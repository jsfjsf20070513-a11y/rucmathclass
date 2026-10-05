import { describe, expect, it, vi } from 'vitest'
import { deploySite } from './deploySite.mjs'

const COMMIT = 'a'.repeat(40)
function fixture(overrides = {}) {
  const commands = [], records = []
  const results = {
    'rev-parse --show-toplevel': '/site',
    'remote get-url origin': 'https://github.com/jsfjsf20070513-a11y/rucmathclass.git',
    'branch --show-current': 'mathclass/main',
    'status --porcelain --untracked-files=all': '',
    'rev-parse HEAD': COMMIT,
    'ls-remote --exit-code origin refs/heads/mathclass/main': `${COMMIT}\trefs/heads/mathclass/main`,
    ...overrides,
  }
  const build = { directory: '/site/.cache/checked/dist', health: { buildTime: '2026-10-05T04:00:00Z' }, receipt: { identity: { sourceDigest: 'source' }, artifactDigest: 'artifact', builtFrom: COMMIT, checkedAt: '2026-10-05T04:00:00Z' } }
  const config = {
    root: '/site', mode: '--check', env: {},
    run: vi.fn(async (command, args) => { commands.push([command, ...args]); return command === 'git' ? results[args.join(' ')] || '' : '' }),
    isFile: async () => true,
    getCheckedBuild: vi.fn(async () => build), confirmBuild: vi.fn(async () => {}),
    beginRecord: vi.fn(async (initial) => { records.push(initial); return { path: '/record.json', update: async (patch) => records.push(patch) } }),
    live: { before: vi.fn(async () => ({ buildTime: 'old' })), verify: vi.fn(async () => ({ buildTime: 'new' })) },
    log: vi.fn(),
  }
  const publish = () => { config.mode = '--publish'; config.env = { MATHCLASS_DEPLOY_HOST: 'example.invalid', MATHCLASS_DEPLOY_USER: 'site', MATHCLASS_DEPLOY_SSH_KEY: '/key' } }
  return { config, commands, records, publish }
}

describe('班级站发布', () => {
  it.each([
    { 'remote get-url origin': 'https://github.com/jsfjsf20070513-a11y/raccord.git' },
    { 'rev-parse --show-toplevel': '/other' },
    { 'status --porcelain --untracked-files=all': '?? notes.txt' },
  ])('拒绝错误仓库和未处理的文件 %j', async (overrides) => {
    const { config, commands } = fixture(overrides)
    await expect(deploySite(config)).rejects.toThrow()
    expect(config.getCheckedBuild).not.toHaveBeenCalled()
    expect(commands.every(([name]) => name === 'git')).toBe(true)
  })

  it('干净工作分支可以检查，不需要凭据，也不访问远端或线上', async () => {
    const { config, commands } = fixture({ 'branch --show-current': 'codex/work' })
    await deploySite(config)
    expect(config.getCheckedBuild).toHaveBeenCalledOnce()
    expect(config.confirmBuild).toHaveBeenCalledOnce()
    expect(config.beginRecord).not.toHaveBeenCalled()
    expect(config.live.before).not.toHaveBeenCalled()
    expect(commands.some(([name, action]) => name !== 'git' || action === 'ls-remote')).toBe(false)
  })

  it.each([
    { MATHCLASS_DEPLOY_DIR: '/var/www/raccord' },
    { MATHCLASS_DEPLOY_HOST: 'example.invalid; touch /tmp/pwn' },
    { MATHCLASS_DEPLOY_USER: '-option' },
    { MATHCLASS_DEPLOY_SSH_KEY: '/key\nextra' },
    { MATHCLASS_DEPLOY_SSH_KEY: 'keys/id' },
  ])('拒绝错误发布目标 %j', async (env) => {
    const { config, commands, publish } = fixture()
    publish(); Object.assign(config.env, env)
    await expect(deploySite(config)).rejects.toThrow()
    expect(config.getCheckedBuild).not.toHaveBeenCalled()
    expect(commands.every(([name]) => name === 'git')).toBe(true)
  })

  it.each([
    { 'branch --show-current': 'codex/work' },
    { 'ls-remote --exit-code origin refs/heads/mathclass/main': 'different\trefs/heads/mathclass/main' },
  ])('不发布尚未合并或不同于远端的提交 %j', async (overrides) => {
    const { config, commands, publish, records } = fixture(overrides)
    publish()
    await expect(deploySite(config)).rejects.toThrow()
    expect(commands.some(([name]) => ['ssh', 'rsync'].includes(name))).toBe(false)
    expect(records.at(-1)).toMatchObject({ phase: 'preflight', result: 'failed' })
  })

  it('检查期间本地或远端变化都会在传输前停止', async () => {
    for (const target of ['rev-parse HEAD', 'ls-remote --exit-code origin refs/heads/mathclass/main']) {
      const { config, commands, publish } = fixture()
      publish()
      const original = config.run
      let calls = 0
      config.run = async (name, args, options) => name === 'git' && args.join(' ') === target && ++calls > 1 ? 'different' : original(name, args, options)
      await expect(deploySite(config)).rejects.toThrow()
      expect(commands.some(([name]) => ['ssh', 'rsync'].includes(name))).toBe(false)
    }
  })

  it('只传已经检查的文件，验收通过才写成功记录', async () => {
    const { config, commands, publish, records } = fixture()
    publish(); config.env.MATHCLASS_DEPLOY_SSH_KEY = "/keys/John's private key"
    await deploySite(config)
    const transfers = commands.filter(([name]) => name !== 'git')
    expect(transfers).toHaveLength(2)
    expect(transfers[0][0]).toBe('ssh')
    expect(transfers[0].at(-1)).toBe("mkdir -p '/var/www/MathClassWebsite/dist'")
    const rsync = transfers[1]
    expect(rsync[rsync.indexOf('-e') + 1]).toContain("'/keys/John'\\''s private key'")
    expect(rsync.slice(-2)).toEqual(['/site/.cache/checked/dist/', 'site@example.invalid:/var/www/MathClassWebsite/dist/'])
    expect(config.live.verify).toHaveBeenCalledOnce()
    expect(records.at(-1)).toMatchObject({ result: 'success', phase: 'complete' })
    expect(JSON.stringify(records)).not.toContain('private key')
  })

  it('读取线上版本期间改动工作区，会在上传前停止', async () => {
    const { config, commands, publish } = fixture()
    publish()
    const original = config.run
    let changed = false
    config.run = (name, args, options) => changed && name === 'git' && args[0] === 'status' ? ' M src/app.js' : original(name, args, options)
    config.live.before = async () => {
      changed = true
      return { buildTime: 'old' }
    }
    await expect(deploySite(config)).rejects.toThrow('工作区')
    expect(commands.some(([name]) => ['ssh', 'rsync'].includes(name))).toBe(false)
  })

  it.each(['checks', 'transfer', 'verify'])('失败会记录发生在哪一步，且不记录原始错误中的凭据：%s', async (phase) => {
    const { config, publish, records } = fixture()
    publish()
    const failure = () => { throw Object.assign(new Error('SECRET_KEY=/keys/private-secret'), { exitCode: 9 }) }
    if (phase === 'checks') config.getCheckedBuild = failure
    if (phase === 'verify') config.live.verify = failure
    if (phase === 'transfer') {
      const original = config.run
      config.run = (...args) => args[0] === 'rsync' ? failure() : original(...args)
    }
    await expect(deploySite(config)).rejects.toThrow()
    expect(records.at(-1)).toMatchObject({ result: 'failed', phase, exitCode: 9 })
    expect(JSON.stringify(records)).not.toContain('private-secret')
  })
})
