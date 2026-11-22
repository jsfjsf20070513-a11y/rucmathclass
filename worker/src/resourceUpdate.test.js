import { afterEach, expect, it, vi } from 'vitest'
import { staticResourceCatalog as seed } from '../../src/data/resourceCatalog.js'
import { validateCatalog } from '../../src/lib/resourcePolicy.js'
import { monthlyBudget } from './chatUsage.js'
import worker from './index.js'
import { runSiteTool } from './chatTools.js'
import { catalogKey, publishResources, readResources, resourceState, rollbackResources } from './resourceStore.js'
import { applyProposal, updateResources } from './resourceUpdate.js'
import { probeResource } from './resourceLinks.js'

function memory() {
  const entries = new Map()
  return { entries, get: async key => entries.has(key) ? JSON.parse(entries.get(key)) : null,
    list: async ({ prefix }) => ({ keys: [...entries.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })), list_complete: true }),
    put: vi.fn(async (key, value) => entries.set(key, value)), delete: async key => entries.delete(key) }
}

const time = Date.parse('2026-11-22T21:07:00Z')
const weekly = { remove: [], add: [], reason: '本周已有合适的书目。' }
const newItem = (i, category = seed[0].category) => ({ ...seed[0], category, id: 'new-' + i,
  title: '新书' + i, url: 'https://publisher.org/book/' + i, before: null })
afterEach(() => vi.unstubAllGlobals())

it('protects six shelves, full-shelf replacement, the green book and weekly change limits', () => {
  expect(validateCatalog(seed)).toBe(seed)
  expect(() => applyProposal(seed, { remove: [], add: [newItem(0)] })).toThrow('六条')
  const replacement = applyProposal(seed, { remove: [seed[0].id], add: [{ ...newItem(0), before: seed[1].id }] })
  expect(replacement[0].id).toBe('new-0')
  expect(() => applyProposal(seed, { remove: ['green-book'], add: [] })).toThrow()
  expect(() => validateCatalog(seed.filter(item => item.id !== 'green-book'))).toThrow('green-book')
  expect(() => applyProposal(seed, { remove: seed.slice(0, 4).map(i => i.id), add: [] })).toThrow('增五删三')
  expect(() => applyProposal(seed, { remove: [], add: Array.from({ length: 6 }, (_, i) => newItem(i)) })).toThrow('增五删三')
  expect(() => validateCatalog(Array(37).fill(seed[0]))).toThrow('36')
  expect(() => validateCatalog([ ...seed, { ...newItem(2, '代数'), url: seed[0].url + '?utm_medium=web' } ])).toThrow('重复')
})

it.each([
  'su-analysis', 'strogatz-chaos', 'strang-linear', 'axler-linear',
  'gross-algebra', 'tokieda-topology', 'blitzstein-probability', 'green-book',
])('keeps %s on its shelf through weekly updates', id => {
  expect(seed.some(item => item.id === id)).toBe(true)
  expect(() => applyProposal(seed, { remove: [id], add: [] })).toThrow('下架')
  expect(() => validateCatalog(seed.filter(item => item.id !== id))).toThrow(id)
})

function upstream(proposal = weekly, verdict = { approved: true }, broken) {
  const requests = []
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (url !== 'https://api.openai.com/v1/responses') {
      if (url === broken) return new Response(null, { status: 404 })
      return new Response('<html><title>大学课程</title><main>练习题</main></html>', { headers: { 'Content-Type': 'text/html' } })
    }
    const payload = JSON.parse(options.body)
    requests.push(payload)
    const content = [{ type: 'output_text', text: JSON.stringify(requests.length === 1 ? proposal : verdict) }]
    return new Response('data: ' + JSON.stringify({ type: 'response.completed', response: {
      output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', content }],
      status: 'completed', usage: { input_tokens: 100, output_tokens: 20 },
    } }) + '\n\n')
  }))
  return requests
}

it('bootstraps from the seed after two separate metered web calls, and serves the same KV edition to readers and chat', async () => {
  const env = { LECTURE: memory(), OPENAI_API_KEY: 'fixture' }
  const get = () => worker.fetch(new Request('https://example.org/api/resources'), env).then(r => r.json())
  expect(await get()).toEqual(seed)
  const proposal = { ...weekly, remove: [seed[0].id], add: [newItem(0)] }
  const requests = upstream(proposal)
  expect(await updateResources(env, time)).toBe('published')
  expect(requests).toHaveLength(2)
  expect(requests.every(r => !r.previous_response_id && r.tools.length === 1 && r.tool_choice.type === 'web_search')).toBe(true)
  expect(requests[1].instructions).toContain('独立复核')
  expect((await env.LECTURE.list({ prefix: 'usage:' })).keys).toHaveLength(4)
  const items = await get()
  expect(items).not.toEqual(seed)
  const tool = await runSiteTool({ name: 'resources', arguments: '{"query":"新书0"}' }, { env })
  expect(tool[0].url).toBe(items.find(item => item.id === 'new-0').url)
  expect(await updateResources(env, time)).toBe('already-published')
  expect(await env.LECTURE.get('resources:backup:seed')).toMatchObject({ items: seed })
})

