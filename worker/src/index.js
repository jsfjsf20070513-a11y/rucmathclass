import { handleChat } from './chat.js'
import { handleSpeak } from './tts.js'
import { corsHeaders, json } from './http.js'
import { checkRequestAccess } from './requestAccess.js'

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
    const rejection = await checkRequestAccess(request, env, origin)
    if (rejection) return rejection
    if (url.pathname === '/api/speak') return handleSpeak(request, env, ctx, url, origin)
    return handleChat(request, env, origin)
  },
}
