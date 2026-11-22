import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { lectureFormat, lectureRequest } from '../../worker/src/lecturePrompt.js'
import { dayMs } from '../../worker/src/lectureStore.js'
import { modelFile, saveNew } from '../batch/files.mjs'
import { checkArticle, readBatch, readJson, readSeeds } from './files.mjs'
import { checkPlan, planPrompt, planSchema, schedule } from './plan.mjs'

const usage = `node scripts/lecture-batch/run.mjs --start YYYY-MM-DD [选项]
  --days N          天数，默认 30
  --concurrency N   同时处理的篇数，默认 4
  --model NAME      Codex 模型，默认 gpt-6.2-astra
  --out DIR         输出目录，默认 .cache/lecture-batch-<起始日期>
  --previous DIR    上一批稿件的目录，用于避开近期题材
  --dry-run         仅打印排期，不调用模型
  --help            显示用法`

const reviewSchema = readJson(new URL('review/schema.json', import.meta.url))
const reviewText = readFileSync(new URL('review/prompt.md', import.meta.url), 'utf8')
const applyText = readFileSync(new URL('review/apply.md', import.meta.url), 'utf8')
const applySchema = {
  type: 'object', additionalProperties: false, required: ['article', 'changes'],
  properties: { article: lectureFormat.schema, changes: { type: 'array', items: { type: 'string' } } },
}

function positive(value, name) {
  const n = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < 1) throw new Error(`${name}须为正整数。`)
  return n
}

function checkReview(report, date) {
  if (!Array.isArray(report?.findings)) throw new Error('审稿结果缺少 findings。')
  const { required, properties } = reviewSchema.properties.findings.items
  for (const item of report.findings) {
    if (item?.date !== date || !properties.kind.enum.includes(item.kind) ||
        !required.every((name) => typeof item[name] === 'string' && item[name].trim())) {
      throw new Error(`${date} 的审稿意见缺少内容，或日期、类别有误。`)
    }
  }
}

async function prepareDay(slot, plan, titles, dir, model) {
  const name = `${slot.date}.json`
  const final = join(dir, 'days', name)
  const check = (article) => checkArticle(article, slot)
  if (existsSync(final)) {
    check(readJson(final))
    return
  }

  const request = lectureRequest(slot.date, model, titles)
  const others = plan.days.filter((day) => day.date !== slot.date).map((day) => day.theme)
  const prompt = `${request.instructions}\n${request.input}\n本篇题材：${slot.theme}\n出题重心：${slot.angle}
本批其他日期的题材：${others.join('；')}`
  const draft = await modelFile(join(dir, 'drafts', name), model, lectureFormat.schema, prompt, check, `${slot.date} 写稿`)
  const review = await modelFile(join(dir, 'review', name), model, reviewSchema,
    `${reviewText}\n原稿：\n${JSON.stringify(draft)}`, (report) => checkReview(report, slot.date), `${slot.date} 审稿`)

  let article = draft
  if (review.findings.length) {
    const revision = await modelFile(join(dir, 'review', `${slot.date}-edits.json`), model, applySchema,
      `${applyText}\n原稿：\n${JSON.stringify(draft)}\n审稿意见：\n${JSON.stringify(review.findings)}`, (result) => {
        check(result?.article)
        if (!Array.isArray(result.changes) || result.changes.length !== review.findings.length ||
            !result.changes.every((s) => typeof s === 'string' && s.trim())) {
          throw new Error('每条审稿意见都须有一条处理说明。')
        }
      }, `${slot.date} 改稿`)
    article = revision.article
  }
  check(saveNew(final, article))
}

async function main() {
  const { values } = parseArgs({ options: {
    start: { type: 'string' }, days: { type: 'string', default: '30' },
    concurrency: { type: 'string', default: '4' }, model: { type: 'string', default: 'gpt-6.2-astra' },
    out: { type: 'string' }, previous: { type: 'string' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
  } })
  if (values.help) return console.log(usage)
  const slots = schedule(values.start, positive(values.days, '天数'))
  const concurrency = positive(values.concurrency, '并发数')
  const model = values.model.trim()
  if (!model) throw new Error('模型名不能为空。')
  const dir = values.out ? resolve(values.out) : fileURLToPath(new URL(`../../.cache/lecture-batch-${values.start}`, import.meta.url))
  console.log(`${slots[0].date} 至 ${slots.at(-1).date}，${slots.length} 篇，并发 ${concurrency}，模型 ${model}。\n${dir}`)
  if (values['dry-run']) {
    for (const { date, exam, level } of slots) console.log(date, exam, level)
    return
  }

  const history = readSeeds().concat(values.previous ? readBatch(values.previous) : [])
  const from = Date.parse(values.start) - 30 * dayMs
  const titles = history.filter((day) => Date.parse(day.date) >= from && day.date < values.start)
    .map((day) => day.title)
  mkdirSync(dir, { recursive: true })
  const plan = await modelFile(join(dir, 'plan.json'), model, planSchema, planPrompt(slots, titles),
    (value) => checkPlan(value, slots), '排题材')

  const queue = plan.days.values()
  let failed = 0
  async function work() {
    for (const slot of queue) {
      try { await prepareDay(slot, plan, titles, dir, model) }
      catch (error) {
        failed++
        console.error(`${slot.date}：${error.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, slots.length) }, work))
  if (failed) throw new Error(`${failed} 篇未完成。`)
  console.log(`${readBatch(dir).length} 篇通过检查，可核对 days/ 中的定稿。`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
