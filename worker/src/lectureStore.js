// day 键的 metadata 就是档案索引项，正文和索引随同一次 KV put 发布。
export const firstLectureDate = '2026-11-18'
export const dayMs = 86_400_000
export const beijingDate = (time) => new Date(time + 8 * 3_600_000).toISOString().slice(0, 10)
export const lectureSummary = ({ date, level, title }) => ({ date, level, title })

export function isLectureDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const ms = Date.parse(value)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
}

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
