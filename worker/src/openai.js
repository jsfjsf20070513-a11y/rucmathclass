// OpenAI 答疑通道：先答，失败、超额或超时时交还给 Gemini。
// 接口为 Responses（POST /v1/responses）；store:false 不让 OpenAI 留存对话。

// 官方价目表（Standard，每百万 token，美元），2026-11-01 核对。
// 未列出的模型不启用，避免花费无法估算。
export const OPENAI_PRICES = {
  'gpt-6.1-terra': { input: 1, cached: 0.05, output: 5 },
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
}
// 5.6 及以后的模型写入缓存按未缓存输入的 1.25 倍计费；估算时全部按这个上限算。
const CACHE_WRITE_FACTOR = 1.25
// 思考也算在输出里；高强度思考的难题要留足，否则想到一半被截断、拿不到答案。
export const MAX_OUTPUT_TOKENS = 32000
const REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

export function openaiModel(env) {
  const model = `${env.OPENAI_MODEL || ''}`.trim()
  return env.OPENAI_API_KEY && OPENAI_PRICES[model] ? model : null
}

// 按用量估算一次请求的花费（美元）；宁可高估。
export function estimateCost(model, usage) {
  const price = OPENAI_PRICES[model]
  const input = Number(usage?.input_tokens) || 0
  const cached = Math.min(input, Number(usage?.input_tokens_details?.cached_tokens) || 0)
  const output = Number(usage?.output_tokens) || 0
  return ((input - cached) * price.input * CACHE_WRITE_FACTOR + cached * price.cached + output * price.output) / 1e6
}

// 没拿到用量（超时、断开）时按最坏情况记账：整段上下文加满额输出。
export function worstCaseCost(model, inputTokens) {
  const price = OPENAI_PRICES[model]
  return (inputTokens * price.input * CACHE_WRITE_FACTOR + MAX_OUTPUT_TOKENS * price.output) / 1e6
}

// 粗估输入 token：一个字符按一个 token，一张图按 3000 个 token，都偏高。
export function estimateInputTokens(instructions, contents) {
  return contents.reduce((sum, message) => sum + message.parts.reduce(
    (count, part) => count + (part.inlineData ? 3000 : `${part.text || ''}`.length), 0), instructions.length)
}

// Gemini 格式的 contents 转成 Responses 的 input。
export function toOpenAIInput(contents) {
  return contents.map((message) => {
    if (message.role === 'model') {
      return { role: 'assistant', content: message.parts.map((part) => part.text || '').join('') }
    }
    return {
      role: 'user',
      content: message.parts.map((part) => (part.inlineData
        ? { type: 'input_image', image_url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}` }
        : { type: 'input_text', text: part.text })),
    }
  })
}

export async function requestOpenAI({ env, model, instructions, contents, userId, signal }) {
  const effort = REASONING_EFFORTS.has(env.OPENAI_REASONING) ? env.OPENAI_REASONING : 'high'
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model, instructions, input: toOpenAIInput(contents), store: false,
      max_output_tokens: MAX_OUTPUT_TOKENS, reasoning: { effort },
      // 官方建议的用户标识：只发账号 ID 的哈希，不发邮箱或原始 ID。
      safety_identifier: await hashUserId(userId),
    }),
    signal,
  })
  if (!response.ok) throw Object.assign(new Error(`status ${response.status}`), { status: response.status, billed: false })
  const data = await response.json()
  const text = (data.output || [])
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === 'output_text')
    .map((part) => part.text).join('')
  const cost = estimateCost(model, data.usage)
  if (!text.trim()) throw Object.assign(new Error('empty'), { cost })
  const truncated = data.status === 'incomplete' && data.incomplete_details?.reason === 'max_output_tokens'
  return { text: truncated ? `${text}\n\n（回答超出长度上限，后面的内容没有显示。）` : text, model, cost }
}

async function hashUserId(userId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`mathclass:${userId}`))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
