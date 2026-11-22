import { createAssistantConversation } from './assistantConversation'
import { questionTitle } from './aiAssistantBackend'

const readError = '对话列表加载失败。请刷新后重试。'
const deleteError = '删除结果未确认。请刷新后核对这段对话。'

// 目录和未确认的写入都只属于这个登录账号。
export function createAssistantArchive({ userId, history, request }) {
  let state = { mode: null, entries: [], deletions: {}, error: '' }
  let generation = 0
  const threads = new Map()
  const listeners = new Set()
  function emit(patch) {
    state = { ...state, ...patch }
    listeners.forEach((notify) => notify())
  }
  const entryFor = (id) => state.entries.find((entry) => entry.id === id)

  function updateEntry(id, message, saved) {
    const entry = {
      id, title: entryFor(id)?.title || questionTitle(message.content),
      updated_at: saved?.updated_at || new Date().toISOString(),
      ...(saved?.lastMessageId != null && { lastMessageId: saved.lastMessageId }),
    }
    emit({ entries: [entry, ...state.entries.filter((other) => other.id !== id)]
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)) })
  }

  function thread(id) {
    if (threads.has(id)) return threads.get(id)
    const stored = entryFor(id)
    const mode = state.mode === 'legacy' ? 'official' : state.mode
    let needsTitle = !stored
    const conversation = createAssistantConversation({
      userId, request,
      history: {
        fetchMessages: () => stored ? history.fetchMessages(userId, undefined, id) : Promise.resolve({ mode, messages: [] }),
        saveTurn: (_, message, reply) => history.saveTurn(userId, message, reply, id,
          needsTitle ? (entryFor(id)?.title || questionTitle(message.content)) : null),
        clearMessages: () => history.deleteConversation(userId, entryFor(id)),
      },
      onFirstQuestion(message) {
        if (stored) return
        if (message) updateEntry(id, message)
        else emit({ entries: state.entries.filter((entry) => entry.id !== id) })
      },
      onAnswered(message, saved) {
        if (saved?.mode === 'official') needsTitle = false
        updateEntry(id, message, saved)
      },
    })
    threads.set(id, conversation)
    return conversation
  }

  function clearDeletion(id) {
    const deletions = { ...state.deletions }
    delete deletions[id]
    return deletions
  }

  async function remove(id, collapseRow) {
    const entry = entryFor(id)
    const conversation = threads.get(id)
    if (!entry || state.deletions[id] || conversation?.getSnapshot().busy) return
    const token = generation
    emit({ deletions: { ...state.deletions, [id]: 'deleting' }, error: '' })
    try {
      if (conversation) {
        if (!await conversation.clear()) throw new Error(deleteError)
      } else {
        await history.deleteConversation(userId, entry)
      }
    } catch {
      if (token === generation) emit({ deletions: clearDeletion(id), error: conversation?.getSnapshot().error || deleteError })
      return
    }
    if (token !== generation) return
    conversation?.dispose()
    threads.delete(id)
    emit({ deletions: { ...state.deletions, [id]: 'deleted' } })
    try {
      await collapseRow?.()
    } finally {
      if (token === generation) emit({ entries: state.entries.filter((other) => other.id !== id), deletions: clearDeletion(id) })
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (notify) => { listeners.add(notify); return () => listeners.delete(notify) },
    async initialize() {
      const token = ++generation
      try {
        const result = await history.fetchConversations(userId)
        if (token === generation) emit(result)
      } catch {
        if (token === generation) emit({ error: readError })
      }
    },
    thread,
    cachedThread: (id) => threads.get(id),
    remove,
    dispose() {
      generation += 1
      for (const conversation of threads.values()) conversation.dispose()
      threads.clear()
    },
  }
}
