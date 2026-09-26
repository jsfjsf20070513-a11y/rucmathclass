import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase } from '../test/fakeSupabase'
import { buildPublicResourceCatalog, staticResourceCatalog } from '../data/resourceCatalog'
import { fetchPublishedResources, subscribeToPublishedResources } from './resourceBackend'

const harness = vi.hoisted(() => ({ configured: true, client: null }))
vi.mock('./supabase', () => ({
  get isSupabaseConfigured() { return harness.configured },
  supabase: { from: (...args) => harness.client.from(...args) },
}))

beforeEach(() => {
  harness.configured = true
  harness.client = fakeSupabase()
})

describe('public resource repository', () => {
  it('subscribes only to resources and suppresses late events after unmount', () => {
    const change = vi.fn()
    let notify
    const channel = {
      on: vi.fn((_type, _filter, callback) => { notify = callback; return channel }),
      subscribe: vi.fn(() => channel),
    }
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() }
    const stop = subscribeToPublishedResources(change, client)
    expect(channel.on.mock.calls[0][1]).toEqual({ event: '*', schema: 'public', table: 'resources' })
    notify()
    expect(change).toHaveBeenCalledTimes(1)
    stop()
    notify()
    expect(change).toHaveBeenCalledTimes(1)
    expect(client.removeChannel).toHaveBeenCalledWith(channel)
    expect(() => subscribeToPublishedResources(change, null)()).not.toThrow()
  })
  it('reads only resources, across server-limited pages, newest first with deterministic ties', async () => {
    harness.client = fakeSupabase([
      { id: 1, title: 'Old', created_at: '2026-08-01T00:00:00Z' },
      { id: 3, title: 'Same date, newer id', created_at: '2026-09-01T00:00:00Z' },
      { id: 2, title: 'New', created_at: '2026-09-01T00:00:00Z' },
    ])
    harness.client.pageLimit = 1
    const resources = await fetchPublishedResources()
    expect(resources.map((r) => r.id)).toEqual(['official-resource-3', 'official-resource-2', 'official-resource-1'])
    expect(harness.client.calls).toHaveLength(4)
    expect(harness.client.calls.every((c) => c.table === 'resources' && c.action === 'select')).toBe(true)
    expect(harness.client.calls.every((c) => c.columns !== '*' && !c.columns.includes('published_by'))).toBe(true)
  })

  it('preserves display fields while removing unsafe stored URLs', async () => {
    harness.client = fakeSupabase([{ id: 9, title: 'Reading', url: 'javascript:alert(1)', source_submission_id: 4 }])
    const [resource] = await fetchPublishedResources()
    expect(resource).toMatchObject({
      id: 'official-resource-9', title: 'Reading', url: '', category: '未分类',
      tag: '', description: '', curator: '站点协作', official: true, published: true,
      sourceSubmissionId: 4,
    })
  })

  it('propagates missing-table and network errors instead of reporting an empty successful catalog', async () => {
    harness.client.from = () => { throw new Error('resources unavailable') }
    await expect(fetchPublishedResources()).rejects.toThrow('resources unavailable')
    const query = {
      select: () => query, order: () => query, limit: () => query, abortSignal: () => query,
      then: (resolve) => Promise.resolve({ error: { code: 'PGRST205' } }).then(resolve),
    }
    harness.client.from = () => query
    await expect(fetchPublishedResources()).rejects.toEqual({ code: 'PGRST205' })
  })

  it('does not request cloud data when Supabase is not configured', async () => {
    harness.configured = false
    expect(await fetchPublishedResources()).toEqual([])
    expect(harness.client.calls).toEqual([])
  })

  it('passes cancellation through to the read transport', async () => {
    const controller = new AbortController()
    controller.abort()
    let receivedSignal
    const query = {
      select: () => query, order: () => query, limit: () => query,
      abortSignal: (signal) => { receivedSignal = signal; return query },
      then: (resolve) => Promise.resolve({ error: { message: 'aborted' } }).then(resolve),
    }
    harness.client.from = () => query
    await expect(fetchPublishedResources({ signal: controller.signal })).rejects.toEqual({ message: 'aborted' })
    expect(receivedSignal.aborted).toBe(true)
  })
})

describe('public catalog composition', () => {
  it('keeps static books available and lets an exact publication replace its catalog entry', () => {
    const original = staticResourceCatalog[0]
    const published = { ...original, id: 'official-resource-1', title: ` ${original.title.toUpperCase()} ` }
    expect(buildPublicResourceCatalog({})).toEqual(staticResourceCatalog)
    const catalog = buildPublicResourceCatalog({ officialResources: [published] })
    expect(catalog).toHaveLength(staticResourceCatalog.length)
    expect(catalog[0]).toMatchObject({ id: published.id, sourceKind: 'published' })
    expect(catalog.some((r) => r.id === original.id)).toBe(false)
  })

  it('keeps the same link when it deliberately belongs to another shelf', () => {
    const published = { ...staticResourceCatalog[0], id: 'official-resource-1', category: '另一书架' }
    expect(buildPublicResourceCatalog({ officialResources: [published] })).toHaveLength(staticResourceCatalog.length + 1)
  })
})
