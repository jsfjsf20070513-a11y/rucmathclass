import { withRequestDeadline } from './requestDeadline'
import { getAccessToken } from './authBackend'
import { UserFacingError } from './userFacingError'

const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT || 'https://rucmathclass.com/api/chat'
const MAX_CONTEXT = 20
const INVALID_CONTENT_MESSAGES = new Set([
  '图片格式无效，请重新选择图片。',
  '本次发送的图片总量过大。请先保留需要的内容，刷新页面后再上传本次需要的图片。',
  '每条消息最多 4000 字，请分段发送。',
  '请先填写问题或选择图片。',
])
const HTTP_MESSAGES = {
  400: '发送的内容无法读取，请检查文字和图片后重试。',
  401: '登录状态已失效，请刷新页面并重新登录后再试。',
  403: '当前账号暂时无法使用答疑，请稍后再试。',
  408: '内容上传超时，请检查网络后重试。',
  413: '发送的内容过大，请减少文字或图片后重试。',
  429: '请求太频繁，请稍后再试。',
  499: '请求已取消。',
}

export async function requestAssistant(messages, { signal, userId } = {}) {
  // A complete recent turn starts with a user message, including for Gemma.
  const context = messages.slice(-MAX_CONTEXT)
  while (context.length && context[0].role !== 'user') context.shift()
  const body = { messages: context.map((message) => ({
    role: message.role, content: message.content,
    ...(message.imageData ? { image: message.imageData } : {}),
  })) }
  return withRequestDeadline(async (requestSignal) => {
    const token = await getAccessToken(userId, { signal: requestSignal })
    requestSignal.throwIfAborted()
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), signal: requestSignal,
    })
    let data
    try { data = await response.json() } catch { /* handled below */ }
    if (!response.ok) {
      const message = response.status === 400 && INVALID_CONTENT_MESSAGES.has(data?.error)
        ? data.error : HTTP_MESSAGES[response.status] || '答疑暂时不可用，请稍后再试。'
      throw new UserFacingError(message)
    }
    const text = `${data?.text || ''}`.trim()
    if (!text) throw new UserFacingError('没有收到有效回复，请重试。')
    return { role: 'model', content: text }
  }, { signal, timeoutMs: 45000 }).catch((error) => {
    if (error.name === 'AbortError' && !signal?.aborted) throw new UserFacingError('等待回复超时，请重试。问题和图片仍保留在输入区。')
    throw error
  })
}
