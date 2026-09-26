export function canPrefetch({ hidden = false, onLine = true, connection } = {}) {
  return !hidden && onLine !== false && !connection?.saveData
    && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType)
}

export const canPrefetchInBrowser = () => canPrefetch({
  hidden: document.hidden, onLine: navigator.onLine, connection: navigator.connection,
})

// Sequential work yields between pages and checks the environment again each
// time. Imports already started cannot be cancelled; stop prevents later ones.
export function schedulePagePrefetch({ loaders, allowed, schedule, cancel }) {
  let stopped = false, task
  const queue = [...loaders]
  const enqueue = () => {
    if (stopped || !queue.length || !allowed()) return
    task = schedule(async () => {
      if (stopped || !allowed()) return
      const load = queue.shift()
      try { await load() } catch { /* speculative failure must remain handled */ }
      enqueue()
    })
  }
  enqueue()
  return () => { stopped = true; if (task !== undefined) cancel(task) }
}
