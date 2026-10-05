import { isSupabaseConfigured, supabase, supabaseUrl, supabaseAnonKey, SUPABASE_MISSING_MESSAGE } from './supabase'
import { withRequestDeadline } from './requestDeadline'
import { UserFacingError, userErrorMessage } from './userFacingError'

const AUTH_MESSAGES = {
  invalid_credentials: '邮箱或密码不正确。',
  email_not_confirmed: '请先打开邮箱中的确认邮件，完成验证后再登录。',
  otp_expired: '验证码或链接已失效，请重新获取。',
  same_password: '新密码不能与原密码相同。',
  weak_password: '密码不符合要求。请换一个更难猜的密码。',
  user_already_exists: '这个邮箱已注册，请登录或找回密码。',
  over_request_rate_limit: '操作太频繁，请稍后再试。',
  over_email_send_rate_limit: '邮件发送太频繁，请稍后再试。',
}

export function authErrorMessage(error) {
  if (['AuthRetryableFetchError', 'AuthUnknownError', 'AbortError'].includes(error?.name) || error?.status >= 500) {
    return '请求结果尚未确认，请先检查邮箱或当前登录状态，再决定是否重试。'
  }
  const known = AUTH_MESSAGES[error?.code]
  if (typeof known === 'string') return known
  // Older auth responses do not always include a machine-readable code.
  if (error?.message === 'Invalid login credentials') return AUTH_MESSAGES.invalid_credentials
  return userErrorMessage(error, error?.status >= 400 && error?.status < 500
    ? '账号操作未完成，请稍后再试。'
    : '请求结果尚未确认，请先检查邮箱或当前登录状态，再决定是否重试。')
}

async function callAuth(method, ...args) {
  if (!isSupabaseConfigured || !supabase) throw new UserFacingError(SUPABASE_MISSING_MESSAGE)
  const { data, error } = await supabase.auth[method](...args)
  if (error) throw error
  return data
}

export const signIn = (email, password) => callAuth('signInWithPassword', { email: email.trim(), password })
export const signUp = (email, password, nickname, realName) => callAuth('signUp', {
  email: email.trim(), password, options: { data: { nickname: nickname.trim(), real_name: realName.trim() } },
})
export const requestEmailCode = (email) => callAuth('signInWithOtp', { email: email.trim(), options: { shouldCreateUser: false } })
export const verifyEmailCode = (email, token) => callAuth('verifyOtp', { email: email.trim(), token: token.trim(), type: 'email' })
export const requestPasswordReset = (email, origin) => callAuth('resetPasswordForEmail', email.trim(), { redirectTo: `${origin}/reset-password` })

export async function getAccessToken(expectedUserId, { signal } = {}) {
  if (!expectedUserId) throw new UserFacingError('请先登录后再试。')
  signal?.throwIfAborted()
  let onAbort
  try {
    // getSession can wait for a refresh in another tab. Stop waiting when the
    // caller leaves; never send its conversation with another account's token.
    const aborted = signal && new Promise((_, reject) => {
      onAbort = () => reject(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
    })
    const pending = callAuth('getSession')
    const { session } = await (aborted ? Promise.race([pending, aborted]) : pending)
    signal?.throwIfAborted()
    if (session?.user?.id !== expectedUserId || !session?.access_token) {
      throw new UserFacingError('账号已退出或切换，请重新打开答疑页面。')
    }
    return session.access_token
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

function unconfirmedPasswordError() {
  return Object.assign(new UserFacingError('还不能确认密码是否已更新。请先退出，再用新密码尝试登录。请勿重复提交。'), { code: 'AUTH_WRITE_UNCONFIRMED' })
}

export async function updatePassword(expectedUserId, password) {
  const { session } = await callAuth('getSession')
  if (!expectedUserId || session?.user?.id !== expectedUserId) {
    throw new UserFacingError('账号已退出或切换，请重新打开密码设置页面。')
  }
  const { user } = await callAuth('getUser', session.access_token)
  if (user?.id !== expectedUserId) throw new UserFacingError('账号验证不一致，请重新打开密码设置页面。')
  // updateUser() rereads the shared session after acquiring the SDK lock. Pin
  // this request to the account confirmed above so another tab cannot retarget it.
  return withRequestDeadline(async (signal) => {
    let response
    try {
      response = await fetch(`${supabaseUrl}/auth/v1/user`, {
        method: 'PUT', signal,
        headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
    } catch {
      throw unconfirmedPasswordError()
    }
    if (response.status >= 500) throw unconfirmedPasswordError()
    let data
    try { data = await response.json() } catch { throw unconfirmedPasswordError() }
    if (!response.ok) throw Object.assign(new Error(data?.msg || data?.message || ''), { code: data?.code || data?.error_code, status: response.status })
    if ((data?.user || data)?.id !== expectedUserId) throw unconfirmedPasswordError()
    return data
  })
}