it.each(['dead-existing', 'dead-new', 'review', 'invalid-review'])('keeps the catalog and its backups untouched on %s', async reason => {
  const env = { LECTURE: memory(), OPENAI_API_KEY: 'fixture' }
  const candidate = newItem(0)
  const proposal = { ...weekly, remove: [seed[0].id], add: [candidate] }
  const broken = { 'dead-existing': seed[1].url, 'dead-new': candidate.url }[reason]
  const requests = upstream(proposal, { approved: reason === 'invalid-review' ? 'true' : false }, broken)
  expect(await updateResources(env, time)).toBe(broken ? 'failed-links' : 'rejected')
  expect(requests).toHaveLength(broken ? 1 : 2)
  expect((await env.LECTURE.list({ prefix: 'resources:' })).keys).toEqual([])
})

it('skips the entire job when the assistant monthly budget is exhausted', async () => {
  const kv = memory()
  const month = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7)
  await kv.put('usage:' + month + ':fixture:settle', JSON.stringify({ costMicros: monthlyBudget }))
  upstream()
  expect(await updateResources({ LECTURE: kv, OPENAI_API_KEY: 'fixture' }, time)).toBe('skipped-budget')
  expect(fetch).not.toHaveBeenCalled()
})

it('retains eight full editions, supports consecutive rollbacks and refuses a stale writer', async () => {
  const kv = memory()
  const first = await resourceState(kv)
  let state = first
  const editions = []
  for (let i = 0; i < 10; i++) {
    const items = state.items.map((item, index) => index === 0 ? { ...item, subject: '专题数学' + i } : item)
    state = await publishResources(kv, state, items, '2026-11-23')
    editions.push(items)
  }
  expect((await kv.list({ prefix: 'resources:backup:' })).keys).toHaveLength(8)
  expect((await rollbackResources(kv)).items).toEqual(editions[8])
  expect((await rollbackResources(kv)).items).toEqual(editions[7])
  await expect(publishResources(kv, first, seed, '2026-11-23')).rejects.toThrow('已变化')
  const current = await kv.get(catalogKey)
  kv.put.mockRejectedValueOnce(new Error('写入留底失败'))
  await expect(rollbackResources(kv)).rejects.toThrow('写入留底失败')
  expect(await kv.get(catalogKey)).toEqual(current)
})

it('falls back on a malformed or unavailable KV but never overwrites it with the seed', async () => {
  const kv = memory()
  await kv.put(catalogKey, '{}')
  expect(await readResources({ LECTURE: kv })).toEqual(seed)
  await expect(updateResources({ LECTURE: kv }, time)).rejects.toThrow()
  expect(await kv.get(catalogKey)).toEqual({})
  expect(await readResources({})).toEqual(seed)
})

it.each(['https://drive.google.com/file/a', 'https://127.0.0.1/', 'https://publisher.org/login'])('blocks forbidden redirect targets before fetching %s', async location => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location } })))
  await expect(probeResource(seed[0])).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('rejects a subscription screen even when it returns HTTP 200', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Subscribe to continue reading', { headers: { 'content-type': 'text/html' } })))
  await expect(probeResource(seed[0])).rejects.toThrow('订阅')
})

it('can repair a broken green-book link without changing its identity or trusting the stale probe', async () => {
  const env = { LECTURE: memory(), OPENAI_API_KEY: 'fixture' }
  const green = seed.find(item => item.id === 'green-book')
  const greenUrl = 'https://publisher.org/quantitative-finance-interviews'
  upstream({ ...weekly, greenUrl }, { approved: true }, green.url)
  expect(await updateResources(env, time)).toBe('published')
  expect((await readResources(env)).find(item => item.id === green.id)).toEqual({ ...green, url: greenUrl })
})

it('reads and rolls back old snapshots, and searches subjects from the public edition', async () => {
  const kv = memory()
  const env = { LECTURE: kv }
  const legacy = seed.map(book => ({ ...book, subject: undefined, description: '这是一句旧介绍。' }))
  legacy[0] = { ...legacy[0], id: 'archived-book', url: 'https://publisher.org/archive' }
  await kv.put(catalogKey, JSON.stringify({ revision: 'old', backups: [], items: legacy }))
  const books = await worker.fetch(new Request('https://example.org/api/resources'), env).then(r => r.json())
  expect(books[0]).toMatchObject({ id: 'archived-book', subject: '' })
  expect(books[1].subject).toBe('实分析')
  expect(books.every(book => !('description' in book))).toBe(true)
  const tool = await runSiteTool({ name: 'resources', arguments: '{"query":"实分析"}' }, { env })
  expect(tool.some(book => book.subject === '实分析')).toBe(true)
  expect(tool.every(book => !('description' in book))).toBe(true)
  await publishResources(kv, await resourceState(kv), seed, '2026-11-30')
  expect((await rollbackResources(kv)).items).toEqual(books)
})

it.each(['这门课介绍实分析。', '', undefined])('requires a subject for every proposed addition', subject => {
  expect(() => applyProposal(seed, { remove: [seed[0].id], add: [{ ...newItem(0), subject }] })).toThrow('学科名')
})
