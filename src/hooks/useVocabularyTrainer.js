import { useCallback, useEffect, useRef, useState } from 'react'
import { buildStudyQueue, computeDeckStats, computeStudyStreak } from '../lib/srsScheduler'
import { EXERCISE_TYPES, gradeExercise } from '../lib/exerciseGenerator'
import { createReviewSubmission, recordSessionScore, confirmSnapshot } from '../lib/reviewSubmission'
import { MAX_NEW, MAX_REVIEW, VALID_DECK, DECK_BY_ID, buildSession, readSessionSnapshot, writeSessionSnapshot, clearSessionSnapshot } from '../lib/vocabularySession'
import { fetchReviewStateMap, saveReviewState } from '../lib/vocabularyBackend'
import { useVocabularyAudio } from './useVocabularyAudio'

const selectDeck = (level) => VALID_DECK.filter((word) => level === 'all' || word.level === level)

// Owns one account's current lesson. Persistence contracts stay in lib/;
// the page consumes this state without performing database requests.
export function useVocabularyTrainer(userId) {
  // idle = 扉页(宪法 §5.2 的开始屏);其余同旧:loading|study|ready|disabled|compat|empty|error|done
  const [status, setStatus] = useState('loading')
  const [studyList, setStudyList] = useState([]) // {word, state} — preview deck shown before the test
  const [studyIdx, setStudyIdx] = useState(0)
  const [steps, setSteps] = useState([])
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState('answer') // answer|feedback
  const [lastCorrect, setLastCorrect] = useState(null)
  const [picked, setPicked] = useState(null)
  const [input, setInput] = useState('')
  const [chosen, setChosen] = useState([]) // build: ordered tile ids
  const [match, setMatch] = useState({ sel: null, done: [], wrong: [] })
  const [stats, setStats] = useState({ correct: 0, attempts: 0, combo: 0, maxCombo: 0 })
  const [wrong, setWrong] = useState([]) // {word, state} missed this session — feeds the review list + 只练错词
  const [deckStats, setDeckStats] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [saveStatus, setSaveStatus] = useState('idle')
  const [sessionOwnerId, setSessionOwnerId] = useState(null)
  const [level, setLevel] = useState('all')
  const levelRef = useRef(level)
  levelRef.current = level
  const inputRef = useRef(null)
  const sessionQueueRef = useRef([])
  const spokenRef = useRef(-1)
  const stateMapRef = useRef({})
  const snapshotRef = useRef(null)
  const saveLock = useRef(null)
  const loadGeneration = useRef(0)

  const current = steps[i]
  const { tone, speak } = useVocabularyAudio()

  const load = useCallback(async (selectedLevel = levelRef.current) => {
    if (!userId) return
    const generation = ++loadGeneration.current
    saveLock.current = null
    setSessionOwnerId(null)
    setStatus('loading')
    setErrorMessage('')
    try {
      const { mode, states } = await fetchReviewStateMap(userId)
      if (generation !== loadGeneration.current) return
      if (mode === 'disabled') return setStatus('disabled')
      if (mode === 'compat') return setStatus('compat')
      const now = new Date().toISOString()

      // ── 恢复当日未完的会话(切屏/刷新回来原地续) ──
      let saved = readSessionSnapshot(userId)
      if (saved?.pending) {
        try {
          const result = await saveReviewState(saved.pending.state, saved.pending.expectedUpdatedAt)
          if (generation !== loadGeneration.current) return
          if (result.mode !== 'official') throw new Error('进度暂时无法同步，请稍后重试。')
          states[result.state.word_id] = result.state
          saved = confirmSnapshot(saved)
          writeSessionSnapshot(saved)
        } catch (error) {
          if (generation !== loadGeneration.current) return
          if (error.code !== 'REVIEW_CONFLICT') throw error
          if (error.currentState) states[error.currentState.word_id] = error.currentState
          // Keep the cloud version and do not count an unconfirmed answer.
          saved = { ...saved, pending: null }
          writeSessionSnapshot(saved)
          setErrorMessage(error.message)
        }
      }
      if (generation !== loadGeneration.current) return
      stateMapRef.current = states
      snapshotRef.current = saved
      setSaveStatus('idle')
      setSessionOwnerId(userId)
      if (saved) {
        const lvl = saved.level || 'all'
        const savedDeck = selectDeck(lvl)
        const queue = saved.queue.map((q) => ({ word: DECK_BY_ID.get(q.id), state: states[q.id], isNew: !states[q.id] }))
        const built = buildSession(queue, savedDeck)
        const idx = Math.min(Math.max(saved.i || 0, 0), built.length)
        if (idx <= built.length) {
          setLevel(lvl)
          sessionQueueRef.current = queue
          setDeckStats({
            ...computeDeckStats({ deck: savedDeck, stateMap: states, now }),
            streak: computeStudyStreak(Object.values(states), now),
          })
          setSteps(built)
          setStudyList(queue.map((q) => ({ word: q.word, state: q.state, isNew: q.isNew })))
          setStudyIdx(Math.min(saved.studyIdx || 0, queue.length - 1))
          setI(idx)
          setPhase('answer')
          setPicked(null)
          setInput('')
          setChosen([])
          setMatch({ sel: null, done: [], wrong: [] })
          setStats(saved.stats || { correct: 0, attempts: 0, combo: 0, maxCombo: 0 })
          setWrong((saved.wrongIds || [])
            .map((id) => ({ word: DECK_BY_ID.get(id), state: null }))
            .filter((x) => x.word))
          spokenRef.current = -1
          setStatus(idx === built.length ? 'done' : saved.status)
          return undefined
        }
        clearSessionSnapshot(userId)
      }

      const deck = selectDeck(selectedLevel)
      setDeckStats({
        ...computeDeckStats({ deck, stateMap: states, now }),
        streak: computeStudyStreak(Object.values(states), now),
      })
      const queue = buildStudyQueue({ deck, stateMap: states, now, maxNew: MAX_NEW, maxReview: MAX_REVIEW })
      const built = buildSession(queue, deck)
      sessionQueueRef.current = queue
      setSteps(built)
      setStudyList(queue.map((q) => ({ word: q.word, state: q.state, isNew: q.isNew })))
      setStudyIdx(0)
      setI(0)
      setPhase('answer')
      setPicked(null)
      setInput('')
      setChosen([])
      setMatch({ sel: null, done: [], wrong: [] })
      setStats({ correct: 0, attempts: 0, combo: 0, maxCombo: 0 })
      setWrong([])
      spokenRef.current = -1
      // 编排版:先停在扉页(idle),COMMENCER 后进预习/测试。
      setStatus(built.length ? 'idle' : 'empty')
    } catch (error) {
      if (generation !== loadGeneration.current) return
      setErrorMessage(error?.message || '加载背词数据失败。')
      setStatus('error')
    }
    return undefined
  }, [userId])

  useEffect(() => {
    if (userId) load()
    return () => { loadGeneration.current += 1; saveLock.current = null }
  }, [userId, load])

  // 扉页 → 预习(有队列)或直接测试。
  const commencer = useCallback(() => {
    if (status !== 'idle') return
    setStatus(studyList.length ? 'study' : 'ready')
  }, [status, studyList.length])

  const finishRecord = useCallback((ok, step, savedState) => {
    setStats((s) => recordSessionScore(s, ok))
    if (!ok && step?.kind === 'card') {
      setWrong((words) => words.some((x) => x.word.id === step.word.id) ? words : [...words, { word: step.word, state: savedState }])
    }
    if (savedState) {
      const states = { ...stateMapRef.current, [savedState.word_id]: savedState }
      stateMapRef.current = states
      const now = new Date().toISOString()
      setDeckStats({ ...computeDeckStats({ deck: selectDeck(level), stateMap: states, now }), streak: computeStudyStreak(Object.values(states), now) })
    }
    setSaveStatus('saved')
  }, [level])

  const persistAnswer = useCallback(async (step) => {
    if (saveLock.current || !snapshotRef.current?.pending) return
    const lock = {}
    saveLock.current = lock
    setSaveStatus('saving')
    setErrorMessage('')
    const snapshot = snapshotRef.current
    const pending = snapshot.pending
    const generation = loadGeneration.current
    try {
      // Freeze the attempt before network I/O, including for reload recovery.
      writeSessionSnapshot(snapshot)
      const result = await saveReviewState(pending.state, pending.expectedUpdatedAt)
      if (generation !== loadGeneration.current) return
      if (result.mode !== 'official' || !result.state) throw new Error('进度暂时无法同步，请稍后重试。')
      const confirmed = confirmSnapshot(snapshot)
      writeSessionSnapshot(confirmed)
      snapshotRef.current = confirmed
      finishRecord(pending.correct, step, result.state)
    } catch (error) {
      if (generation !== loadGeneration.current) return
      setSaveStatus(error.code === 'REVIEW_CONFLICT' ? 'conflict' : 'error')
      setErrorMessage(error.code === 'REVIEW_CONFLICT' ? error.message : '本题进度尚未确认保存，请检查网络后重试。')
    } finally {
      if (saveLock.current === lock) saveLock.current = null
    }
  }, [finishRecord])

  // Verdict is immediate; score, snapshot cursor and Continue wait for storage.
  const record = useCallback(
    (ok, step) => {
      if (saveLock.current || sessionOwnerId !== userId) return
      tone(ok)
      setLastCorrect(ok)
      if (step?.kind === 'card' && userId) {
        const pending = createReviewSubmission({ state: stateMapRef.current[step.word.id], userId, wordId: step.word.id, correct: ok, now: new Date().toISOString() })
        snapshotRef.current = { ...snapshotRef.current, pending }
        persistAnswer(step)
      } else finishRecord(ok, step)
    },
    [tone, userId, sessionOwnerId, persistAnswer, finishRecord],
  )

  const choose = useCallback(
    (opt) => {
      if (phase !== 'answer' || !current) return
      setPicked(opt)
      setPhase('feedback')
      record(gradeExercise(current.exercise, opt), current)
    },
    [phase, current, record],
  )

  const submitSpelling = useCallback(() => {
    if (phase !== 'answer' || !current) return
    setPhase('feedback')
    record(gradeExercise(current.exercise, input), current)
  }, [phase, current, input, record])

  const submitBuild = useCallback(() => {
    if (phase !== 'answer' || !current) return
    const map = Object.fromEntries(current.exercise.bank.map((t) => [t.id, t.w]))
    const words = chosen.map((id) => map[id])
    setPhase('feedback')
    record(gradeExercise(current.exercise, words), current)
  }, [phase, current, chosen, record])

  const tapTile = useCallback((id) => {
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))
  }, [])

  const tapMatch = useCallback(
    (side, id) => {
      if (phase !== 'answer' || !current) return
      const m = match
      if (m.done.includes(id)) return
      if (!m.sel) { setMatch({ ...m, sel: { side, id }, wrong: [] }); return }
      if (m.sel.side === side) { setMatch({ ...m, sel: { side, id } }); return }
      if (m.sel.id === id) {
        // correct pair — keep side effects OUT of the state updater
        const done = [...m.done, id]
        setMatch({ sel: null, done, wrong: [] })
        if (done.length >= current.exercise.cards.length) {
          setPhase('feedback')
          record(true, current)
        }
        return
      }
      // mismatch — flash both, then clear
      setMatch({ ...m, sel: null, wrong: [`${m.sel.side}${m.sel.id}`, `${side}${id}`] })
      setTimeout(() => setMatch((mm) => ({ ...mm, wrong: [] })), 380)
    },
    [phase, current, match, record],
  )

  const next = useCallback(() => {
    if (saveStatus !== 'saved') return
    const ni = i + 1
    try { window.speechSynthesis && window.speechSynthesis.cancel() } catch { /* ignore */ }
    if (ni >= steps.length) {
      setStatus('done')
      return
    }
    setI(ni)
    setPhase('answer')
    setSaveStatus('idle')
    setPicked(null)
    setInput('')
    setChosen([])
    setMatch({ sel: null, done: [], wrong: [] })
  }, [i, steps.length, saveStatus])

  // Re-drill only the words missed this session (design: « 只练错词 »).
  const retryWrong = useCallback(() => {
    if (!wrong.length) return
    const deck = selectDeck(level)
    const retryQueue = wrong.map((x) => ({ word: x.word, state: stateMapRef.current[x.word.id] }))
    const built = buildSession(retryQueue, deck)
    sessionQueueRef.current = retryQueue
    setSteps(built)
    setI(0)
    setPhase('answer')
    setSaveStatus('idle')
    setPicked(null)
    setInput('')
    setChosen([])
    setMatch({ sel: null, done: [], wrong: [] })
    setStats({ correct: 0, attempts: 0, combo: 0, maxCombo: 0 })
    setWrong([])
    spokenRef.current = -1
    setStatus('ready')
  }, [wrong, level])

  // Study (preview) navigation: step through the deck, then begin the test.
  const studyNext = useCallback(() => {
    setStudyIdx((idx) => {
      if (idx + 1 >= studyList.length) { setStatus('ready'); return idx }
      return idx + 1
    })
  }, [studyList.length])
  const skipStudy = useCallback(() => setStatus('ready'), [])

  // 快照只在保存确认后推进游标；失败或刷新保留同一次 pending 提交。
  useEffect(() => {
    if (!userId || sessionOwnerId !== userId || (status !== 'study' && status !== 'ready')) return
    const queue = sessionQueueRef.current
    if (!queue.length) return
    const answeredThrough = phase === 'feedback' && saveStatus === 'saved' ? i + 1 : i
    const snapshot = {
      userId, level, status, i: answeredThrough, studyIdx, stats,
      wrongIds: wrong.map((x) => x.word.id),
      queue: queue.map((q) => ({ id: q.word.id })),
      pending: snapshotRef.current?.pending || null,
    }
    snapshotRef.current = snapshot
    try {
      writeSessionSnapshot(snapshot)
    } catch { /* storage 不可用时静默 */ }
  }, [userId, sessionOwnerId, status, i, phase, studyIdx, stats, wrong, level, saveStatus])

  useEffect(() => {
    if (status === 'done' && sessionOwnerId === userId) clearSessionSnapshot(userId)
  }, [status, sessionOwnerId, userId])

  // speak the listen prompt when its step appears; autofocus the spelling input
  useEffect(() => {
    if (status !== 'ready' || !current) return
    if (current.exercise?.type === EXERCISE_TYPES.listen && phase === 'answer' && spokenRef.current !== i) {
      spokenRef.current = i
      speak(current.exercise.audioText)
    }
    if (current.exercise?.type === EXERCISE_TYPES.spelling && phase === 'answer') {
      inputRef.current?.focus()
    }
  }, [status, current, phase, i, speak])

  // keyboard: 1–4 pick options, Enter submits/advances
  useEffect(() => {
    if (status !== 'ready') return undefined
    const onKey = (event) => {
      const tagName = event.target?.tagName
      const inField = tagName === 'INPUT' || tagName === 'TEXTAREA'
      if (phase === 'feedback') {
        if (event.key === 'Enter' || event.code === 'Space') {
          if (inField && event.key !== 'Enter') return
          event.preventDefault()
          next()
        }
        return
      }
      const ex = current?.exercise
      if (!ex) return
      if ((ex.type === EXERCISE_TYPES.recognition || ex.type === EXERCISE_TYPES.cloze || ex.type === EXERCISE_TYPES.listen) && !inField) {
        const n = Number(event.key)
        if (n >= 1 && n <= ex.options.length) {
          event.preventDefault()
          choose(ex.options[n - 1])
        }
      } else if (ex.type === EXERCISE_TYPES.spelling && event.key === 'Enter') {
        event.preventDefault()
        submitSpelling()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, phase, current, choose, submitSpelling, next])

  // study preview: Enter / Space advances; idle: Enter begins
  useEffect(() => {
    if (status !== 'study' && status !== 'idle') return undefined
    const onKey = (event) => {
      if (event.key === 'Enter' || event.code === 'Space') {
        if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA' || event.target?.tagName === 'BUTTON') return
        event.preventDefault()
        if (status === 'idle') commencer()
        else studyNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, studyNext, commencer])

  const changeLevel = useCallback((value) => { setLevel(value); load(value) }, [load])

  return {
    status,
    studyList,
    studyIdx,
    steps,
    i,
    phase,
    lastCorrect,
    picked,
    input,
    setInput,
    chosen,
    match,
    stats,
    wrong,
    deckStats,
    errorMessage,
    saveStatus,
    sessionOwnerId,
    level,
    inputRef,
    current,
    speak,
    load,
    commencer,
    persistAnswer,
    choose,
    submitSpelling,
    submitBuild,
    tapTile,
    tapMatch,
    next,
    retryWrong,
    studyNext,
    skipStudy,
    changeLevel
  }
}
