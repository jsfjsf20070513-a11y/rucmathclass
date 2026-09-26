import { useEffect, useRef, useState } from 'react'
import { portraits, portraitSrc } from '../data/portraits'

export default function PortraitWall({ active }) {
  const rootRef = useRef(null)
  const [visible, setVisible] = useState(() => new Set())
  useEffect(() => {
    if (!active) return undefined
    if (!window.IntersectionObserver) {
      setVisible(new Set(portraits.map((portrait) => portrait.slug)))
      return undefined
    }
    let alive = true
    const observer = new IntersectionObserver((entries) => {
      if (!alive) return
      const entering = entries.filter((entry) => entry.isIntersecting)
      if (!entering.length) return
      setVisible((current) => new Set([...current, ...entering.map((entry) => entry.target.dataset.portrait)]))
      entering.forEach((entry) => observer.unobserve(entry.target))
    }, { rootMargin: '160px' })
    rootRef.current.querySelectorAll('[data-portrait]').forEach((element) => observer.observe(element))
    return () => { alive = false; observer.disconnect() }
  }, [active])
  return (
    <div ref={rootRef} className="mag-wall" aria-hidden="true">
      {portraits.map((portrait) => (
        <div key={portrait.slug} className="mag-wall-cell" data-portrait={portrait.slug}>
          <img src={visible.has(portrait.slug) ? portraitSrc(portrait.slug) : undefined} alt="" decoding="async" draggable={false}
            onError={(event) => { event.currentTarget.style.visibility = 'hidden' }} />
        </div>
      ))}
    </div>
  )
}
