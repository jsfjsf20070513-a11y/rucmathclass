import { describe, expect, it, vi } from 'vitest'
import { readCachedWeather, fetchWeather } from './homeWeather'

const weather = { temp: 23, code: 0, isDay: 1 }
const storage = (value) => ({ getItem: () => JSON.stringify(value) })
describe('optional cover weather', () => {
  it('accepts fresh valid cache only, including on clocks that moved backwards', () => {
    expect(readCachedWeather(storage({ at: 100, w: weather }), 200)).toEqual(weather)
    expect(readCachedWeather(storage({ at: 100, w: weather }), 100 + 3 * 3600 * 1000)).toBeNull()
    expect(readCachedWeather(storage({ at: 300, w: weather }), 200)).toBeNull()
    expect(readCachedWeather(storage({ at: 100, w: { ...weather, temp: null } }), 200)).toBeNull()
    expect(readCachedWeather({ getItem: () => { throw new Error('private mode') } })).toBeNull()
  })
  it('requires a successful response and finite weather fields', async () => {
    await expect(fetchWeather({ fetchImpl: async () => ({ ok: false }) })).rejects.toThrow('天气暂不可用')
    await expect(fetchWeather({ fetchImpl: async () => ({ ok: true, json: async () => ({ current: { temperature_2m: null, weather_code: 0, is_day: 1 } }) }) })).rejects.toThrow('天气数据无效')
    await expect(fetchWeather({ fetchImpl: async () => ({ ok: true, json: async () => ({ current: { temperature_2m: 23.6, weather_code: 0, is_day: 1 } }) }) })).resolves.toEqual({ ...weather, temp: 24 })
  })
  it('keeps the deadline active through a stalled response body', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = async (_url, { signal }) => ({
        ok: true, json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
      })
      const request = fetchWeather({ fetchImpl, timeoutMs: 100 })
      const failed = expect(request).rejects.toThrow('aborted')
      await vi.advanceTimersByTimeAsync(100)
      await failed
      expect(vi.getTimerCount()).toBe(0)
    } finally { vi.useRealTimers() }
  })
  it('propagates unmount cancellation to the active request', async () => {
    const controller = new AbortController()
    const fetchImpl = (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))
    const request = fetchWeather({ fetchImpl, signal: controller.signal })
    controller.abort()
    await expect(request).rejects.toThrow('aborted')
  })
})
