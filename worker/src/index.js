import { handleChat } from './chat.js'
import { handleSpeak } from './tts.js'
import { corsHeaders, json } from './http.js'
import { checkRequestAccess } from './requestAccess.js'

import { generateLectures } from './lectureGeneration.js'
import { readLecture } from './lectureRoute.js'

export default {
  scheduled(controller, env) {
    return generateLectures(env, controller.scheduledTime)
  },
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || ''
    const url = new URL(request.url)
    if (url.pathname === '/api/lecture' || url.pathname.startsWith('/api/lecture/')) {
      return readLecture(request, env, ctx)
    }
    const method = { '/api/chat': 'POST', '/api/speak': 'GET' }[url.pathname]
    if (!method) return json({ error: 'Not found' }, 404, origin)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }
    if (request.method !== method) return json({ error: 'Method not allowed' }, 405, origin)
    const access = await checkRequestAccess(request, env, origin)
    if (access instanceof Response) return access
    if (url.pathname === '/api/speak') return handleSpeak(request, env, ctx, url, origin)
    return handleChat(request, env, origin, access)
  },
}
