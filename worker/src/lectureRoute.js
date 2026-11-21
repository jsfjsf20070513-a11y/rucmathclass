import { corsHeaders, json } from './http.js'
import { beijingDate, dayMs, firstLectureDate, isLectureDate, lectureIndex } from './lectureStore.js'

export async function readLecture(request, env, ctx, now = Date.now()) {
  const url = new URL(request.url)
  const origin = request.headers.get('Origin') || ''
  const index = url.pathname === '/api/lecture'
  const date = url.pathname.slice('/api/lecture/'.length)
  const today = beijingDate(now)
  if (!index && (!isLectureDate(date) || date < firstLectureDate || date > today)) return json(null, 404, origin)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (request.method !== 'GET') return json(null, 405, origin)

  // 所有查询参数共用缓存。索引按北京时间隔日换键，CORS 随当前请求生成。
  url.search = index ? `?day=${today}` : ''
  const cache = globalThis.caches?.default
  try {
    let content = await cache?.match(url.href)
    if (!content) {
      const value = index ? JSON.stringify(await lectureIndex(env.LECTURE, today)) : await env.LECTURE.get(`day:${date}`)
      if (value === null) return json(null, 404, origin)
      const midnight = Date.parse(today + 'T00:00:00+08:00') + dayMs
      const ttl = index ? Math.min(300, Math.floor((midnight - now) / 1000)) : 86400
      content = new Response(value, {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${ttl}` },
      })
      if (cache && ttl > 0) ctx.waitUntil(cache.put(url.href, content.clone()))
    }
    const headers = new Headers(content.headers)
    for (const [name, value] of Object.entries(corsHeaders(origin))) headers.set(name, value)
    return new Response(content.body, { headers })
  } catch { return json(null, 503, origin) }
}
