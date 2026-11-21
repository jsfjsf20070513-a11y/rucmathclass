import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lectureSamples } from '../../src/data/lectureSamples.js'
import { lectureProblems } from '../../src/lib/lectureContent.js'
import { isLectureDate } from '../../worker/src/lectureStore.js'
import { checkPlan } from './plan.mjs'

export function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')) }
  catch (error) { throw new Error(`${path}：${error.message}`) }
}

export function checkArticle(article, slot) {
  const problems = lectureProblems(article)
  if (!isLectureDate(article?.date)) problems.push('文章日期无效')
  if (slot && (article?.date !== slot.date || article?.exam !== slot.exam || article?.level !== slot.level)) {
    problems.push(`应为 ${slot.date} ${slot.exam} ${slot.level}`)
  }
  if (problems.length) throw new Error(`${article?.date ?? '文章'}：${problems.join('；')}`)
}

export function readSeeds() {
  const dir = fileURLToPath(new URL('../lecture-seed/', import.meta.url))
  const names = readdirSync(dir).filter((name) => name.endsWith('.json')).sort()
  const seeds = [...lectureSamples, ...names.map((name) => readJson(join(dir, name)))]
  for (const article of seeds) checkArticle(article)
  return seeds
}

export function readBatch(dir) {
  const plan = readJson(join(dir, 'plan.json'))
  checkPlan(plan)
  const daysDir = join(dir, 'days')
  const expected = new Set(plan.days.map(({ date }) => `${date}.json`))
  const extra = readdirSync(daysDir).filter((name) => name.endsWith('.json') && !expected.has(name))
  if (extra.length) throw new Error(`days/ 含题材表以外的稿件：${extra.join('、')}`)
  return plan.days.map((slot) => {
    const article = readJson(join(daysDir, `${slot.date}.json`))
    checkArticle(article, slot)
    return article
  })
}
