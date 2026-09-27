import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestAssistant } from './assistantClient'
import { getAccessToken } from './authBackend'

vi.mock('./authBackend', () => ({ getAccessToken: vi.fn() }))
beforeEach(() => { getAccessToken.mockReset(); getAccessToken.mockResolvedValue('token-a') })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
describe('assistant HTTP client', () => {
  it('sends complete recent turns with image context without mutating displayed history', async () => {
    const messages = Array.from({ length: 23 }, (_, i) => ({ role: i % 2 ? 'model' : 'user', content: `${i}` }))
    messages[20].imageData = { mimeType: 'image/jpeg', data: 'aGVsbG8=' }
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ text: 'ok' })))
    await requestAssistant(messages, { userId: 'a' })
    expect(getAccessToken).toHaveBeenCalledWith('a', { signal: expect.any(AbortSignal) })
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token-a')
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
    const result = expect(requestAssistant([{ role: 'user', content: 'question' }], { userId: 'a' })).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(45000)
    await result
    expect(vi.getTimerCount()).toBe(0)
  })
  it('does not send conversation data if the session changed', async () => {
    getAccessToken.mockRejectedValue(new Error('账号已退出或切换'))
    vi.stubGlobal('fetch', vi.fn())
    await expect(requestAssistant([{ role: 'user', content: 'private question' }], { userId: 'a' })).rejects.toThrow('账号已退出或切换')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('checks cancellation again after obtaining the token', async () => {
    const controller = new AbortController()
    getAccessToken.mockImplementation(async () => { controller.abort(); return 'token-a' })
    vi.stubGlobal('fetch', vi.fn())
    await expect(requestAssistant([{ role: 'user', content: 'question' }], { userId: 'a', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
