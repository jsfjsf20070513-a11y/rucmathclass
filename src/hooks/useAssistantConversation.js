import { useEffect, useMemo, useSyncExternalStore } from 'react'
import * as history from '../lib/aiAssistantBackend'
import { requestAssistant } from '../lib/assistantClient'
import { createAssistantConversation } from '../lib/assistantConversation'

export function useAssistantConversation(userId) {
  const conversation = useMemo(() => createAssistantConversation({ userId, history, request: requestAssistant }), [userId])
  const state = useSyncExternalStore(conversation.subscribe, conversation.getSnapshot)
  useEffect(() => {
    conversation.initialize()
    return () => conversation.dispose()
  }, [conversation])
  return { ...state, send: conversation.send, clear: conversation.clear }
}
