// Navigation and prefetch share the same import functions. A failed speculative
// request is caught by the caller, never stored as a rejected page promise.
import { canPrefetchInBrowser } from '../lib/pagePrefetch'
export const pageLoaders = {
  '/resources': () => import('../pages/Resources'),
  '/resources/curate': () => import('../pages/ResourceCurate'),
  '/login': () => import('../pages/Login'),
  '/reset-password': () => import('../pages/ResetPassword'),
  '/404': () => import('../pages/NotFound'),
  '/vocabulary': () => import('../pages/Vocabulary'),
  '/assistant': () => import('../pages/Assistant'),
}

export function prefetchPage(path) {
  if (!canPrefetchInBrowser()) return
  const loader = pageLoaders[path.split(/[?#]/)[0]]
  if (loader) loader().catch(() => { /* navigation still has its own recovery UI */ })
}
