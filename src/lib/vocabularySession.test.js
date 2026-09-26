import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSession, readSessionSnapshot, writeSessionSnapshot, clearSessionSnapshot, VALID_DECK } from './vocabularySession'
import { confirmSnapshot, createReviewSubmission } from './reviewSubmission'

let storage
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('window', { localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } })
})
afterEach(() => vi.unstubAllGlobals())
const snapshot = (userId) => ({
  userId, level: 'all', status: 'ready', i: 0, studyIdx: 0,
  stats: { correct: 0, attempts: 0, combo: 0, maxCombo: 0 }, wrongIds: [],
  queue: [{ id: VALID_DECK[0].id }],
})
describe('study snapshot storage', () => {
  it('avoids ambiguous spelling across CEFR levels while keeping distractors in the selected level', () => {
    const deck = VALID_DECK.filter((word) => word.level === 'B1')
    const word = deck.find((entry) => entry.french === 'cependant')
    const synonym = VALID_DECK.find((entry) => entry.french === 'toutefois')
    expect(synonym.level).toBe('C1')
    expect(word.chinese).toBe(synonym.chinese)
    const queue = [...deck.filter((entry) => entry.id !== word.id).slice(0, 4), word].map((entry) => ({ word: entry }))
    expect(buildSession(queue, deck).at(-1).exercise.type).toBe('recognition')
  })
  it('isolates accounts when saving, reading and clearing snapshots', () => {
    writeSessionSnapshot(snapshot('a'))
    writeSessionSnapshot(snapshot('b'))
    expect(readSessionSnapshot('a').userId).toBe('a')
    clearSessionSnapshot('b')
    expect(readSessionSnapshot('b')).toBeNull()
    expect(readSessionSnapshot('a')).not.toBeNull()
  })
  it.each([true, false])('retains a final pending answer across reload and midnight (correct=%s)', (correct) => {
    const saved = snapshot('a')
    saved.pending = createReviewSubmission({ userId: 'a', wordId: VALID_DECK[0].id, correct, now: '2026-01-01T00:00:00Z' })
    writeSessionSnapshot(saved)
    const key = [...storage.keys()][0]
    storage.set(key, JSON.stringify({ ...JSON.parse(storage.get(key)), day: '2026-01-01' }))
    const restored = readSessionSnapshot('a')
    expect(restored.pending).toEqual(saved.pending)
    const confirmed = confirmSnapshot(restored)
    expect(confirmed.i).toBe(buildSession([{ word: VALID_DECK[0] }], VALID_DECK).length)
    expect(confirmed.stats.attempts).toBe(1)
    expect(confirmed.wrongIds).toEqual(correct ? [] : [VALID_DECK[0].id])
  })
})
