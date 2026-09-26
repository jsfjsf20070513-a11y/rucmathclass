import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeResourcePayload, submitResourceRecommendation, RECOMMENDATION_COLUMNS } from './resourceRecommendations'

const harness = vi.hoisted(() => ({ configured: true, client: null }))
vi.mock('./supabase', () => ({
  get isSupabaseConfigured() { return harness.configured },
  supabase: { from: (...args) => harness.client.from(...args) },
  SUPABASE_MISSING_MESSAGE: '尚未配置',
}))
const form = { title: '  Lecture ', category: '数学', url: 'https://example.com', description: '  讲义 ' }
const user = { id: 'user-a', email: 'a@example.invalid', user_metadata: { nickname: 'A' } }
let query
beforeEach(() => {
  harness.configured = true
  query = {
    insert: vi.fn(() => query), select: vi.fn(() => query), abortSignal: vi.fn(() => query),
    single: vi.fn(async () => ({ data: { id: 42 }, error: null })),
  }
  harness.client = { from: vi.fn(() => query) }
})
describe('resource recommendation write contract', () => {
  it('writes only a resource envelope in the existing queue and never selects the contact email', async () => {
    expect(await submitResourceRecommendation(form, user)).toEqual({ id: 42, title: 'Lecture' })
    expect(harness.client.from).toHaveBeenCalledWith('comments')
    const [record] = query.insert.mock.calls[0][0]
    expect(record).toMatchObject({ album_id: 0, user_id: user.id, user_email: user.email, user_nickname: 'A' })
    const prefix = '__mathclass_ops__::'
    expect(record.content.startsWith(prefix)).toBe(true)
    expect(JSON.parse(record.content.slice(prefix.length))).toEqual({
      version: 1, kind: 'resource', payload: { category: '数学', title: 'Lecture', url: form.url, tag: '', description: '讲义' },
    })
    expect(query.select).toHaveBeenCalledWith(RECOMMENDATION_COLUMNS)
    expect(RECOMMENDATION_COLUMNS.split(',')).toEqual(['id', 'album_id', 'content', 'user_id', 'user_nickname', 'created_at'])
  })
  it('rejects incomplete or unsafe recommendations before any write', async () => {
    for (const invalid of [{ title: ' ' }, { category: '' }, { url: 'javascript:alert(1)' }, { url: 'data:text/html,x' }]) {
      await expect(submitResourceRecommendation({ ...form, ...invalid }, user)).rejects.toThrow('有效的资源链接')
    }
    expect(query.insert).not.toHaveBeenCalled()
    expect(normalizeResourcePayload({ ...form, tag: '  讲义 ' })).toMatchObject({ title: 'Lecture', tag: '讲义' })
  })
  it('requires a configured service and an identified account', async () => {
    await expect(submitResourceRecommendation(form, {})).rejects.toThrow('先登录')
    harness.configured = false
    await expect(submitResourceRecommendation(form, user)).rejects.toThrow('尚未配置')
    expect(query.insert).not.toHaveBeenCalled()
  })
  it('reports a definite database rejection without claiming success', async () => {
    query.single.mockResolvedValue({ error: { code: '42501', message: '无权提交' } })
    await expect(submitResourceRecommendation(form, user)).rejects.toThrow('无权提交')
  })
  it.each([
    { error: { message: 'response lost' } },
    { error: { code: 'ECONNRESET', message: 'connection reset' } },
    { data: null, error: null },
  ])('does not turn an ambiguous write result into a retry invitation (%j)', async (result) => {
    query.single.mockResolvedValue(result)
    await expect(submitResourceRecommendation(form, user)).rejects.toMatchObject({ code: 'SUBMISSION_UNCONFIRMED' })
    expect(query.insert).toHaveBeenCalledTimes(1)
  })
  it('treats a transport exception as an unconfirmed write', async () => {
    query.single.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(submitResourceRecommendation(form, user)).rejects.toMatchObject({ code: 'SUBMISSION_UNCONFIRMED' })
  })
})
