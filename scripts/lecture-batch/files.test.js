import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { lectureSamples } from '../../src/data/lectureSamples.js'
import { readBatch } from './files.mjs'
import { schedule } from './plan.mjs'

const slots = schedule('2028-02-29', 2)
const plan = { days: slots.map((slot) => ({ ...slot, theme: '毕业旅行', angle: '行程为什么改变' })) }
const articles = slots.map((slot) => ({ ...lectureSamples[0], ...slot }))
let dir

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lecture-batch-test-'))
  mkdirSync(join(dir, 'days'))
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan))
  for (const article of articles) {
    writeFileSync(join(dir, 'days', `${article.date}.json`), JSON.stringify(article))
  }
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

it('按排期读取整批定稿，缺少最后一天也会报错', () => {
  expect(readBatch(dir).map((day) => day.date)).toEqual(['2028-02-29', '2028-03-01'])
  rmSync(join(dir, 'days', '2028-03-01.json'))
  expect(() => readBatch(dir)).toThrow('2028-03-01.json')
})

it('拦下同步产生的额外 JSON 副本', () => {
  writeFileSync(join(dir, 'days', '2028-02-29 2.json'), JSON.stringify(articles[0]))
  expect(() => readBatch(dir)).toThrow('2028-02-29 2.json')
})

it('相邻两天的文件即使各自内容合格也不能互换', () => {
  writeFileSync(join(dir, 'days', '2028-02-29.json'), JSON.stringify(articles[1]))
  expect(() => readBatch(dir)).toThrow('应为 2028-02-29')
})
