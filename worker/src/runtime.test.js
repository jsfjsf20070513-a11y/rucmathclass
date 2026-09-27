import { afterEach, beforeEach, expect, it } from 'vitest'
import { createFetchMock, fetch as mockFetch, Miniflare } from 'miniflare'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const compatibilityDate = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  .match(/^compatibility_date = "([^"]+)"/m)[1]
const authOrigin = 'https://auth.example.invalid'
const user = { id: '11111111-1111-4111-8111-111111111111' }
let runtime, upstream

beforeEach(() => {
  upstream = createFetchMock()
  upstream.disableNetConnect()
  runtime = new Miniflare({
    modules: true,
    modulesRules: [{ type: 'ESModule', include: ['**/*.js'] }],
    scriptPath: fileURLToPath(new URL('./index.js', import.meta.url)),
    compatibilityDate,
    // Return raw 3xx responses from the Node transport; workerd decides whether to follow them.
    outboundService: (request) => mockFetch(request, { dispatcher: upstream, redirect: 'manual' }),
    bindings: {
      SUPABASE_URL: authOrigin, SUPABASE_ANON_KEY: 'fixture-key', GEMINI_API_KEY: 'fixture-model-key',
    },
    ratelimits: { RATE_LIMITER: { simple: { limit: 30, period: 60 } } },
  })
})
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
