import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import worker from './index.js'
import { lectureSamples } from '../../src/data/lectureSamples.js'
import { bannedLecturePhrases } from '../../src/lib/lectureContent.js'
import { lectureAssignment } from './lecturePrompt.js'
import { dayMs, lectureIndex, lectureSummary } from './lectureStore.js'

const now = Date.parse('2026-11-20T15:55:00Z')
const date = '2026-11-21'
const day = { ...lectureSamples[0], ...lectureAssignment(date), date, title: 'Une nouvelle lecture' }
const completed = (value) => ({ status: 'completed', output: [
  { type: 'reasoning' }, { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
] })
let env, kv, upstream

function fixtureKV() {
  const rows = new Map()
  return {
    get: vi.fn(async (key, type) => {
      const value = rows.get(key)?.value ?? null
      return type === 'json' ? JSON.parse(value) : value
    }),
    put: vi.fn(async (key, value, options) => rows.set(key, { value, metadata: options?.metadata })),
    delete: vi.fn(async (key) => rows.delete(key)),
    list: async ({ prefix, cursor }) => {
      const keys = [...rows.keys()].sort().filter((name) => name.startsWith(prefix) && (!cursor || name > cursor))
      const page = keys.slice(0, 2).map((name) => ({ name, metadata: rows.get(name).metadata }))
      return { keys: page, cursor: page.at(-1)?.name, list_complete: keys.length <= 2 }
    },
  }
}
const tick = (time = now) => {
  let work
  worker.scheduled({ scheduledTime: time }, env, { waitUntil: (promise) => { work = promise } })
  return work
}
const reply = (json, status = 200) => upstream.mockResolvedValueOnce(Response.json(json, { status }))
const store = (article) => kv.put('day:' + article.date, JSON.stringify(article), { metadata: lectureSummary(article) })
const read = (suffix = '', options = {}) => worker.fetch(new Request('https://rucmathclass.com/api/lecture' + suffix, options), env, {})

beforeEach(() => {
  kv = fixtureKV()
  env = { LECTURE: kv, OPENAI_API_KEY: 'mock', RATE_LIMITER: { limit: vi.fn() } }
  upstream = vi.fn(() => { throw new Error('unexpected fetch') })
  vi.stubGlobal('fetch', upstream)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('creates one background response for Beijing tomorrow and resumes it across midnight', async () => {
  for (const seed of lectureSamples) await store(seed)
  await store({ ...day, date: '2026-10-21', title: 'old title' })
  reply({ status: 'queued', id: 'resp_one' })
  await tick()
  const body = JSON.parse(upstream.mock.calls[0][1].body)
  expect(body).toMatchObject({ model: 'gpt-6.2-astra', background: true, reasoning: { effort: 'high' },
    service_tier: 'default', background_options: { completion_window: '8h' }, text: { format: { type: 'json_schema', strict: true } } })
  expect(body.input).toContain(date)
  expect(body.input).not.toContain('old title')
  for (const { title } of lectureSamples) expect(body.input).toContain(title)
  for (const phrase of bannedLecturePhrases) expect(body.instructions).toContain(phrase)
  expect(await kv.get('day:' + date)).toBeNull()
  reply({ status: 'in_progress' })
  await tick()
  reply({ status: 'queued', id: 'resp_two' })
  reply(completed(day))
  await tick(now + 5 * 60_000)
  expect(upstream.mock.calls.map(([url, opts]) => [opts.method, url.split('/').at(-1)]))
    .toEqual([['POST','responses'], ['GET','resp_one'], ['POST','responses'], ['GET','resp_one']])
  expect(await kv.get('day:' + date, 'json')).toEqual(day)
  expect(await kv.get('pending:2026-11-22', 'json')).toMatchObject({ id: 'resp_two' })
  expect(await lectureIndex(kv, date)).toEqual([...lectureSamples, day].map(lectureSummary))
  await tick()
  expect(upstream).toHaveBeenCalledTimes(5) // 只轮询仍在进行的 22 日任务。
})

it('records all five failures privately and never indexes rejected output or restarts an exhausted day', async () => {
  const bad = structuredClone(day)
  bad.questions[0].evidence = ['不存在的原文']
  for (const data of [
    completed(bad), { status: 'failed', error: { code: 'server_error' } },
    { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
    { status: 'completed', output: [] }, { status: 'cancelled' },
  ]) { reply(data); await tick(); expect(await lectureIndex(kv, date)).toEqual([]) }
  await tick()
  const result = await kv.get('result:' + date, 'json')
  expect(result.status).toBe('abandoned')
  expect(result.failures[0].problems).toContain('第 1 题：引用的原文在文章里找不到')
  expect(result.failures.map((f) => f.model)).toEqual(['astra','astra','astra','sol','sol'].map((name) => 'gpt-6.2-' + name))
  expect(upstream.mock.calls.map(([, args]) => JSON.parse(args.body).model)).toEqual(result.failures.map((f) => f.model))
  expect(await kv.get('day:' + date)).toBeNull()
  expect(await kv.get('pending:' + date)).toBeNull()
})

it('keeps a response id through transient poll errors and retains diagnostics after a successful retry', async () => {
  reply({ status: 'queued', id: 'resp_retry' })
  await tick()
  reply({}, 503)
  await tick()
  expect(await kv.get('pending:' + date, 'json')).toMatchObject({ id: 'resp_retry', pollError: 'Responses HTTP 503' })
  reply({}, 404)
  await tick()
  reply(completed({ ...day, date: '2020-01-01' }))
  await tick()
  reply(completed(day))
  await tick()
  expect(await kv.get('result:' + date, 'json')).toMatchObject({ status: 'published', failures: [
    { problems: ['Responses HTTP 404'] }, { problems: ['文章日期与任务不符'] },
  ] })
  await tick()
  expect(upstream).toHaveBeenCalledTimes(5)
})

it('retires stuck requests and missing ids; retries a KV publication without buying another response', async () => {
  await kv.put('pending:' + date, JSON.stringify({ id: 'expired', started: now - dayMs, failures: [], titles: [] }))
  reply({ status: 'queued' })
  await tick()
  reply({ status: 'queued' })
  await tick()
  reply({ status: 'queued', id: 'ok' })
  await tick()
  reply(completed(day))
  kv.put.mockRejectedValueOnce(new Error('KV unavailable'))
  await expect(tick()).rejects.toThrow('KV unavailable')
  reply(completed(day))
  await tick()
  expect(upstream.mock.calls.at(-1)[1].method).toBe('GET')
  expect(await kv.get('result:' + date, 'json')).toMatchObject({ failures: [
    { problems: ['超过一天仍未完成'] }, { problems: ['创建任务未返回 response id'] },
  ] })
})

it('public GETs show published dates through Beijing today with CORS, pagination and bounded cache lifetime', async () => {
  for (const seed of lectureSamples) await store(seed)
  await store(day)
  const response = await read('?noise=a', { headers: { Origin: 'https://www.rucmathclass.com' } })
  expect(await response.json()).toEqual(lectureSamples.map(lectureSummary))
  expect(response.headers.get('Cache-Control')).toBe('public, max-age=300')
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://www.rucmathclass.com')
  expect(await (await read('/2026-11-20')).json()).toEqual(lectureSamples[2])
  kv.get.mockClear()
  for (const path of ['/2026-11-21','/2026-02-30','/1900-01-01','/pending:2026-11-21','/2026-11-20/extra']) {
    expect((await read(path)).status).toBe(404)
  }
  expect(kv.get).not.toHaveBeenCalled()
  expect((await read('', { method: 'POST' })).status).toBe(405)
  expect((await read('', { method: 'OPTIONS' })).status).toBe(204)
  vi.setSystemTime(Date.parse('2026-11-20T15:59:58Z'))
  expect((await read()).headers.get('Cache-Control')).toBe('public, max-age=2')
  vi.setSystemTime(Date.parse('2026-11-20T16:00:00Z'))
  expect(await (await read('/' + date)).json()).toEqual(day)
  await kv.delete('day:' + date)
  expect((await read('/' + date)).status).toBe(404)
  kv.get.mockRejectedValueOnce(new Error())
  expect((await read('/' + date)).status).toBe(503)
  expect(env.RATE_LIMITER.limit).not.toHaveBeenCalled()
  expect(upstream).not.toHaveBeenCalled()
})
