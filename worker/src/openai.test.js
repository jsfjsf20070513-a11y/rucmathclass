import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { billingPeriod, reserveOpenAI, shanghaiDate } from './openaiBudget.js'
import { estimateCost, toOpenAIInput } from './openai.js'

const userId = '11111111-1111-4111-8111-111111111111'
const image = { mimeType: 'image/jpeg', data: 'aGVsbG8=' }
const gemini = (text) => Response.json({ candidates: [{ content: { parts: [{ text }] } }] })
const openai = (text, extra = {}) => Response.json({
  status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
  usage: { input_tokens: 1000, input_tokens_details: { cached_tokens: 0 }, output_tokens: 2000 }, ...extra,
})
function memoryKV(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    store,
    get: vi.fn(async (key) => store.get(key) ?? null),
    put: vi.fn(async (key, value) => { store.set(key, value) }),
  }
}
const environment = (patch = {}) => ({
  GEMINI_API_KEY: 'gemini-key', OPENAI_API_KEY: 'openai-key', OPENAI_MODEL: 'gpt-6.1-terra',
  OPENAI_DAILY_PER_USER: '2', OPENAI_PERIOD_BUDGET_USD: '80', AI_QUOTA: memoryKV(), ...patch,
})
let handleChat
beforeEach(async () => {
  vi.resetModules()
  handleChat = (await import('./chat.js')).handleChat
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function upstream({ openaiReply, geminiReply = async () => gemini('gemini answer') }) {
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    if (url.startsWith('https://api.openai.com/')) return openaiReply(url, options)
    if (!url.includes(':generateContent')) return Promise.resolve(Response.json({ models: [] }))
    return geminiReply(url, options)
  }))
}
async function ask(env, body = { messages: [{ role: 'user', content: '求导 x^2' }] }) {
  const waits = []
  const response = await handleChat(
    new Request('https://rucmathclass.com/api/chat', { method: 'POST', body: JSON.stringify(body) }),
    env, 'https://rucmathclass.com', { userId, ctx: { waitUntil: (p) => waits.push(p) } },
  )
  await Promise.all(waits)
  return response
}

