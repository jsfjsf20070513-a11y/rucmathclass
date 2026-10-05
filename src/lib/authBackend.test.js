import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authErrorMessage, getAccessToken, requestEmailCode, signIn, updatePassword } from './authBackend'
import { UserFacingError } from './userFacingError'

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
  it.each([
    ['invalid_credentials', '邮箱或密码不正确。'],
    ['email_not_confirmed', '请先打开邮箱中的确认邮件，完成验证后再登录。'],
    ['otp_expired', '验证码或链接已失效，请重新获取。'],
    ['same_password', '新密码不能与原密码相同。'],
    ['over_request_rate_limit', '操作太频繁，请稍后再试。'],
  ])('translates auth code %s without exposing service text', (code, expected) => {
    expect(authErrorMessage({ code, message: 'technical service detail' })).toBe(expected)
  })

  it('handles legacy credentials errors and hides unknown service details', () => {
    expect(authErrorMessage(new Error('Invalid login credentials'))).toBe('邮箱或密码不正确。')
    expect(authErrorMessage({ message: '数据库 SQL failed', status: 400 })).toBe('账号操作未完成，请稍后再试。')
    expect(authErrorMessage(new UserFacingError('两次输入的密码不一致。'))).toBe('两次输入的密码不一致。')
    expect(authErrorMessage({ name: 'AuthRetryableFetchError' })).toContain('结果尚未确认')
    expect(authErrorMessage({ name: 'AuthApiError', status: 500 })).toContain('结果尚未确认')
    expect(authErrorMessage({ name: 'AuthUnknownError' })).toContain('结果尚未确认')
    expect(authErrorMessage(new Error('Failed to fetch'))).toContain('结果尚未确认')
  })

  it.each(['code', 'error_code'])('preserves password rejection code from %s for the page', async (field) => {
    fetch.mockResolvedValueOnce(Response.json({ [field]: 'same_password', msg: 'New password should be different.' }, { status: 422 }))
    const failure = await updatePassword('a', 'example-password').catch((error) => error)
    expect(authErrorMessage(failure)).toBe('新密码不能与原密码相同。')
    expect(failure.code).not.toBe('AUTH_WRITE_UNCONFIRMED')
  })
  it('returns only the current conversation account token', async () => {
    await expect(getAccessToken('a')).resolves.toBe('token-a')
    h.auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'b' }, access_token: 'token-b' } } })
    await expect(getAccessToken('a')).rejects.toThrow('账号已退出或切换')
    h.auth.getSession.mockResolvedValueOnce({ data: { session: null } })
    await expect(getAccessToken('a')).rejects.toThrow('账号已退出或切换')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires an expected account rather than sending whichever token is cached', async () => {
    await expect(getAccessToken()).rejects.toThrow('请先登录')
    expect(h.auth.getSession).not.toHaveBeenCalled()
  })

  it('cancels waiting for a session refresh without leaking a late token to the caller', async () => {
    const controller = new AbortController()
    let resolveSession
    h.auth.getSession.mockReturnValueOnce(new Promise((resolve) => { resolveSession = resolve }))
    const result = expect(getAccessToken('a', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await result
    resolveSession({ data: { session: { user: { id: 'b' }, access_token: 'token-b' } } })
    expect(fetch).not.toHaveBeenCalled()
  })

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
    fetch.mockRejectedValueOnce(new Error('response lost'))
    expect(authErrorMessage(await updatePassword('a', 'example-password').catch((error) => error))).toContain('请勿重复提交')
  })
  it.each([null, {}, { id: 'other-account' }])('does not claim a password update succeeded for ambiguous data %j', async (data) => {
    fetch.mockResolvedValueOnce(Response.json(data))
    await expect(updatePassword('a', 'example-password')).rejects.toMatchObject({ code: 'AUTH_WRITE_UNCONFIRMED' })
  })
})
