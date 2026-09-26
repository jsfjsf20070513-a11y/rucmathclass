import { afterEach, expect, it, vi } from 'vitest'
import worker from './index.js'

afterEach(() => vi.unstubAllGlobals())
const origin = 'https://www.rucmathclass.com'
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
  }
  expect(limit).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

it('retains best-effort limiting and returns 429 only on an explicit denial', async () => {
  for (const [implementation, status] of [
    [async () => ({ success: false }), 429], [async () => { throw new Error('binding failed') }, 500],
  ]) {
    const limit = vi.fn(implementation)
    const response = await worker.fetch(new Request('https://rucmathclass.com/api/chat', {
      method: 'POST', headers: { 'CF-Connecting-IP': '192.0.2.1' },
    }), { RATE_LIMITER: { limit } }, {})
    expect(response.status).toBe(status)
    expect(limit).toHaveBeenCalledWith({ key: '192.0.2.1' })
  }
})
