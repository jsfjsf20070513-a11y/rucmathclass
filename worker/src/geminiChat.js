import { modelEvents } from './modelStream.js'
import { json } from './http.js'
import { createRequestScope } from './requestScope.js'
import { beijingDate } from './lectureStore.js'

// 动态查询聊天模型，失败时使用下面的候选列表。
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

async function getChatModels(env, signal) {
  signal.throwIfAborted()
  const now = Date.now()
  if (chainCache && now - chainCacheAt < CHAIN_TTL_MS) return chainCache
  const scope = createRequestScope(signal, 3000)
  try {
    const r = await scope.run(() => fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
      headers: { 'X-goog-api-key': env.GEMINI_API_KEY },
      signal: scope.signal,
    }))
    if (r.ok) {
      const data = await scope.run(() => r.json())
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
  } catch { /* 请求仍有效时才走兜底 */ } finally { scope.close() }
  signal.throwIfAborted()
  return FALLBACK_CHAIN
}

async function* geminiChunks(body) {
  let finished = false
  for await (const event of modelEvents(body)) {
    const candidate = event.candidates?.[0]
    const text = candidate?.content?.parts?.filter(part => !part.thought).map(part => part.text || '').join('')
    if (text) yield text
    if (candidate?.finishReason === 'STOP') finished = true
  }
  if (!finished) throw new Error('Gemini 回复未完成')
}

export async function geminiChat(contents, env, signal, origin, emit) {
  const prompt = '这里是中法学院 2025 级数学班网站。今天是北京时间 ' + beijingDate(Date.now()) + '。'
  // 组装上游模型请求；调度和错误归因独立于前端对话状态。
  const buildBody = (model) => {
    if (model.startsWith('gemma')) {
      // Gemma 不支持 systemInstruction:把系统提示折进第一条 user 消息。
      const firstUser = contents.findIndex((c) => c.role === 'user')
      const folded = contents.map((c, k) => (k === firstUser
        ? { ...c, parts: [{ text: `${prompt}\n\n---\n\n` }, ...c.parts] }
        : c))
      return JSON.stringify({ contents: folded, generationConfig: { temperature: 0.5, maxOutputTokens: 8192 } })
    }
    return JSON.stringify({
      systemInstruction: { parts: [{ text: prompt }] },
      contents,
      generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    })
  }

  let chatModels
  try { chatModels = await getChatModels(env, signal) } catch {
    return json({ error: '请求已取消。' }, 499, origin)
  }

  const failures = []
  const tryModel = async (model, signal) => {
    const method = emit ? 'streamGenerateContent?alt=sse' : 'generateContent'
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': env.GEMINI_API_KEY },
        body: buildBody(model),
        signal,
      },
    )
    if (!upstream.ok) throw Object.assign(new Error(`status ${upstream.status}`), { status: upstream.status })
    if (emit) {
      const chunks = geminiChunks(upstream.body)
      const first = await chunks.next()
      if (first.done) throw new Error('empty')
      return { text: first.value, model, chunks }
    }
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
    const scope = createRequestScope(signal, timeoutMs)
    const attempts = models.map(() => createRequestScope(scope.signal, timeoutMs))
    try {
      const win = await scope.run(() => Promise.any(models.map((model, i) => tryModel(model, attempts[i].signal))))
      attempts.forEach((attempt, i) => { if (models[i] !== win.model) attempt.close() })
      if (win.chunks) {
        emit({ delta: win.text })
        await scope.run(async () => {
          for await (const delta of win.chunks) { win.text += delta; emit({ delta }) }
        })
      }
      return { text: win.text, model: win.model }
    } catch (error) {
      emit?.({ reset: true })
      failures.push(...(error.errors || [error]))
      return null
    } finally {
      attempts.forEach(attempt => attempt.close())
      scope.close()
    }
  }

  let win = await race(chatModels.slice(0, 3), 18000)
  if (signal.aborted) return json({ error: '请求已取消。' }, 499, origin)
  if (!win && chatModels.length > 3) win = await race(chatModels.slice(3, 6), 15000)
  if (signal.aborted) return json({ error: '请求已取消。' }, 499, origin)
  if (win) return json(win, 200, origin)

  const limited = failures.length > 0 && failures.every((error) => error.status === 429)
  return json(
    { error: limited ? '请求太频繁，请稍后再试。' : '答疑暂时不可用，请稍后再试。' },
    limited ? 429 : 503,
    origin,
  )
}
