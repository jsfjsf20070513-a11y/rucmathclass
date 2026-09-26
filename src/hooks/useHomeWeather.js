import { useEffect, useState } from 'react'
import { cacheWeather, fetchWeather, readCachedWeather } from '../lib/homeWeather'

const browserStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
}

export function useHomeWeather() {
  const [weather, setWeather] = useState(() => readCachedWeather(browserStorage))
  useEffect(() => {
    if (weather) return undefined
    const controller = new AbortController()
    fetchWeather({ signal: controller.signal }).then((fresh) => {
      if (controller.signal.aborted) return
      cacheWeather(browserStorage, fresh)
      setWeather(fresh)
    }).catch(() => { /* weather must not block the cover */ })
    return () => controller.abort()
  }, [weather])
  return weather
}
