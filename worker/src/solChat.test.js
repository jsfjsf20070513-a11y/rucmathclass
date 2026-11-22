import { afterEach, expect, it, vi } from 'vitest'
import { handleChat } from './chat.js'
import { monthlyBudget, reserveUsage, settleUsage } from './chatUsage.js'
import { answerWithSol } from './solChat.js'
import { beijingDate } from './lectureStore.js'

const userId = '11111111-1111-4111-8111-111111111111'
function environment({ spent = 0, searches = 0 } = {}) {
  const entries = new Map()
  const day = beijingDate(Date.now())
  const prefix = 'usage:' + day.slice(0, 7) + ':'
  entries.set(prefix + 'seed:settle', { day, userId, costMicros: spent, searches })
  const kv = {
    put: vi.fn(async (name, value, { metadata }) => entries.set(name, metadata)),
    list: async ({ prefix, cursor = '0' }) => {
      const keys = [...entries].filter(([name]) => name.startsWith(prefix))
        .map(([name, metadata]) => ({ name, metadata }))
      const start = Number(cursor)
      return { keys: keys.slice(start, start + 2), list_complete: start + 2 >= keys.length, cursor: String(start + 2) }
    },
  }
  return { env: { LECTURE: kv, OPENAI_API_KEY: 'fixture', GEMINI_API_KEY: 'fixture' } }
}
afterEach(() => vi.unstubAllGlobals())
const body = { messages: [{ role: 'user', content: '今日定理是什么？' }] }
const contents = [{ role: 'user', parts: [{ text: body.messages[0].content }] }]
const context = env => ({ env, userId, authorization: 'Bearer fixture', signal: new AbortController().signal })
const frame = event => 'data: ' + JSON.stringify(event) + '\r\n\r\n'
const stream = (...events) => new Response(events.map(frame).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
const final = (output, usage = { input_tokens: 100, output_tokens: 30 }) => ({
  type: 'response.completed', response: { status: 'completed', usage, output },
})
const textItem = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '回答' }] }
const call = { type: 'function_call', name: 'theorem', arguments: '{"date":"2025-09-01"}', call_id: 'one' }
it('passes tool outputs and encrypted reasoning back to Responses, returning final text with clickable citations', async () => {
  const { env } = environment()
  const reasoning = { type: 'reasoning', encrypted_content: 'fixture', summary: [] }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(stream(final([reasoning, call])))
    .mockResolvedValueOnce(stream({ type: 'response.output_text.delta', delta: '回答' }, final([
      { type: 'web_search_call' }, { ...textItem, content: [{ ...textItem.content[0], annotations: [
        { type: 'url_citation', url: 'https://example.org/article', title: '资料' },
      ] }] },
    ]))))
  const emit = vi.fn()
  const result = await answerWithSol(contents, context(env), emit)
  expect(result.text).toContain('[1](<https://example.org/article>)')
  const payloads = fetch.mock.calls.map(([, opts]) => JSON.parse(opts.body))
  expect(payloads[0]).toMatchObject({ model: 'gpt-6.2-sol', store: false, max_tool_calls: 1, stream: true })
  expect(payloads[0].tools).toContainEqual(expect.objectContaining({ type: 'web_search' }))
  expect(payloads[1].input).toContainEqual(reasoning)
  expect(payloads[1].input.at(-1)).toMatchObject({ call_id: 'one', type: 'function_call_output', output: expect.stringContaining('Bolzano-Weierstrass') })
  expect(emit).toHaveBeenCalledWith({ delta: '回答' })
  expect(env.LECTURE.put.mock.calls).toHaveLength(4)
  expect(env.LECTURE.put.mock.calls.every(([key]) => key.startsWith('usage:'))).toBe(true)
  expect(env.LECTURE.put.mock.calls.filter(([key]) => key.endsWith(':settle')).map(([, value]) => JSON.parse(value).searches)).toEqual([0, 1])
})

