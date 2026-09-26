// Bound a request's lifetime and propagate component cancellation. The timeout
// only bounds our wait; a failed write still has an uncertain server outcome.
export async function withRequestDeadline(run, { signal, timeoutMs = 15000 } = {}) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try { return await run(controller.signal) } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}
