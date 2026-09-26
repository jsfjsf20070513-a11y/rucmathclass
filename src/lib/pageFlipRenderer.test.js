import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPageFlipRenderer } from './pageFlipRenderer'

const clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id),
  requestAnimationFrame: (fn) => setTimeout(fn, 16), cancelAnimationFrame: (id) => clearTimeout(id),
}
const element = () => {
  const items = [{ style: {} }]
  return { style: {}, items, querySelectorAll: () => items }
}
describe('page stack animation', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  function setup() {
    const pages = [element(), element()], renderer = createPageFlipRenderer({ clock, reducedMotion: () => false })
    const apply = (cur, extra = {}) => renderer.apply({ pages, cur, sides: ['none', 'right'], durationMs: 900, enabled: true, instant: false, ...extra })
    apply(0, { instant: true })
    return { pages, renderer, apply }
  }
  it('keeps the pending entrance when data or interaction lock updates on the same page', () => {
    const h = setup()
    h.apply(1)
    h.apply(1, { enabled: false })
    vi.advanceTimersByTime(16)
    expect(h.pages[1].items[0].style.animation).toContain('magFadeIn')
    expect(h.pages[1].inert).toBe(true)
    h.apply(1)
    expect(h.pages[1].inert).toBe(false)
  })
  it('rapid reversal cannot let old frames or hide timers affect the new current page', () => {
    const h = setup()
    h.apply(1)
    h.apply(0)
    vi.runAllTimers()
    expect(h.pages[0].style.visibility).toBe('visible')
    expect(h.pages[1].style.visibility).toBe('hidden')
    expect(h.pages[1].items[0].style.animation).toBe('none')
    expect(h.pages[1].inert).toBe(true)
  })
  it('replacing a page at the same index restores its content and disposes remaining work', () => {
    const h = setup()
    h.apply(1)
    h.pages[1] = element()
    h.apply(1, { instant: true })
    expect(h.pages[1].items[0].style.opacity).toBe('1')
    h.renderer.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})
