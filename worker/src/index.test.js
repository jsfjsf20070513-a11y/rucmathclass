import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import worker from './index.js'
import { handleChat } from './chat.js'
import { handleSpeak } from './tts.js'

vi.mock('./chat.js', () => ({ handleChat: vi.fn() }))
vi.mock('./tts.js', () => ({ handleSpeak: vi.fn() }))

const user = { id: '11111111-1111-4111-8111-111111111111' }
const origin = 'https://www.rucmathclass.com'
const environment = () => ({
  SUPABASE_URL: 'https://auth.example.invalid', SUPABASE_ANON_KEY: 'fixture-key',
  RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
})
function request(path = '/api/chat', options = {}) {
  return new Request(`https://rucmathclass.com${path}`, {
    method: path === '/api/chat' ? 'POST' : 'GET',
    headers: { Origin: origin, Authorization: 'Bearer fixture-token', 'CF-Connecting-IP': '192.0.2.1' },
    ...options,
  })
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json(user)))
  handleChat.mockImplementation(async () => Response.json({ text: 'fixture reply' }))
  handleSpeak.mockImplementation(async () => new Response('fixture audio'))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('rejects unknown paths and wrong methods before consuming quota or contacting models', async () => {
  const limit = vi.fn()
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  for (const [path, method, status] of [
    ['/api/speak-extra', 'GET', 404], ['/other/api/speak', 'GET', 404],
    ['/other', 'OPTIONS', 404], ['/api/chat', 'GET', 405], ['/api/speak', 'POST', 405],
    ['/api/chat', 'OPTIONS', 204],
  ]) {
    const response = await worker.fetch(new Request(`https://rucmathclass.com${path}`, { method, headers: { Origin: origin } }), { RATE_LIMITER: { limit } }, {})
    expect(response.status).toBe(status)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  }
  expect(limit).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('requires a bearer session on both endpoints before reading input or cached audio', async () => {
  const env = environment()
  for (const path of ['/api/chat', '/api/speak?text=bonjour']) {
    for (const authorization of ['', 'Basic fixture-token', 'Bearer one two', `Bearer ${'x'.repeat(8193)}`]) {
      const input = request(path, { headers: { Origin: origin, Authorization: authorization } })
      const response = await worker.fetch(input, env, {})
      expect(response.status).toBe(401)
      expect(input.bodyUsed).toBe(false)
    }
  }
  expect(env.RATE_LIMITER.limit).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  expect(handleChat).not.toHaveBeenCalled()
  expect(handleSpeak).not.toHaveBeenCalled()
})

it.each([
  { SUPABASE_URL: undefined }, { SUPABASE_URL: 'http://auth.example.invalid' },
  { SUPABASE_URL: 'https://auth.example.invalid/other' },
  { SUPABASE_URL: 'https://user:password@auth.example.invalid' },
  { SUPABASE_URL: 'https://auth.example.invalid/?query=unexpected' },
  { SUPABASE_ANON_KEY: undefined }, { RATE_LIMITER: undefined },
])('fails closed when service configuration is invalid: %j', async (patch) => {
  const response = await worker.fetch(request(), { ...environment(), ...patch }, {})
  expect(response.status).toBe(503)
  expect(fetch).not.toHaveBeenCalled()
  expect(handleChat).not.toHaveBeenCalled()
})

it.each([
  [async () => ({ success: false }), 429],
  [async () => { throw new Error('binding failed') }, 503],
  [async () => ({}), 503],
])('stops before authentication and models when limiting cannot allow the request', async (limit, status) => {
  const env = environment()
  env.RATE_LIMITER.limit.mockImplementation(limit)
  const response = await worker.fetch(request(), env, {})
  expect(response.status).toBe(status)
  expect(env.RATE_LIMITER.limit).toHaveBeenCalledWith({ key: '192.0.2.1' })
  expect(fetch).not.toHaveBeenCalled()
  expect(handleChat).not.toHaveBeenCalled()
})

it.each([400, 401, 403, 429, 500])('does not trust a rejected or unavailable auth response (%i)', async (status) => {
  fetch.mockResolvedValue(new Response('upstream diagnostic', { status }))
  const response = await worker.fetch(request(), environment(), {})
  expect(response.status).toBe(status < 429 ? 401 : 503)
  expect(await response.text()).not.toContain('upstream diagnostic')
  expect(handleChat).not.toHaveBeenCalled()
})

it.each(['not json', '{}', '{"id":"not-a-user-id"}', 'null'])('rejects incomplete auth responses: %s', async (body) => {
  fetch.mockResolvedValue(new Response(body))
  const response = await worker.fetch(request(), environment(), {})
  expect(response.status).toBe(503)
  expect(handleChat).not.toHaveBeenCalled()
})

it('verifies with the configured auth server before either handler and never sends conversation data to it', async () => {
  const env = environment()
  const input = request('/api/chat', { body: JSON.stringify({ messages: [{ role: 'user', content: 'private question' }] }) })
  expect((await worker.fetch(input, env, {})).status).toBe(200)
  expect(fetch).toHaveBeenCalledWith('https://auth.example.invalid/auth/v1/user', {
    method: 'GET', redirect: 'error', signal: expect.any(AbortSignal),
    headers: { apikey: 'fixture-key', Authorization: 'Bearer fixture-token' },
  })
  expect(handleChat).toHaveBeenCalledWith(input, env, origin)
  expect(input.bodyUsed).toBe(false)
  expect((await worker.fetch(request('/api/speak?text=bonjour'), env, {})).status).toBe(200)
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(handleSpeak).toHaveBeenCalledOnce()
})

it.each(['limiter', 'connection', 'body'])('bounds stalled access checks including %s', async (stage) => {
  vi.useFakeTimers()
  const env = environment()
  const pending = new Promise(() => {})
  if (stage === 'limiter') env.RATE_LIMITER.limit.mockReturnValue(pending)
  if (stage === 'connection') fetch.mockReturnValue(pending)
  if (stage === 'body') fetch.mockResolvedValue({ ok: true, status: 200, json: () => pending })
  const response = worker.fetch(request(), env, {})
  await vi.advanceTimersByTimeAsync(5000)
  expect((await response).status).toBe(503)
  expect(handleChat).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  if (stage !== 'limiter') expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
})

it('does not start access checks for an already cancelled request', async () => {
  const controller = new AbortController()
  controller.abort()
  const env = environment()
  const response = await worker.fetch(request('/api/chat', { signal: controller.signal }), env, {})
  expect(response.status).toBe(499)
  expect(env.RATE_LIMITER.limit).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('does not start a model request after cancellation while auth is pending', async () => {
  const controller = new AbortController()
  let resolveAuth
  fetch.mockImplementation(() => new Promise((resolve) => { resolveAuth = resolve }))
  const response = worker.fetch(request('/api/chat', { signal: controller.signal }), environment(), {})
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  controller.abort()
  expect((await response).status).toBe(499)
  resolveAuth(Response.json(user))
  await Promise.resolve()
  expect(handleChat).not.toHaveBeenCalled()
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
})
