import { afterEach, beforeEach, expect, it } from 'vitest'
import { createFetchMock, fetch as mockFetch, Miniflare } from 'miniflare'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { lectureSamples } from '../../src/data/lectureSamples.js'
import { lectureAssignment } from './lecturePrompt.js'
import { lectureSummary } from './lectureStore.js'

const compatibilityDate = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  .match(/^compatibility_date = "([^"]+)"/m)[1]
const authOrigin = 'https://auth.example.invalid'
const user = { id: '11111111-1111-4111-8111-111111111111' }
let runtime, upstream

beforeEach(async () => {
  upstream = createFetchMock()
  upstream.disableNetConnect()
  runtime = new Miniflare({
    modules: true,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    scriptPath: fileURLToPath(new URL('./index.js', import.meta.url)),
    compatibilityDate, kvNamespaces: ['LECTURE'], unsafeTriggerHandlers: true,
    // Return raw 3xx responses from the Node transport; workerd decides whether to follow them.
    outboundService: (request) => mockFetch(request, { dispatcher: upstream, redirect: 'manual' }),
    bindings: {
      SUPABASE_URL: authOrigin, SUPABASE_ANON_KEY: 'fixture-key', GEMINI_API_KEY: 'fixture-model-key', OPENAI_API_KEY: 'fixture-openai',
    },
    ratelimits: { RATE_LIMITER: { simple: { limit: 30, period: 60 } } },
  })
  // Process startup can be slow on a busy host; it is separate from request assertions.
  await runtime.ready
}, 20_000)
afterEach(async () => { await runtime?.dispose(); await upstream?.close() })

const chat = () => runtime.dispatchFetch('https://rucmathclass.com/api/chat', {
  method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' }, body: '{}',
})
const authRequest = () => upstream.get(authOrigin).intercept({
  path: '/auth/v1/user', method: 'GET', headers: { apikey: 'fixture-key', authorization: 'Bearer fixture-token' },
})

it('recognizes an expired session in the Workers runtime', async () => {
  authRequest().reply(403, { error_code: 'bad_jwt' })
  expect((await chat()).status).toBe(401)
  upstream.assertNoPendingInterceptors()
})

it('allows a verified session through to input validation without a model request', async () => {
  authRequest().reply(200, user)
  expect((await chat()).status).toBe(400)
  upstream.assertNoPendingInterceptors()
})

it('uses Sol after authentication and records its charge in the local LECTURE KV', async () => {
  authRequest().reply(200, user)
  const completed = { type: 'response.completed', response: { status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: '回答' }] }],
    usage: { input_tokens: 100, output_tokens: 30 } } }
  upstream.get('https://api.openai.com').intercept({ method: 'POST', path: '/v1/responses' })
    .reply(200, 'data: ' + JSON.stringify(completed) + '\n\n')
  const response = await runtime.dispatchFetch('https://rucmathclass.com/api/chat', {
    method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '你好' }] }),
  })
  expect(await response.json()).toEqual({ model: 'gpt-6.2-sol', text: '回答' })
  const kv = await runtime.getKVNamespace('LECTURE')
  const { keys } = await kv.list({ prefix: 'usage:' })
  expect(keys).toHaveLength(2)
  expect(keys.find(key => key.name.endsWith(':settle')).metadata).toMatchObject({
    userId: user.id, searches: 0, costMicros: 550,
  })
  upstream.assertNoPendingInterceptors()
})

it('rejects an auth redirect without forwarding the session to another host', async () => {
  let followed = false
  authRequest().reply(302, '', { headers: { location: 'https://redirect.example.invalid/user' } })
  upstream.get('https://redirect.example.invalid').intercept({ path: '/user' }).reply(200, () => {
    followed = true
    return JSON.stringify(user)
  })
  expect((await chat()).status).toBe(503)
  expect(followed).toBe(false)
})

it('runs the cron against local KV and serves only public metadata through the Workers cache', async () => {
  const date = '2026-11-19'
  const article = { ...lectureSamples[0], date, ...lectureAssignment(date) }
  const kv = await runtime.getKVNamespace('LECTURE')
  await kv.put('result:2026-11-18', JSON.stringify({ status: 'fixture' }))
  const model = upstream.get('https://api.openai.com')
  model.intercept({ method: 'POST', path: '/v1/responses', headers: { authorization: 'Bearer fixture-openai' } })
    .reply(200, { id: 'resp_fixture', status: 'queued' })
  model.intercept({ method: 'GET', path: '/v1/responses/resp_fixture' })
    .reply(200, { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(article) }] }] })
  const tick = (time) => runtime.dispatchFetch('http://localhost/cdn-cgi/handler/scheduled?time=' + Date.parse(time))
  expect((await tick('2026-11-18T04:00:00Z')).ok).toBe(true)
  expect(await kv.get('pending:' + date, 'json')).toMatchObject({ id: 'resp_fixture' })
  expect((await tick('2026-11-18T04:05:00Z')).ok).toBe(true)
  expect(await kv.get('day:' + date, 'json')).toEqual(article)
  upstream.assertNoPendingInterceptors()

  // 上线时间由运行时的北京时间决定。即使本机时钟早于样稿，也不能提前公开。
  const published = Date.now() >= Date.parse(date + 'T00:00:00+08:00')
  for (const origin of ['https://rucmathclass.com', 'https://www.rucmathclass.com']) {
    const index = await runtime.dispatchFetch('https://rucmathclass.com/api/lecture?noise=' + origin.length, { headers: { Origin: origin } })
    expect(index.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(await index.json()).toEqual(published ? [lectureSummary(article)] : [])
  }
  expect((await runtime.dispatchFetch('https://rucmathclass.com/api/lecture/pending:' + date)).status).toBe(404)
})

it('streams the Gemini fallback through workerd when the budget service is unavailable', async () => {
  authRequest().reply(200, user)
  const gemini = upstream.get('https://generativelanguage.googleapis.com')
  gemini.intercept({ method: 'GET', path: '/v1beta/models?pageSize=1000' }).reply(200, {
    models: [{ name: 'models/gemini-fixture-flash', supportedGenerationMethods: ['generateContent'] }],
  })
  const events = [
    { candidates: [{ content: { parts: [{ text: '第一步' }] } }] },
    { candidates: [{ content: { parts: [{ text: '。' }] }, finishReason: 'STOP' }] },
  ]
  gemini.intercept({ method: 'POST', path: '/v1beta/models/gemini-fixture-flash:streamGenerateContent?alt=sse' })
    .reply(200, events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''))
  const response = await runtime.dispatchFetch('https://rucmathclass.com/api/chat', {
    method: 'POST', headers: { Authorization: 'Bearer fixture-token', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '问题' }] }),
  })
  expect(response.headers.get('Content-Type')).toContain('application/x-ndjson')
  expect((await response.text()).trim().split('\n').map(line => JSON.parse(line))).toEqual([
    { reset: true }, { delta: '第一步' }, { delta: '。' }, { done: true, text: '第一步。' },
  ])
  upstream.assertNoPendingInterceptors()
})
