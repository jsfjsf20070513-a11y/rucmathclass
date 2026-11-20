import { execFileSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lectureSamples } from '../src/data/lectureSamples.js'
import { lectureProblems } from '../src/lib/lectureContent.js'
import { lectureSummary } from '../worker/src/lectureStore.js'

const [mode, ...extra] = process.argv.slice(2)
if (!['--local', '--remote'].includes(mode) || extra.length) throw new Error('用法：node scripts/seed-lecture.mjs --local 或 --remote')
const root = fileURLToPath(new URL('..', import.meta.url))
// 三篇样稿之外，scripts/lecture-seed/ 里放上线前已审过的生成稿（每个文件一天）。
const seedDir = join(root, 'scripts/lecture-seed')
const reviewed = await Promise.all((await readdir(seedDir)).filter((name) => name.endsWith('.json')).sort()
  .map(async (name) => JSON.parse(await readFile(join(seedDir, name), 'utf8'))))
const entries = [...lectureSamples, ...reviewed].map((day) => {
  const problems = lectureProblems(day)
  if (problems.length) throw new Error(problems.join('\n'))
  return { key: `day:${day.date}`, value: JSON.stringify(day), metadata: lectureSummary(day) }
})
const dir = await mkdtemp(join(tmpdir(), 'lecture-seed-'))
try {
  const path = join(dir, 'days.json')
  await writeFile(path, JSON.stringify(entries))
  execFileSync(join(root, 'node_modules/.bin/wrangler'), [
    'kv', 'bulk', 'put', path, '--binding', 'LECTURE', '--config', 'worker/wrangler.toml', mode,
  ], { cwd: root, stdio: 'inherit' })
} finally { await rm(dir, { recursive: true, force: true }) }
