import { afterEach, expect, it, vi } from 'vitest'
import { startWeatherCanvas } from './weatherCanvas'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each(['rain', 'thunder'])('keeps %s ripple radii valid when the first frame predates initialization', (override) => {
  const frames = new Map()
  let nextId = 0
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    requestAnimationFrame: (callback) => { frames.set(++nextId, callback); return nextId },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: () => ++nextId,
    clearTimeout: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  })
  vi.spyOn(performance, 'now').mockReturnValue(100)
  // One near-ground drop reliably creates a ripple on the first frame.
  vi.spyOn(Math, 'random').mockReturnValue(0.999)
  const ellipse = vi.fn((_x, _y, radiusX, radiusY) => {
    if (radiusX < 0 || radiusY < 0) throw new RangeError('Canvas ellipse radii must be nonnegative')
  })
  const context = {
    setTransform() {}, clearRect() {}, fillRect() {}, beginPath() {},
    moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, ellipse,
    createLinearGradient: () => ({ addColorStop() {} }),
  }
  const canvas = { style: {}, getContext: () => context, parentElement: { getBoundingClientRect: () => ({ width: 390, height: 844 }) } }
  const stop = startWeatherCanvas(canvas, { code: 61, isDay: 1 }, { override, particleScale: 1 / 140 })
  const frame = (time) => {
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((callback) => callback(time))
  }
  try {
    expect(() => frame(98)).not.toThrow()
    expect(ellipse).toHaveBeenCalled()
    expect(() => frame(114)).not.toThrow()
    expect(ellipse.mock.lastCall[2]).toBeGreaterThan(0)
  } finally { stop() }
  expect(frames.size).toBe(0)
})
