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
  it.each([
    [500, 'Server not configured', '答疑暂时不可用，请稍后再试。'],
    [429, 'Trop de requêtes', '请求太频繁，请稍后再试。'],
    [413, 'Request body too large', '发送的内容过大，请减少文字或图片后重试。'],
    [400, 'internal parse failure', '发送的内容无法读取，请检查文字和图片后重试。'],
    [400, '图片格式无效，请重新选择图片。', '图片格式无效，请重新选择图片。'],
  ])('shows actionable errors for HTTP %s', async (status, error, expected) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error }, { status })))
    await expect(requestAssistant([{ role: 'user', content: 'question' }], { userId: 'a' })).rejects.toThrow(expected)
  })
})
