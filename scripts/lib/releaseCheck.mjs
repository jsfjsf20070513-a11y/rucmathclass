import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, readdir, lstat, readlink, realpath, rm, rename, symlink, unlink } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import process from 'node:process'
import { loadEnv } from 'vite'

const PLAN_VERSION = 1
const CHECKS = ['lint', 'test', 'build', 'worker:check', 'browser:check']
const digest = (value) => createHash('sha256').update(value).digest('hex')
export const releaseDirectory = (root) => join(root, '.cache/mathclass-release')

export async function fileManifest(directory) {
  const result = {}
  async function visit(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(path, entry.name)
      if (entry.isSymbolicLink()) throw new Error('发布文件中不能包含符号链接。')
      if (entry.isDirectory()) await visit(full)
      else if (entry.isFile()) result[relative(directory, full)] = digest(await readFile(full))
    }
  }
  await visit(directory)
  return result
}

// 本机缓存还核对每个依赖文件的大小、修改时间和元数据变更时间。
// ctime 让手改依赖后恢复 mtime 也不能沿用旧结果；无需读取闲置的云端文件。
async function installedDigest(root) {
  const directory = await realpath(join(root, 'node_modules'))
  const inputs = []
  async function visit(path) {
    await Promise.all((await readdir(path, { withFileTypes: true })).map(async (entry) => {
      if (entry.name === '.DS_Store' || (path === directory && ['.vite', '.vite-temp', '.cache'].includes(entry.name))) return
      const full = join(path, entry.name)
      if (entry.isDirectory()) await visit(full)
      else inputs.push({ path: full, name: relative(directory, full), link: entry.isSymbolicLink() })
    }))
  }
  await visit(directory)
  inputs.sort((a, b) => a.name.localeCompare(b.name))
  const hashes = new Array(inputs.length)
  let cursor = 0
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (cursor < inputs.length) {
      const index = cursor++, entry = inputs[index]
      if (entry.link && !(await realpath(entry.path)).startsWith(directory + sep)) throw new Error('依赖链接指向 node_modules 以外，请先用 npm ci 重新安装。')
      const info = await lstat(entry.path, { bigint: true })
      hashes[index] = [entry.name, String(info.size), String(info.mtimeNs), String(info.ctimeNs), String(info.ino), entry.link ? await readlink(entry.path) : '']
    }
  }))
  return digest(JSON.stringify(hashes))
}

export async function releaseIdentity(root, run) {
  if (process.env.CLOUDFLARE_ENV) throw new Error('本地检查只使用默认 Worker 配置，请先取消 CLOUDFLARE_ENV。')
  const names = (await run('git', ['ls-files', '-z'], { capture: true })).split('\0').filter(Boolean).sort()
  const relevant = names.filter((name) => (!name.endsWith('.md') || name === 'CLAUDE.md') && !name.startsWith('docs/') && !name.startsWith('.claude/') && name !== 'public/health.json')
  const source = createHash('sha256')
  for (const name of relevant) {
    const path = join(root, name)
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`发布输入不能是符号链接：${name}`)
    source.update(name + '\0').update(await readFile(path))
  }
  // Vite 会复制 public 的全部文件；禁止把未纳入版本管理的文件顺带发布。
  const publicFiles = await fileManifest(join(root, 'public'))
  if (Object.keys(publicFiles).some((name) => !names.includes(`public/${name}`))) throw new Error('public 中有未纳入 Git 的文件。请先确认这些文件是否应公开，再检查发布。')
  const config = loadEnv('production', root, 'VITE_')
  if (/fixture|localhost|127\.0\.0\.1|\.invalid/i.test(config.VITE_SUPABASE_URL || '') || config.VITE_SUPABASE_ANON_KEY === 'local-fixture' || /fixture|localhost|127\.0\.0\.1|\.invalid/i.test(config.VITE_AI_ENDPOINT || '')) {
    throw new Error('当前配置指向假数据或本地服务，不能用来生成发布文件。')
  }
  const identity = {
    plan: PLAN_VERSION, node: process.version,
    sourceDigest: source.digest('hex'),
    configDigest: digest(JSON.stringify({ vite: Object.entries(config).sort(), nodeEnv: process.env.NODE_ENV || '', nodeOptions: process.env.NODE_OPTIONS || '', platform: process.platform, arch: process.arch })),
    installedDependencies: await installedDigest(root),
  }
  return { ...identity, key: digest(JSON.stringify(identity)) }
}

