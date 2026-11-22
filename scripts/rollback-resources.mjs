import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeLectureKV } from './batch/seed.mjs'
import { rollbackResources } from '../worker/src/resourceStore.js'

const mode = process.argv[2]
if (!['--remote', '--local'].includes(mode) || process.argv.length !== 3) {
  throw new Error('用法：node scripts/rollback-resources.mjs --local 或 --remote')
}
const root = fileURLToPath(new URL('../', import.meta.url))
function run(action, key, ...args) {
  return execFileSync('node_modules/.bin/wrangler', [
    'kv', 'key', action, key, ...args, '--binding', 'LECTURE', '--config', 'worker/wrangler.toml', mode,
  ], { cwd: root, encoding: 'utf8' })
}
const state = await rollbackResources({
  get: async key => JSON.parse(run('get', key, '--text')),
  put: async (key, value) => writeLectureKV([{ key, value }], mode),
  delete: async key => run('delete', key),
})
console.log('已恢复书目，共 ' + state.items.length + ' 条。')
