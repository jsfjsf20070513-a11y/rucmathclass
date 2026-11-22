import { useEffect } from 'react'
import { createAnimationTasks } from '../lib/animationTasks'
import { startWeatherCanvas } from '../lib/weatherCanvas'

export function useCoverAtmosphere({ weather, page, canvasRef, contentRef }) {
  useEffect(() => {
    const element = contentRef.current
    if (!element || element.style.opacity === '1') return undefined
    const tasks = createAnimationTasks()
    const show = () => {
      element.style.transition = 'opacity 1.1s ease'
      tasks.frame(() => tasks.frame(() => { element.style.opacity = '1' }))
      tasks.timeout(() => { element.style.transition = 'none' }, 1300)
    }
    if (weather) show()
    else tasks.timeout(show, 1200)
    return tasks.cancel
  }, [weather, contentRef])

  useEffect(() => {
    if (!weather || !canvasRef.current || page !== 0) return undefined
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mobile = window.matchMedia('(max-width: 719px)')
    let stop = () => {}
    const refresh = () => {
      stop()
      stop = () => {}
      canvasRef.current.style.opacity = '0'
      if (!document.hidden && !motion.matches) {
        stop = startWeatherCanvas(canvasRef.current, weather, { particleScale: mobile.matches ? 0.5 : 1 })
      }
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    motion.addEventListener('change', refresh)
    mobile.addEventListener('change', refresh)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', refresh)
      motion.removeEventListener('change', refresh)
      mobile.removeEventListener('change', refresh)
    }
  }, [weather, page, canvasRef])
}
