import { handleChat } from './chat.js'
import { handleSpeak } from './tts.js'
import { corsHeaders, json } from './http.js'

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || ''
    const url = new URL(request.url)
    const method = { '/api/chat': 'POST', '/api/speak': 'GET' }[url.pathname]
    if (!method) return json({ error: 'Not found' }, 404, origin)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (request.method !== method) return json({ error: 'Method not allowed' }, 405, origin)
    // 保留现有可用性策略：绑定缺失或失败时继续处理，不把 CORS 当作身份验证。
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'anon'
      try {
        const { success } = await env.RATE_LIMITER.limit({ key: ip })
        if (!success) return json({ error: 'Trop de requêtes — réessaie dans un instant.' }, 429, origin)
      } catch { /* best effort */ }
    }
    if (url.pathname === '/api/speak') return handleSpeak(request, env, ctx, url, origin)
    return handleChat(request, env, origin)
  },
}
