import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '../test/fakeSupabase'
import { createReviewSubmission } from './reviewSubmission'
import { fetchReviewStateMap, saveReviewState } from './vocabularyBackend'

const harness = vi.hoisted(() => ({ client: null }))
vi.mock('./supabase', () => ({ isSupabaseConfigured: true, supabase: { from: (...args) => harness.client.from(...args) } }))
const base = { user_id: 'u1', word_id: 'w1', proficiency_level: 2, streak_count: 2, updated_at: '2026-09-25T00:00:00Z' }
const attempt = (state = base, correct = true) => createReviewSubmission({ state, userId: 'u1', wordId: 'w1', correct, now: '2026-09-26T10:00:00Z' })
const save = (pending) => saveReviewState(pending.state, pending.expectedUpdatedAt)
beforeEach(() => { harness.client = fakeSupabase([base, { ...base, user_id: 'u2' }]) })

describe('review repository concurrency', () => {
  it('reads every server-capped page, including the final empty page, and updates an existing late-page word', async () => {
    harness.client = fakeSupabase(Array.from({ length: 5 }, (_, i) => ({ ...base, word_id: `w${i}` })))
    harness.client.pageLimit = 2
    const { states } = await fetchReviewStateMap('u1')
    expect(Object.keys(states)).toEqual(['w0', 'w1', 'w2', 'w3', 'w4'])
    expect(harness.client.calls).toHaveLength(4)
    const pending = createReviewSubmission({ state: states.w4, userId: 'u1', wordId: 'w4', correct: true, now: '2026-09-26T10:00:00Z' })
    await save(pending)
    expect(harness.client.calls.at(-1).action).toBe('update')
  })
  it('does not overwrite a newer device or another user', async () => {
    await save(attempt())
    await expect(save(attempt(base, false))).rejects.toMatchObject({ code: 'REVIEW_CONFLICT' })
    expect(harness.client.rows.find((r) => r.user_id === 'u1').proficiency_level).toBe(3)
    expect(harness.client.rows.find((r) => r.user_id === 'u2')).toEqual({ ...base, user_id: 'u2' })
  })
  it('retries a committed write with lost response without advancing twice', async () => {
    const pending = attempt()
    harness.client.loseNextWriteResponse()
    await expect(save(pending)).rejects.toMatchObject({ message: 'response lost after commit' })
    expect((await save(pending)).state.proficiency_level).toBe(3)
    expect(harness.client.rows[0].streak_count).toBe(3)
  })
  it('uses insert for a new word and treats a conflicting insert as a conflict', async () => {
    harness.client = fakeSupabase()
    await save(attempt(null))
    expect(harness.client.calls[0].action).toBe('insert')
  })
  it('confirms a lost INSERT response, but never overwrites a different new-word attempt', async () => {
    harness.client = fakeSupabase()
    const pending = attempt(null)
    harness.client.loseNextWriteResponse()
    await expect(save(pending)).rejects.toBeDefined()
    expect((await save(pending)).state.proficiency_level).toBe(1)
    await expect(save(attempt(null, false))).rejects.toMatchObject({ code: 'REVIEW_CONFLICT' })
    expect(harness.client.rows).toHaveLength(1)
  })
})
