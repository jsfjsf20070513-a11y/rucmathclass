import { describe, expect, it, vi } from 'vitest'
import { createAssistantArchive } from './assistantArchive'

const original = { id: 'math', title: '第一题', updated_at: '2026-11-20T08:00:00Z' }
const reply = { role: 'model', content: '回答' }

async function setup(entries = [original], userId = 'alice') {
  const history = {
    fetchConversations: vi.fn(async () => ({ mode: 'official', entries })),
    fetchMessages: vi.fn(async () => ({ mode: 'official', messages: [{ role: 'user', content: '第一题' }, reply] })),
    saveTurn: vi.fn(async () => ({ mode: 'official', updated_at: '2026-11-21T08:00:00Z' })),
    deleteConversation: vi.fn(async () => ({ mode: 'official' })),
  }
  const request = vi.fn(async () => reply)
  const archive = createAssistantArchive({ userId, history, request })
  await archive.initialize()
  return { archive, history, request }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

describe('按账号分段的答疑目录', () => {
  it('打开空页不建段。首轮收到回复后才保存，后续提问沿用第一句标题', async () => {
    const { archive, history, request } = await setup()
    const draft = archive.thread('draft')
    await draft.initialize()
    expect(history.fetchMessages).not.toHaveBeenCalled()
    expect(archive.getSnapshot().entries).toEqual([original])
    let fail
    request.mockImplementationOnce(() => new Promise((resolve, reject) => { fail = reject }))
    const sending = draft.send('第一问')
    expect(archive.getSnapshot().entries[0]).toMatchObject({ id: 'draft', title: '第一问' })
    expect(history.saveTurn).not.toHaveBeenCalled()
    archive.remove('draft')
    expect(archive.getSnapshot().deletions).toEqual({})
    fail(new Error('offline'))
    expect(await sending).toBe(false)
    expect(archive.getSnapshot().entries).toEqual([original])
    await draft.send('第一问')
    await draft.send('另一问')
    expect(history.saveTurn.mock.calls.map((args) => args.slice(3))).toEqual([['draft', '第一问'], ['draft', null]])
    expect(archive.getSnapshot().entries.map((row) => row.title)).toEqual(['第一问', '第一题'])
    const existing = archive.thread('math')
    await existing.initialize()
    await existing.send('续问')
    expect(request.mock.calls.at(-1)[0].map((item) => item.content)).toEqual(['第一题', '回答', '续问'])
    expect(history.saveTurn.mock.calls.at(-1).slice(3)).toEqual(['math', null])
  })

  it('点删除就提交，两行可以独立完成，重复点击只提交一次', async () => {
    const other = { ...original, id: 'french' }
    const { archive, history } = await setup([original, other])
    const response = deferred()
    const animation = deferred()
    history.deleteConversation.mockReturnValueOnce(response.promise)
    const removing = archive.remove('math', () => animation.promise)
    expect(history.deleteConversation).toHaveBeenCalledWith('alice', original)
    await archive.remove('math')
    await archive.remove('french')
    expect(archive.getSnapshot()).toMatchObject({ entries: [original], deletions: { math: 'deleting' } })
    response.resolve({ mode: 'official' })
    await response.promise
    expect(archive.getSnapshot()).toMatchObject({ entries: [original], deletions: { math: 'deleted' } })
    await archive.remove('math')
    expect(history.deleteConversation.mock.calls).toEqual([['alice', original], ['alice', other]])
    animation.resolve()
    await removing
    expect(archive.getSnapshot()).toMatchObject({ entries: [], deletions: {} })
  })

  it('版本检查拒绝删除后，保留原条目并显示现有提示', async () => {
    const { archive, history } = await setup()
    const collapse = vi.fn()
    history.deleteConversation.mockRejectedValueOnce(new Error('Conversation changed'))
    await archive.remove('math', collapse)
    expect(collapse).not.toHaveBeenCalled()
    expect(archive.getSnapshot()).toMatchObject({ entries: [original], deletions: {}, error: '删除结果未确认。请刷新后核对这段对话。' })
  })

  it.each(['成功', '失败'])('切换账号后忽略旧账号的删除回执（%s）和迟到的回答', async (outcome) => {
    const { archive, history, request } = await setup()
    const draft = archive.thread('new-id')
    await draft.initialize()
    const answer = deferred()
    request.mockReturnValueOnce(answer.promise)
    const sent = draft.send('尚未回答')
    const response = deferred()
    history.deleteConversation.mockReturnValueOnce(response.promise)
    const collapse = vi.fn()
    const removing = archive.remove('math', collapse)
    expect(history.deleteConversation).toHaveBeenCalledWith('alice', original)
    archive.dispose()
    const next = await setup([original], 'bob')
    const oldState = archive.getSnapshot()
    const newState = next.archive.getSnapshot()
    if (outcome === '成功') response.resolve({ mode: 'official' })
    else response.reject(new Error('Conversation changed'))
    answer.resolve(reply)
    await removing
    expect(await sent).toBe(false)
    expect(history.saveTurn).not.toHaveBeenCalled()
    expect(collapse).not.toHaveBeenCalled()
    expect(archive.getSnapshot()).toBe(oldState)
    expect(next.archive.getSnapshot()).toBe(newState)
  })

  it('保存结果不明时从目录重开仍看得到回答，并继续阻止删除', async () => {
    const { archive, history } = await setup()
    const thread = archive.thread('draft')
    await thread.initialize()
    history.saveTurn.mockRejectedValueOnce(new Error('timeout'))
    await thread.send('画一个三角形')
    const reopened = archive.thread('draft')
    await reopened.initialize()
    expect(reopened.getSnapshot()).toMatchObject({ notice: expect.stringContaining('保存未确认'), messages: expect.arrayContaining([reply]) })
    await archive.remove('draft')
    expect(history.deleteConversation).not.toHaveBeenCalled()
    expect(archive.getSnapshot().error).toContain('核对历史')
  })
})
