import { describe, expect, it, vi } from 'vitest'
import { deploySite } from './deploySite.mjs'

function fixture(overrides = {}) {
  const commands = []
  const results = {
    'rev-parse --show-toplevel': '/site',
    'remote get-url origin': 'https://github.com/jsfjsf20070513-a11y/rucmathclass.git',
    'branch --show-current': 'mathclass/main',
    'status --porcelain --untracked-files=all': '',
    'rev-parse HEAD': 'abc123',
    ...overrides,
  }
  const config = {
    root: '/site', mode: '--check',
    env: { MATHCLASS_DEPLOY_HOST: 'example.invalid', MATHCLASS_DEPLOY_USER: 'site', MATHCLASS_DEPLOY_SSH_KEY: '/key' },
    run: vi.fn(async (command, args) => {
      commands.push([command, ...args])
      return command === 'git' ? results[args.join(' ')] || '' : ''
    }),
    isFile: async () => true,
    readJson: async () => ({ app: 'MathClassWebsite', mode: 'static-spa', buildTime: '2026-09-26T00:00:00Z' }),
    log: vi.fn(),
  }
  return { config, commands }
}
describe('release preflight', () => {
  it.each([
    { 'remote get-url origin': 'https://github.com/jsfjsf20070513-a11y/raccord.git' },
    { 'branch --show-current': 'codex/work' }, { 'branch --show-current': '' },
    { 'rev-parse --show-toplevel': '/other' },
    { 'status --porcelain --untracked-files=all': '?? notes.txt' },
  ])('rejects an unsafe checkout before building or connecting %j', async (override) => {
    const { config, commands } = fixture(override)
    await expect(deploySite(config)).rejects.toThrow()
    expect(commands.every(([name]) => name === 'git')).toBe(true)
  })
  it.each([
    { MATHCLASS_DEPLOY_DIR: '/var/www/raccord' },
    { MATHCLASS_DEPLOY_HOST: 'example.invalid; touch /tmp/pwn' },
    { MATHCLASS_DEPLOY_USER: '-option' }, { MATHCLASS_DEPLOY_SSH_KEY: '/key\nextra' },
    { MATHCLASS_DEPLOY_SSH_KEY: 'keys/id' },
  ])('rejects unsafe targets before building %j', async (env) => {
    const { config, commands } = fixture()
    Object.assign(config.env, env)
    await expect(deploySite(config)).rejects.toThrow()
    expect(commands.every(([name]) => name === 'git')).toBe(true)
  })
  it('checks lint, tests and a fresh build, restores only health, and never transports in check mode', async () => {
    const { config, commands } = fixture()
    await deploySite(config)
    expect(commands.filter(([name]) => name === 'npm')).toEqual([['npm', 'run', 'lint'], ['npm', 'test'], ['npm', 'run', 'build']])
    expect(commands).toContainEqual(['git', 'restore', '--', 'public/health.json'])
    expect(commands.some(([name]) => name === 'ssh' || name === 'rsync')).toBe(false)
  })
  it('restores health after a build failure, without connecting', async () => {
    const { config, commands } = fixture()
    const original = config.run
    config.run = async (name, args) => { if (name === 'npm' && args.includes('build')) throw new Error('build failed'); return original(name, args) }
    await expect(deploySite(config)).rejects.toThrow('build failed')
    expect(commands.at(-1)).toEqual(['git', 'restore', '--', 'public/health.json'])
  })
  it('rejects a changed commit during the build before connecting', async () => {
    const { config, commands } = fixture()
    config.mode = '--publish'
    let heads = 0
    const original = config.run
    config.run = async (name, args) => {
      if (name === 'git' && args.join(' ') === 'rev-parse HEAD' && ++heads > 1) return 'different'
      return original(name, args)
    }
    await expect(deploySite(config)).rejects.toThrow('检查期间')
    expect(commands.some(([name]) => name === 'ssh' || name === 'rsync')).toBe(false)
  })
  it('refuses generated source changes and invalid build markers before connecting', async () => {
    for (const dirty of [true, false]) {
      const { config, commands } = fixture()
      let checks = 0
      const original = config.run
      config.run = async (name, args) => {
        if (name === 'git' && args[0] === 'status' && ++checks > 1 && dirty) return ' M src/data/generated.js'
        return original(name, args)
      }
      config.mode = '--publish'
      config.readJson = async () => ({ app: 'raccord' })
      await expect(deploySite(config)).rejects.toThrow()
      expect(commands.some(([name]) => name === 'ssh' || name === 'rsync')).toBe(false)
    }
  })
  it('only publishes after checks and quotes a key path as one SSH argument', async () => {
    const { config, commands } = fixture()
    config.mode = '--publish'
    config.env.MATHCLASS_DEPLOY_SSH_KEY = "/keys/John's private key"
    await deploySite(config)
    expect(commands.at(-2)[0]).toBe('ssh')
    const rsync = commands.at(-1)
    expect(rsync[0]).toBe('rsync')
    expect(rsync[rsync.indexOf('-e') + 1]).toContain("'/keys/John'\\''s private key'")
    expect(rsync.at(-1)).toBe('site@example.invalid:/var/www/MathClassWebsite/dist/')
  })
})
