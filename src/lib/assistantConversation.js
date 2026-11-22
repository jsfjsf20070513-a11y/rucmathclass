// Conversation lifecycle, independent of React and page layout. All operations
// share one busy state so loading, sending, persistence and clearing cannot race.
import { userErrorMessage } from './userFacingError'

export function createAssistantConversation({ userId, history, request, onFirstQuestion, onAnswered }) {
  let state = { messages: [], ready: false, busy: !!userId, loading: false, partial: '', error: '', notice: '' }
  const listeners = new Set()
  let generation = 0
  let initialized = false
  let controller = null
  let mode = 'official'
  let uncertainWrite = false
  let uncertainClear = false
  const emit = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    async initialize() {
      if (initialized) return
      initialized = true
      const token = ++generation
      if (!userId) return emit({ messages: [], ready: true, busy: false })
      emit({ messages: [], ready: false, busy: true, error: '', notice: '' })
      try {
        const result = await history.fetchMessages(userId)
        if (token !== generation) return
        mode = result.mode
        emit({ messages: result.messages, notice: mode === 'official' ? '' : '云端历史暂不可用，对话仅保留在本次页面中。' })
      } catch {
        if (token === generation) emit({ ready: true, error: '历史记录加载失败。请刷新后重试，以免接续错误的对话。' })
        // Keep sending locked when the existing history could not be read.
        return
      }
      if (token === generation) emit({ ready: true, busy: false })
    },
    async send(content, image) {
      if (!userId || state.busy || (!content.trim() && !image)) return false
      const token = generation
      const previous = state.messages
      const userMessage = {
        role: 'user', content: content.trim() || '请看图，用中文一步步解释这道题并给出答案。',
        ...(image ? { image: image.preview, imageData: { mimeType: image.mimeType, data: image.data } } : {}),
      }
      controller = new AbortController()
      emit({ messages: [...previous, userMessage], busy: true, loading: true, error: '' })
      try {
        if (!previous.length) onFirstQuestion?.(userMessage)
        const reply = await request([...previous, userMessage], {
          signal: controller.signal,
          onPartial: partial => { if (token === generation) emit({ partial }) },
        })
        if (token !== generation) return false
        emit({ messages: [...previous, userMessage, reply], partial: '', loading: false })
        let saved
        if (mode === 'official') {
          try {
            saved = await history.saveTurn(userId, userMessage, reply)
            if (token !== generation) return false
            if (saved.mode !== 'official') throw new Error('History unavailable')
          } catch {
            uncertainWrite = true
            if (token === generation) emit({ notice: '本轮回答已收到，但云端保存未确认。请保留此页面；刷新或换设备可能看不到本轮对话。' })
          }
        }
        if (token === generation) onAnswered?.(userMessage, saved)
        return token === generation
      } catch (error) {
        if (token === generation) {
          if (!previous.length) onFirstQuestion?.(null)
          emit({ messages: previous, error: userErrorMessage(error, '答疑请求未完成，请检查网络后重试。') })
        }
        return false
      } finally {
        if (token === generation) emit({ busy: false, loading: false, partial: '' })
      }
    },
    async clear() {
      if (!userId || state.busy) return false
      if (uncertainWrite) {
        emit({ error: '上次保存结果尚未确认。请稍后刷新并核对历史后再删除这段对话。' })
        return false
      }
      const token = generation
      emit({ busy: true, error: '' })
      try {
        if (mode === 'official') {
          const result = await history.clearMessages(userId)
          if (result.mode !== 'official') throw new Error('History unavailable')
        }
        if (token !== generation) return false
        emit({ messages: [], notice: mode === 'official' ? '' : '对话仅保留在本次页面中。' })
        return true
      } catch {
        uncertainClear = true
        if (token === generation) emit({ error: '删除结果未确认。请刷新后核对这段对话。' })
        return false
      } finally {
        if (token === generation) emit({ busy: uncertainClear })
      }
    },
    dispose() { initialized = false; generation += 1; controller?.abort() },
  }
}
