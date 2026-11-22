import { hasDailyContent, staticDaily } from './dailyContent.js'
import { withRequestDeadline } from './requestDeadline.js'

let latest, pending

export function currentDaily(date) {
  return latest?.date === date ? latest : staticDaily(date)
}

export function fetchDaily(date) {
  if (pending?.date === date) return pending.work
  const work = withRequestDeadline(async (signal) => {
    const response = await fetch('/api/daily/' + date, { signal })
    if (!response.ok) throw new Error('未取到当天稿件。')
    const day = await response.json()
    if (!hasDailyContent(day, date)) throw new Error('当天稿件不完整。')
    if (pending?.work === work) latest = day
    return day
  }).catch(() => currentDaily(date)).finally(() => {
    if (pending?.work === work) pending = undefined
  })
  pending = { date, work }
  return work
}
