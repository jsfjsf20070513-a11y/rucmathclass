import { createRequestScope } from './requestScope.js'

export const MAX_CHAT_BODY_BYTES = 8 * 1024 * 1024
const tooLarge = () => Object.assign(new Error('发送的内容过大，请减少文字或图片后重试。'), { status: 413 })

export async function readChatBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_CHAT_BODY_BYTES) {
    request.body?.cancel().catch(() => {})
    throw tooLarge()
  }
  if (!request.body) throw new Error('发送的内容无法读取，请检查文字和图片后重试。')
  const scope = createRequestScope(request.signal, 10000)
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    for (;;) {
      const { value, done } = await scope.run(() => reader.read())
      if (done) break
      size += value.byteLength
      if (size > MAX_CHAT_BODY_BYTES) throw tooLarge()
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } catch (error) {
    // Do not wait for a stalled sender before returning an error.
    reader.cancel().catch(() => {})
    if (request.signal.aborted) throw Object.assign(new Error('请求已取消。'), { status: 499 })
    if (scope.signal.aborted) throw Object.assign(new Error('内容上传超时，请检查网络后重试。'), { status: 408 })
    throw error
  } finally {
    scope.close()
    reader.releaseLock()
  }
}
