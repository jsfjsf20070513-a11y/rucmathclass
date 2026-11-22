import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function askCodex(model, schema, prompt) {
  const dir = mkdtempSync(join(tmpdir(), 'batch-codex-'))
  try {
    writeFileSync(join(dir, 'schema.json'), JSON.stringify(schema))
    writeFileSync(join(dir, 'prompt.md'), `${prompt}\n只输出符合格式的 JSON。不要运行命令或读写文件。`)
    const input = openSync(join(dir, 'prompt.md'), 'r')
    try {
      const child = spawn('codex', [
        'exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--model', model,
        '-c', 'model_provider="openai"', '-c', 'forced_login_method="chatgpt"', '-c', 'model_reasoning_effort="high"',
        '--output-schema', 'schema.json', '-o', 'answer.json', '-',
      ], { cwd: dir, stdio: [input, 'ignore', 'pipe'] })
      let tail = ''
      child.stderr.setEncoding('utf8').on('data', (chunk) => { tail = (tail + chunk).slice(-1500) })
      const [status, signal] = await once(child, 'close')
      if (status !== 0) throw new Error(`Codex 执行失败（${signal ?? status}）。\n${tail.trim()}`)
      const answer = join(dir, 'answer.json')
      return existsSync(answer) ? readFileSync(answer, 'utf8') : ''
    } finally { closeSync(input) }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

export async function generate(model, schema, prompt, check, label) {
  let feedback = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`${label}，第 ${attempt} 次。`)
    const text = await askCodex(model, schema, prompt + feedback)
    try {
      if (!text.trim()) throw new Error('未收到 JSON。')
      const value = JSON.parse(text)
      check(value)
      return value
    } catch (error) {
      feedback = `\n上一份未通过检查。请修正以下问题后重新输出全文。\n${error.message}`
    }
  }
  throw new Error(`${label}连续三次未通过检查。${feedback}`)
}
