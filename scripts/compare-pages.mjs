import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile, lstat, readlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'
import { startDemo, projectRoot } from './lib/demoServer.mjs'
import { captureScene, composeComparison } from './lib/captureScene.mjs'
import { FIXTURE_TIME, SCENES } from './lib/localFixture.mjs'

const git = (...args) => execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim()
let temporary, browser, output, record
const servers = new Set()
async function sourceDigest() {
  const hash = createHash('sha256')
  const names = [...new Set(git('ls-files', '-c', '-o', '--exclude-standard', '-z').split('\0').filter(Boolean))].sort()
  for (const name of names) {
    const path = join(projectRoot, name)
    const stat = await lstat(path).catch(() => null)
    hash.update(name + '\0')
    hash.update(!stat ? 'deleted' : stat.isSymbolicLink() ? await readlink(path) : await readFile(path))
  }
  return hash.digest('hex')
}
async function cleanup() {
  await Promise.allSettled([browser?.close(), ...[...servers].map((server) => server.close())])
  if (temporary) await rm(temporary, { recursive: true, force: true })
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await cleanup(); process.exit(130) })

try {
  const { values } = parseArgs({ options: { base: { type: 'string' }, scene: { type: 'string', default: 'home' }, size: { type: 'string', default: 'both' }, help: { type: 'boolean' } } })
  if (values.help) {
    console.log('用法：npm run compare -- --base <提交或分支> --scene vocabulary-study\n--scene all 可检查全部场景；--size mobile|desktop|both 选择尺寸。\n场景：' + Object.keys(SCENES).join('、'))
  } else {
    if (!values.base) throw new Error('请用 --base 明确指定“改前”的提交或分支。')
    const scenes = values.scene === 'all' ? Object.keys(SCENES) : values.scene.split(',')
    if (scenes.some((name) => !SCENES[name])) throw new Error('场景不存在。运行 npm run compare -- --help 查看。')
    const viewports = { mobile: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } }
    const sizes = values.size === 'both' ? Object.keys(viewports) : [values.size]
    if (sizes.some((size) => !viewports[size])) throw new Error('尺寸只能是 mobile、desktop 或 both。')
    const before = git('rev-parse', '--verify', '--end-of-options', `${values.base}^{commit}`)
    const after = git('rev-parse', 'HEAD')
    temporary = await mkdtemp(join(tmpdir(), 'mathclass-compare-'))
    const beforeRoot = join(temporary, 'before')
    await mkdir(beforeRoot)
    const archive = execFileSync('git', ['archive', '--format=tar', before], { cwd: projectRoot, maxBuffer: 64 * 1024 * 1024 })
    execFileSync('tar', ['-x', '-C', beforeRoot], { input: archive })
    const [oldLock, newLock] = await Promise.all([readFile(join(beforeRoot, 'package-lock.json')), readFile(join(projectRoot, 'package-lock.json'))])
    if (!oldLock.equals(newLock)) throw new Error('两版的依赖清单不同，暂时无法自动对比。请选择依赖清单相同的基准版本。')
    await symlink(join(projectRoot, 'node_modules'), join(beforeRoot, 'node_modules'), 'dir')
    output = join(projectRoot, 'output/playwright/comparisons', new Date().toISOString().replaceAll(':', '-'))
    await mkdir(output, { recursive: true })
    const status = git('status', '--porcelain')
    record = { before, after, workingTreeChanged: Boolean(status), sourceDigest: await sourceDigest(), result: 'failed', capturedAt: new Date().toISOString(), fixtureTime: FIXTURE_TIME, reducedMotion: 'reduce', locale: 'zh-CN', timezone: 'Asia/Shanghai', deviceScaleFactor: 1, files: [] }
    browser = await chromium.launch()
    for (const scene of scenes) {
      for (const size of sizes) {
        const paths = []
        for (const [side, root] of [['before', beforeRoot], ['after', projectRoot]]) {
          const demo = await startDemo({ root, scene, cacheDir: join(temporary, `cache-${side}`) })
          servers.add(demo)
          try {
            const path = join(output, `${scene}-${size}-${side}.png`)
            await captureScene(browser, demo, viewports[size], path)
            paths.push(path)
          } finally { await demo.close(); servers.delete(demo) }
        }
        const [left, right] = await Promise.all(paths.map((path) => readFile(path)))
        const file = `${scene}-${size}.png`
        await composeComparison(browser, left, right, join(output, file), [before.slice(0, 7), `${after.slice(0, 7)}${status ? ' + 工作区改动' : ''}`])
        record.files.push({ scene, size, viewport: viewports[size], file, identical: left.equals(right), beforeSha256: createHash('sha256').update(left).digest('hex'), afterSha256: createHash('sha256').update(right).digest('hex') })
        console.log(`${SCENES[scene].title} / ${size}：${resolve(output, file)}`)
      }
    }
    if (await sourceDigest() !== record.sourceDigest) throw new Error('截图期间工作区文件发生变化，请重新生成，避免混用不同版本。')
    record.result = 'complete'
  }
} catch (error) {
  if (record) record.error = error.message
  console.error(error.message)
  process.exitCode = 1
} finally {
  await cleanup()
  if (record) await writeFile(join(output, 'record.json'), JSON.stringify(record, null, 2) + '\n')
}
