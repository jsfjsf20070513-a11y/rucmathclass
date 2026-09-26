// A deadline covers both fetch and reading its body. Closing a scope also stops
// losing model requests; a disconnected caller must not start another attempt.
export function createRequestScope(parentSignal, timeoutMs) {
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(parentSignal.reason)
  if (parentSignal?.aborted) forwardAbort()
  else parentSignal?.addEventListener('abort', forwardAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), timeoutMs)
  const { signal } = controller
  return {
    signal,
    run(operation) {
      signal.throwIfAborted()
      return new Promise((resolve, reject) => {
        const onAbort = () => reject(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
        Promise.resolve().then(() => {
          signal.throwIfAborted()
          return operation(signal)
        }).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
      })
    },
    close() {
      clearTimeout(timer)
      parentSignal?.removeEventListener('abort', forwardAbort)
      controller.abort()
    },
  }
}
