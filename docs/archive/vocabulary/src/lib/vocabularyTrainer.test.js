import { describe, expect, it, vi } from 'vitest'
import { createVocabularyTrainer } from './vocabularyTrainer'
import { EXERCISE_TYPES, buildExercise } from './exerciseGenerator'
import { createReviewSubmission } from './reviewSubmission'
import { buildSession } from './vocabularySession'

const TIME = '2026-09-26T09:00:00.000Z'
const words = [
  { id: 'un', french: 'un', chinese: '一', pos: 'number', level: 'B1' },
  { id: 'deux', french: 'deux', chinese: '二', pos: 'number', level: 'B1' },
]
const score = { correct: 0, attempts: 0, combo: 0, maxCombo: 0 }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const row = (userId = 'a', id = 'un', stage = 0) => ({
  user_id: userId, word_id: id, proficiency_level: stage, streak_count: stage,
  next_review_at: TIME, last_result: null, updated_at: '2026-09-25T09:00:00.000Z',
})
const steps = (queue) => queue.map((item) => ({
  kind: 'card', word: item.word, state: item.state,
  exercise: { type: EXERCISE_TYPES.recognition, options: [item.word.chinese, '错'], answer: item.word.chinese },
}))
function harness({ deck = words, saved = null, buildSteps = steps, repository: supplied } = {}) {
  const cloud = {}, local = new Map(saved ? [[saved.userId, structuredClone(saved)]] : [])
  const repository = supplied || {
    fetchReviewStateMap: vi.fn(async (id) => ({ mode: 'official', states: structuredClone(cloud[id] || {}) })),
    saveReviewState: vi.fn(async (state) => {
      cloud[state.user_id] ||= {}
      cloud[state.user_id][state.word_id] = structuredClone(state)
      return { mode: 'official', state: structuredClone(state) }
    }),
  }
  const snapshots = {
    read: vi.fn((id) => structuredClone(local.get(id) || null)),
    write: vi.fn((snapshot) => local.set(snapshot.userId, structuredClone(snapshot))),
    clear: vi.fn((id) => local.delete(id)),
  }
  const make = (userId = 'a') => createVocabularyTrainer({ userId, repository, snapshots, deck, buildSteps, now: () => TIME })
  const trainer = make()
  return { trainer, make, repository, snapshots, cloud, local }
}
async function start(trainer) {
  await trainer.initialize()
  trainer.commencer()
  trainer.skipStudy()
}
function pendingSnapshot(correct) {
  return {
    userId: 'a', level: 'B1', status: 'ready', i: 0, studyIdx: 0, stats: score,
    wrongIds: [], queue: [{ id: 'un' }],
    pending: createReviewSubmission({ userId: 'a', wordId: 'un', correct, now: TIME }),
  }
}

