import { randomUUID } from 'node:crypto'
import { renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { readBatch } from './content.mjs'

try {
  const { values, positionals } = parseArgs({ options: { render: { type: 'boolean' } }, allowPositionals: true })
  if (positionals.length !== 1) throw new Error('用法：node scripts/daily-batch/check.mjs [--render] 批次目录')
  const [dir] = positionals
  const days = readBatch(dir, { refreshHtml: values.render })
  if (values.render) {
    for (const day of days) {
      const path = join(dir, 'days', day.date + '.json')
      const temp = path + '.' + randomUUID() + '.tmp'
      writeFileSync(temp, JSON.stringify(day, null, 2) + '\n')
      renameSync(temp, path)
    }
  }
  console.log(days.length + ' 天全部通过。')
} catch (error) { console.error(error.message); process.exitCode = 1 }
