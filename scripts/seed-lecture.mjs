import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lectureSamples } from '../src/data/lectureSamples.js'
import { lectureProblems } from '../src/lib/lectureContent.js'
import { lectureSummary } from '../worker/src/lectureStore.js'

const [mode, ...extra] = process.argv.slice(2)
if (!['--local', '--remote'].includes(mode) || extra.length) throw new Error('用法：node scripts/seed-lecture.mjs --local 或 --remote')
const root = fileURLToPath(new URL('..', import.meta.url))
const entries = lectureSamples.map((day) => {
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
