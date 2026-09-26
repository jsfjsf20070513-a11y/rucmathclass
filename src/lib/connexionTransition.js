import { createAnimationTasks } from './animationTasks'

// Own only the temporary split-page visuals. The form and account remain React's.
export function createConnexionTransition({ getParole, getLogin, onPhase, reducedMotion, clock }) {
  const tasks = createAnimationTasks(clock)
  let clones = [], phase = 'closed', active = true
  const clean = () => {
    tasks.cancel()
    clones.forEach((element) => element.remove())
    clones = []
  }
  const publish = (next) => { phase = next; onPhase(next) }
  const setOpen = (open, instant = false) => {
    if (!active) return
    const parole = getParole(), login = getLogin()
    if (!parole || !login) return
    if (!instant && (phase === (open ? 'open' : 'closed') || phase === (open ? 'opening' : 'closing'))) return
    clean()
    if (instant || reducedMotion()) {
      login.style.visibility = open ? 'visible' : 'hidden'
      publish(open ? 'open' : 'closed')
      return
    }
    publish(open ? 'opening' : 'closing')
    login.style.visibility = 'visible'
    const out = ['translateX(-58%) rotate(-1.6deg)', 'translateX(58%) rotate(1.6deg)']
    clones = out.map((transform, index) => {
      const clone = parole.cloneNode(true)
      clone.setAttribute('aria-hidden', 'true')
      clone.inert = true
      Object.assign(clone.style, {
        zIndex: '60', transition: 'none', transform: open ? 'none' : transform,
        clipPath: index ? 'inset(0 0 0 50%)' : 'inset(0 50% 0 0)',
        pointerEvents: 'none', willChange: 'transform', opacity: '1', visibility: 'visible',
      })
      parole.parentElement.appendChild(clone)
      return clone
    })
    tasks.frame(() => {
      clones[0].getBoundingClientRect()
      clones.forEach((clone, index) => {
        clone.style.transition = 'transform 0.62s cubic-bezier(0.45, 0, 0.12, 1)'
        clone.style.transform = open ? out[index] : 'translateX(0) rotate(0deg)'
      })
    })
    tasks.timeout(() => {
      clean()
      if (!open) login.style.visibility = 'hidden'
      publish(open ? 'open' : 'closed')
    }, 650)
  }
  return {
    setOpen,
    // A changed account invalidates the old visual snapshot immediately.
    settle() { setOpen(phase === 'open' || phase === 'opening', true) },
    dispose() { active = false; clean(); const login = getLogin(); if (login) login.style.visibility = 'hidden' },
  }
}
