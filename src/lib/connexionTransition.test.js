import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnexionTransition } from './connexionTransition'
import { createAnimationTasks } from './animationTasks'

const clock = {
  setTimeout: (callback, delay) => setTimeout(callback, delay), clearTimeout: (id) => clearTimeout(id),
  requestAnimationFrame: (callback) => setTimeout(callback, 16), cancelAnimationFrame: (id) => clearTimeout(id),
}
function setup(reduced = false) {
  const clones = [], login = { style: { visibility: 'hidden' } }, onPhase = vi.fn()
  const parole = {
    parentElement: { appendChild: (clone) => clones.push(clone) },
    cloneNode: () => ({
      style: {}, setAttribute: vi.fn(), getBoundingClientRect: vi.fn(),
      remove() { const index = clones.indexOf(this); if (index >= 0) clones.splice(index, 1) },
    }),
  }
  const transition = createConnexionTransition({ getParole: () => parole, getLogin: () => login, onPhase, reducedMotion: () => reduced, clock })
  return { transition, clones, login, onPhase }
}

describe('home animation lifetime', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('locks at opening, deduplicates opening, and removes inaccessible copies after completion', () => {
    const h = setup()
    h.transition.setOpen(true)
    h.transition.setOpen(true)
    expect(h.onPhase).toHaveBeenLastCalledWith('opening')
    expect(h.clones).toHaveLength(2)
    expect(h.clones.every((clone) => clone.inert)).toBe(true)
    vi.advanceTimersByTime(650)
    expect(h.clones).toHaveLength(0)
    expect(h.onPhase).toHaveBeenLastCalledWith('open')
    expect(h.login.style.visibility).toBe('visible')
  })

  it('cannot reopen or leave clones behind after closing an unfinished opening', () => {
    const h = setup()
    h.transition.setOpen(true)
    vi.advanceTimersByTime(100)
    h.transition.setOpen(false)
    expect(h.clones).toHaveLength(2)
    vi.runAllTimers()
    expect(h.onPhase.mock.calls.map(([phase]) => phase)).toEqual(['opening', 'closing', 'closed'])
    expect(h.clones).toHaveLength(0)
    expect(h.login.style.visibility).toBe('hidden')
  })

  it('settles account changes immediately and discards the old account visual copies', () => {
    const h = setup()
    h.transition.setOpen(true)
    h.transition.settle()
    expect(h.clones).toHaveLength(0)
    expect(h.onPhase).toHaveBeenLastCalledWith('open')
    vi.runAllTimers()
    expect(h.onPhase).toHaveBeenCalledTimes(2)
    h.transition.setOpen(false)
    h.transition.settle()
    expect(h.login.style.visibility).toBe('hidden')
    expect(h.clones).toHaveLength(0)
  })

  it('unmount cancels every frame and timeout, and ignores later requests', () => {
    const h = setup()
    h.transition.setOpen(true)
    h.transition.dispose()
    h.transition.setOpen(true)
    vi.runAllTimers()
    expect(h.onPhase).toHaveBeenCalledTimes(1)
    expect(h.login.style.visibility).toBe('hidden')
    expect(h.clones).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reduced motion opens and closes directly without visual copies or timers', () => {
    const h = setup(true)
    h.transition.setOpen(true)
    expect(h.onPhase).toHaveBeenLastCalledWith('open')
    h.transition.setOpen(false)
    expect(h.onPhase).toHaveBeenLastCalledWith('closed')
    expect(h.clones).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('invalidates callbacks even if the browser had already queued them', () => {
    const queued = [], callback = vi.fn()
    const tasks = createAnimationTasks({
      setTimeout: (fn) => queued.push(fn), clearTimeout: () => {},
      requestAnimationFrame: (fn) => queued.push(fn), cancelAnimationFrame: () => {},
    })
    tasks.timeout(callback, 10)
    tasks.frame(callback)
    tasks.cancel()
    queued.forEach((fn) => fn())
    expect(callback).not.toHaveBeenCalled()
    tasks.frame(callback)
    queued.at(-1)()
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
