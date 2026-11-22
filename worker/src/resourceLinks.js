import { publicResourceUrl } from '../../src/lib/resourcePolicy.js'

async function sample(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let text = '', bytes = 0
  try {
    while (bytes < 64 * 1024) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = value.subarray(0, 64 * 1024 - bytes)
      text += decoder.decode(chunk, { stream: true })
      bytes += chunk.length
    }
    return text + decoder.decode()
  } finally { await reader.cancel() }
}

export async function probeResource(item) {
  const signal = AbortSignal.timeout(15000)
  let url = publicResourceUrl(item.url)
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetch(url.href, { redirect: 'manual', signal })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('Location')
      if (!location) throw new Error('跳转地址为空')
      url = publicResourceUrl(new URL(location, url).href)
      continue
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      throw new Error('无法读取页面 ' + response.status)
    }
    const type = response.headers.get('content-type') || ''
    const source = await sample(response.body)
    if (type.includes('application/pdf') && source.startsWith('%PDF-')) {
      return { url: url.href, excerpt: 'PDF 文献，需核对作者或出版机构及公开许可。' }
    }
    if (!/text\/html|application\/xhtml/i.test(type) || !source.trim()) throw new Error('网页不可读')
    const text = source.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text || /(?:sign in|log in|subscribe) to (?:continue reading|read (?:this|the full) (?:article|story))|subscribe to unlock|登录后阅读全文|订阅后阅读全文|just a moment\.\.\.|verify (?:that )?you are human/i.test(text)) throw new Error('页面要求登录、订阅或验证')
    return { url: url.href, excerpt: text.slice(0, 1100) }
  }
  throw new Error('跳转次数过多')
}
