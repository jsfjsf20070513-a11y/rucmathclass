import { useCallback, useRef } from 'react'

// 列表和详情共用的页面持有这两个 ref。重新挂上列表时，露出先前看到的那一行。
export function useArchiveScroll() {
  const scroller = useRef(null)
  const top = useRef(0)
  return useCallback((element) => {
    if (element) element.scrollTop = top.current
    else if (scroller.current) top.current = scroller.current.scrollTop
    scroller.current = element
  }, [])
}
