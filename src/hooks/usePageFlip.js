import { useCallback, useEffect, useRef, useState } from 'react'
import { createPageFlipRenderer } from '../lib/pageFlipRenderer'

// 首页与内页共用翻页参数。
// 页面栈:绝对定位互叠,zIndex = 10 + i;已到页 translate(0),未到页停在各自入场侧。
// 交互:← → 键、滚轮(|deltaY|>24 防抖 950ms)、触摸横滑 >56px。
// 页内滚动优先:当前页内 [data-flip-scroll] 未滚到边缘时,滚轮不翻页。
// prefers-reduced-motion:翻页降级为淡入淡出(transform 直落,过渡只走 opacity)。

export function usePageFlip({ count, sides = [], durationMs = 900, enabled = true, initialPage = 0 }) {
  const [page, setPage] = useState(initialPage)
  const pagesRef = useRef([])
  const pageStateRef = useRef(initialPage)
  const instantRef = useRef(true)
  const wheelLockRef = useRef(0)
  const wheelAccRef = useRef(0)
  const wheelAtRef = useRef(0)
  const rendererRef = useRef(null)
  if (!rendererRef.current) rendererRef.current = createPageFlipRenderer()
  const touchRef = useRef(null)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const setPageEl = useCallback((index) => (el) => {
    pagesRef.current[index] = el
  }, [])

  const goTo = useCallback((idx) => {
    if (!enabledRef.current) return
    const max = count - 1
    const next = Math.max(0, Math.min(max, idx))
    if (next === pageStateRef.current) return
    pageStateRef.current = next
    setPage(next)
  }, [count])

  useEffect(() => {
    rendererRef.current.apply({ pages: pagesRef.current, cur: page, sides, durationMs, instant: instantRef.current, enabled })
    instantRef.current = false
  }, [page, sides, durationMs, enabled])

  useEffect(() => {
    const inField = (target) => {
      const tag = target?.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable
    }
    const onKey = (e) => {
      if (!enabledRef.current || inField(e.target)) return
      if (e.key === 'ArrowRight') goTo(pageStateRef.current + 1)
      else if (e.key === 'ArrowLeft') goTo(pageStateRef.current - 1)
    }
    const onWheel = (e) => {
      if (!enabledRef.current) return
      const now = Date.now()
      // 翻页在飞:静默吞掉触控板惯性尾,不累积(否则松手后连翻)。
      if (now < wheelLockRef.current) { wheelAccRef.current = 0; return }
      // 触控板横扫是翻页的自然手势:取主导轴(|dX| vs |dY|)。
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      const raw = horizontal ? e.deltaX : e.deltaY
      // 纵向滚动仍尊重页内滚动优先:滚到边缘才参与翻页。
      if (!horizontal) {
        const el = pagesRef.current[pageStateRef.current]
        const scroller = el?.querySelector('[data-flip-scroll]')
        if (scroller && scroller.scrollHeight > scroller.clientHeight + 1) {
          const atTop = scroller.scrollTop <= 0
          const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
          if ((raw > 0 && !atBottom) || (raw < 0 && !atTop)) return
        }
      }
      // 200ms 窗口内累积微小 delta:轻扫灵敏,漂移不误触。
      if (now - wheelAtRef.current > 200) wheelAccRef.current = 0
      wheelAtRef.current = now
      wheelAccRef.current += raw
      if (Math.abs(wheelAccRef.current) < 50) return
      const dir = wheelAccRef.current > 0 ? 1 : -1
      wheelAccRef.current = 0
      wheelLockRef.current = now + 900
      goTo(pageStateRef.current + dir)
    }
    const onTouchStart = (e) => {
      touchRef.current = enabledRef.current && e.touches.length === 1
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
    }
    const onTouchEnd = (e) => {
      const start = touchRef.current
      touchRef.current = null
      if (!enabledRef.current || !start || !e.changedTouches.length) return
      const dx = e.changedTouches[0].clientX - start.x
      const dy = e.changedTouches[0].clientY - start.y
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy)) {
        goTo(pageStateRef.current + (dx < 0 ? 1 : -1))
      }
    }
    const onTouchCancel = () => { touchRef.current = null }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [goTo])

  useEffect(() => {
    const renderer = rendererRef.current
    return renderer.dispose
  }, [])

  const next = useCallback(() => goTo(pageStateRef.current + 1), [goTo])
  const prev = useCallback(() => goTo(pageStateRef.current - 1), [goTo])

  // 无动画直跳:页面栈成员数变化(如登录后插入一页)时校正当前页,不演翻页。
  const jumpTo = useCallback((idx) => {
    const max = count - 1
    const target = Math.max(0, Math.min(max, idx))
    if (target === pageStateRef.current) return
    instantRef.current = true
    pageStateRef.current = target
    setPage(target)
  }, [count])

  return { page, goTo, next, prev, jumpTo, setPageEl }
}
