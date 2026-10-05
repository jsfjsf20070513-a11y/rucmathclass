import { createHash } from 'node:crypto'

const SITE = 'https://rucmathclass.com'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
// 2026-10-05 公网实测的 Cloudflare JSD 完整脚本，只将 r/t 换成固定占位符。
// 模板改变就停止验收；不能宽泛删除 script 或只凭 /cdn-cgi/ 路径放行。
const CLOUDFLARE_JSD_HASH = '6d6461bd4913a7ca818f91936d4eac138eba3a8fd68f90a74203f65c7f4b29cf'

function withoutKnownCloudflareScript(bytes, headers) {
  if (headers.get('server') !== 'cloudflare' || !headers.get('content-type')?.startsWith('text/html')) return null
  const ray = /^([a-f0-9]{16})(?:-[A-Z]{3})?$/.exec(headers.get('cf-ray') || '')?.[1]
  if (!ray) return null
  // latin1 保留每个原始字节，不让无效 UTF-8 在解码时被替换。
  const html = bytes.toString('latin1')
  const closing = /<\/body>\s*<\/html>\s*$/.exec(html)
  if (!closing) return null
  const start = html.lastIndexOf('<script>', closing.index)
  if (start < 0) return null
  const script = html.slice(start, closing.index)
  const parameters = /window\.__CF\$cv\$params=\{r:'([a-f0-9]{16})',t:'([A-Za-z0-9+/]{14}==)'\};/.exec(script)
  if (!parameters || parameters[1] !== ray) return null
  const time = Buffer.from(parameters[2], 'base64').toString('latin1')
  if (!/^\d{10}$/.test(time) || Buffer.from(time).toString('base64') !== parameters[2]) return null
  const template = script.replace(parameters[0], "window.__CF$cv$params={r:'<ray>',t:'<time>'};")
  if (hash(Buffer.from(template, 'latin1')) !== CLOUDFLARE_JSD_HASH) return null
  return Buffer.from(html.slice(0, start) + html.slice(closing.index), 'latin1')
}

export function createReleaseHttp(fetchImpl = fetch) {
  async function read(path) {
    const url = new URL(path, SITE)
    if (url.origin !== SITE) throw new Error('验收只允许访问班级站。')
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } })
    if (response.status !== 200) throw new Error(`线上验收失败：${path} 返回 ${response.status}。`)
    return { bytes: Buffer.from(await response.arrayBuffer()), headers: response.headers }
  }
  return {
    async before() {
      const { bytes } = await read('/health.json')
      const health = JSON.parse(bytes.toString())
      if (health.app !== 'MathClassWebsite' || !Number.isFinite(Date.parse(health.buildTime))) throw new Error('线上版本文件 health.json 无效，已停止发布。')
      return { app: health.app, buildTime: health.buildTime, sourceDigest: health.sourceDigest || null }
    },
    async verify(build) {
      const paths = Object.keys(build.files).filter((path) => path === 'index.html' || path === 'health.json' || /\.(js|css)$/.test(path))
      const results = []
      for (let i = 0; i < paths.length; i += 4) {
        const batch = await Promise.all(paths.slice(i, i + 4).map(async (path) => {
          const { bytes, headers } = await read(path === 'index.html' ? '/' : '/' + path)
          const receivedHash = hash(bytes)
          if (receivedHash === build.files[path]) return { path, status: 200, check: 'exact', receivedHash }
          const original = path === 'index.html' && withoutKnownCloudflareScript(bytes, headers)
          if (!original || hash(original) !== build.files[path]) throw new Error(`线上验收失败：${path} 与本次构建不同。`)
          return { path, status: 200, check: 'known-cloudflare-jsd', receivedHash, originalHash: hash(original) }
        }))
        results.push(...batch)
      }
      return { app: build.health.app, buildTime: build.health.buildTime, sourceDigest: build.health.sourceDigest, files: results }
    },
  }
}