export async function checkedBuild({ root, run, log }) {
  const identity = await releaseIdentity(root, run)
  const directory = join(releaseDirectory(root), 'checked', identity.key)
  try {
    const receipt = JSON.parse(await readFile(join(directory, 'check.json'), 'utf8'))
    const files = await fileManifest(join(directory, 'dist'))
    if (receipt.identity.key === identity.key && receipt.checks.join(',') === CHECKS.join(',') && digest(JSON.stringify(files)) === receipt.artifactDigest) {
      log('使用上次检查通过的发布文件。')
      return { directory: join(directory, 'dist'), receipt, files, health: JSON.parse(await readFile(join(directory, 'dist/health.json'), 'utf8')) }
    }
  } catch { /* 缺失、旧格式或产物被改动时重新检查。 */ }

  const staging = `${directory}-${randomUUID()}`
  const artifact = join(staging, 'dist')
  await mkdir(staging, { recursive: true })
  const healthPath = join(root, 'public/health.json')
  const originalHealth = await readFile(healthPath)
  try {
    for (const check of CHECKS) {
      log(`检查：${check}`)
      const args = check === 'test' ? ['test'] : ['run', check]
      if (check === 'build') args.push('--', '--outDir', artifact)
      await run('npm', args)
    }
    await writeFile(healthPath, originalHealth)
    if ((await releaseIdentity(root, run)).key !== identity.key) throw new Error('检查期间源码、依赖或构建配置发生变化，请重新检查。')
    if ((await run('git', ['status', '--porcelain', '--untracked-files=all'], { capture: true })).trim()) throw new Error('检查后工作区出现改动，未保存通过记录。')
    const health = JSON.parse(await readFile(join(artifact, 'health.json'), 'utf8'))
    if (health.app !== 'MathClassWebsite' || health.mode !== 'static-spa' || !Number.isFinite(Date.parse(health.buildTime))) throw new Error('构建缺少有效的班级站标记。')
    const builtFrom = (await run('git', ['rev-parse', 'HEAD'], { capture: true })).trim()
    health.sourceDigest = identity.sourceDigest
    await writeFile(join(artifact, 'health.json'), JSON.stringify(health, null, 2) + '\n')
    const files = await fileManifest(artifact)
    if (!files['index.html'] || !Object.keys(files).some((name) => /^assets\/.*\.js$/.test(name))) throw new Error('构建缺少首页或脚本。')
    const receipt = { identity, builtFrom, checkedAt: new Date().toISOString(), checks: CHECKS, artifactDigest: digest(JSON.stringify(files)) }
    await writeFile(join(staging, 'check.json'), JSON.stringify(receipt, null, 2) + '\n')
    await rm(directory, { recursive: true, force: true })
    await rename(staging, directory)
    return { directory: join(directory, 'dist'), receipt, files, health }
  } finally {
    await writeFile(healthPath, originalHealth)
    await rm(staging, { recursive: true, force: true })
  }
}

export async function beginReleaseRecord(root, initial) {
  const directory = join(releaseDirectory(root), 'records')
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.json`)
  let record = { version: 1, startedAt: new Date().toISOString(), result: 'running', ...initial }
  const update = async (patch) => {
    record = { ...record, ...patch }
    const temporary = path + '.tmp'
    await writeFile(temporary, JSON.stringify(record, null, 2) + '\n')
    await rename(temporary, path)
  }
  await update({})
  return { path, update }
}

export async function confirmCheckedBuild(build, { root, run }) {
  if ((await releaseIdentity(root, run)).key !== build.receipt.identity.key) throw new Error('检查后源码、依赖或配置发生变化，已停止发布。')
  if (build.health.app !== 'MathClassWebsite' || build.health.mode !== 'static-spa' || build.health.sourceDigest !== build.receipt.identity.sourceDigest) throw new Error('构建标记与检查记录不一致，已停止发布。')
  if (digest(JSON.stringify(await fileManifest(build.directory))) !== build.receipt.artifactDigest) throw new Error('检查后的构建文件已被修改，已停止发布。')
}

export async function withReleaseLock(root, task) {
  const directory = releaseDirectory(root)
  await mkdir(directory, { recursive: true })
  const lock = join(directory, 'lock')
  try { await symlink(String(process.pid), lock) } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const pid = Number(await readlink(lock).catch(() => ''))
    let alive = true
    if (pid > 0) {
      try { process.kill(pid, 0) } catch (failure) { if (failure.code === 'ESRCH') alive = false }
    }
    if (alive && pid > 0) throw new Error(`已有检查或发布正在运行（进程 ${pid}），请等它结束。`)
    throw new Error(`上次检查留下了锁。请确认没有检查或发布在运行，再删除此锁后重试：${lock}`)
  }
  try { return await task() } finally { await unlink(lock) }
}
