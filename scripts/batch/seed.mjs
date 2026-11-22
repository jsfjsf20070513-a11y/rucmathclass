import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function writeLectureKV(entries, mode) {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const dir = await mkdtemp(join(tmpdir(), 'batch-seed-'))
  try {
    const path = join(dir, 'days.json')
    await writeFile(path, JSON.stringify(entries))
    execFileSync(join(root, 'node_modules/.bin/wrangler'), [
      'kv', 'bulk', 'put', path, '--binding', 'LECTURE', '--config', 'worker/wrangler.toml', mode,
    ], { cwd: root, stdio: 'inherit' })
  } finally { await rm(dir, { recursive: true, force: true }) }
}
