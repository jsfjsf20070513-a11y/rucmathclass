import { mergePicks } from './lectureAnswerStorage'

export function createLectureAnswers({ userId, local, sync, now = Date.now }) {
  const owner = userId || 'guest'
  const listeners = new Set()
  const queues = new Map()
  let state = {}, scope, ready, visible, lastPick = 0

  function publish(next) {
    state = next
    listeners.forEach((fn) => fn())
  }
  function read() {
    try { return local.read(owner) } catch { return {} }
  }
  function refresh() {
    if (!scope || userId === undefined) return
    const rows = read()
    publish(Object.fromEntries(Object.entries(rows).map(([date, row]) => [date, mergePicks(row?.answers)])))
  }

  function save(day, pick) {
    const run = scope
    if (!run || userId === undefined) return
    if (!pick && queues.has(day)) return queues.get(day)
    const work = (queues.get(day) || ready).then(async () => {
      if (run.signal.aborted) return
      const choices = mergePicks(state[day], read()[day]?.answers, pick)
      let confirmed, online = false
      if (userId) {
        try {
          confirmed = await sync(userId, day, choices, run.signal)
          online = true
        } catch { /* 表缺失和网络失败都走本机保存。 */ }
      }
      if (run.signal.aborted) return
      if (!online && !pick) return
      try {
        const rows = await local.save(owner, day, confirmed || choices, online, () => !run.signal.aborted)
        confirmed = rows[day]?.answers || confirmed
      } catch { /* 只有云端已确认时，仍可显示所选答案。 */ }
      if (confirmed && !run.signal.aborted) publish({ ...state, [day]: mergePicks(state[day], confirmed) })
    }).finally(() => { if (queues.get(day) === work) queues.delete(day) })
    queues.set(day, work)
    return work
  }

  async function retryPending() {
    const run = scope
    if (!run || !userId) return
    await ready
    if (run.signal.aborted) return
    const readRows = read()
    const dates = new Set([visible, ...Object.keys(readRows).filter((day) => readRows[day]?.pending)])
    for (const day of dates) {
      if (run.signal.aborted) return
      if (day) await save(day)
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    refresh, retryPending,
    start() {
      scope = new AbortController()
      const run = scope
      ready = (async () => {
        if (userId) {
          try { await local.claim(owner, () => !run.signal.aborted) } catch { /* 可继续读取云端。 */ }
        }
        if (!run.signal.aborted) refresh()
      })()
      return retryPending()
    },
    stop() {
      scope?.abort()
      scope = null
      queues.clear()
    },
    view(day) {
      visible = day
      if (day && userId) return save(day)
    },
    choose(day, index, key) {
      lastPick = Math.max(now(), lastPick + 1, (state[day]?.[index]?.at || 0) + 1)
      return save(day, { [index]: { key, at: lastPick } })
    },
  }
}
