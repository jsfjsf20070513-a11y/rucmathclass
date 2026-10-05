import { json } from './http.js'
import { createRequestScope } from './requestScope.js'

const unavailable = (origin) => json({ error: '暂时无法确认服务权限，请稍后重试。' }, 503, origin)
const unauthorized = (origin) => json({ error: '登录状态已失效，请刷新页面并重新登录后再试。' }, 401, origin)

// Both endpoints use the same boundary. A verified session is required even
// for cached audio; browser CORS and a frontend login screen are not proof.
export async function checkRequestAccess(request, env, origin) {
  const authorization = request.headers.get('Authorization') || ''
  if (!/^Bearer [^\s]{1,8192}$/i.test(authorization)) return unauthorized(origin)

  let authUrl
  try {
    const url = new URL(env.SUPABASE_URL)
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      return unavailable(origin)
    }
    authUrl = new URL('/auth/v1/user', url).href
  } catch { return unavailable(origin) }
  if (!env.SUPABASE_ANON_KEY || typeof env.RATE_LIMITER?.limit !== 'function') return unavailable(origin)

  // Bound quota checks, session verification, and the response body together.
  // No model request may start if one of these services fails or stalls.
  const scope = createRequestScope(request.signal, 5000)
  try {
    const result = await scope.run(() => env.RATE_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') || 'anon',
    }))
    if (result?.success === false) return json({ error: '请求太频繁，请稍后再试。' }, 429, origin)
    if (result?.success !== true) return unavailable(origin)

    const response = await scope.run(() => fetch(authUrl, {
      // Workers supports manual/follow; a 3xx stays here and fails the !ok check below.
      method: 'GET', redirect: 'manual', signal: scope.signal,
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: authorization },
    }))
    if ([400, 401, 403].includes(response.status)) return unauthorized(origin)
    if (!response.ok) return unavailable(origin)
    const user = await scope.run(() => response.json())
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(user?.id || '')) return unavailable(origin)
    return null
  } catch {
    return request.signal.aborted
      ? json({ error: '请求已取消。' }, 499, origin)
      : unavailable(origin)
  } finally { scope.close() }
}
