import { execFileSync } from 'node:child_process'
import { readFile, realpath, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { deploySite } from './lib/deploySite.mjs'

const root = await realpath(fileURLToPath(new URL('..', import.meta.url)))
try {
  if (process.argv.length > 3) throw new Error('请只指定 --check 或 --publish。')
  await deploySite({
    root, mode: process.argv[2] || '--check', env: process.env,
    run: async (command, args, { capture = false } = {}) => execFileSync(command, args, {
      cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit',
    }) || '',
    isFile: async (path) => { try { return (await stat(path)).isFile() } catch { return false } },
    readJson: async (path) => JSON.parse(await readFile(path, 'utf8')),
    log: console.log,
  })
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
