import { isAbsolute, join } from 'node:path'

const REMOTE_DIR = '/var/www/MathClassWebsite/dist'
const ORIGINS = new Set([
  'https://github.com/jsfjsf20070513-a11y/rucmathclass',
  'https://github.com/jsfjsf20070513-a11y/rucmathclass.git',
  'git@github.com:jsfjsf20070513-a11y/rucmathclass.git',
  'ssh://git@github.com/jsfjsf20070513-a11y/rucmathclass.git',
])
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`

// The release sequence is tested with injected commands: no SSH or real key.
export async function deploySite({ root, mode, env, run, isFile, readJson, log }) {
  if (!['--check', '--publish'].includes(mode)) throw new Error('只接受 --check（离线检查）或 --publish（发布）。')
  const git = (...args) => run('git', args, { capture: true })
  if ((await git('rev-parse', '--show-toplevel')).trim() !== root) throw new Error('脚本目录不是当前 Git 仓库根目录。')
  if (!ORIGINS.has((await git('remote', 'get-url', 'origin')).trim())) throw new Error('origin 不是班级网站 rucmathclass 仓库。')
  if ((await git('branch', '--show-current')).trim() !== 'mathclass/main') throw new Error('发布只允许 mathclass/main 分支。')
  const requireClean = async () => {
    if ((await git('status', '--porcelain', '--untracked-files=all')).trim()) throw new Error('工作区不干净；请先处理改动，不会自动丢弃文件。')
  }
  await requireClean()
  const host = env.MATHCLASS_DEPLOY_HOST || ''
  const user = env.MATHCLASS_DEPLOY_USER || ''
  const key = env.MATHCLASS_DEPLOY_SSH_KEY || ''
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host) || !/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(user)) {
    throw new Error('请设置有效的 MATHCLASS_DEPLOY_HOST 和 MATHCLASS_DEPLOY_USER。')
  }
  if (!isAbsolute(key) || /[\r\n\0]/.test(key) || !await isFile(key)) throw new Error('MATHCLASS_DEPLOY_SSH_KEY 必须是本地密钥文件的绝对路径。')
  if (env.MATHCLASS_DEPLOY_DIR && env.MATHCLASS_DEPLOY_DIR !== REMOTE_DIR) throw new Error(`班级站发布目录固定为 ${REMOTE_DIR}，拒绝覆盖其他目录。`)
  const commit = (await git('rev-parse', 'HEAD')).trim()
  log(`待发布提交：${commit}\n目标：${user}@${host}:${REMOTE_DIR}`)
  try {
    for (const args of [['run', 'lint'], ['test'], ['run', 'build']]) await run('npm', args)
  } finally {
    // The clean-tree guard ran first; restore only this generated timestamp.
    await git('restore', '--', 'public/health.json')
  }
  await requireClean()
  if ((await git('rev-parse', 'HEAD')).trim() !== commit || (await git('branch', '--show-current')).trim() !== 'mathclass/main') {
    throw new Error('检查期间提交或分支发生变化，请重新检查。')
  }
  if (!await isFile(join(root, 'dist/index.html'))) throw new Error('构建缺少 dist/index.html。')
  const health = await readJson(join(root, 'dist/health.json'))
  if (health.app !== 'MathClassWebsite' || health.mode !== 'static-spa' || !Number.isFinite(Date.parse(health.buildTime))) {
    throw new Error('构建的 health.json 不是有效班级站标记。')
  }
  log(`本次构建时间：${health.buildTime}`)
  if (mode === '--check') {
    log('离线检查完成，未连接服务器、未发布。')
    return
  }
  const ssh = ['ssh', '-i', key, '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=accept-new']
  await run('ssh', [...ssh.slice(1), `${user}@${host}`, `mkdir -p '${REMOTE_DIR}'`])
  await run('rsync', ['-av', '--delete', '-e', ssh.map(shellQuote).join(' '), `${join(root, 'dist')}/`, `${user}@${host}:${REMOTE_DIR}/`])
  log('静态文件同步完成；还需按部署流程核对线上 health 和实际页面。')
}
