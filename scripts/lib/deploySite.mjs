import { isAbsolute } from 'node:path'

const REMOTE_DIR = '/var/www/MathClassWebsite/dist'
const ORIGINS = new Set([
  'https://github.com/jsfjsf20070513-a11y/rucmathclass',
  'https://github.com/jsfjsf20070513-a11y/rucmathclass.git',
  'git@github.com:jsfjsf20070513-a11y/rucmathclass.git',
  'ssh://git@github.com/jsfjsf20070513-a11y/rucmathclass.git',
])
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`
const STAGES = { preflight: '发布前核对', checks: '本地检查', before: '读取线上版本', transfer: '上传文件', verify: '核对线上文件' }

// 发布顺序可以用假 Git、假传输和假 HTTP 完整检查，不需要服务器凭据。
export async function deploySite({ root, mode, env, run, isFile, getCheckedBuild, confirmBuild, beginRecord, live, log }) {
  if (!['--check', '--publish'].includes(mode)) throw new Error('只接受 --check（本地检查）或 --publish（发布）。')
  const git = async (...args) => (await run('git', args, { capture: true })).trim()
  if (await git('rev-parse', '--show-toplevel') !== root) throw new Error('脚本目录不是当前 Git 仓库根目录。')
  if (!ORIGINS.has(await git('remote', 'get-url', 'origin'))) throw new Error('origin 不是班级网站 rucmathclass 仓库。')
  const branch = await git('branch', '--show-current')
  const commit = await git('rev-parse', 'HEAD')
  const requireClean = async () => {
    if (await git('status', '--porcelain', '--untracked-files=all')) throw new Error('工作区不干净；请先处理改动，不会自动丢弃文件。')
  }
  const requireRemote = async () => {
    const remote = await git('ls-remote', '--exit-code', 'origin', 'refs/heads/mathclass/main')
    if (remote.split(/\s+/)[0] !== commit) throw new Error('本地提交与远端 mathclass/main 不同，已停止发布。')
  }
  let stage = 'preflight', record
  if (mode === '--publish') record = await beginRecord({ sourceCommit: commit, phase: stage, target: 'https://rucmathclass.com' })
  const enter = async (next, details = {}) => { stage = next; await record?.update({ phase: next, ...details }) }
  try {
    await requireClean()
    const host = env.MATHCLASS_DEPLOY_HOST || '', user = env.MATHCLASS_DEPLOY_USER || '', key = env.MATHCLASS_DEPLOY_SSH_KEY || ''
    if (mode === '--publish') {
      if (branch !== 'mathclass/main') throw new Error('发布只允许 mathclass/main 分支。')
      if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host) || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(user)) throw new Error('请设置有效的 MATHCLASS_DEPLOY_HOST 和 MATHCLASS_DEPLOY_USER。')
      if (!isAbsolute(key) || /[\r\n\0]/.test(key) || !await isFile(key)) throw new Error('MATHCLASS_DEPLOY_SSH_KEY 必须是本地密钥文件的绝对路径。')
      if (env.MATHCLASS_DEPLOY_DIR && env.MATHCLASS_DEPLOY_DIR !== REMOTE_DIR) throw new Error(`班级站发布目录固定为 ${REMOTE_DIR}，拒绝覆盖其他目录。`)
      await requireRemote()
    }
    await enter('checks')
    const build = await getCheckedBuild()
    await requireClean()
    if (await git('rev-parse', 'HEAD') !== commit || await git('branch', '--show-current') !== branch) throw new Error('检查期间提交或分支发生变化，请重新检查。')
    await confirmBuild(build)
    if (mode === '--check') {
      log(`本地检查通过：${commit}\n构建时间：${build.health.buildTime}\n未连接服务器、未发布。`)
      return build
    }
    await requireRemote()
    await enter('before', { artifactDigest: build.receipt.artifactDigest, sourceDigest: build.receipt.identity.sourceDigest, checkedAt: build.receipt.checkedAt, builtFrom: build.receipt.builtFrom, buildTime: build.health.buildTime })
    const previous = await live.before()
    await requireClean()
    if (await git('rev-parse', 'HEAD') !== commit || await git('branch', '--show-current') !== branch) throw new Error('读取线上版本期间提交或分支发生变化，已停止发布。')
    await requireRemote()
    await confirmBuild(build)
    await enter('transfer', { previous })
    const ssh = ['ssh', '-i', key, '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=accept-new']
    await run('ssh', [...ssh.slice(1), `${user}@${host}`, `mkdir -p '${REMOTE_DIR}'`])
    await run('rsync', ['-av', '--delete', '-e', ssh.map(shellQuote).join(' '), `${build.directory}/`, `${user}@${host}:${REMOTE_DIR}/`])
    await enter('verify')
    const verified = await live.verify(build)
    await record.update({ phase: 'complete', result: 'success', finishedAt: new Date().toISOString(), verified })
    log(`班级站文件已发布，线上文件核对通过：${commit}\n记录：${record.path}`)
    return build
  } catch (error) {
    // 原始进程错误可能带密钥路径或环境值，只把阶段和退出码写入记录。
    await record?.update({ phase: stage, result: 'failed', finishedAt: new Date().toISOString(), exitCode: Number.isInteger(error.exitCode) ? error.exitCode : null })
    if (record) log(`发布未完成，停在“${STAGES[stage]}”。记录：${record.path}`)
    throw error
  }
}
