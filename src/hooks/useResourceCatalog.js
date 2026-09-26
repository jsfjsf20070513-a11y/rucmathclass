import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildPublicResourceCatalog } from '../data/resourceCatalog'
import { fetchPublishedResources } from '../lib/resourceBackend'
import { OFFICIAL_CONTENT_UPDATED_EVENT, OFFICIAL_CONTENT_UPDATED_STORAGE_KEY } from '../lib/contentEvents'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export function useResourceCatalog() {
  const [state, setState] = useState({ resources: [], loading: true, error: '' })
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((current) => current + 1), [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    setState((current) => ({ ...current, loading: true }))
    fetchPublishedResources({ signal: controller.signal }).then(
      (resources) => {
        if (active) setState({ resources, loading: false, error: '' })
      },
      () => {
        if (active) setState((current) => ({
          ...current, loading: false, error: '增补资源暂时无法更新，现有书目仍可阅读。',
        }))
      },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [revision])

  useEffect(() => {
    let timer
    const scheduleRefresh = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(refresh, 120)
    }
    const onStorage = (event) => {
      if (event.key === OFFICIAL_CONTENT_UPDATED_STORAGE_KEY) scheduleRefresh()
    }
    window.addEventListener(OFFICIAL_CONTENT_UPDATED_EVENT, scheduleRefresh)
    window.addEventListener('storage', onStorage)
    const channel = isSupabaseConfigured && supabase
      ? supabase.channel('public:resources')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, scheduleRefresh)
        .subscribe()
      : null
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(OFFICIAL_CONTENT_UPDATED_EVENT, scheduleRefresh)
      window.removeEventListener('storage', onStorage)
      if (channel) supabase.removeChannel(channel)
    }
  }, [refresh])

  const catalogItems = useMemo(
    () => buildPublicResourceCatalog({ officialResources: state.resources }),
    [state.resources],
  )

  return {
    catalogItems,
    loading: state.loading,
    error: state.error,
    refresh,
  }
}
