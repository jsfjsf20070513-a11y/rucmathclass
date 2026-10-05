import { buildStudyQueue, computeDeckStats } from './srsScheduler'
import { EXERCISE_TYPES, gradeExercise } from './exerciseGenerator'
import { createReviewSubmission, recordSessionScore, confirmSnapshot } from './reviewSubmission'
import { MAX_NEW, MAX_REVIEW, VALID_DECK, buildSession } from './vocabularySession'

const emptyScore = () => ({ correct: 0, attempts: 0, combo: 0, maxCombo: 0 })
const answerState = () => ({ phase: 'answer', lastCorrect: null, picked: null, input: '', chosen: [], match: { sel: null, done: [], wrong: [] }, saveStatus: 'idle' })
const initialState = (level = 'all') => ({
  status: 'loading', studyList: [], studyIdx: 0, steps: [], i: 0, current: undefined,
  ...answerState(), stats: emptyScore(), wrong: [], deckStats: null, errorMessage: '', sessionOwnerId: null, level,
})

// One instance owns one account. Network, local storage and time are ports;
// React, DOM events and audio stay in the hook that subscribes to this store.
export function createVocabularyTrainer({ userId, repository, snapshots, deck = VALID_DECK, buildSteps = buildSession, now = () => new Date().toISOString() }) {
  let state = initialState()
  let active = false, generation = 0, saving = null, pendingSnapshot = null
  let states = {}, queue = []
  const listeners = new Set()
  const byId = new Map(deck.map((word) => [word.id, word]))
  const selectDeck = (level) => deck.filter((word) => level === 'all' || word.level === level)
  const currentRun = (run) => active && run === generation
  const publish = (patch) => {
    state = { ...state, ...patch }
    state.current = state.steps[state.i]
    listeners.forEach((listener) => listener())
  }
  const deckStats = (level) => {
    const time = now()
    return computeDeckStats({ deck: selectDeck(level), stateMap: states, now: time })
  }
  const snapshot = (pending = null) => ({
    userId, level: state.level, status: state.status === 'study' ? 'study' : 'ready',
    i: state.i + (state.phase === 'feedback' && state.saveStatus === 'saved' ? 1 : 0),
    studyIdx: state.studyIdx, stats: state.stats, wrongIds: state.wrong.map((item) => item.word.id),
    queue: queue.map((item) => ({ id: item.word.id })), pending,
  })
  const checkpoint = () => {
    // Preview/cursor checkpoints are best effort. A pending cloud write below
    // must be stored successfully BEFORE it can be sent.
    try { snapshots.write(snapshot()) } catch { /* optional local resume */ }
  }
  const clearSnapshot = () => { try { snapshots.clear(userId) } catch { /* already confirmed */ } }
  const canAnswer = () => active && state.sessionOwnerId === userId && state.status === 'ready'
    && state.phase === 'answer' && !saving && !pendingSnapshot && Boolean(state.current)

  async function initialize(level = state.level) {
    active = true
    const run = ++generation
    saving = null
    pendingSnapshot = null
    publish(initialState(level))
    if (!userId) return
    try {
      const result = await repository.fetchReviewStateMap(userId)
      if (!currentRun(run)) return
      if (result.mode !== 'official') return publish({ status: result.mode })
      const loaded = { ...result.states }
      let saved = snapshots.read(userId)
      if (saved && (saved.userId !== userId || !saved.queue?.length || saved.queue.some((item) => !byId.has(item.id)))) saved = null
      let notice = ''
      if (saved?.pending) {
        try {
          const confirmed = await repository.saveReviewState(saved.pending.state, saved.pending.expectedUpdatedAt)
          if (!currentRun(run)) return
          if (confirmed.mode !== 'official' || !confirmed.state) throw new Error('进度暂时无法同步，请稍后重试。')
          loaded[confirmed.state.word_id] = confirmed.state
          saved = confirmSnapshot(saved)
          snapshots.write(saved)
        } catch (error) {
          if (!currentRun(run)) return
          if (error.code !== 'REVIEW_CONFLICT') throw error
          if (error.currentState) loaded[error.currentState.word_id] = error.currentState
          saved = { ...saved, pending: null }
          snapshots.write(saved)
          notice = error.message
        }
      }
      if (!currentRun(run)) return
      states = loaded
      const selectedLevel = saved?.level || level
      const selectedDeck = selectDeck(selectedLevel)
      queue = saved
        ? saved.queue.map(({ id }) => ({ word: byId.get(id), state: states[id], isNew: !states[id] }))
        : buildStudyQueue({ deck: selectedDeck, stateMap: states, now: now(), maxNew: MAX_NEW, maxReview: MAX_REVIEW })
      const steps = buildSteps(queue, selectedDeck)
      const i = saved ? Math.min(Math.max(saved.i || 0, 0), steps.length) : 0
      const status = saved ? (i === steps.length ? 'done' : saved.status) : (steps.length ? 'idle' : 'empty')
      publish({
        ...answerState(), sessionOwnerId: userId, level: selectedLevel, status, steps, i,
        studyList: queue.map((item) => ({ ...item })), studyIdx: Math.max(0, Math.min(saved?.studyIdx || 0, queue.length - 1)),
        stats: saved?.stats || emptyScore(),
        wrong: (saved?.wrongIds || []).filter((id) => byId.has(id)).map((id) => ({ word: byId.get(id), state: states[id] })),
        deckStats: deckStats(selectedLevel), errorMessage: notice,
      })
      if (status === 'done') clearSnapshot()
    } catch {
      if (currentRun(run)) publish({ status: 'error', errorMessage: '暂时无法加载背词进度。请稍后重试。' })
    }
  }

  async function persistAnswer() {
    if (!active || saving || !pendingSnapshot || state.saveStatus === 'conflict') return false
    const run = generation, lock = {}, attempt = pendingSnapshot
    saving = lock
    publish({ saveStatus: 'saving', errorMessage: '' })
    try {
      snapshots.write(attempt)
      const result = await repository.saveReviewState(attempt.pending.state, attempt.pending.expectedUpdatedAt)
      if (!currentRun(run)) return false
      if (result.mode !== 'official' || !result.state) throw new Error('进度暂时无法同步，请稍后重试。')
      const confirmed = confirmSnapshot(attempt)
      snapshots.write(confirmed)
      pendingSnapshot = null
      states = { ...states, [result.state.word_id]: result.state }
      publish({
        stats: confirmed.stats,
        wrong: confirmed.wrongIds.map((id) => ({ word: byId.get(id), state: states[id] })),
        deckStats: deckStats(state.level), saveStatus: 'saved',
      })
      return true
    } catch (error) {
      if (currentRun(run)) publish({
        saveStatus: error.code === 'REVIEW_CONFLICT' ? 'conflict' : 'error',
        errorMessage: error.code === 'REVIEW_CONFLICT' ? error.message : '本题进度尚未确认保存，请检查网络后重试。',
      })
      return false
    } finally {
      if (saving === lock) saving = null
    }
  }

  function record(correct, patch = {}) {
    if (!canAnswer()) return false
    const step = state.current
    if (step.kind === 'card') {
      const pending = createReviewSubmission({ state: states[step.word.id], userId, wordId: step.word.id, correct, now: now() })
      pendingSnapshot = snapshot(pending)
      publish({ ...patch, phase: 'feedback', lastCorrect: correct, saveStatus: 'saving' })
      return persistAnswer()
    }
    publish({ ...patch, phase: 'feedback', lastCorrect: correct, saveStatus: 'saved', stats: recordSessionScore(state.stats, correct) })
    checkpoint()
    return true
  }

  function next() {
    if (!active || state.status !== 'ready' || state.phase !== 'feedback' || state.saveStatus !== 'saved') return
    const i = state.i + 1
    publish({ ...answerState(), i, status: i >= state.steps.length ? 'done' : 'ready', errorMessage: '' })
    if (state.status === 'done') clearSnapshot()
    else checkpoint()
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    initialize, load: initialize, persistAnswer, next,
    dispose() { active = false; generation += 1; saving = null },
    commencer() {
      if (!active || state.status !== 'idle') return
      publish({ status: state.studyList.length ? 'study' : 'ready' })
      checkpoint()
    },
    studyNext() {
      if (!active || state.status !== 'study') return
      if (state.studyIdx + 1 >= state.studyList.length) publish({ status: 'ready' })
      else publish({ studyIdx: state.studyIdx + 1 })
      checkpoint()
    },
    skipStudy() {
      if (!active || state.status !== 'study') return
      publish({ status: 'ready' })
      checkpoint()
    },
    setInput(input) { if (canAnswer()) publish({ input }) },
    choose(option) {
      if (!canAnswer() || !state.current.exercise.options?.includes(option)) return false
      return record(gradeExercise(state.current.exercise, option), { picked: option })
    },
    submitSpelling() {
      if (!canAnswer() || state.current.exercise.type !== EXERCISE_TYPES.spelling) return false
      return record(gradeExercise(state.current.exercise, state.input))
    },
    submitBuild() {
      if (!canAnswer() || state.current.exercise.type !== EXERCISE_TYPES.build || !state.chosen.length) return false
      const bank = new Map(state.current.exercise.bank.map((tile) => [tile.id, tile.w]))
      return record(gradeExercise(state.current.exercise, state.chosen.map((id) => bank.get(id))))
    },
    tapTile(id) {
      if (!canAnswer() || !state.current.exercise.bank?.some((tile) => tile.id === id)) return
      publish({ chosen: state.chosen.includes(id) ? state.chosen.filter((item) => item !== id) : [...state.chosen, id] })
    },
    tapMatch(side, id) {
      if (!canAnswer() || state.current.exercise.type !== EXERCISE_TYPES.match || !['L', 'R'].includes(side)) return
      const match = state.match, cards = state.current.exercise.cards
      if (match.done.includes(id) || !cards.some((card) => card.id === id)) return
      if (!match.sel || match.sel.side === side) return publish({ match: { ...match, sel: { side, id }, wrong: [] } })
      if (match.sel.id === id) {
        const done = [...match.done, id], nextMatch = { sel: null, done, wrong: [] }
        if (done.length === cards.length) return record(true, { match: nextMatch })
        return publish({ match: nextMatch })
      }
      publish({ match: { ...match, sel: null, wrong: [`${match.sel.side}${match.sel.id}`, `${side}${id}`] } })
    },
    clearMatchError(expected) {
      if (active && state.match.wrong === expected) publish({ match: { ...state.match, wrong: [] } })
    },
    retryWrong() {
      if (!active || state.status !== 'done' || !state.wrong.length) return
      queue = state.wrong.map(({ word }) => ({ word, state: states[word.id], isNew: !states[word.id] }))
      publish({
        ...answerState(), steps: buildSteps(queue, selectDeck(state.level)), i: 0, studyIdx: 0,
        studyList: queue.map((item) => ({ ...item })), stats: emptyScore(), wrong: [], status: 'ready', errorMessage: '',
      })
      checkpoint()
    },
    changeLevel(level) {
      if (!active || !['idle', 'empty', 'done'].includes(state.status)) return
      return initialize(level)
    },
  }
}