it('allows search number ten and removes web_search on the next request while still offering local tools', async () => {
  const { env } = environment({ searches: 9 })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(stream(final([{ type: 'web_search_call' }, textItem])))
    .mockResolvedValueOnce(stream(final([textItem]))))
  await answerWithSol(contents, context(env), () => {})
  await answerWithSol(contents, context(env), () => {})
  const tools = fetch.mock.calls.map(([, opts]) => JSON.parse(opts.body).tools.map(t => t.type))
  expect(tools[0]).toContain('web_search')
  expect(tools[1]).not.toContain('web_search')
  expect(tools[1]).toContain('function')
})

it.each(['budget', 'failure', 'truncated'])('falls back to the Gemini stream on %s, without enabling Gemini search', async reason => {
  const { env } = environment({ spent: reason === 'budget' ? monthlyBudget : 0 })
  const sol = vi.fn(async () => reason === 'failure' ? new Response('', { status: 503 })
    : stream({ type: 'response.output_text.delta', delta: '半句' }))
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    if (url.includes('api.openai.com')) return sol()
    if (url.includes('pageSize')) return Response.json({ models: [{ name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] }] })
    expect(url).toContain('streamGenerateContent?alt=sse')
    expect(JSON.parse(options.body)).not.toHaveProperty('tools')
    return stream({ candidates: [{ content: { parts: [{ text: '备用回答' }] }, finishReason: 'STOP' }] })
  }))
  const request = new Request('https://example.invalid/api/chat', { method: 'POST', body: JSON.stringify(body),
    headers: { Accept: 'application/x-ndjson', Authorization: 'Bearer fixture' } })
  const response = await handleChat(request, env, '', userId)
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line))
  expect(events.at(-1)).toEqual({ done: true, text: '备用回答' })
  expect(events).toContainEqual({ delta: '备用回答' })
  expect(sol).toHaveBeenCalledTimes(reason === 'budget' ? 0 : 1)
  if (reason === 'truncated') expect(events.slice(0, 2)).toEqual([{ delta: '半句' }, { reset: true }])
})

it('keeps an uncertain charge when the upstream stream disappears', async () => {
  const { env } = environment()
  vi.stubGlobal('fetch', vi.fn(async () => stream({ type: 'response.output_text.delta', delta: '半句' })))
  await expect(answerWithSol(contents, context(env), () => {})).rejects.toThrow('中断')
  expect(env.LECTURE.put).toHaveBeenCalledOnce()
})

it('stops if a tool never finishes the answer, with a final round without tools', async () => {
  const { env } = environment()
  vi.stubGlobal('fetch', vi.fn(async () => stream(final([call]))))
  await expect(answerWithSol(contents, context(env), () => {})).rejects.toThrow('次数已满')
  expect(fetch).toHaveBeenCalledTimes(6)
  expect(JSON.parse(fetch.mock.calls.at(-1)[1].body).tools).toEqual([])
})

it('releases unused search reservations once, independently for each user and Beijing day', async () => {
  const { env } = environment()
  const args = { today: '2026-11-22', userId, input: contents, tools: [], wantSearch: true }
  const reserve = (overrides = {}) => reserveUsage(env, { ...args, ...overrides })
  const first = await reserve()
  for (let i = 1; i < 10; i++) expect((await reserve()).search).toBe(true)
  expect((await reserve()).search).toBe(false)
  await settleUsage(env, first, { input_tokens: 1, output_tokens: 1 }, 0)
  expect((await reserve()).search).toBe(true)
  expect((await reserve()).search).toBe(false)
  expect((await reserve({ userId: 'another' })).search).toBe(true)
  expect((await reserve({ today: '2026-11-23' })).search).toBe(true)
})

it('defaults to Sol using the existing KV and settles the cost before the next budget check', async () => {
  expect(monthlyBudget).toBe(55_000_000)
  const { env } = environment({ spent: 54_450_000 })
  vi.stubGlobal('fetch', vi.fn(async () => stream(final([textItem]))))
  for (let i = 0; i < 2; i++) {
    const request = new Request('https://example.invalid/api/chat', { method: 'POST', body: JSON.stringify(body) })
    const response = await handleChat(request, env, '', userId)
    expect(await response.json()).toEqual({ model: 'gpt-6.2-sol', text: '回答' })
  }
  expect(fetch).toHaveBeenCalledTimes(2)
})
