import { isSupabaseConfigured, supabase, supabaseUrl, supabaseAnonKey, SUPABASE_MISSING_MESSAGE } from './supabase'
import { withRequestDeadline } from './requestDeadline'

export function authErrorMessage(error) {
  return error?.name === 'AuthRetryableFetchError' || error?.name === 'AbortError'
    ? '请求结果尚未确认，请先检查邮箱或当前登录状态，再决定是否重试。'
    : error?.message || '操作失败，请稍后重试。'
}

async function callAuth(method, ...args) {
  if (!isSupabaseConfigured || !supabase) throw new Error(SUPABASE_MISSING_MESSAGE)
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
  if (!expectedUserId) throw new Error('请先登录后再试。')
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
      throw new Error('账号已退出或切换，请重新打开答疑页面。')
    }
    return session.access_token
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

function unconfirmedPasswordError() {
  return Object.assign(new Error('密码更新结果尚未确认，请先退出当前账号，再用新密码核对登录，勿连续提交。'), { code: 'AUTH_WRITE_UNCONFIRMED' })
}

export async function updatePassword(expectedUserId, password) {
  const { session } = await callAuth('getSession')
  if (!expectedUserId || session?.user?.id !== expectedUserId) {
    throw new Error('账号已退出或切换，请重新打开密码设置页面。')
  }
  const { user } = await callAuth('getUser', session.access_token)
  if (user?.id !== expectedUserId) throw new Error('账号验证不一致，请重新打开密码设置页面。')
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
    if (!response.ok) throw new Error(data.msg || data.message || '密码更新未完成，请重新申请重置链接。')
    if ((data.user || data).id !== expectedUserId) throw unconfirmedPasswordError()
    return data
  })
}
