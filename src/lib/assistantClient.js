import { withRequestDeadline } from './requestDeadline'
import { getAccessToken } from './authBackend'

const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT || 'https://rucmathclass.com/api/chat'
const MAX_CONTEXT = 20

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
    if (!response.ok) throw new Error(data?.error || `服务暂时不可用（${response.status}），请稍后重试。`)
    const text = `${data?.text || ''}`.trim()
    if (!text) throw new Error('没有收到有效回复，请重试。')
    return { role: 'model', content: text }
  }, { signal, timeoutMs: 45000 }).catch((error) => {
    if (error.name === 'AbortError' && !signal?.aborted) throw new Error('等待回复超时，请重试；问题和图片仍保留在输入区。')
    throw error
  })
}
