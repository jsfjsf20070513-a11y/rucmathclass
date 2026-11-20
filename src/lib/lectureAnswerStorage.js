const legacyKey = 'mcw_lecture_answers_v1'
export const lectureAnswersKey = 'mcw_lecture_answers_v2'
const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v)

// 旧版只有选项。迁移时它只补空缺，不覆盖有作答时间的记录。
export function mergePicks(...sources) {
  const result = {}
  for (const source of sources) {
    if (!isRecord(source)) continue
    for (const [index, value] of Object.entries(source)) {
      if (!/^\d+$/.test(index)) continue
      const pick = typeof value === 'string' ? { key: value, at: 0 } : value
      if (!pick || typeof pick.key !== 'string' || !pick.key.length || pick.key.length > 8 ||
          !Number.isSafeInteger(pick.at) || pick.at < 0) continue
      const old = result[index]
      if (!old || pick.at > old.at || (pick.at === old.at && pick.key > old.key)) {
        result[index] = { key: pick.key, at: pick.at }
      }
    }
  }
  return result
}

export const samePicks = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function parseRecord(raw) {
  try {
    const value = JSON.parse(raw)
    if (isRecord(value)) return value
  } catch { /* 忽略损坏的旧记录。 */ }
  return {}
}

function load(storage) {
  const raw = storage.getItem(lectureAnswersKey)
  if (raw !== null) return parseRecord(raw)
  const guest = {}
  for (const [day, picks] of Object.entries(parseRecord(storage.getItem(legacyKey)))) {
    if (isDay(day)) guest[day] = { answers: mergePicks(picks), pending: true }
  }
  return { guest }
}

// 一次 setItem 同时把游客记录归入当前账号并清空游客区。标签页之间只锁本机读写。
export function answerStorage(storage, locks) {
  function change(fn) {
    const run = () => {
      const book = load(storage)
      const result = fn(book)
      if (result.changed) {
        storage.setItem(lectureAnswersKey, JSON.stringify(book))
        try { storage.removeItem(legacyKey) } catch { /* v2 已确认，今后只读 v2。 */ }
      }
      return result.days
    }
    return locks ? locks.request(lectureAnswersKey, run) : Promise.resolve().then(run)
  }
  return {
    read(owner) { return load(storage)[owner] || {} },
    claim(owner, active) {
      return change((book) => {
        const days = book[owner] || {}
        const entries = Object.entries(book.guest || {})
        if (!active() || !entries.length) return { days }
        for (const [day, guest] of entries) {
          days[day] = { answers: mergePicks(days[day]?.answers, guest.answers), pending: true }
        }
        book[owner] = days
        delete book.guest
        return { days, changed: true }
      })
    },
    save(owner, day, picks, confirmedOnline, active) {
      return change((book) => {
        if (!active()) return { days: {} }
        const days = book[owner] ||= {}
        const answers = mergePicks(days[day]?.answers, picks)
        const pending = !confirmedOnline || !samePicks(answers, picks)
        if (!Object.keys(answers).length || (samePicks(answers, days[day]?.answers) && days[day]?.pending === pending)) return { days }
        days[day] = { answers, pending }
        return { days, changed: true }
      })
    },
  }
}
