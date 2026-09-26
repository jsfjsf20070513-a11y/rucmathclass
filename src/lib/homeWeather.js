import { withRequestDeadline } from './requestDeadline'

const CACHE_KEY = 'mcw_weather_cache'
const CACHE_MS = 3 * 3600 * 1000
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast?latitude=31.30&longitude=120.62&current=temperature_2m,weather_code,is_day&timezone=Asia/Shanghai'

function validWeather(weather) {
  return weather && Number.isFinite(weather.temp) && Number.isInteger(weather.code)
    && weather.code >= 0 && weather.code <= 99 && [0, 1].includes(weather.isDay)
}

export function readCachedWeather(storage, now = Date.now()) {
  try {
    const cached = JSON.parse(storage.getItem(CACHE_KEY))
    const age = now - cached?.at
    if (Number.isFinite(age) && age >= 0 && age < CACHE_MS && validWeather(cached.w)) return cached.w
  } catch { /* optional cache */ }
  return null
}

export function cacheWeather(storage, weather, now = Date.now()) {
  try { storage.setItem(CACHE_KEY, JSON.stringify({ at: now, w: weather })) } catch { /* optional cache */ }
}

export function fetchWeather({ signal, fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  return withRequestDeadline(async (requestSignal) => {
    const response = await fetchImpl(ENDPOINT, { signal: requestSignal })
    if (!response.ok) throw new Error('天气暂不可用')
    const { current } = await response.json()
    const weather = { temp: current?.temperature_2m, code: current?.weather_code, isDay: current?.is_day }
    if (!validWeather(weather)) throw new Error('天气数据无效')
    return { ...weather, temp: Math.round(weather.temp) }
  }, { signal, timeoutMs })
}
