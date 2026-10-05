import { createHash } from 'node:crypto'

const SITE = 'https://rucmathclass.com'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function createReleaseHttp(fetchImpl = fetch) {
  async function read(path) {
    const url = new URL(path, SITE)
    if (url.origin !== SITE) throw new Error('验收只允许访问班级站。')
    const response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } })
    if (response.status !== 200) throw new Error(`线上验收失败：${path} 返回 ${response.status}。`)
    return Buffer.from(await response.arrayBuffer())
  }
  return {
    async before() {
      const health = JSON.parse((await read('/health.json')).toString())
      if (health.app !== 'MathClassWebsite' || !Number.isFinite(Date.parse(health.buildTime))) throw new Error('线上版本文件 health.json 无效，已停止发布。')
      return { app: health.app, buildTime: health.buildTime, sourceDigest: health.sourceDigest || null }
    },
    async verify(build) {
      const paths = Object.keys(build.files).filter((path) => path === 'index.html' || path === 'health.json' || /\.(js|css)$/.test(path))
      const results = []
      for (let i = 0; i < paths.length; i += 4) {
        const batch = await Promise.all(paths.slice(i, i + 4).map(async (path) => {
          const bytes = await read(path === 'index.html' ? '/' : '/' + path)
          if (hash(bytes) !== build.files[path]) throw new Error(`线上验收失败：${path} 与本次构建不同。`)
          return { path, status: 200 }
        }))
        results.push(...batch)
      }
      return { app: build.health.app, buildTime: build.health.buildTime, sourceDigest: build.health.sourceDigest, files: results }
    },
  }
}
