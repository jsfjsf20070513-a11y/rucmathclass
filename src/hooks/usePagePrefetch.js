import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { canPrefetchInBrowser, schedulePagePrefetch } from '../lib/pagePrefetch'
import { pageLoaders } from '../routes/pageLoaders'
import { prefetchReadingFonts } from '../lib/paperFonts'

export function usePagePrefetch() {
  const home = useLocation().pathname === '/'
  const { user } = useAuth()
  const hasUser = Boolean(user)
  useEffect(() => {
    const idle = 'requestIdleCallback' in window
    const loaders = ['/resources', '/lecture', hasUser ? '/assistant' : '/login'].map(path => pageLoaders[path])
    if (home) loaders.unshift(prefetchReadingFonts)
    return schedulePagePrefetch({
      loaders,
      allowed: canPrefetchInBrowser,
      schedule: (run) => idle ? window.requestIdleCallback(run, { timeout: 4000 }) : window.setTimeout(run, 1500),
      cancel: (id) => idle ? window.cancelIdleCallback(id) : window.clearTimeout(id),
    })
  }, [home, hasUser])
}
