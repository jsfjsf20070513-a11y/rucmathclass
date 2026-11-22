import { useEffect, useState } from 'react'
import { beijingDate, dayMs } from '../lib/calendarDate'
import { currentDaily, fetchDaily } from '../lib/dailyBackend'

export function useDailyContent() {
  const [date, setDate] = useState(() => beijingDate())
  const [day, setDay] = useState(() => currentDaily(date))
  useEffect(() => {
    let active = true
    fetchDaily(date).then(value => { if (active) setDay(value) })
    const refreshDate = () => setDate(beijingDate())
    const midnight = Date.parse(date + 'T00:00:00+08:00') + dayMs
    const timer = setTimeout(refreshDate, Math.max(0, midnight - Date.now()))
    document.addEventListener('visibilitychange', refreshDate)
    return () => {
      active = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshDate)
    }
  }, [date])
  return day.date === date ? day : currentDaily(date)
}
