export { beijingDate, dayMs, isCalendarDate as isLectureDate } from '../../src/lib/calendarDate.js'

// day 键的 metadata 就是档案索引项，正文和索引随同一次 KV put 发布。
export const firstLectureDate = '2026-11-18'
export const lectureSummary = ({ date, level, title }) => ({ date, level, title })

export async function listLectureKeys(kv, prefix) {
  const keys = []
  let cursor
  do {
    const page = await kv.list({ prefix, cursor })
    keys.push(...page.keys)
    if (page.list_complete) break
    cursor = page.cursor
  } while (cursor)
  return keys
}

export async function lectureIndex(kv, through, from = firstLectureDate) {
  const keys = await listLectureKeys(kv, 'day:')
  return keys.filter(({ name, metadata }) =>
    metadata && name === `day:${metadata.date}` && metadata.date >= from && metadata.date <= through)
    .map(({ metadata }) => lectureSummary(metadata))
}
