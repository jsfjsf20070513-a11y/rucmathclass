import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase, isSupabaseConfigured, recoveryCallbackFailed } from '../lib/supabase'
import { AuthContext } from './auth-context'
import { createAuthSession } from '../lib/authSession'

export function AuthProvider({ children }) {
  const [session] = useState(() => createAuthSession(supabase?.auth))
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)

  useEffect(() => {
    session.start()
    return session.stop
  }, [session])

  const value = {
    ...state,
    signOut: session.signOut,
    refreshSession: session.refresh,
    isAuthEnabled: isSupabaseConfigured,
    recoveryCallbackFailed,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
