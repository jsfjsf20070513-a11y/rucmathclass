import { beijingDate, isCalendarDate } from '../../src/lib/calendarDate.js'
import { hasDailyContent, staticDaily } from '../../src/lib/dailyContent.js'

export async function getDailyContent(env, date, now = Date.now()) {
  const today = beijingDate(now)
  if (date === undefined) date = today
  if (!isCalendarDate(date) || date > today) return null
  try {
    const day = await env.LECTURE.get('daily:' + date, 'json')
    if (hasDailyContent(day, date)) return day
  } catch {
    // KV 暂时不可读时，网站与答疑仍取同一天的静态稿。
  }
  return staticDaily(date)
}
