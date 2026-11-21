import { normalizeRoutePath } from './routePath'
import { loginReturnPath } from './loginReturn'

export function pageMotion(before, after) {
  const from = normalizeRoutePath(before.visit.location.pathname)
  const to = normalizeRoutePath(after.visit.location.pathname)
  if (before.visit === after.visit) {
    if (to === '/login' && !before.loading && !after.loading && Boolean(before.userId) !== Boolean(after.userId) &&
        !loginReturnPath(after.visit.location.state?.returnTo)) {
      return after.userId ? 'connexion-open' : 'connexion-close'
    }
    return null
  }
  for (const list of ['/lecture', '/assistant']) {
    if (from.startsWith(list + '/') && to === list) return 'lec-retract'
    if (from === list && to.startsWith(list + '/')) return 'lec-rise'
  }
  if (to === '/reset-password') return 'page-arrive'
  if (from === '/reset-password') return 'page-arrive-back'
  if (to === '/login' && from !== to) return from === '/lecture' ? 'page-arrive-back' : 'page-arrive'
  if (from === '/login' && to !== from) return to === '/lecture' ? 'page-arrive' : 'page-arrive-back'
  if (after.visit.flip) return to === '/' ? 'page-arrive-back' : 'page-arrive'
  return null
}