describe('vocabulary lesson lifecycle', () => {
  it.each(['fetchReviewStateMap', 'saveReviewState'])('hides technical errors from %s without discarding a pending answer', async (method) => {
    const saved = pendingSnapshot(true)
    const h = harness({ saved })
    h.repository[method].mockRejectedValueOnce(new Error('SQL service failure'))
    await h.trainer.initialize()
    expect(h.trainer.getSnapshot()).toMatchObject({ status: 'error', i: 0, stats: score, errorMessage: '暂时无法加载背词进度。请稍后重试。' })
    expect(h.local.get('a')).toEqual(saved)
    expect(h.snapshots.clear).not.toHaveBeenCalled()
    h.trainer.next()
    expect(h.trainer.getSnapshot().i).toBe(0)
  })

  it('freezes the first answer synchronously and prevents progression before confirmation', async () => {
    const h = harness(), pending = deferred()
    h.repository.saveReviewState.mockReturnValueOnce(pending.promise)
    await start(h.trainer)
    const first = h.trainer.choose('一')
    expect(h.trainer.choose('错')).toBe(false)
    h.trainer.next()
    expect(h.repository.saveReviewState).toHaveBeenCalledTimes(1)
    expect(h.trainer.getSnapshot()).toMatchObject({ i: 0, picked: '一', phase: 'feedback', saveStatus: 'saving', stats: score })
    expect(h.local.get('a')).toMatchObject({ i: 0, pending: { correct: true }, stats: score })
    const saved = h.repository.saveReviewState.mock.calls[0][0]
    pending.resolve({ mode: 'official', state: saved })
    await first
    expect(h.trainer.getSnapshot()).toMatchObject({ i: 0, saveStatus: 'saved', stats: { correct: 1, attempts: 1 } })
    expect(h.local.get('a')).toMatchObject({ i: 1, pending: null, stats: { attempts: 1 } })
    h.trainer.next()
    expect(h.trainer.getSnapshot()).toMatchObject({ i: 1, phase: 'answer', saveStatus: 'idle' })
  })

  it('retries the exact frozen write after the server committed but the response was lost', async () => {
    const h = harness()
    const save = h.repository.saveReviewState.getMockImplementation()
    h.repository.saveReviewState.mockImplementationOnce(async (...args) => { await save(...args); throw new Error('response lost') })
    await start(h.trainer)
    await h.trainer.choose('一')
    h.trainer.next()
    expect(h.trainer.getSnapshot()).toMatchObject({ i: 0, saveStatus: 'error', stats: score })
    await h.trainer.persistAnswer()
    expect(h.repository.saveReviewState.mock.calls[1]).toEqual(h.repository.saveReviewState.mock.calls[0])
    expect(h.cloud.a.un.proficiency_level).toBe(1)
    expect(h.trainer.getSnapshot().stats.attempts).toBe(1)
    await h.trainer.persistAnswer()
    expect(h.repository.saveReviewState).toHaveBeenCalledTimes(2)
  })

  it.each([true, false])('recovers the final pending B1 answer into completion (correct=%s)', async (correct) => {
    const h = harness({ deck: [words[0]], saved: pendingSnapshot(correct) })
    await h.trainer.initialize()
    expect(h.trainer.getSnapshot()).toMatchObject({ status: 'done', level: 'B1', i: 1, stats: { correct: Number(correct), attempts: 1 } })
    expect(h.trainer.getSnapshot().wrong.map(({ word }) => word.id)).toEqual(correct ? [] : ['un'])
    expect(h.repository.fetchReviewStateMap).toHaveBeenCalledTimes(1)
    expect(h.local.has('a')).toBe(false)
  })

  it('recovers a committed write after refresh without an old response changing the checkpoint', async () => {
    const h = harness(), late = deferred()
    const save = h.repository.saveReviewState.getMockImplementation()
    h.repository.saveReviewState.mockImplementationOnce(async (...args) => { await save(...args); return late.promise })
    await start(h.trainer)
    const old = h.trainer.choose('一')
    h.trainer.dispose()
    const recovered = h.make()
    await recovered.initialize()
    expect(recovered.getSnapshot()).toMatchObject({ status: 'ready', i: 1, stats: { attempts: 1 } })
    const checkpoint = structuredClone(h.local.get('a'))
    late.resolve({ mode: 'official', state: h.cloud.a.un })
    await old
    expect(h.local.get('a')).toEqual(checkpoint)
    expect(recovered.getSnapshot().stats.attempts).toBe(1)
  })

  it.each(['success', 'failure', 'conflict'])('ignores account A late save %s while account B is saving', async (outcome) => {
    const h = harness(), old = deferred(), current = deferred()
    h.repository.saveReviewState.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    await start(h.trainer)
    const first = h.trainer.choose('一')
    h.trainer.dispose()
    const b = h.make('b')
    await start(b)
    const second = b.choose('一')
    const bCheckpoint = structuredClone(h.local.get('b'))
    const writes = h.snapshots.write.mock.calls.length
    if (outcome === 'success') old.resolve({ mode: 'official', state: row('a') })
    else old.reject(Object.assign(new Error('late failure'), { code: outcome === 'conflict' ? 'REVIEW_CONFLICT' : undefined }))
    await first
    expect(h.snapshots.write).toHaveBeenCalledTimes(writes)
    expect(h.local.get('b')).toEqual(bCheckpoint)
    expect(b.getSnapshot()).toMatchObject({ sessionOwnerId: 'b', saveStatus: 'saving', stats: score })
    expect(await b.persistAnswer()).toBe(false)
    current.resolve({ mode: 'official', state: h.repository.saveReviewState.mock.calls[1][0] })
    await second
    expect(b.getSnapshot().stats.attempts).toBe(1)
  })

  it('uses only the newest load, including after a StrictMode dispose/restart', async () => {
    const h = harness(), old = deferred()
    h.repository.fetchReviewStateMap.mockReturnValueOnce(old.promise)
    const first = h.trainer.initialize()
    h.trainer.dispose()
    await h.trainer.initialize('B1')
    old.reject(new Error('old load failed'))
    await first
    expect(h.trainer.getSnapshot()).toMatchObject({ status: 'idle', level: 'B1', errorMessage: '', sessionOwnerId: 'a' })
    h.trainer.commencer()
    expect(h.trainer.getSnapshot().status).toBe('study')
  })

  it('does not let an earlier overlapping load replace the selected level or state map', async () => {
    const h = harness(), old = deferred()
    h.repository.fetchReviewStateMap.mockReturnValueOnce(old.promise)
    const first = h.trainer.initialize()
    await h.trainer.initialize('B1')
    old.resolve({ mode: 'official', states: { un: row('a', 'un', 7) } })
    await first
    expect(h.trainer.getSnapshot()).toMatchObject({ level: 'B1', deckStats: { mastered: 0 } })
  })

  it('keeps a conflicting answer uncounted and reloads from the current cloud version', async () => {
    const h = harness()
    const newer = row('a', 'un', 4)
    h.repository.saveReviewState.mockRejectedValue(Object.assign(new Error('changed elsewhere'), { code: 'REVIEW_CONFLICT', currentState: newer }))
    await start(h.trainer)
    await h.trainer.choose('一')
    expect(h.trainer.getSnapshot()).toMatchObject({ saveStatus: 'conflict', stats: score })
    h.trainer.next()
    expect(h.trainer.getSnapshot().i).toBe(0)
    await h.trainer.initialize()
    expect(h.trainer.getSnapshot()).toMatchObject({ status: 'ready', i: 0, stats: score, errorMessage: 'changed elsewhere' })
    expect(h.local.get('a').pending).toBeNull()
    expect(h.trainer.getSnapshot().current.state.proficiency_level).toBe(4)
  })

  it('redrills wrong words from confirmed progress and starts a separate session score', async () => {
    const h = harness({ deck: [words[0]] })
    h.cloud.a = { un: row('a', 'un', 4) }
    await start(h.trainer)
    await h.trainer.choose('错')
    h.trainer.next()
    h.trainer.retryWrong()
    expect(h.trainer.getSnapshot()).toMatchObject({ status: 'ready', stats: score, wrong: [] })
    await h.trainer.choose('一')
    const [saved, expectedVersion] = h.repository.saveReviewState.mock.calls[1]
    expect(saved.proficiency_level).toBe(1)
    expect(expectedVersion).toBe(h.repository.saveReviewState.mock.calls[0][0].updated_at)
    expect(h.trainer.getSnapshot().stats).toMatchObject({ correct: 1, attempts: 1 })
  })

  it('does not send a write if the pending checkpoint cannot be stored', async () => {
    const h = harness()
    await start(h.trainer)
    h.snapshots.write.mockImplementationOnce(() => { throw new Error('storage full') })
    await h.trainer.choose('一')
    expect(h.repository.saveReviewState).not.toHaveBeenCalled()
    expect(h.trainer.getSnapshot()).toMatchObject({ saveStatus: 'error', stats: score })
    await h.trainer.persistAnswer()
    expect(h.trainer.getSnapshot().stats.attempts).toBe(1)
  })

  it('can retry if the cloud confirmed but storing the advanced checkpoint failed', async () => {
    const h = harness()
    await start(h.trainer)
    const write = h.snapshots.write.getMockImplementation()
    h.snapshots.write.mockImplementationOnce(write).mockImplementationOnce(() => { throw new Error('storage full') })
    await h.trainer.choose('一')
    expect(h.trainer.getSnapshot()).toMatchObject({ saveStatus: 'error', stats: score })
    expect(h.local.get('a').pending).toBeTruthy()
    await h.trainer.persistAnswer()
    expect(h.repository.saveReviewState.mock.calls[1]).toEqual(h.repository.saveReviewState.mock.calls[0])
    expect(h.trainer.getSnapshot().stats.attempts).toBe(1)
  })

  it('guards duplicate spelling submissions without waiting for a React render', async () => {
    const h = harness({ buildSteps: (queue) => steps(queue).map((step) => ({ ...step, exercise: { type: EXERCISE_TYPES.spelling, answer: step.word.french } })) })
    await start(h.trainer)
    h.trainer.setInput('un')
    const first = h.trainer.submitSpelling()
    h.trainer.setInput('deux')
    expect(h.trainer.submitSpelling()).toBe(false)
    await first
    expect(h.repository.saveReviewState).toHaveBeenCalledTimes(1)
    expect(h.trainer.getSnapshot()).toMatchObject({ input: 'un', lastCorrect: true, stats: { attempts: 1 } })
  })

  it('restores completion after a final checkpoint failure and a confirmed retry', async () => {
    const h = harness({ deck: [words[0]] })
    await start(h.trainer)
    const write = h.snapshots.write.getMockImplementation()
    h.snapshots.write.mockImplementationOnce(write).mockImplementationOnce(() => { throw new Error('storage full') })
    await h.trainer.choose('一')
    expect(h.local.get('a')).toMatchObject({ i: 0, pending: { correct: true }, stats: score })
    await h.trainer.persistAnswer()
    h.trainer.dispose()
    const restored = h.make()
    await restored.initialize()
    expect(restored.getSnapshot()).toMatchObject({ status: 'done', stats: { attempts: 1, correct: 1 } })
    expect(h.repository.saveReviewState).toHaveBeenCalledTimes(2)
    expect(h.repository.saveReviewState.mock.calls[1]).toEqual(h.repository.saveReviewState.mock.calls[0])
    expect(h.cloud.a.un.proficiency_level).toBe(1)
    expect(h.local.has('a')).toBe(false)
  })

  it('ignores a pending recovery from the disposed lifecycle while a new recovery waits', async () => {
    const h = harness({ deck: [words[0]], saved: pendingSnapshot(true) })
    const old = deferred(), current = deferred()
    h.repository.saveReviewState.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const first = h.trainer.initialize()
    await Promise.resolve()
    h.trainer.dispose()
    const second = h.trainer.initialize()
    await Promise.resolve()
    expect(h.repository.saveReviewState).toHaveBeenCalledTimes(2)
    old.resolve({ mode: 'official', state: h.repository.saveReviewState.mock.calls[0][0] })
    await first
    expect(h.trainer.getSnapshot()).toMatchObject({ status: 'loading', stats: score })
    expect(h.snapshots.write).not.toHaveBeenCalled()
    expect(h.local.get('a').pending).toBeTruthy()
    current.resolve({ mode: 'official', state: h.repository.saveReviewState.mock.calls[1][0] })
    await second
    expect(h.trainer.getSnapshot()).toMatchObject({ status: 'done', stats: { attempts: 1, correct: 1 } })
    expect(h.snapshots.write).toHaveBeenCalledTimes(1)
    expect(h.local.has('a')).toBe(false)
  })

  it('counts a completed matching warm-up once without advancing any word schedule', async () => {
    const deck = [...words, { ...words[0], id: 'trois', french: 'trois', chinese: '三' }, { ...words[0], id: 'quatre', french: 'quatre', chinese: '四' }]
    const h = harness({ deck, buildSteps: buildSession })
    await start(h.trainer)
    h.trainer.tapMatch('L', 'un')
    h.trainer.tapMatch('R', 'deux')
    const firstError = h.trainer.getSnapshot().match.wrong
    h.trainer.tapMatch('L', 'deux')
    h.trainer.tapMatch('R', 'un')
    h.trainer.clearMatchError(firstError)
    expect(h.trainer.getSnapshot().match.wrong).toEqual(['Ldeux', 'Run'])
    expect(h.trainer.getSnapshot().stats).toEqual(score)
    for (const word of deck) {
      h.trainer.tapMatch('L', word.id)
      h.trainer.tapMatch('R', word.id)
    }
    h.trainer.tapMatch('L', 'un')
    h.trainer.tapMatch('R', 'un')
    expect(h.trainer.getSnapshot()).toMatchObject({ phase: 'feedback', saveStatus: 'saved', stats: { attempts: 1, correct: 1 } })
    expect(h.repository.saveReviewState).not.toHaveBeenCalled()
    expect(h.local.get('a')).toMatchObject({ i: 1, pending: null, stats: { attempts: 1 } })
    h.trainer.next()
    await h.trainer.choose('一')
    expect(h.repository.saveReviewState).toHaveBeenCalledTimes(1)
    expect(h.trainer.getSnapshot().stats.attempts).toBe(2)
  })

  it('keeps sentence tile order and removal, then freezes it while saving', async () => {
    const word = { ...words[0], example: 'un de plus' }
    const h = harness({ deck: [word], buildSteps: (queue, deck) => queue.map((item) => ({
      ...item, kind: 'card', exercise: buildExercise(item.word, deck, { type: EXERCISE_TYPES.build }),
    })) })
    await start(h.trainer)
    expect(h.trainer.submitBuild()).toBe(false)
    h.trainer.tapTile('t1')
    h.trainer.tapTile('t1')
    expect(h.trainer.getSnapshot().chosen).toEqual([])
    for (const id of ['t0', 't1', 't2']) h.trainer.tapTile(id)
    const first = h.trainer.submitBuild()
    h.trainer.tapTile('t0')
    expect(h.trainer.submitBuild()).toBe(false)
    await first
    expect(h.trainer.getSnapshot()).toMatchObject({ chosen: ['t0', 't1', 't2'], lastCorrect: true, stats: { attempts: 1, correct: 1 } })
    expect(h.repository.saveReviewState).toHaveBeenCalledTimes(1)
  })
})
