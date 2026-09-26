import { useCallback, useEffect, useRef, useState } from 'react'

// 共用翻页物理(宪法 §4)——Home 与内页同一套参数,不许各页自造。
// 页面栈:绝对定位互叠,zIndex = 10 + i;已到页 translate(0),未到页停在各自入场侧。
// 交互:← → 键、滚轮(|deltaY|>24 防抖 950ms)、触摸横滑 >56px。
// 页内滚动优先:当前页内 [data-flip-scroll] 未滚到边缘时,滚轮不翻页。
// prefers-reduced-motion:翻页降级为淡入淡出(transform 直落,过渡只走 opacity)。

const PARKED = {
  right: 'translateX(105%) rotate(2.2deg)',
  left: 'translateX(-105%) rotate(-2.2deg)',
  top: 'translateY(-105%) rotate(1.2deg)',
  bottom: 'translateY(105%) rotate(-1.2deg)',
}
const SHADOW = {
  right: '-40px 0 80px rgba(23,16,12,0.10)',
  left: '40px 0 80px rgba(23,16,12,0.10)',
  top: '0 40px 80px rgba(23,16,12,0.10)',
  bottom: '0 -40px 80px rgba(23,16,12,0.10)',
  none: '-40px 0 80px rgba(23,16,12,0.10)',
}

export const FLIP_EASE = 'cubic-bezier(0.72, 0, 0.22, 1)'

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function usePageFlip({ count, sides = [], durationMs = 900, enabled = true, initialPage = 0 }) {
  const [page, setPage] = useState(initialPage)
  const pagesRef = useRef([])
  const pageStateRef = useRef(initialPage)
  const appliedPageRef = useRef(-1)
  const appliedElementRef = useRef(null)
  const instantRef = useRef(true)
  const wheelLockRef = useRef(0)
  const wheelAccRef = useRef(0)
  const wheelAtRef = useRef(0)
  const hideTimersRef = useRef(new Map())
  const touchRef = useRef(null)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const setPageEl = useCallback((index) => (el) => {
    pagesRef.current[index] = el
  }, [])

  const apply = useCallback((cur, instant) => {
    const reduced = prefersReducedMotion()
    // A removed shelf may move another DOM page into the same index. Its
    // previously hidden contents still need an entrance even without a new index.
    const changed = appliedPageRef.current !== cur || appliedElementRef.current !== pagesRef.current[cur]
    appliedPageRef.current = cur
    appliedElementRef.current = pagesRef.current[cur]
    pagesRef.current.forEach((el, i) => {
      if (!el) return
      const side = sides[i] || 'right'
      el.style.zIndex = String(10 + i)
      el.style.pointerEvents = i === cur ? 'auto' : 'none'
      el.style.transformOrigin = '50% 100%'
      // 性能:非当前页在翻页完成后移出合成器(visibility:hidden)——
      // 封面 60 张 multiply 图层与各停靠页不再常驻参与合成;
      // 翻页进行中所有页保持可见(入场页要看得到,回翻要露出底页)。
      const timers = hideTimersRef.current
      if (timers.has(i)) { window.clearTimeout(timers.get(i)); timers.delete(i) }
      if (i === cur) {
        el.style.visibility = 'visible'
      } else if (instant || !changed) {
        el.style.visibility = 'hidden'
      } else {
        el.style.visibility = 'visible'
        timers.set(i, window.setTimeout(() => {
          el.style.visibility = 'hidden'
          timers.delete(i)
        }, durationMs + 60))
      }
      // 停靠在场外的页不带投影——多页叠停时投影会在页缘穿帮。
      el.style.boxShadow = i <= cur ? (SHADOW[side] || SHADOW.none) : 'none'
      if (reduced) {
        el.style.transition = instant ? 'none' : 'opacity 0.3s ease'
        el.style.transform = 'none'
        el.style.opacity = i === cur ? '1' : i < cur ? '1' : '0'
      } else {
        el.style.transition = instant ? 'none' : `transform ${durationMs}ms ${FLIP_EASE}`
        el.style.opacity = ''
        el.style.transform = i <= cur || side === 'none'
          ? 'translate(0, 0) rotate(0deg)'
          : PARKED[side] || PARKED.right
      }
      // 进场编排:刚成为当前页的内容逐件错开淡入(0.7s,起点 0.35s,步进 0.12s)。
      const items = el.querySelectorAll('[data-animate]')
      if (i === cur) {
        if (!changed) return // 页码没变的重跑:别打断正在播/已播完的进场
        if (instant || reduced) {
          items.forEach((it) => {
            it.style.animation = 'none'
            it.style.opacity = '1'
          })
        } else {
          items.forEach((it, k) => {
            it.style.animation = 'none'
            it.style.opacity = '0'
            requestAnimationFrame(() => {
              it.style.animation = `magFadeIn 0.7s ${0.35 + k * 0.12}s cubic-bezier(0.22, 1, 0.36, 1) both`
            })
          })
        }
      } else {
        items.forEach((it) => {
          it.style.animation = 'none'
          it.style.opacity = i < cur ? '1' : '0'
        })
      }
    })
  }, [sides, durationMs])

  const goTo = useCallback((idx) => {
    const max = count - 1
    const next = Math.max(0, Math.min(max, idx))
    if (next === pageStateRef.current) return
    pageStateRef.current = next
    setPage(next)
  }, [count])

  useEffect(() => {
    apply(page, instantRef.current)
    instantRef.current = false
  }, [page, apply])

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
      touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    const onTouchEnd = (e) => {
      if (!enabledRef.current || !touchRef.current) return
      const dx = e.changedTouches[0].clientX - touchRef.current.x
      const dy = e.changedTouches[0].clientY - touchRef.current.y
      touchRef.current = null
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy)) {
        goTo(pageStateRef.current + (dx < 0 ? 1 : -1))
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    const timers = hideTimersRef.current
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      timers.forEach((t) => window.clearTimeout(t))
      timers.clear()
    }
  }, [goTo])

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

  // 出场翻页(跨路由衔接的前半个动作):当前页向 exit 侧翻出,~0.45s 后回调。
  const flipOut = useCallback((onDone, exitSide = 'left') => {
    const el = pagesRef.current[pageStateRef.current]
    if (!el || prefersReducedMotion()) {
      onDone()
      return
    }
    el.style.transition = `transform 450ms ${FLIP_EASE}, opacity 450ms ease`
    el.style.transform = PARKED[exitSide] || PARKED.left
    window.setTimeout(onDone, 430)
  }, [])

  return { page, goTo, next, prev, jumpTo, setPageEl, flipOut }
}
