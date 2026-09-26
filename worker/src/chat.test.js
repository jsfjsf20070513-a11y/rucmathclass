import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let worker
const image = { mimeType: 'image/jpeg', data: 'aGVsbG8=' }
const answer = (text) => Response.json({ candidates: [{ content: { parts: [{ text }] } }] })
const request = (body = { messages: [{ role: 'user', content: 'question' }] }) => worker.fetch(
  new Request('https://rucmathclass.com/api/chat', { method: 'POST', body: JSON.stringify(body) }),
  { GEMINI_API_KEY: 'test-key' }, {},
)
function upstream(generate, count = 3) {
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    if (!url.includes(':generateContent')) return Promise.resolve(Response.json({ models: Array.from({ length: count }, (_, i) => ({
      name: `models/gemini-${99 - i}-flash`, supportedGenerationMethods: ['generateContent'],
    })) }))
    return generate(url, options)
  }))
}
beforeEach(async () => {
  vi.resetModules()
  worker = (await import('./index.js')).default
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('chat API contract', () => {
  it('returns the first valid answer and cancels slower requests', async () => {
    const aborted = []
    upstream((url, { signal }) => {
      if (url.includes('98-flash')) return Promise.resolve(answer('fast'))
      return new Promise((_, reject) => signal.addEventListener('abort', () => {
        aborted.push(url)
        reject(new Error('aborted'))
      }))
    })
    const response = await request()
    expect(await response.json()).toMatchObject({ text: 'fast', model: 'gemini-98-flash' })
    expect(aborted).toHaveLength(2)
  })
  it.each([
    [[503, 503, 503], 503], [[429, 429, 429], 429], [[429, 503, 429], 503],
  ])('classifies upstream failures %j as %i without promising a daily reset', async (statuses, expected) => {
    upstream(async () => new Response('', { status: statuses.shift() }))
    const response = await request()
    expect(response.status).toBe(expected)
    expect((await response.json()).error).not.toMatch(/今日|明天/)
  })
  it('treats empty answers as unavailable, not quota exhaustion', async () => {
    upstream(async () => answer(''))
    expect((await request()).status).toBe(503)
  })
  it('tries the second group only after all first-group models fail', async () => {
    const called = []
    upstream(async (url) => {
      called.push(url)
      return /9[789]-flash/.test(url) ? new Response('', { status: 503 }) : answer('fallback')
    }, 6)
    expect(await (await request()).json()).toMatchObject({ text: 'fallback' })
    expect(called).toHaveLength(6)
  })
  it('carries a historical image into a follow-up and preserves the legacy current-image contract', async () => {
    const contents = []
    upstream(async (_, options) => { contents.push(JSON.parse(options.body).contents); return answer('ok') })
    await request({ messages: [{ role: 'user', content: '题目', image }, { role: 'model', content: '第一问' }, { role: 'user', content: '第二问呢' }] })
    expect(contents[0][0].parts[1]).toEqual({ inlineData: image })
    contents.length = 0
    await request({ messages: [{ role: 'user', content: '题目', image }], image })
    expect(contents[0][0].parts).toHaveLength(2)
    contents.length = 0
    await request({ messages: [{ role: 'user', content: '旧客户端' }], image })
    expect(contents[0][0].parts[1]).toEqual({ inlineData: image })
  })
  it('accepts image-only messages', async () => {
    upstream(async () => answer('ok'))
    expect((await request({ messages: [{ role: 'user', content: '', image }] })).status).toBe(200)
  })
  it('rejects invalid or excessive images instead of silently discarding them', async () => {
    const generate = vi.fn(async () => answer('ok'))
    upstream(generate)
    expect((await request({ messages: [{ role: 'user', content: '题目', image: { ...image, mimeType: 'text/html' } }] })).status).toBe(400)
    const big = { ...image, data: 'a'.repeat(3500001) }
    expect((await request({ messages: [{ role: 'user', content: '1', image: big }, { role: 'user', content: '2', image: big }] })).status).toBe(400)
    expect(generate).not.toHaveBeenCalled()
  })
  it('rejects an oversized user question without silently truncating its conditions', async () => {
    expect((await request({ messages: [{ role: 'user', content: 'a'.repeat(4001) }] })).status).toBe(400)
  })
  it('allows continuing old long questions rather than permanently blocking the thread', async () => {
    upstream(async () => answer('ok'))
    expect((await request({ messages: [
      { role: 'user', content: 'a'.repeat(4100) }, { role: 'model', content: 'answer' }, { role: 'user', content: '继续' },
    ] })).status).toBe(200)
  })
  it('keeps the system prompt for Gemma when an older client starts the context with a model turn', async () => {
    let payload
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (!url.includes(':generateContent')) return Response.json({ models: [{ name: 'models/gemma-3-27b-it', supportedGenerationMethods: ['generateContent'] }] })
      payload = JSON.parse(options.body)
      return answer('ok')
    }))
    await request({ messages: [{ role: 'model', content: 'previous' }, { role: 'user', content: '继续' }] })
    expect(payload.contents[1].parts[0].text).toContain('assistant bilingue')
  })
})
