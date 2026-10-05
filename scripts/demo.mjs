import { parseArgs } from 'node:util'
import { startDemo } from './lib/demoServer.mjs'
import { FIXTURE_PASSWORD, SCENES } from './lib/localFixture.mjs'

try {
  const { values } = parseArgs({ options: { scene: { type: 'string', default: 'home' }, port: { type: 'string', default: '4178' }, help: { type: 'boolean' } } })
  if (values.help) {
    console.log('用法：npm run demo -- --scene vocabulary-study\n场景：\n' + Object.entries(SCENES).map(([name, scene]) => `  ${name}  ${scene.title}`).join('\n'))
  } else {
    const port = Number(values.port)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口应是 1024 到 65535 之间的整数。')
    const demo = await startDemo({ scene: values.scene, port })
    console.log(`本地假数据网站：${demo.url}\n假账号：browser@example.invalid / other@example.invalid\n密码：${FIXTURE_PASSWORD}；验证码：123456\n不会发送邮件或调用真实 AI。进度保留到本次进程退出。`)
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await demo.close(); process.exit(0) })
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
