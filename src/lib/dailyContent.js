import { dailyTheoremNotes } from '../data/dailyTheoremNotes.generated.js'
import { paroles } from '../data/siteContent.js'
import { dayMs } from './calendarDate.js'

const rotationStart = Date.parse('2025-09-01')

export function staticDaily(date) {
  const offset = (Date.parse(date) - rotationStart) / dayMs
  const pick = (items) => items[((offset % items.length) + items.length) % items.length]
  return { date, theorem: pick(dailyTheoremNotes), parole: pick(paroles) }
}

export function hasDailyContent(day, date) {
  const hasText = (value) => typeof value === 'string' && value.trim().length > 0
  return day?.date === date &&
    ['title', 'prelude', 'fallback', 'note', 'displayHtml'].every((key) => hasText(day.theorem?.[key])) &&
    ['text', 'note', 'author'].every((key) => hasText(day.parole?.[key])) &&
    (day.parole.src === undefined || typeof day.parole.src === 'string')
}
