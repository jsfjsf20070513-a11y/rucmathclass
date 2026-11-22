import { parseArgs } from 'node:util'
import { writeLectureKV } from './batch/seed.mjs'
import { lectureSummary } from '../worker/src/lectureStore.js'
import { readBatch, readSeeds } from './lecture-batch/files.mjs'

const { values } = parseArgs({ options: {
  local: { type: 'boolean' }, remote: { type: 'boolean' }, batch: { type: 'string' },
} })
if (Boolean(values.local) === Boolean(values.remote) || values.batch === '') {
  throw new Error('用法：node scripts/seed-lecture.mjs (--local | --remote) [--batch 批次目录]')
}
const mode = values.remote ? '--remote' : '--local'
const days = values.batch ? readBatch(values.batch) : readSeeds()
const entries = days.map((day) => ({
  key: `day:${day.date}`, value: JSON.stringify(day), metadata: lectureSummary(day),
}))
await writeLectureKV(entries, mode)
