import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createReleaseHttp } from './releaseHttp.mjs'

const bodies = { 'index.html': '<html><body>班级站</body></html>', 'health.json': '{"app":"MathClassWebsite","buildTime":"2026-10-05T04:00:00Z"}', 'assets/app.js': 'app', 'assets/page.js': 'lazy page', 'assets/app.css': 'style' }
const files = Object.fromEntries(Object.entries(bodies).map(([path, body]) => [path, createHash('sha256').update(body).digest('hex')]))
const build = { files, health: JSON.parse(bodies['health.json']) }
const respond = (url) => new Response(bodies[new URL(url).pathname.slice(1) || 'index.html'])
const jsd = readFileSync(new URL('./fixtures/cloudflare-jsd.html', import.meta.url), 'utf8')
const cfHeaders = { server: 'cloudflare', 'cf-ray': '0123456789abcdef-LAX', 'content-type': 'text/html; charset=utf-8' }
const injected = (script = jsd) => bodies['index.html'].replace('</body>', script + '</body>')
const withHomepage = (body, headers = cfHeaders) => createReleaseHttp(async (url) => new URL(url).pathname === '/' ? new Response(body, { headers }) : respond(url))

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
  it.each(['index.html', 'health.json', 'assets/page.js', 'assets/app.css'])('不能放过文件错误：%s', async (wrong) => {
    const live = createReleaseHttp(async (url) => (new URL(url).pathname.slice(1) || 'index.html') === wrong ? new Response('old file') : respond(url))
    await expect(live.verify(build)).rejects.toThrow('与本次构建不同')
  })
  it('只识别实测的 Cloudflare 脚本，并在记录中明确写出例外', async () => {
    const result = await withHomepage(injected()).verify(build)
    expect(result.files.find(({ path }) => path === 'index.html')).toMatchObject({
      check: 'known-cloudflare-jsd', originalHash: files['index.html'],
      receivedHash: createHash('sha256').update(injected()).digest('hex'),
    })
    expect(result.files.filter(({ check }) => check === 'exact')).toHaveLength(4)
  })
  it.each([
    ['正文改变', injected().replace('班级站', '别的网站')],
    ['任意语句', injected(jsd.replace('</script>', 'alert(1)</script>'))],
    ['其它脚本路径', injected(jsd.replace('/cdn-cgi/challenge-platform/', '/other/'))],
    ['重复注入', injected(jsd + jsd)],
    ['不在 body 末尾', '<html><body>' + jsd + '班级站</body></html>'],
    ['时间不是十位数字', injected(jsd.replace('MTc5MTE5NjgwOQ==', 'aW52YWxpZC10aW1l'))],
    ['Base64 包含垃圾字符', injected(jsd.replace('MTc5MTE5NjgwOQ==', 'MTc5MTE5NjgwOQ!!'))],
    ['时间字节带高位', injected(jsd.replace('MTc5MTE5NjgwOQ==', Buffer.from(Array(10).fill(0xb1)).toString('base64')))],
    ['ray 与响应不同', injected(jsd.replace('0123456789abcdef', 'fedcba9876543210'))],
  ])('Cloudflare 例外不能放过：%s', async (_, body) => {
    await expect(withHomepage(body).verify(build)).rejects.toThrow('与本次构建不同')
  })
  it.each(['server', 'cf-ray', 'content-type'])('缺少 %s 时不识别注入脚本', async (missing) => {
    const headers = { ...cfHeaders }; delete headers[missing]
    await expect(withHomepage(injected(), headers).verify(build)).rejects.toThrow('与本次构建不同')
  })
  it('不跟随重定向到其他站点', async () => {
    const request = vi.fn(async () => new Response(null, { status: 302, headers: { Location: 'https://other.invalid' } }))
    await expect(createReleaseHttp(request).before()).rejects.toThrow('302')
    expect(request).toHaveBeenCalledOnce()
  })
})
