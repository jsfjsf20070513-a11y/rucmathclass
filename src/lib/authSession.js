// Auth events own identity. A delayed initialization read must never replace
// a newer event, and public reading must not depend on this service settling.
export function createAuthSession(auth, { timeoutMs = 10000 } = {}) {
  let state = { user: null, loading: Boolean(auth), error: '', signingOut: false, signOutError: '' }
  const listeners = new Set()
  let active = false, generation = 0, lifecycle = 0, eventRevision = 0, signOutGeneration = 0, subscription, timer
  const publish = (next) => {
    if ('user' in next && next.user?.id !== state.user?.id) {
      signOutGeneration += 1
      next = { ...next, signingOut: false, signOutError: '' }
    }
    state = { ...state, ...next }
    listeners.forEach((listener) => listener())
  }
  const refresh = async () => {
    if (!auth || !active) return
    const attempt = ++generation
    const revision = eventRevision
    clearTimeout(timer)
    publish({ loading: true, error: '' })
    timer = setTimeout(() => {
      if (active && attempt === generation && revision === eventRevision) {
        publish({ loading: false, error: '登录状态暂时无法确认。你仍可阅读公开内容。' })
      }
    }, timeoutMs)
    try {
      const { data, error } = await auth.getSession()
      if (!active || attempt !== generation || revision !== eventRevision) return
      if (error) throw error
      publish({ user: data.session?.user ?? null, loading: false, error: '' })
    } catch {
      if (active && attempt === generation && revision === eventRevision) {
        publish({ loading: false, error: '登录状态暂时无法确认。你仍可阅读公开内容。' })
      }
    } finally {
      if (attempt === generation) clearTimeout(timer)
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    refresh,
    start() {
      active = true
      const run = ++lifecycle
      if (!auth) return
      subscription = auth.onAuthStateChange((_event, session) => {
        if (!active || run !== lifecycle) return
        // INITIAL_SESSION hides SDK initialization errors by emitting null.
        // The explicit read below owns initial success/failure; live events win.
        if (_event === 'INITIAL_SESSION') return
        eventRevision += 1
        clearTimeout(timer)
        publish({ user: session?.user ?? null, loading: false, error: '', signOutError: '' })
      }).data.subscription
      refresh()
    },
    stop() {
      active = false
      lifecycle += 1
      generation += 1
      signOutGeneration += 1
      state = { ...state, signingOut: false, signOutError: '' }
      clearTimeout(timer)
      subscription?.unsubscribe()
    },
    async signOut() {
      if (!auth || !active || state.signingOut) return
      const attempt = ++signOutGeneration
      const run = lifecycle
      const isCurrent = () => active && run === lifecycle && attempt === signOutGeneration
      publish({ signingOut: true, signOutError: '' })
      try {
        const { error } = await auth.signOut()
        if (error) throw error
      } catch {
        if (isCurrent()) publish({ signOutError: '退出未完成，请检查网络后重试。' })
      } finally {
        if (isCurrent()) publish({ signingOut: false })
      }
    },
  }
}
