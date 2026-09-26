import { createAnimationTasks } from './animationTasks'

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

export function createPageFlipRenderer({ clock, reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches } = {}) {
  const tasks = createAnimationTasks(clock)
  let appliedPage = -1, appliedElement = null
  function apply({ pages, cur, sides, durationMs, instant, enabled }) {
    const reduced = reducedMotion()
    // A removed shelf may move another DOM page into the same index. Its
    // previously hidden contents still need an entrance even without a new index.
    const changed = appliedPage !== cur || appliedElement !== pages[cur]
    if (changed) tasks.cancel()
    appliedPage = cur
    appliedElement = pages[cur]
    pages.forEach((el, i) => {
      if (!el) return
      const side = sides[i] || 'right'
      el.style.zIndex = String(10 + i)
      el.style.pointerEvents = i === cur && enabled ? 'auto' : 'none'
      el.inert = i !== cur || !enabled
      el.style.transformOrigin = '50% 100%'
      // 性能:非当前页在翻页完成后移出合成器(visibility:hidden)——
      // 封面 60 张 multiply 图层与各停靠页不再常驻参与合成;
      // 翻页进行中所有页保持可见(入场页要看得到,回翻要露出底页)。
      if (i === cur) {
        el.style.visibility = 'visible'
      } else if (instant || !changed) {
        el.style.visibility = 'hidden'
      } else {
        el.style.visibility = 'visible'
        tasks.timeout(() => { el.style.visibility = 'hidden' }, durationMs + 60)
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
            tasks.frame(() => {
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
  }
  return { apply, dispose: tasks.cancel }
}
