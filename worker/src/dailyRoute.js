import { corsHeaders, json } from './http.js'
import { getDailyContent } from './dailyStore.js'

export async function readDaily(request, env) {
  const origin = request.headers.get('Origin') || ''
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== 'GET') return json(null, 405, origin)
  const date = new URL(request.url).pathname.slice('/api/daily/'.length)
  const day = await getDailyContent(env, date)
  return json(day, day ? 200 : 404, origin)
}
