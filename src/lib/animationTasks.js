// Each animation owns its scheduled work. Cancelling also invalidates callbacks
// already queued by the browser, so they cannot revive an old DOM transition.
export function createAnimationTasks(clock = window) {
  const timers = new Set(), frames = new Set()
  let generation = 0
  return {
    timeout(callback, delay) {
      const run = generation
      const id = clock.setTimeout(() => {
        timers.delete(id)
        if (run === generation) callback()
      }, delay)
      timers.add(id)
    },
    frame(callback) {
      const run = generation
      const id = clock.requestAnimationFrame((time) => {
        frames.delete(id)
        if (run === generation) callback(time)
      })
      frames.add(id)
    },
    cancel() {
      generation += 1
      timers.forEach((id) => clock.clearTimeout(id))
      frames.forEach((id) => clock.cancelAnimationFrame(id))
      timers.clear()
      frames.clear()
    },
  }
}
