import { describe, expect, it } from 'vitest'
import { confirmSnapshot, createReviewSubmission } from './reviewSubmission'

const oldState = { user_id: 'u1', word_id: 'w1', proficiency_level: 2, streak_count: 2, updated_at: '2026-09-26T10:00:00.123456Z' }
describe('review submission', () => {
  it('freezes the expected version without losing PostgreSQL precision and generates a different new version', () => {
    const pending = createReviewSubmission({ state: oldState, userId: 'u1', wordId: 'w1', correct: true, now: oldState.updated_at })
    expect(pending.expectedUpdatedAt).toBe(oldState.updated_at)
    expect(pending.state.proficiency_level).toBe(3)
    expect(pending.state.updated_at).not.toBe(oldState.updated_at)
  })
  it('advances score and cursor exactly once only on confirmation', () => {
    const pending = createReviewSubmission({ state: oldState, userId: 'u1', wordId: 'w1', correct: false, now: '2026-09-26T11:00:00Z' })
    const snapshot = { i: 3, stats: { correct: 2, attempts: 3, combo: 2, maxCombo: 2 }, wrongIds: [], pending }
    const confirmed = confirmSnapshot(JSON.parse(JSON.stringify(snapshot)))
    expect(snapshot.i).toBe(3)
    expect(confirmed).toMatchObject({ i: 4, pending: null, wrongIds: ['w1'], stats: { correct: 2, attempts: 4, combo: 0 } })
    expect(confirmSnapshot(confirmed)).toEqual(confirmed)
  })
})
