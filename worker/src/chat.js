import { json } from './http.js'

// ── 动态降级链:免费层配额按模型独立计,把全家额度榨干 ──
// 每小时从 ListModels 拉一次当前可用模型,自动排序(flash 新版本优先 → pro →
// flash-lite → gemma 兜底);Google 上新模型自动收编,不用改代码。
// ListModels 失败时用静态兜底链(2026-08 快照)。
const CHAIN_TTL_MS = 3600 * 1000
const CHAIN_MAX = 10
const FALLBACK_CHAIN = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemma-3-27b-it',
  'gemma-3-12b-it',
]
// 排除:别名(latest 与具体版本重复)、特种模态与实验通道。
const CHAIN_EXCLUDE = /latest|tts|image|imagen|veo|embed|audio|live|dialog|native|computer|research|robotic|banana|antigravity|thinking|-exp|preview-\d|aqa|learnlm/i

let chainCache = null
let chainCacheAt = 0

function rankModel(name) {
  const m = /gemini-(\d+(?:\.\d+)?)/.exec(name)
  const ver = m ? parseFloat(m[1]) : 0
  let family = 0 // gemma
  if (/flash-lite/.test(name)) family = 1
  else if (/pro/.test(name)) family = 2
  else if (/flash/.test(name)) family = 3
  return family * 100 + ver
}

async function getChatModels(env) {
  const now = Date.now()
  if (chainCache && now - chainCacheAt < CHAIN_TTL_MS) return chainCache
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      headers: { 'X-goog-api-key': env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(3000),
    })
    if (r.ok) {
      const data = await r.json()
      const names = (data.models || [])
        .filter((m2) => Array.isArray(m2.supportedGenerationMethods)
          && m2.supportedGenerationMethods.includes('generateContent'))
        .map((m2) => `${m2.name || ''}`.replace(/^models\//, ''))
        .filter((n) => (n.startsWith('gemini-') || n.startsWith('gemma-')) && !CHAIN_EXCLUDE.test(n))
      if (names.length) {
        names.sort((a, b) => rankModel(b) - rankModel(a))
        chainCache = names.slice(0, CHAIN_MAX)
        chainCacheAt = now
        return chainCache
      }
    }
  } catch { /* 走兜底 */ }
  return FALLBACK_CHAIN
}
const MAX_MESSAGES = 20
const MAX_CHARS = 4000
// 图片问答(多模态):只收常见图片类型,base64 体积设上限防刷配额。
const ALLOWED_IMAGE = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_B64 = 7000000 // ≈5MB 二进制

const SYSTEM_PROMPT = [
  "Tu es l'assistant bilingue (中文 / français) de la classe de mathématiques 2025 du campus sino-français.",
  'Public : des élèves qui apprennent les mathématiques ET le français (du niveau A1 au C2).',
  'Règles :',
  "- Réponds dans la langue de la question ; si on te le demande, donne le terme dans l'autre langue.",
  '- Pour les maths : sois rigoureux, montre les étapes clés, utilise la notation LaTeX entre $...$ quand c\'est utile.',
  '- Pour le français : explique le sens, le genre des noms, et donne un exemple court.',
  '- Reste concis et bienveillant. Si tu n\'es pas sûr, dis-le.',
  '- Refuse poliment ce qui sort du cadre scolaire (maths / français / méthode d\'étude).',
].join('\n')

export async function handleChat(request, env, origin) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin)
  if (!env.GEMINI_API_KEY) return json({ error: 'Server not configured' }, 500, origin)

  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400, origin)
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
    if (imageBytes > MAX_IMAGE_B64) throw new Error('本轮图片总量过大，请清空对话后重新上传需要的图片。')
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
  if (!contents.length) return json({ error: 'No messages' }, 400, origin)

  // 组装上游模型请求；调度和错误归因独立于前端对话状态。
  const buildBody = (model) => {
    if (model.startsWith('gemma')) {
      // Gemma 不支持 systemInstruction:把系统提示折进第一条 user 消息。
      const firstUser = contents.findIndex((c) => c.role === 'user')
      const folded = contents.map((c, k) => (k === firstUser
        ? { ...c, parts: [{ text: `${SYSTEM_PROMPT}\n\n---\n\n` }, ...c.parts] }
        : c))
      return JSON.stringify({ contents: folded, generationConfig: { temperature: 0.5, maxOutputTokens: 8192 } })
    }
    return JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    })
  }

  const chatModels = await getChatModels(env)

  const failures = []
  const tryModel = async (model, signal) => {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': env.GEMINI_API_KEY },
        body: buildBody(model),
        signal,
      },
    )
    if (!upstream.ok) throw Object.assign(new Error(`status ${upstream.status}`), { status: upstream.status })
    const data = await upstream.json()
    const parts = (((data.candidates || [])[0] || {}).content || {}).parts || []
    const text = parts.map((p) => p.text).filter(Boolean).join('')
    if (!text.trim()) throw new Error('empty')
    return { text, model }
  }

  // 并发赛跑而非串行降级:被限流的模型往往不是秒回 429 而是挂满超时,
  // 串行等三个就是一分钟(用户感知 = "AI 没反应")。同时发给前 3 个,
  // 谁先给出正文用谁;全败再补第二梯队。
  const race = async (models, timeoutMs) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await Promise.any(models.map((model) => tryModel(model, controller.signal)))
    } catch (error) {
      failures.push(...(error.errors || [error]))
      return null
    } finally {
      clearTimeout(timer)
      controller.abort()
    }
  }

  let win = await race(chatModels.slice(0, 3), 18000)
  if (!win && chatModels.length > 3) win = await race(chatModels.slice(3, 6), 15000)
  if (win) return json(win, 200, origin)

  const limited = failures.length > 0 && failures.every((error) => error.status === 429)
  return json(
    { error: limited ? 'AI 服务暂时限流，请稍后再试。' : 'AI 服务暂时不可用，请稍后重试；你的问题可以重新发送。' },
    limited ? 429 : 503,
    origin,
  )
}
