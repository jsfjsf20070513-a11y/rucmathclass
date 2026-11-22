import { parseArgs } from 'node:util'
import { writeLectureKV } from './batch/seed.mjs'
import { readBatch } from './daily-batch/content.mjs'

const { values } = parseArgs({ options: {
  local: { type: 'boolean' }, remote: { type: 'boolean' }, batch: { type: 'string' },
} })
if (Boolean(values.local) === Boolean(values.remote) || !values.batch) {
  throw new Error('用法：node scripts/seed-daily.mjs (--local | --remote) --batch 批次目录')
}
const mode = values.remote ? '--remote' : '--local'
const days = readBatch(values.batch)
const entries = days.map((day) => ({
  key: `daily:${day.date}`, value: JSON.stringify(day),
}))
await writeLectureKV(entries, mode)
