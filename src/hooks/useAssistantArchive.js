import { useEffect, useMemo, useSyncExternalStore } from 'react'
import * as history from '../lib/aiAssistantBackend'
import { requestAssistant } from '../lib/assistantClient'
import { createAssistantArchive } from '../lib/assistantArchive'

export function useAssistantArchive(userId) {
  const archive = useMemo(() => createAssistantArchive({
    userId, history,
    request: (messages, options) => requestAssistant(messages, { ...options, userId }),
  }), [userId])
  const state = useSyncExternalStore(archive.subscribe, archive.getSnapshot)
  useEffect(() => {
    archive.initialize()
    return () => archive.dispose()
  }, [archive])
  return { archive, ...state }
}
