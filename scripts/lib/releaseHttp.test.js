import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createReleaseHttp } from './releaseHttp.mjs'

const bodies = { 'index.html': '<html>site</html>', 'health.json': '{"app":"MathClassWebsite","buildTime":"2026-10-05T04:00:00Z"}', 'assets/app.js': 'app', 'assets/page.js': 'lazy page', 'assets/app.css': 'style' }
const files = Object.fromEntries(Object.entries(bodies).map(([path, body]) => [path, createHash('sha256').update(body).digest('hex')]))
const build = { files, health: JSON.parse(bodies['health.json']) }
const respond = (url) => new Response(bodies[new URL(url).pathname.slice(1) || 'index.html'])

describe('发布后的线上验收', () => {
  it('核对首页、health、入口及各页脚本和样式，限制目标并设置超时', async () => {
    const request = vi.fn(async (url) => respond(url))
    expect((await createReleaseHttp(request).verify(build)).files).toHaveLength(5)
    for (const [url, options] of request.mock.calls) {
      expect(url.origin).toBe('https://rucmathclass.com')
      expect(url.search).toBe('')
      expect(options.redirect).toBe('manual')
      expect(options.signal).toBeInstanceOf(AbortSignal)
    }
  })
  it('临时地址是新版，普通地址仍旧版时不能通过', async () => {
    const live = createReleaseHttp(async (url) => new URL(url).search ? respond(url) : new Response('old cached file'))
    await expect(live.verify(build)).rejects.toThrow('与本次构建不同')
  })
  it.each(['index.html', 'assets/page.js', 'assets/app.css'])('health 正确也不能掩盖文件错误：%s', async (wrong) => {
    const live = createReleaseHttp(async (url) => (new URL(url).pathname.slice(1) || 'index.html') === wrong ? new Response('old file') : respond(url))
    await expect(live.verify(build)).rejects.toThrow('与本次构建不同')
  })
  it('不跟随重定向到其他站点', async () => {
    const request = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://other.invalid' } }))
    await expect(createReleaseHttp(request).before()).rejects.toThrow('302')
    expect(request).toHaveBeenCalledOnce()
  })
})
