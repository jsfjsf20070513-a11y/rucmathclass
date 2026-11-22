import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { dates, readBatch, renderDay, staticHistory } from './content.mjs'

const slot = { date: '2026-12-01', title: '二项式定理' }
const day = {
  date: slot.date,
  theorem: { title: slot.title, prelude: '平方是二次幂。', displayExpression: '(a+b)^2=a^2+2ab+b^2', fallback: '(a+b)² = a²+2ab+b²', note: '中间项来自两个交叉乘积。' },
  parole: { text: 'Comptons les chemins.', note: '数一数有几条路。', author: 'Parole du jour', src: '原创' },
}
it('排期跨年、跨闰日，拒绝无效日期', () => {
  expect(dates('2026-12-31', 2)).toEqual(['2026-12-31', '2027-01-01'])
  expect(dates('2028-02-28', 3)).toEqual(['2028-02-28', '2028-02-29', '2028-03-01'])
  expect(() => dates('2027-02-29', 1)).toThrow()
})
it('HTML 只从检查过的公式生成，拒绝缺字段、坏公式、重复引语及套话', () => {
  expect(renderDay(day, slot, staticHistory).theorem.displayHtml).toContain('class="katex"')
  for (const field of [{ displayExpression: '\\unknownCommand' }, { displayExpression: '\\href{a}{x}' }, { note: '赋能用户' }, { prelude: ' ' }]) {
    expect(() => renderDay({ ...day, theorem: { ...day.theorem, ...field } }, slot, staticHistory)).toThrow()
  }
  expect(() => renderDay(day, slot, { titles: [], quotes: ['COMPTONS LES CHEMINS !'] })).toThrow('重复')
})

it('整批检查核对日期和渲染结果，手改公式后可重新排版', () => {
  const dir = mkdtempSync(join(tmpdir(), 'daily-batch-test-'))
  const save = (file, value) => writeFileSync(join(dir, file), JSON.stringify(value))
  try {
    mkdirSync(join(dir, 'days'))
    save('history.json', staticHistory)
    save('plan.json', { days: [{ ...slot, angle: '数一数乘积里的交叉项。' }] })
    const path = 'days/' + day.date + '.json'
    save(path, { ...day, theorem: { ...day.theorem, displayHtml: '<b>旧公式</b>' } })
    expect(() => readBatch(dir)).toThrow('HTML')
    const [rendered] = readBatch(dir, { refreshHtml: true })
    save(path, rendered)
    expect(readBatch(dir)).toEqual([rendered])
    save('days/副本.json', rendered)
    expect(() => readBatch(dir)).toThrow('日期')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
