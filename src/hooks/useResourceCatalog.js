import { useCallback, useEffect, useState } from 'react'
import { staticResourceCatalog } from '../data/resourceCatalog'
import { fetchPublishedResources } from '../lib/resourceBackend'

export function useResourceCatalog() {
  const [state, setState] = useState({ catalogItems: staticResourceCatalog, loading: true, error: '' })
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(current => current + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    setState(current => ({ ...current, loading: true }))
    fetchPublishedResources({ signal: controller.signal }).then(catalogItems => {
      if (!controller.signal.aborted) setState({ catalogItems, loading: false, error: '' })
    }, () => {
      if (!controller.signal.aborted) setState(current => ({ ...current, loading: false, error: '暂时无法更新书目。' }))
    })
    return () => controller.abort()
  }, [revision])
  return { ...state, refresh }
}
