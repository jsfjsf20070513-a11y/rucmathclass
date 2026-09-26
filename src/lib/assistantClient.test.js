import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestAssistant } from './assistantClient'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('assistant HTTP client', () => {
  it('sends complete recent turns with image context without mutating displayed history', async () => {
    const messages = Array.from({ length: 23 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', content: `${i}` }))
    messages[20].imageData = { mimeType: 'image/jpeg', data: 'aGVsbG8=' }
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ text: 'ok' })))
    await requestAssistant(messages)
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body.messages).toHaveLength(19)
    expect(body.messages[0]).toMatchObject({ role: 'user', content: '4' })
    expect(body.messages.at(-3).image).toEqual(messages[20].imageData)
    expect(messages).toHaveLength(23)
  })
  it('bounds an unresponsive connection and reports retryable timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const result = expect(requestAssistant([{ role: 'user', content: 'question' }])).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(45000)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })
})
