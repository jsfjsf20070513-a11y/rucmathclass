import { execFileSync } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { deploySite } from './lib/deploySite.mjs'
import { checkedBuild, confirmCheckedBuild, beginReleaseRecord, withReleaseLock } from './lib/releaseCheck.mjs'
import { createReleaseHttp } from './lib/releaseHttp.mjs'

const root = await realpath(fileURLToPath(new URL('..', import.meta.url)))
try {
  if (process.argv.length > 3) throw new Error('请只指定 --check 或 --publish。')
  const run = async (command, args, { capture = false } = {}) => {
    try {
      return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' }) || ''
    } catch (error) {
      const hint = capture ? '请检查仓库状态和网络连接。' : '请查看上方输出。'
      throw Object.assign(new Error(`${command} 执行失败。${hint}`), { exitCode: error.status })
    }
  }
  await withReleaseLock(root, () => deploySite({
    root, mode: process.argv[2] || '--check', env: process.env, run,
    isFile: async (path) => { try { return (await stat(path)).isFile() } catch { return false } },
    getCheckedBuild: () => checkedBuild({ root, run, log: console.log }),
    confirmBuild: (build) => confirmCheckedBuild(build, { root, run }),
    beginRecord: (initial) => beginReleaseRecord(root, initial),
    live: createReleaseHttp(),
    log: console.log,
  }))
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
