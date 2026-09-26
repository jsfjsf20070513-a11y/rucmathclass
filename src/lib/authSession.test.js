import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAuthSession } from './authSession'

const stores = []
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function setup(getSession = async () => ({ data: { session: { user: { id: 'a' } } } })) {
  const callbacks = []
  const auth = {
    getSession: vi.fn(getSession), signOut: vi.fn(async () => ({ error: null })),
    onAuthStateChange: (callback) => {
      callbacks.push(callback)
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    },
  }
  const store = createAuthSession(auth, { timeoutMs: 100 })
  stores.push(store)
  store.start()
  return { store, auth, callbacks, emit: (event, user) => callbacks.at(-1)(event, user ? { user } : null) }
}
afterEach(() => { stores.splice(0).forEach((s) => s.stop()); vi.useRealTimers() })

describe('auth session ownership', () => {
  it('exits loading on timeout and recovers when a later auth event confirms identity', async () => {
    vi.useFakeTimers()
    const h = setup(() => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(100)
    expect(h.store.getSnapshot()).toMatchObject({ loading: false, user: null })
    expect(h.store.getSnapshot().error).toBeTruthy()
    h.emit('SIGNED_IN', { id: 'b' })
    expect(h.store.getSnapshot()).toMatchObject({ loading: false, user: { id: 'b' }, error: '' })
  })

  it('does not restore an old account after a newer sign-in or sign-out event', async () => {
    const pending = deferred()
    const h = setup(() => pending.promise)
    h.emit('SIGNED_IN', { id: 'b' })
    pending.resolve({ data: { session: { user: { id: 'a' } } } })
    await pending.promise
    expect(h.store.getSnapshot().user.id).toBe('b')
    const old = deferred()
    h.auth.getSession.mockReturnValueOnce(old.promise)
    const refresh = h.store.refresh()
    h.emit('SIGNED_OUT', null)
    old.resolve({ data: { session: { user: { id: 'b' } } } })
    await refresh
    expect(h.store.getSnapshot().user).toBeNull()
  })

  it('handles failed initialization and allows an explicit retry', async () => {
    const h = setup(async () => { throw new Error('offline') })
    await vi.waitFor(() => expect(h.store.getSnapshot().loading).toBe(false))
    expect(h.store.getSnapshot().error).toBeTruthy()
    h.auth.getSession.mockResolvedValueOnce({ data: { session: null } })
    await h.store.refresh()
    expect(h.store.getSnapshot()).toMatchObject({ user: null, error: '', loading: false })
  })

  it('does not let an SDK INITIAL_SESSION null hide initialization failure', async () => {
    const pending = deferred()
    const h = setup(() => pending.promise)
    h.emit('INITIAL_SESSION', null)
    pending.resolve({ data: { session: null }, error: new Error('offline') })
    await pending.promise
    expect(h.store.getSnapshot().error).toBeTruthy()
  })

  it('ignores work and callbacks from a stopped lifecycle, including a StrictMode restart', async () => {
    const pending = deferred()
    const h = setup(() => pending.promise)
    h.store.stop()
    h.store.start()
    h.callbacks[0]('SIGNED_IN', { user: { id: 'stale' } })
    expect(h.store.getSnapshot().user).toBeNull()
    h.store.stop()
    pending.resolve({ data: { session: { user: { id: 'stale' } } } })
    await pending.promise
    expect(h.store.getSnapshot().user).toBeNull()
  })

  it('reports sign-out failure without pretending the account was removed or sending duplicates', async () => {
    const h = setup()
    await vi.waitFor(() => expect(h.store.getSnapshot().user?.id).toBe('a'))
    const pending = deferred()
    h.auth.signOut.mockReturnValueOnce(pending.promise)
    const first = h.store.signOut()
    await h.store.signOut()
    expect(h.auth.signOut).toHaveBeenCalledTimes(1)
    pending.resolve({ error: new Error('offline') })
    await first
    expect(h.store.getSnapshot()).toMatchObject({ user: { id: 'a' }, signingOut: false })
    expect(h.store.getSnapshot().signOutError).toBeTruthy()
  })

  it('drops an old sign-out failure after switching accounts', async () => {
    const h = setup()
    await vi.waitFor(() => expect(h.store.getSnapshot().user?.id).toBe('a'))
    const pending = deferred()
    h.auth.signOut.mockReturnValueOnce(pending.promise)
    const oldSignOut = h.store.signOut()
    h.emit('SIGNED_IN', { id: 'b' })
    expect(h.store.getSnapshot()).toMatchObject({ user: { id: 'b' }, signingOut: false })
    pending.resolve({ error: new Error('offline') })
    await oldSignOut
    expect(h.store.getSnapshot().signOutError).toBe('')
  })

  it('does not let an old sign-out clear the pending state after a lifecycle restart', async () => {
    const h = setup()
    const old = deferred(), current = deferred()
    h.auth.signOut.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const first = h.store.signOut()
    h.store.stop()
    h.store.start()
    await vi.waitFor(() => expect(h.store.getSnapshot().user?.id).toBe('a'))
    const second = h.store.signOut()
    old.resolve({ error: new Error('offline') })
    await first
    expect(h.store.getSnapshot()).toMatchObject({ signingOut: true, signOutError: '' })
    current.resolve({ error: null })
    await second
    expect(h.store.getSnapshot().signingOut).toBe(false)
  })
})
