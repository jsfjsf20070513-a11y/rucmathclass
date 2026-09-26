import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchAuthResponse } from './authTransport'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('auth response deadline', () => {
  it('keeps status and JSON for SDK consumption and supports an empty sign-out response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"id":"a"}', { status: 200 })))
    expect(await (await fetchAuthResponse('/auth')).json()).toEqual({ id: 'a' })
    fetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect((await fetchAuthResponse('/logout')).status).toBe(204)
  })

  it('aborts a response whose headers arrive but whose body never finishes', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')))
      },
    }))))
    const request = fetchAuthResponse('/auth', {}, 100)
    const rejected = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(100)
    await rejected
  })
})
