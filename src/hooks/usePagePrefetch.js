import { useEffect } from 'react'
import { useAuth } from '../context/useAuth'
import { canPrefetchInBrowser, schedulePagePrefetch } from '../lib/pagePrefetch'
import { pageLoaders } from '../routes/pageLoaders'

export function usePagePrefetch() {
  const { user } = useAuth()
  const hasUser = Boolean(user)
  useEffect(() => {
    const idle = 'requestIdleCallback' in window
    return schedulePagePrefetch({
      loaders: ['/resources', '/vocabulary', ...(hasUser ? ['/assistant'] : ['/login'])].map((path) => pageLoaders[path]),
      allowed: canPrefetchInBrowser,
      schedule: (run) => idle ? window.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 1500),
      cancel: (id) => idle ? window.cancelIdleCallback(id) : window.clearTimeout(id),
    })
  }, [hasUser])
}
