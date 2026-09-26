import { useCallback, useEffect, useRef, useState } from 'react'
import { createConnexionTransition } from '../lib/connexionTransition'

export function useConnexionTransition({ paroleRef, loginRef, userId }) {
  const [phase, setPhase] = useState('closed')
  const transitionRef = useRef(null)
  useEffect(() => {
    const transition = createConnexionTransition({
      getParole: () => paroleRef.current, getLogin: () => loginRef.current,
      onPhase: setPhase, reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    })
    transitionRef.current = transition
    return () => { transition.dispose(); transitionRef.current = null }
  }, [paroleRef, loginRef])
  useEffect(() => { transitionRef.current?.settle() }, [userId])
  useEffect(() => {
    if (!userId || phase !== 'open') return undefined
    const timer = window.setTimeout(() => transitionRef.current?.setOpen(false), 500)
    return () => window.clearTimeout(timer)
  }, [userId, phase])
  const splitParole = useCallback((open) => transitionRef.current?.setOpen(open), [])
  return { connexionOpen: phase !== 'closed', splitParole }
}
