import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import katex from 'katex'
import { dailyTheoremNotes, paroles } from '../../src/data/siteContent.js'
import { dayMs, isCalendarDate } from '../../src/lib/calendarDate.js'
import { readJson } from '../batch/files.mjs'

const text = { type: 'string' }
const list = (items) => ({ type: 'array', items })
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const fields = (names) => object(Object.fromEntries(names.split(' ').map((name) => [name, text])))
const theorem = fields('title prelude displayExpression fallback note')
const parole = fields('text note author src')
export const daySchema = object({ date: text, theorem, parole })
export const planSchema = object({ days: list(fields('date title angle')) })
export const reviewSchema = object({ findings: list(fields('where problem fix')) })
export const editSchema = object({ day: daySchema, changes: list(text) })

const normalized = (s) => s.normalize('NFKC').toLowerCase().replace(/[\p{P}\s]/gu, '')
const jargon = /抓手|赋能|底层逻辑|颗粒度|认知升级|形成闭环|方法论闭环/
export const staticHistory = {
  titles: dailyTheoremNotes.map((item) => item.title),
  quotes: paroles.map((item) => item.text),
}

export function dates(start, count) {
  if (!isCalendarDate(start) || !Number.isSafeInteger(count) || count < 1 ||
      Date.parse(start) + (count - 1) * dayMs > Date.parse('9999-12-31')) throw new Error('请指定有效起始日期和天数。')
  return Array.from({ length: count }, (_, i) => new Date(Date.parse(start) + i * dayMs).toISOString().slice(0, 10))
}

function checkFields(value, names) {
  for (const name of names) {
    if (typeof value?.[name] !== 'string' || !value[name].trim()) throw new Error('缺少字段 ' + name)
  }
}

function unique(value, previous) {
  if (previous.some((s) => normalized(s) === normalized(value))) throw new Error('内容重复：' + value)
}

export function checkPlan(plan, expected, history) {
  if (!Array.isArray(plan?.days) || plan.days.length !== expected.length) throw new Error('排期天数不符。')
  const titles = [...history.titles]
  plan.days.forEach((slot, i) => {
    checkFields(slot, ['date', 'title', 'angle'])
    if (slot.date !== expected[i]) throw new Error('排期应为 ' + expected[i])
    unique(slot.title, titles)
    titles.push(slot.title)
  })
}

export function renderDay(day, slot, history) {
  checkFields(day?.theorem, theorem.required)
  checkFields(day.parole, parole.required)
  if (day.date !== slot.date || day.theorem.title !== slot.title) throw new Error('须按排期写 ' + slot.date + ' ' + slot.title)
  if (/https?:\/\/|\]\(/i.test(day.parole.src)) throw new Error('出处在页面直接显示，请用纯文本写作品名和章节。')
  unique(day.theorem.title, history.titles)
  unique(day.parole.text, history.quotes)
  for (const line of [day.theorem.title, day.theorem.prelude, day.theorem.note, day.parole.note]) {
    if (jargon.test(line)) throw new Error('请把套话改成具体的中文：' + line)
  }
  const displayHtml = katex.renderToString(day.theorem.displayExpression, {
    displayMode: true, output: 'html', throwOnError: true, strict: 'error',
    trust: ({ command }) => { throw new Error('公式含非数学排版指令：' + command) },
  })
  return { ...day, theorem: { ...day.theorem, displayHtml } }
}

export function readBatch(dir, { refreshHtml = false } = {}) {
  const plan = readJson(join(dir, 'plan.json'))
  const history = readJson(join(dir, 'history.json'))
  const expected = dates(plan.days?.[0]?.date, plan.days?.length)
  checkPlan(plan, expected, history)
  const files = readdirSync(join(dir, 'days')).filter((name) => name.endsWith('.json')).sort()
  if (files.join() !== expected.map((date) => date + '.json').join()) throw new Error('days/ 的日期与排期不符。')
  return plan.days.map((slot) => {
    const day = readJson(join(dir, 'days', slot.date + '.json'))
    const rendered = renderDay(day, slot, history)
    if (!refreshHtml && day.theorem.displayHtml !== rendered.theorem.displayHtml) throw new Error(slot.date + ' 的公式 HTML 与原式不符。')
    history.titles.push(day.theorem.title)
    history.quotes.push(day.parole.text)
    return rendered
  })
}
