import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssistantArchive, UNDO_MS } from './assistantArchive'

const original = { id: 'math', title: '第一题', updated_at: '2026-11-20T08:00:00Z' }
const reply = { role: 'model', content: '回答' }

async function setup() {
  const history = {
    fetchConversations: vi.fn(async () => ({ mode: 'official', entries: [original] })),
    fetchMessages: vi.fn(async () => ({ mode: 'official', messages: [{ role: 'user', content: '第一题' }, reply] })),
    saveTurn: vi.fn(async () => ({ mode: 'official', updated_at: '2026-11-21T08:00:00Z' })),
    deleteConversation: vi.fn(async () => ({ mode: 'official' })),
  }
  const request = vi.fn(async () => reply)
  const archive = createAssistantArchive({ userId: 'alice', history, request })
  await archive.initialize()
  return { archive, history, request }
}

afterEach(() => vi.useRealTimers())

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
    expect(archive.getSnapshot().pending).toEqual([])
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

  it('切换账号后，迟到的回答无法保存，旧计时器也无法删除', async () => {
    vi.useFakeTimers()
    const { archive, history, request } = await setup()
    const draft = archive.thread('new-id')
    await draft.initialize()
    let release
    request.mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const sent = draft.send('尚未回答')
    archive.remove('math')
    archive.dispose()
    release(reply)
    expect(await sent).toBe(false)
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(history.saveTurn).not.toHaveBeenCalled()
    expect(history.deleteConversation).not.toHaveBeenCalled()
  })

  it('撤销不写库。到期只删除点名的一段，另一设备已续写时保留目录', async () => {
    vi.useFakeTimers()
    const { archive, history } = await setup()
    archive.remove('math')
    await vi.advanceTimersByTimeAsync(UNDO_MS - 1)
    archive.undo('math')
    await vi.advanceTimersByTimeAsync(1)
    expect(history.deleteConversation).not.toHaveBeenCalled()
    expect(archive.getSnapshot().entries).toEqual([original])
    history.deleteConversation.mockRejectedValueOnce(new Error('version changed'))
    archive.remove('math')
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(archive.getSnapshot()).toMatchObject({ entries: [original], pending: [], error: expect.stringContaining('删除结果未确认') })
    archive.remove('math')
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(history.deleteConversation).toHaveBeenLastCalledWith('alice', original)
    expect(archive.getSnapshot()).toMatchObject({ entries: [], pending: [] })
  })

  it('保存结果不明时从目录重开仍看得到回答，并继续阻止删除', async () => {
    vi.useFakeTimers()
    const { archive, history } = await setup()
    const thread = archive.thread('draft')
    await thread.initialize()
    history.saveTurn.mockRejectedValueOnce(new Error('timeout'))
    await thread.send('画一个三角形')
    const reopened = archive.thread('draft')
    await reopened.initialize()
    expect(reopened.getSnapshot()).toMatchObject({ notice: expect.stringContaining('保存未确认'), messages: expect.arrayContaining([reply]) })
    archive.remove('draft')
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    expect(history.deleteConversation).not.toHaveBeenCalled()
    expect(archive.getSnapshot().error).toContain('核对历史')
  })
})
