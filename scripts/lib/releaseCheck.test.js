import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkedBuild, confirmCheckedBuild, releaseIdentity, withReleaseLock } from './releaseCheck.mjs'

const roots = []
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))) })

async function fixture() {
  // Vitest 会加载本仓环境；这里检查的是临时仓库自己的配置。
  for (const name of Object.keys(process.env).filter((name) => name.startsWith('VITE_'))) vi.stubEnv(name, undefined)
  const root = await mkdtemp(join(tmpdir(), 'mathclass-release-test-'))
  roots.push(root)
  await Promise.all(['public', 'src', 'node_modules'].map((path) => mkdir(join(root, path))))
  const files = { 'public/health.json': '{"original":true}', 'src/app.js': 'app', 'package-lock.json': '{}', 'README.md': '旧说明', 'CLAUDE.md': '规矩', 'node_modules/.package-lock.json': '{}' }
  await Promise.all(Object.entries(files).map(([name, body]) => writeFile(join(root, name), body)))
  const commands = []
  const run = async (name, args) => {
    commands.push([name, ...args])
    if (name === 'git') {
      if (args[0] === 'ls-files') return Object.keys(files).filter((file) => !file.startsWith('node_modules/')).join('\0') + '\0'
      if (args[0] === 'status') return ''
      return 'a'.repeat(40)
    }
    if (args[1] === 'build') {
      const directory = args.at(-1)
      await mkdir(join(directory, 'assets'), { recursive: true })
      await writeFile(join(directory, 'index.html'), '<script src="/assets/app.js"></script>')
      await writeFile(join(directory, 'assets/app.js'), 'verified code')
      await writeFile(join(directory, 'health.json'), JSON.stringify({ app: 'MathClassWebsite', mode: 'static-spa', buildTime: '2026-10-05T04:00:00Z' }))
      await writeFile(join(root, 'public/health.json'), 'generated timestamp')
    }
    return ''
  }
  return { root, run, commands, log: () => {} }
}

describe('复用已检查的发布文件', () => {
  it('相同输入不再运行 npm；文档修改可以沿用，源码或配置变化则重新检查', async () => {
    const f = await fixture()
    const first = await checkedBuild(f)
    expect(f.commands.filter(([name]) => name === 'npm')).toHaveLength(5)
    expect(await readFile(join(f.root, 'public/health.json'), 'utf8')).toBe('{"original":true}')
    await writeFile(join(f.root, 'README.md'), '改好的说明')
    expect((await checkedBuild(f)).receipt.artifactDigest).toBe(first.receipt.artifactDigest)
    expect(f.commands.filter(([name]) => name === 'npm')).toHaveLength(5)
    await writeFile(join(f.root, 'src/app.js'), 'changed app')
    await checkedBuild(f)
    expect(f.commands.filter(([name]) => name === 'npm')).toHaveLength(10)
    await writeFile(join(f.root, '.env.production'), 'VITE_RELEASE_TEST_MARKER=private-value-not-for-records')
    const changed = await checkedBuild(f)
    expect(f.commands.filter(([name]) => name === 'npm')).toHaveLength(15)
    expect(JSON.stringify(changed.receipt)).not.toContain('private-value-not-for-records')
    await writeFile(join(f.root, 'node_modules/tool.js'), 'changed installed dependency')
    await checkedBuild(f)
    expect(f.commands.filter(([name]) => name === 'npm')).toHaveLength(20)
  })

  it('产物被修改时不能直接发布，下一次检查重新生成', async () => {
    const f = await fixture()
    const build = await checkedBuild(f)
    await writeFile(join(build.directory, 'assets/app.js'), 'unverified edit')
    await expect(confirmCheckedBuild(build, f)).rejects.toThrow('已被修改')
    await checkedBuild(f)
    expect(f.commands.filter(([name]) => name === 'npm')).toHaveLength(10)
  })

  it('检查后修改未纳入 Git 的配置，上传前也会停止', async () => {
    const f = await fixture()
    const build = await checkedBuild(f)
    await writeFile(join(f.root, '.env.local'), 'VITE_RELEASE_TEST_MARKER=changed')
    await expect(confirmCheckedBuild(build, f)).rejects.toThrow('配置发生变化')
  })

  it('检查失败恢复原 health，不生成可以复用的通过记录', async () => {
    const f = await fixture()
    const original = f.run
    f.run = async (name, args, options) => {
      if (name === 'npm' && args[1] === 'browser:check') throw new Error('browser failed')
      return original(name, args, options)
    }
    await expect(checkedBuild(f)).rejects.toThrow('browser failed')
    expect(await readFile(join(f.root, 'public/health.json'), 'utf8')).toBe('{"original":true}')
    f.run = original
    await checkedBuild(f)
    expect(f.commands.filter(([name, , check]) => name === 'npm' && check === 'build')).toHaveLength(2)
  })

  it('不把 public 内的未跟踪文件或假接口配置带进发布', async () => {
    const f = await fixture()
    await writeFile(join(f.root, 'public/private.txt'), 'local only')
    await expect(releaseIdentity(f.root, f.run)).rejects.toThrow('未纳入 Git')
    await rm(join(f.root, 'public/private.txt'))
    await writeFile(join(f.root, '.env.production'), 'VITE_SUPABASE_URL=https://fixture.invalid')
    await expect(releaseIdentity(f.root, f.run)).rejects.toThrow('假数据')
  })

  it('检查和发布不能同时运行', async () => {
    const f = await fixture()
    let unlock, entered
    const ready = new Promise((resolve) => { entered = resolve })
    const first = withReleaseLock(f.root, async () => { entered(); await new Promise((resolve) => { unlock = resolve }) })
    await ready
    await expect(withReleaseLock(f.root, async () => {})).rejects.toThrow('正在运行')
    unlock(); await first
    await expect(withReleaseLock(f.root, async () => 'done')).resolves.toBe('done')
  })

  it('Node 构建模式变化不能复用；指定其他 Worker 环境时停止', async () => {
    const f = await fixture()
    vi.stubEnv('NODE_ENV', 'production')
    const first = await releaseIdentity(f.root, f.run)
    vi.stubEnv('NODE_ENV', 'development')
    expect((await releaseIdentity(f.root, f.run)).key).not.toBe(first.key)
    vi.stubEnv('CLOUDFLARE_ENV', 'other-site')
    await expect(releaseIdentity(f.root, f.run)).rejects.toThrow('CLOUDFLARE_ENV')
  })
})
