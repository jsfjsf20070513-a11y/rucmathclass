import { describe, expect, it, vi } from 'vitest'
import { createAssistantConversation } from './assistantConversation'
import { UserFacingError } from './userFacingError'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const reply = { role: 'model', content: 'answer' }
function setup(overrides = {}) {
  const history = {
    fetchMessages: vi.fn(async () => ({ mode: 'official', messages: [] })),
    saveTurn: vi.fn(async () => ({ mode: 'official' })),
    clearMessages: vi.fn(async () => ({ mode: 'official' })),
    ...overrides,
  }
  const request = vi.fn(async () => reply)
  return { history, request, conversation: createAssistantConversation({ userId: 'u1', history, request }) }
}

describe('assistant conversation lifecycle', () => {
  it('locks sending until history is loaded', async () => {
    const loaded = deferred()
    const { conversation, request } = setup({ fetchMessages: () => loaded.promise })
    const init = conversation.initialize()
    expect(await conversation.send('question')).toBe(false)
    loaded.resolve({ mode: 'official', messages: [] })
    await init
    expect(request).not.toHaveBeenCalled()
    expect(conversation.getSnapshot().busy).toBe(false)
  })
  it('keeps a failed image question out of history and retries without duplicates', async () => {
    const { conversation, request, history } = setup()
    await conversation.initialize()
    request.mockRejectedValueOnce(new Error('offline'))
    const image = { mimeType: 'image/jpeg', data: 'aGVsbG8=', preview: 'data:image/jpeg;base64,aGVsbG8=' }
    expect(await conversation.send('看图', image)).toBe(false)
    expect(conversation.getSnapshot().messages).toEqual([])
    expect(conversation.getSnapshot().error).toBe('答疑请求未完成，请检查网络后重试。')
    expect(history.saveTurn).not.toHaveBeenCalled()
    expect(await conversation.send('看图', image)).toBe(true)
    await conversation.send('第二问呢')
    expect(request.mock.calls[2][0][0].imageData).toEqual({ mimeType: image.mimeType, data: image.data })
    expect(conversation.getSnapshot().messages.map((m) => m.content)).toEqual(['看图', 'answer', '第二问呢', 'answer'])
  })
  it('preserves the account-switch instruction without saving or showing the failed question', async () => {
    const { conversation, request, history } = setup()
    await conversation.initialize()
    request.mockRejectedValueOnce(new UserFacingError('账号已退出或切换，请重新打开答疑页面。'))
    expect(await conversation.send('问题')).toBe(false)
    expect(conversation.getSnapshot()).toMatchObject({ messages: [], error: '账号已退出或切换，请重新打开答疑页面。' })
    expect(history.saveTurn).not.toHaveBeenCalled()
  })
  it('blocks duplicate sends and clear until the answer has been saved', async () => {
    const saved = deferred()
    const { conversation, request, history } = setup({ saveTurn: () => saved.promise })
    await conversation.initialize()
    const sent = conversation.send('question')
    expect(await conversation.send('duplicate')).toBe(false)
    await Promise.resolve()
    expect(conversation.getSnapshot().loading).toBe(false)
    expect(await conversation.clear()).toBe(false)
    expect(history.clearMessages).not.toHaveBeenCalled()
    saved.resolve({ mode: 'official' })
    await sent
    await conversation.clear()
    expect(request).toHaveBeenCalledTimes(1)
    expect(conversation.getSnapshot().messages).toEqual([])
  })
  it('preserves the conversation if clear fails and blocks sends during clear', async () => {
    const cleared = deferred()
    const { conversation } = setup({ clearMessages: () => cleared.promise })
    await conversation.initialize()
    await conversation.send('question')
    const clearing = conversation.clear()
    expect(await conversation.send('new question')).toBe(false)
    cleared.reject(new Error('offline'))
    expect(await clearing).toBe(false)
    expect(conversation.getSnapshot().messages).toHaveLength(2)
    expect(conversation.getSnapshot().error).toContain('清空结果未确认')
    expect(conversation.getSnapshot().busy).toBe(true)
    expect(await conversation.send('cannot continue uncertain history')).toBe(false)
  })
  it('does not show or save a late answer after leaving/changing account', async () => {
    const response = deferred()
    const { conversation, request, history } = setup()
    await conversation.initialize()
    request.mockReturnValueOnce(response.promise)
    const sent = conversation.send('question')
    conversation.dispose()
    response.resolve(reply)
    expect(await sent).toBe(false)
    expect(history.saveTurn).not.toHaveBeenCalled()
  })
  it('shows an explicit unsynced notice and retains the answer when history saving fails', async () => {
    const { conversation } = setup({ saveTurn: async () => { throw new Error('offline') } })
    await conversation.initialize()
    expect(await conversation.send('question')).toBe(true)
    expect(conversation.getSnapshot()).toMatchObject({ busy: false, notice: expect.stringContaining('保存未确认') })
    expect(conversation.getSnapshot().messages).toHaveLength(2)
    expect(await conversation.clear()).toBe(false)
    expect(conversation.getSnapshot().error).toContain('核对历史')
  })
  it('does not shrink loaded history to the API context window on send', async () => {
    const messages = Array.from({ length: 200 }, () => reply)
    const { conversation } = setup({ fetchMessages: async () => ({ mode: 'official', messages }) })
    await conversation.initialize()
    await conversation.send('question')
    expect(conversation.getSnapshot().messages).toHaveLength(202)
  })
})
