import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createConnexionTransition } from '../lib/connexionTransition'

export function useConnexionTransition({ paroleRef, loginRef, userId, initialOpen = false }) {
  const [phase, setPhase] = useState(initialOpen ? 'open' : 'closed')
  const transitionRef = useRef(null)
  useLayoutEffect(() => {
    const transition = createConnexionTransition({
      getParole: () => paroleRef.current, getLogin: () => loginRef.current,
      onPhase: setPhase, reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    transitionRef.current = transition
    if (initialOpen) transition.setOpen(true, true)
    return () => { transition.dispose(); transitionRef.current = null }
  }, [paroleRef, loginRef, initialOpen])
  useEffect(() => { transitionRef.current?.settle() }, [userId])
  useEffect(() => {
    if (!userId || phase !== 'open') return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      transitionRef.current?.setOpen(false, true)
      return
    }
    const timer = window.setTimeout(() => transitionRef.current?.setOpen(false), 500)
    return () => window.clearTimeout(timer)
  }, [userId, phase])
  const splitParole = useCallback((open) => transitionRef.current?.setOpen(open), [])
  return { connexionOpen: phase !== 'closed', splitParole }
}
