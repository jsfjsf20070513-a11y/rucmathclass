import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import worker from './index.js'

const validAudio = { mimeType: 'audio/L16;codec=pcm;rate=24000', data: 'AQIDBA==' }
const answer = (inlineData = validAudio) => Response.json({ candidates: [{ content: { parts: [{ inlineData }] } }] })
let pending
let cache
let fetch
const speak = (origin = 'https://rucmathclass.com', signal) => worker.fetch(
  new Request('https://rucmathclass.com/api/speak?text=bonjour', { headers: { Origin: origin }, signal }),
  { GEMINI_API_KEY: 'test-key' }, { waitUntil(task) { pending.push(task) } },
)
beforeEach(() => {
  pending = []
  const values = new Map()
  cache = { match: vi.fn(async (key) => values.get(key.url)?.clone()), put: vi.fn(async (key, value) => { values.set(key.url, value) }) }
  fetch = vi.fn(async () => answer())
  vi.stubGlobal('caches', { default: cache })
  vi.stubGlobal('fetch', fetch)
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('reuses valid WAV bytes with each caller’s CORS, keeping CORS out of the cache', async () => {
  const first = await speak()
  const bytes = new Uint8Array(await first.arrayBuffer())
  const header = new DataView(bytes.buffer)
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF')
  expect(header.getUint32(24, true)).toBe(24000)
  expect(header.getUint32(40, true)).toBe(4)
  expect([...bytes.slice(44)]).toEqual([1, 2, 3, 4])
  await Promise.all(pending)
  expect(cache.put.mock.calls[0][1].headers.has('Access-Control-Allow-Origin')).toBe(false)
  for (const origin of ['https://www.rucmathclass.com', 'http://localhost:5173']) {
    const hit = await speak(origin)
    expect(hit.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(new Uint8Array(await hit.arrayBuffer())).toEqual(bytes)
  }
  expect(fetch).toHaveBeenCalledOnce()
})
it('still delivers audio when cache lookup and write both fail', async () => {
  cache.match.mockRejectedValue(new Error('cache unavailable'))
  cache.put.mockRejectedValue(new Error('cache unavailable'))
  expect((await speak()).status).toBe(200)
  await Promise.all(pending)
})
it.each([
  () => new Response('<html>bad gateway</html>'),
  () => answer({ ...validAudio, mimeType: 'image/png' }),
  () => answer({ ...validAudio, mimeType: 'audio/L16;rate=0' }),
  () => answer({ ...validAudio, data: '%%%' }),
  () => answer({ ...validAudio, data: '' }),
  () => answer({ ...validAudio, data: 'AQ==' }),
])('rejects malformed upstream audio with JSON/CORS and without caching', async (response) => {
  fetch.mockImplementation(response)
  const result = await speak()
  expect(result.status).toBe(502)
  expect(result.headers.get('Content-Type')).toBe('application/json')
  expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://rucmathclass.com')
  expect(cache.put).not.toHaveBeenCalled()
})
it.each(['fetch', 'body'])('bounds a stalled %s including response-body time', async (stage) => {
  vi.useFakeTimers()
  let signal
  fetch.mockImplementation((_, options) => {
    signal = options.signal
    return stage === 'fetch' ? new Promise(() => {}) : { ok: true, json: () => new Promise(() => {}) }
  })
  const result = speak()
  await vi.advanceTimersByTimeAsync(20000)
  expect((await result).status).toBe(504)
  expect(signal.aborted).toBe(true)
  expect(fetch).toHaveBeenCalledOnce()
})
it('stops on caller cancellation without retrying', async () => {
  const controller = new AbortController()
  fetch.mockImplementation(() => { controller.abort(); return Promise.resolve(Response.json({})) })
  expect((await speak(undefined, controller.signal)).status).toBe(499)
  expect(fetch).toHaveBeenCalledOnce()
  expect(cache.put).not.toHaveBeenCalled()
})
it('retries an empty/5xx response only once and never retries a 4xx', async () => {
  for (const response of [() => Response.json({}), () => new Response('', { status: 500 })]) {
    fetch.mockReset().mockImplementation(response)
    expect((await speak()).status).toBe(502)
    expect(fetch).toHaveBeenCalledTimes(2)
  }
  fetch.mockReset().mockResolvedValue(new Response('', { status: 429 }))
  expect((await speak()).status).toBe(502)
  expect(fetch).toHaveBeenCalledOnce()
})
