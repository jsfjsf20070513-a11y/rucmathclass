import { createClient } from '@supabase/supabase-js'
import { fetchAuthResponse } from './authTransport'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

const hasRealValue = (value = '') => value && !value.startsWith('YOUR_SUPABASE_')

// Capture explicit recovery callback failures before the SDK cleans the URL.
export const recoveryCallbackFailed = typeof window !== 'undefined'
  && window.location.pathname === '/reset-password'
  && [window.location.search.slice(1), window.location.hash.slice(1)].some((value) => {
    const params = new URLSearchParams(value)
    return params.has('error') || params.has('error_code')
  })

export const isSupabaseConfigured = Boolean(
  hasRealValue(supabaseUrl) && hasRealValue(supabaseAnonKey),
)

export const SUPABASE_MISSING_MESSAGE =
  'Supabase has not been configured by the site admin yet — sign-in, password reset, and account data are temporarily unavailable. · 站点管理员还没有完成 Supabase 配置，登录、找回密码和个人数据暂时不可用。'

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: { lockAcquireTimeout: 10000 },
    global: {
      fetch: (url, options = {}) => `${url}`.startsWith(`${supabaseUrl}/auth/v1/`)
        ? fetchAuthResponse(url, options)
        : fetch(url, options),
    },
  })
  : null
