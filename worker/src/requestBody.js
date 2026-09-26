import { createRequestScope } from './requestScope.js'

export const MAX_CHAT_BODY_BYTES = 8 * 1024 * 1024
const tooLarge = () => Object.assign(new Error('Request body too large'), { status: 413 })

export async function readChatBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_CHAT_BODY_BYTES) {
    request.body?.cancel().catch(() => {})
    throw tooLarge()
  }
  if (!request.body) throw new Error('Invalid JSON')
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
    if (request.signal.aborted) throw Object.assign(new Error('Request cancelled'), { status: 499 })
    if (scope.signal.aborted) throw Object.assign(new Error('Request body timed out'), { status: 408 })
    throw error
  } finally {
    scope.close()
    reader.releaseLock()
  }
}
