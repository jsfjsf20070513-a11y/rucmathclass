import { useLayoutEffect, useRef } from 'react'

// 保留点击时各组的实际高度，连续切换时也从眼前的位置接着走。
export function useLoginFieldMotion(mode) {
  const form = useRef(null)
  const before = useRef(null)
  function measure() {
    before.current = [...form.current.querySelectorAll('.login-fields')]
      .map(group => group.getBoundingClientRect().height)
  }

  useLayoutEffect(() => {
    const heights = before.current
    before.current = null
    if (!heights) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (media.matches) return

    const easing = getComputedStyle(form.current).getPropertyValue('--flip-ease').trim()
    const animations = []
    form.current.querySelectorAll('.login-fields').forEach((group, index) => {
      const from = heights[index]
      const to = group.getBoundingClientRect().height
      if (from === to) return
      animations.push(group.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: 300, easing }))
      // 先为新增字段留足位置，再显示完整的一行。邮箱和提交按钮始终随正常文档流移动。
      if (group.firstElementChild) {
        animations.push(group.firstElementChild.animate([
          { visibility: 'hidden', opacity: 0 },
          { visibility: 'hidden', opacity: 0, offset: 0.6 },
          { visibility: 'visible', opacity: 0, offset: 0.6 },
          { visibility: 'visible', opacity: 1 },
        ], { duration: 500 }))
      }
    })
    const stop = () => animations.forEach(animation => animation.cancel())
    media.addEventListener('change', stop)
    return () => {
      stop()
      media.removeEventListener('change', stop)
    }
  }, [mode])
  return { form, measure }
}
