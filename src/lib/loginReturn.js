// 登录门只会从答疑列表或一段对话打开。保留该地址上的查询和锚点。
export function loginReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') ||
      /[\\\s]/u.test(value)) return null
  try {
    const url = new URL(value, 'https://class.invalid')
    if (url.origin === 'https://class.invalid' && /^\/assistant(?:\/[^/]+)?\/?$/i.test(url.pathname)) {
      return url.pathname + url.search + url.hash
    }
  } catch { /* 无效的地址留在登录页。 */ }
  return null
}
