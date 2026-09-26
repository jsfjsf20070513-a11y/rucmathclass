import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { requestEmailCode, signIn, updatePassword } from './authBackend'

const h = vi.hoisted(() => ({ auth: {} }))
vi.mock('./supabase', () => ({
  isSupabaseConfigured: true, supabase: { auth: h.auth }, supabaseUrl: 'https://auth.example.invalid',
  supabaseAnonKey: 'test-anon', SUPABASE_MISSING_MESSAGE: 'unavailable',
}))
beforeEach(() => {
  h.auth.getSession = vi.fn(async () => ({ data: { session: { user: { id: 'a' }, access_token: 'token-a' } } }))
  h.auth.getUser = vi.fn(async () => ({ data: { user: { id: 'a' } } }))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'a' }), { status: 200 })))
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('authentication API boundary', () => {
  it('normalizes email consistently and keeps code login limited to existing accounts', async () => {
    h.auth.signInWithPassword = vi.fn(async () => ({ data: {} }))
    h.auth.signInWithOtp = vi.fn(async () => ({ data: {} }))
    await signIn(' a@example.invalid ', 'example-password')
    await requestEmailCode(' a@example.invalid ')
    expect(h.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'a@example.invalid', password: 'example-password' })
    expect(h.auth.signInWithOtp).toHaveBeenCalledWith({ email: 'a@example.invalid', options: { shouldCreateUser: false } })
  })

  it('rejects an account switch before any password update request', async () => {
    h.auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'b' }, access_token: 'token-b' } } })
    await expect(updatePassword('a', 'example-password')).rejects.toThrow('账号已退出或切换')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('confirms token ownership with the server rather than trusting cached user metadata', async () => {
    h.auth.getUser.mockResolvedValueOnce({ data: { user: { id: 'b' } } })
    await expect(updatePassword('a', 'example-password')).rejects.toThrow('账号验证不一致')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('pins the verified token even if the shared session changes before the request', async () => {
    h.auth.getUser.mockImplementationOnce(async (token) => {
      expect(token).toBe('token-a')
      h.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'b' }, access_token: 'token-b' } } })
      return { data: { user: { id: 'a' } } }
    })
    await updatePassword('a', 'example-password')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://auth.example.invalid/auth/v1/user', expect.objectContaining({
      method: 'PUT', headers: expect.objectContaining({ Authorization: 'Bearer token-a' }),
    }))
  })

  it('reports network or ambiguous server failures as unconfirmed writes', async () => {
    fetch.mockRejectedValueOnce(new Error('response lost'))
    await expect(updatePassword('a', 'example-password')).rejects.toMatchObject({ code: 'AUTH_WRITE_UNCONFIRMED' })
    fetch.mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    await expect(updatePassword('a', 'example-password')).rejects.toMatchObject({ code: 'AUTH_WRITE_UNCONFIRMED' })
  })
})
