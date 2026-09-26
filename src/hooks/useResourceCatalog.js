import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildPublicResourceCatalog } from '../data/resourceCatalog'
import { fetchPublishedResources, subscribeToPublishedResources } from '../lib/resourceBackend'

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
    const unsubscribe = subscribeToPublishedResources(scheduleRefresh)
    return () => {
      unsubscribe()
      window.clearTimeout(timer)
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
