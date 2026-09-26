import { describe, expect, it, vi } from 'vitest'
import { canPrefetch, schedulePagePrefetch } from './pagePrefetch'

describe('speculative page loading', () => {
  it('skips hidden, offline, metered and slow connections', () => {
    expect(canPrefetch()).toBe(true)
    for (const environment of [{ hidden: true }, { onLine: false }, { connection: { saveData: true } }, ...['slow-2g', '2g', '3g'].map((effectiveType) => ({ connection: { effectiveType } }))]) {
      expect(canPrefetch(environment)).toBe(false)
    }
    expect(canPrefetch({ connection: { effectiveType: '4g' } })).toBe(true)
  })
  it('handles failure and schedules the next page separately, without overlapping requests', async () => {
    const queued = [], second = vi.fn(async () => {})
    let rejectFirst
    const first = vi.fn(() => new Promise((_resolve, reject) => { rejectFirst = reject }))
    schedulePagePrefetch({ loaders: [first, second], allowed: () => true, schedule: (fn) => queued.push(fn), cancel: () => {} })
    const work = queued[0]()
    expect(first).toHaveBeenCalledTimes(1)
    expect(queued).toHaveLength(1)
    expect(second).not.toHaveBeenCalled()
    rejectFirst(new Error('temporary network error'))
    await work
    expect(queued).toHaveLength(2)
    await queued[1]()
    expect(second).toHaveBeenCalledTimes(1)
  })
  it('rechecks network conditions at execution, not only at scheduling', async () => {
    const queued = [], load = vi.fn(), allowed = vi.fn(() => true)
    schedulePagePrefetch({ loaders: [load], allowed, schedule: (fn) => queued.push(fn), cancel: () => {} })
    allowed.mockReturnValue(false)
    await queued[0]()
    expect(load).not.toHaveBeenCalled()
  })
  it('unmount prevents later pages even when an in-flight import finishes afterwards', async () => {
    const queued = [], next = vi.fn(), cancel = vi.fn()
    let finish
    const stop = schedulePagePrefetch({
      loaders: [() => new Promise((resolve) => { finish = resolve }), next], allowed: () => true,
      schedule: (fn) => queued.push(fn), cancel,
    })
    const work = queued[0]()
    stop()
    finish()
    await work
    expect(queued).toHaveLength(1)
    expect(next).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledWith(1)
  })
})
