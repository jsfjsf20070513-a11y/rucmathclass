import { withRequestDeadline } from './requestDeadline'

export function fetchAuthResponse(url, options = {}, timeoutMs = 15000) {
  return withRequestDeadline(async (signal) => {
    const response = await fetch(url, { ...options, signal })
    // fetch resolves at headers. Keep the deadline until the SDK's JSON body
    // is completely received, otherwise a stalled body leaves forms busy forever.
    const bytes = await response.arrayBuffer()
    return new Response(bytes.byteLength ? bytes : null, {
      status: response.status, statusText: response.statusText, headers: response.headers,
    })
  }, { signal: options.signal, timeoutMs })
}
