import { afterEach, expect, it, vi } from 'vitest'
import { FIXTURE_USERS, fixtureSession } from '../../scripts/lib/localFixture.mjs'
import { lectureSamples } from '../../src/data/lectureSamples.js'
import { runSiteTool } from './chatTools.js'

afterEach(() => vi.unstubAllGlobals())
const today = '2026-11-20'
const article = lectureSamples[0]
const env = { SUPABASE_URL: 'https://auth.example.invalid', SUPABASE_ANON_KEY: 'anon',
  LECTURE: { get: vi.fn(async key => key === 'day:' + article.date ? article : null),
    list: async () => ({ keys: [{ name: 'day:' + article.date, metadata: article }], list_complete: true }) } }
const invoke = (name, args, user = FIXTURE_USERS[0]) => runSiteTool({ name, arguments: JSON.stringify(args) }, {
  env, today, userId: user.id, authorization: 'Bearer ' + fixtureSession(user).access_token, signal: new AbortController().signal,
})

it('serves the published archive and the site catalogue', async () => {
  expect(await invoke('lecture', { date: null })).toEqual([{ date: article.date, title: article.title, level: article.level }])
  expect(await invoke('lecture', { date: article.date })).toEqual(article)
  expect(await invoke('lecture', { date: '2026-11-21' })).toBeNull()
  expect((await invoke('resources', { query: '实分析' })).length).toBeGreaterThan(0)
})

it('uses each verified caller’s bearer JWT and anon key on all three RLS tables, even for a guessed thread ID', async () => {
  const users = FIXTURE_USERS
  const threads = users.map(u => u.id.replace(/^./, 'a'))
  // 模拟 PostgREST 的 JWT 角色。真实表策略另由 databaseGrants.test.js 在本机 PostgreSQL 执行。
  let caller
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const owner = users.find(u => init.headers.Authorization === 'Bearer ' + fixtureSession(u).access_token)
    expect(owner.id).toBe(caller.id)
    expect(init.headers.apikey).toBe('anon')
    expect(init.redirect).toBe('manual')
    const { pathname, searchParams } = new URL(url)
    expect(searchParams.get('user_id')).toBe('eq.' + owner.id)
    const index = users.indexOf(owner)
    if (pathname.endsWith('/lecture_answers')) return Response.json([{ day: article.date, answers: { 0: index ? 'B' : { key: 'A', at: 1 } } }])
    if (pathname.endsWith('/ai_conversations')) return Response.json([{ id: threads[index] }])
    expect(pathname).toBe('/rest/v1/ai_messages')
    return Response.json(searchParams.get('conversation_id') === 'eq.' + threads[index] ? [{ content: owner.id }] : [])
  }))
  for (const [i, user] of users.entries()) {
    caller = user
    const forged = { user_id: users[1-i].id, authorization: 'Bearer other' }
    expect((await invoke('my_answers', forged, user))[0].answers[0]).toMatchObject({ picked: i ? 'B' : 'A', correct: article.questions[0].answer })
    expect(await invoke('my_chats', forged, user)).toEqual([{ id: threads[i] }])
    expect(await invoke('my_chats', { conversation_id: threads[1-i] }, user)).toEqual([])
    expect(await invoke('my_chats', { conversation_id: threads[i] }, user)).toEqual([{ content: user.id }])
  }
})
