import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { lectureSummary } from '../worker/src/lectureStore.js'
import { readBatch, readSeeds } from './lecture-batch/files.mjs'

const { values } = parseArgs({ options: {
  local: { type: 'boolean' }, remote: { type: 'boolean' }, batch: { type: 'string' },
} })
if (Boolean(values.local) === Boolean(values.remote) || values.batch === '') {
  throw new Error('用法：node scripts/seed-lecture.mjs (--local | --remote) [--batch 批次目录]')
}
const mode = values.remote ? '--remote' : '--local'
const root = fileURLToPath(new URL('..', import.meta.url))
const days = values.batch ? readBatch(values.batch) : readSeeds()
const entries = days.map((day) => ({
  key: `day:${day.date}`, value: JSON.stringify(day), metadata: lectureSummary(day),
}))
const dir = await mkdtemp(join(tmpdir(), 'lecture-seed-'))
try {
  const path = join(dir, 'days.json')
  await writeFile(path, JSON.stringify(entries))
  execFileSync(join(root, 'node_modules/.bin/wrangler'), [
    'kv', 'bulk', 'put', path, '--binding', 'LECTURE', '--config', 'worker/wrangler.toml', mode,
  ], { cwd: root, stdio: 'inherit' })
} finally { await rm(dir, { recursive: true, force: true }) }