describe('OpenAI first, Gemini as fallback', () => {
  it('answers with OpenAI, sends no stored data or raw ids, and records the estimated spend', async () => {
    let payload
    upstream({ openaiReply: async (_, options) => { payload = JSON.parse(options.body); return openai('2x') } })
    const env = environment()
    const response = await ask(env, { messages: [{ role: 'user', content: '看图', image }, { role: 'model', content: '好' }, { role: 'user', content: '继续' }] })
    expect(await response.json()).toEqual({ text: '2x', model: 'gpt-6.1-terra' })
    expect(payload).toMatchObject({ model: 'gpt-6.1-terra', store: false, max_output_tokens: 6000, reasoning: { effort: 'low' } })
    expect(payload.input[0].content[1]).toEqual({ type: 'input_image', image_url: 'data:image/jpeg;base64,aGVsbG8=' })
    expect(payload.input[1]).toEqual({ role: 'assistant', content: '好' })
    expect(payload.safety_identifier).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(payload)).not.toContain(userId)
    const spend = [...env.AI_QUOTA.store].find(([key]) => key.startsWith('spend:'))
    expect(Number(spend[1])).toBe(Math.ceil(estimateCost('gpt-6.1-terra', { input_tokens: 1000, output_tokens: 2000 }) * 1e6))
  })

  it('falls back to Gemini once the daily count is used up', async () => {
    const openaiReply = vi.fn(async () => openai('gpt'))
    upstream({ openaiReply })
    const env = environment()
    expect((await (await ask(env)).json()).text).toBe('gpt')
    expect((await (await ask(env)).json()).text).toBe('gpt')
    expect((await (await ask(env)).json()).text).toBe('gemini answer')
    expect(openaiReply).toHaveBeenCalledTimes(2)
  })

  it('falls back to Gemini when the period budget is spent', async () => {
    const openaiReply = vi.fn(async () => openai('gpt'))
    upstream({ openaiReply })
    const key = `spend:${billingPeriod(Date.now(), 1)}`
    const env = environment({ AI_QUOTA: memoryKV({ [key]: String(80e6) }) })
    expect((await (await ask(env)).json()).text).toBe('gemini answer')
    expect(openaiReply).not.toHaveBeenCalled()
  })

  it.each([
    ['no key', { OPENAI_API_KEY: undefined }],
    ['an unpriced model', { OPENAI_MODEL: 'gpt-unknown' }],
    ['no KV binding', { AI_QUOTA: undefined }],
    ['a failing KV', { AI_QUOTA: { get: async () => { throw new Error('kv down') }, put: async () => {} } }],
  ])('uses only Gemini with %s', async (_, patch) => {
    const openaiReply = vi.fn(async () => openai('gpt'))
    upstream({ openaiReply })
    expect((await (await ask(environment(patch))).json()).text).toBe('gemini answer')
    expect(openaiReply).not.toHaveBeenCalled()
  })

  it('does not charge rejected requests and still answers with Gemini', async () => {
    upstream({ openaiReply: async () => new Response('{}', { status: 429 }) })
    const env = environment()
    expect((await (await ask(env)).json()).text).toBe('gemini answer')
    expect([...env.AI_QUOTA.store.keys()].some((key) => key.startsWith('spend:'))).toBe(false)
  })

  it('charges the worst case when OpenAI times out, then answers with Gemini', async () => {
    vi.useFakeTimers()
    upstream({ openaiReply: (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason))) })
    const env = environment()
    const pending = ask(env)
    await vi.advanceTimersByTimeAsync(24000)
    expect((await (await pending).json()).text).toBe('gemini answer')
    const spend = [...env.AI_QUOTA.store].find(([key]) => key.startsWith('spend:'))
    expect(Number(spend[1])).toBeGreaterThanOrEqual(6000 * 5)
  })

  it('marks an answer cut by the output limit', async () => {
    upstream({ openaiReply: async () => openai('前半段', { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } }) })
    expect((await (await ask(environment())).json()).text).toContain('后面的内容没有显示')
  })

  it('returns 499 without calling Gemini when the caller leaves during OpenAI', async () => {
    const controller = new AbortController()
    const geminiReply = vi.fn()
    upstream({ openaiReply: (_, { signal }) => {
      queueMicrotask(() => controller.abort())
      return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
    }, geminiReply })
    const response = await handleChat(new Request('https://rucmathclass.com/api/chat', {
      method: 'POST', signal: controller.signal, body: JSON.stringify({ messages: [{ role: 'user', content: '问' }] }),
    }), environment(), 'https://rucmathclass.com', { userId })
    expect(response.status).toBe(499)
    expect(geminiReply).not.toHaveBeenCalled()
  })
})

describe('budget periods and input conversion', () => {
  it('uses Beijing dates and the subscription reset day', () => {
    const t = Date.parse('2026-11-30T17:00:00Z') // 北京时间 12-01 01:00
    expect(shanghaiDate(t)).toBe('2026-12-01')
    expect(billingPeriod(t, 1)).toBe('2026-12')
    expect(billingPeriod(t, 15)).toBe('2026-11')
    expect(billingPeriod(Date.parse('2026-01-03T00:00:00Z'), 15)).toBe('2025-12')
  })
  it('refuses to reserve without a user id', async () => {
    expect(await reserveOpenAI({ env: environment(), userId: '' })).toBeNull()
  })
  it('keeps text and images in order for user turns', () => {
    expect(toOpenAIInput([{ role: 'user', parts: [{ text: '题' }, { inlineData: image }] }])[0].content.map((p) => p.type))
      .toEqual(['input_text', 'input_image'])
  })
})
