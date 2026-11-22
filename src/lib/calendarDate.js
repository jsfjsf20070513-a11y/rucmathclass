export const dayMs = 86_400_000
export const beijingDate = (time = Date.now()) => new Date(time + 8 * 3_600_000).toISOString().slice(0, 10)

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const ms = Date.parse(value)
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value
}
