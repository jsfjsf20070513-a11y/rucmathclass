import { corsHeaders, json } from './http.js'
import { readChatBody } from './requestBody.js'
import { createRequestScope } from './requestScope.js'
import { answerWithSol } from './solChat.js'
import { geminiChat } from './geminiChat.js'

const MAX_MESSAGES = 20
const MAX_CHARS = 4000
// 图片问答(多模态):只收常见图片类型,base64 体积设上限防刷配额。
const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_B64 = 7000000 // ≈5MB 二进制

export async function handleChat(request, env, origin, userId) {
  if (request.method !== 'POST') return json({ error: '暂不支持这种发送方式，请刷新页面后重试。' }, 405, origin)
  if (!env.GEMINI_API_KEY && !env.OPENAI_API_KEY) return json({ error: '答疑暂时不可用，请稍后再试。' }, 500, origin)

  let body
  try {
    body = await readChatBody(request)
  } catch (error) {
    return json({ error: error.status ? error.message : '发送的内容无法读取，请检查文字和图片后重试。' }, error.status || 400, origin)
  }

  const raw = Array.isArray(body && body.messages) ? body.messages.slice(-MAX_MESSAGES) : []
  const contents = []
  const lastUserIndex = raw.findLastIndex((message) => message?.role !== 'model' && message?.role !== 'assistant')
  let imageBytes = 0
  const imagePart = (img) => {
    if (!img || typeof img.data !== 'string' || !ALLOWED_IMAGE.has(img.mimeType)
      || !img.data.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(img.data)) {
      throw new Error('图片格式无效，请重新选择图片。')
    }
    imageBytes += img.data.length
    if (imageBytes > MAX_IMAGE_B64) throw new Error('本次发送的图片总量过大。请先保留需要的内容，刷新页面后再上传本次需要的图片。')
    return { inlineData: { mimeType: img.mimeType, data: img.data } }
  }
  try {
    for (const [index, m] of raw.entries()) {
      const role = m && (m.role === 'model' || m.role === 'assistant') ? 'model' : 'user'
      let text = `${(m && m.content) || ''}`
      if (index === lastUserIndex && text.length > MAX_CHARS) return json({ error: `每条消息最多 ${MAX_CHARS} 字，请分段发送。` }, 400, origin)
      text = text.slice(0, MAX_CHARS)
      const parts = text.trim() ? [{ text }] : []
      if (m?.image && role === 'user') parts.push(imagePart(m.image))
      if (parts.length) contents.push({ role, parts })
    }
    // Keep the original body.image contract for already-open/older clients.
    const img = body && body.image
    if (img) {
      for (let i = contents.length - 1; i >= 0; i -= 1) {
        if (contents[i].role === 'user') {
          if (!contents[i].parts.some((p) => p.inlineData)) contents[i].parts.push(imagePart(img))
          break
        }
      }
    }
  } catch (error) {
    return json({ error: error.message }, 400, origin)
  }
  if (!contents.length) return json({ error: '请先填写问题或选择图片。' }, 400, origin)

  const streaming = request.headers.get('Accept')?.includes('application/x-ndjson')
  const scope = createRequestScope(request.signal, 120000)
  async function answer(emit) {
    if (env.OPENAI_API_KEY && userId) {
      const primary = createRequestScope(scope.signal, 75000)
      try {
        const reply = await primary.run(() => answerWithSol(contents, {
          env, userId, signal: primary.signal, authorization: request.headers.get('Authorization'),
        }, event => { if (!primary.signal.aborted) emit(event) }))
        return json(reply, 200, origin)
      } catch {
        emit({ reset: true })
      } finally { primary.close() }
    }
    if (scope.signal.aborted) return json({ error: '请求已取消。' }, 499, origin)
    if (!env.GEMINI_API_KEY) return json({ error: '答疑暂时不可用，请稍后再试。' }, 503, origin)
    return geminiChat(contents, env, scope.signal, origin, streaming ? emit : undefined)
  }
  if (!streaming) {
    try { return await answer(() => {}) } finally { scope.close() }
  }
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = event => { if (!scope.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event) + '\n')) }
      try {
        const response = await answer(emit)
        const result = await response.json()
        emit(response.ok ? { done: true, text: result.text } : { error: response.status })
      } catch { emit({ error: 503 }) }
      finally { try { controller.close() } catch { /* 客户端已关闭 */ } scope.close() }
    },
    cancel() { scope.close() },
  })
  return new Response(stream, { headers: { ...corsHeaders(origin), 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
}
