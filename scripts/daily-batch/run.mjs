import { existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { dayMs, isCalendarDate } from '../../src/lib/calendarDate.js'
import { modelFile, readJson, saveNew } from '../batch/files.mjs'
import { checkPlan, dates, daySchema, editSchema, planSchema, readBatch, renderDay, reviewSchema, staticHistory } from './content.mjs'

function recentHistory(start, previous) {
  const history = structuredClone(staticHistory)
  const from = Date.parse(start) - 30 * dayMs
  const dirs = new Set()
  if (existsSync('.cache')) {
    for (const name of readdirSync('.cache')) {
      if (/^daily-batch-\d{4}-\d{2}-\d{2}$/.test(name) && existsSync(join('.cache', name, 'days'))) {
        dirs.add(resolve('.cache', name))
      }
    }
  }
  if (previous) dirs.add(resolve(previous))
  for (const dir of dirs) {
    for (const file of readdirSync(join(dir, 'days'))) {
      const date = file.slice(0, 10)
      if (file !== date + '.json' || !isCalendarDate(date) || date >= start || Date.parse(date) < from) continue
      const day = readJson(join(dir, 'days', file))
      history.titles.push(day.theorem.title)
      history.quotes.push(day.parole.text)
    }
  }
  return history
}

async function prepareDay(slot, dir, history, ask) {
  const file = slot.date + '.json'
  const final = join(dir, 'days', file)
  const check = (day) => renderDay(day, slot, history)
  if (existsSync(final)) {
    const saved = readJson(final)
    check(saved)
    return saved
  }
  const prompt = '为中法数学班写一天的定理与 Parole。保留排期日期和定理名。用一两句中文说明条件和结论，theorem.note 给例子或解释条件。' +
    'displayExpression 用简短可独立渲染的纯 LaTeX，fallback 用可读纯文本。Parole 延续现有引语的选法。' +
    '从公版法语原作中选一句值得细读的短引文，抄准原文，给出作者和作品名，能确定章、节或编号时也写出。src 只写纯文本书名和章节，页面会直接显示这个字段。' +
    '不强求与当天定理对应。避免来源不明的名言或自拟例句。parole.note 写自然、准确的中文译文。' +
    '\n排期：' + JSON.stringify(slot) + '\n避开已用的法语句子：' + JSON.stringify(history.quotes)
  const draft = await ask('drafts/' + file, daySchema, prompt, check, slot.date + ' 写稿')
  const review = await ask('review/' + file, reviewSchema,
    '独立审稿。检查定理的适用条件，验算公式和例子，核对纯文本是否准确表达原式。检查法语、出处与翻译，挑出中文里的套话与生硬表达。' +
    '引文或出处存疑时，建议换用出处确切的短句。逐条给出位置、问题、具体改法。没有问题可给空列表。\n' + JSON.stringify(draft),
    (r) => {
      if (!Array.isArray(r?.findings) || r.findings.some((f) => !['where', 'problem', 'fix'].every(k => typeof f?.[k] === 'string' && f[k].trim()))) throw new Error('审稿意见不完整。')
    }, slot.date + ' 独立审稿')
  let day = draft
  if (review.findings.length) {
    const edits = await ask('review/' + slot.date + '-edits.json', editSchema,
      prompt + '\n请逐条处理意见，交回完整稿件及对应说明。\n' + JSON.stringify({ draft, review }),
      (edits) => {
        check(edits.day)
        if (edits.changes?.length !== review.findings.length || !edits.changes.every(s => typeof s === 'string' && s.trim())) throw new Error('缺少逐条改稿说明。')
      }, slot.date + ' 改稿')
    day = edits.day
  }
  return saveNew(final, check(day))
}

async function main() {
  const { values } = parseArgs({ options: {
    start: { type: 'string' }, days: { type: 'string', default: '30' }, out: { type: 'string' },
    previous: { type: 'string' }, 'dry-run': { type: 'boolean' }, model: { type: 'string', default: 'gpt-6.2-astra' },
  } })
  const calendar = dates(values.start, Number(values.days))
  if (values['dry-run']) return console.log(calendar.join('\n'))
  const dir = resolve(values.out || '.cache/daily-batch-' + values.start)
  const historyPath = join(dir, 'history.json')
  const history = existsSync(historyPath) ? readJson(historyPath) : saveNew(historyPath, recentHistory(values.start, values.previous))
  const ask = (file, schema, prompt, check, label) => modelFile(join(dir, file), values.model, schema, prompt, check, label)
  const plan = await ask('plan.json', planSchema,
    '为数学班首页排期，兼顾分析、代数、几何、概率、组合。title 用准确的通行定理名，angle 写一个适合学生的具体例子或易错条件。' +
    '按以下日期各排不同定理：' + calendar.join('、') + '。避开这些定理及其别名：' + history.titles.join('、'),
    (value) => checkPlan(value, calendar, history), '排期')
  for (const slot of plan.days) {
    const day = await prepareDay(slot, dir, history, ask)
    history.titles.push(day.theorem.title)
    history.quotes.push(day.parole.text)
  }
  console.log(readBatch(dir).length + ' 天通过检查。' + dir)
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
