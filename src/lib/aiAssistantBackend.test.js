import { describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '../test/fakeSupabase'
import { clearMessages, fetchMessages, saveTurn } from './aiAssistantBackend'

const harness = vi.hoisted(() => ({ client: null }))
vi.mock('./supabase', () => ({ isSupabaseConfigured: true, supabase: { from: (...args) => harness.client.from(...args) } }))
describe('assistant history repository', () => {
  it('bounds clearing to the observed rows and preserves a concurrently inserted message and other users', async () => {
    harness.client = fakeSupabase([{ id: 1, user_id: 'u1' }, { id: 2, user_id: 'u1' }, { id: 3, user_id: 'u2' }])
    harness.client.beforeWrite = () => harness.client.rows.push({ id: 4, user_id: 'u1' })
    await clearMessages('u1')
    expect(harness.client.rows).toEqual([{ id: 3, user_id: 'u2' }, { id: 4, user_id: 'u1' }])
  })
  it('returns the latest 200 in chronological order, scoped to the current user, with deterministic ties', async () => {
    harness.client = fakeSupabase(Array.from({ length: 250 }, (_, id) => ({
      id, user_id: 'u1', role: id % 2 ? 'model' : 'user', content: `${id}`, created_at: '2026-09-26T10:00:00Z',
    })).concat([{ id: 999, user_id: 'u2', role: 'user', content: 'private', created_at: '2026-09-27T10:00:00Z' }]))
    const { messages } = await fetchMessages('u1')
    expect(messages).toHaveLength(200)
    expect(messages[0].content).toBe('50')
    expect(messages.at(-1).content).toBe('249')
    expect(messages.some((m) => m.content === 'private')).toBe(false)
  })
  it('saves both sides in a single insert and never stores image bytes', async () => {
    harness.client = fakeSupabase()
    await saveTurn('u1', { role: 'user', content: '题目', imageData: { data: 'PRIVATE_IMAGE' } }, { role: 'model', content: '答案' })
    expect(harness.client.calls).toHaveLength(1)
    expect(harness.client.rows.map((r) => r.role)).toEqual(['user', 'model'])
    expect(harness.client.rows[0].content).toContain('重新上传')
    expect(JSON.stringify(harness.client.rows)).not.toContain('PRIVATE_IMAGE')
  })
})
