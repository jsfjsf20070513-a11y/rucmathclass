import { afterEach, expect, it, vi } from 'vitest'
import { MAX_CHAT_BODY_BYTES, readChatBody } from './requestBody.js'

afterEach(() => vi.useRealTimers())
const request = (body, options = {}) => new Request('https://rucmathclass.com/api/chat', { method: 'POST', body, duplex: 'half', ...options })

it.each([{}, { 'Content-Length': '2' }])('caps streamed input despite missing or misleading length %j', async (headers) => {
  const cancel = vi.fn()
  const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(MAX_CHAT_BODY_BYTES / 2 + 1)) }, cancel })
  await expect(readChatBody(request(stream, { headers }))).rejects.toMatchObject({ status: 413 })
  expect(cancel).toHaveBeenCalledOnce()
})
it('rejects a known large body without reading it', async () => {
  const cancel = vi.fn()
  await expect(readChatBody(request(new ReadableStream({ cancel }), { headers: { 'Content-Length': String(MAX_CHAT_BODY_BYTES + 1) } }))).rejects.toMatchObject({ status: 413 })
  expect(cancel).toHaveBeenCalledOnce()
})
it('cancels a stalled body on caller abort or deadline', async () => {
  vi.useFakeTimers()
  for (const abort of [true, false]) {
    const controller = new AbortController()
    const cancel = vi.fn()
    const result = readChatBody(request(new ReadableStream({ cancel }), { signal: controller.signal }))
    const checked = expect(result).rejects.toMatchObject({ status: abort ? 499 : 408 })
    if (abort) controller.abort()
    else await vi.advanceTimersByTimeAsync(10000)
    await checked
    expect(cancel).toHaveBeenCalledOnce()
  }
})
it('decodes unicode split across chunks without changing the question', async () => {
  const bytes = new TextEncoder().encode('{"question":"法语"}')
  const stream = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
    controller.close()
  } })
  expect(await readChatBody(request(stream))).toEqual({ question: '法语' })
})
