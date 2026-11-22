import { afterEach, expect, it, vi } from 'vitest'
import { currentDaily, fetchDaily } from './dailyBackend.js'
import { staticDaily } from './dailyContent.js'

afterEach(() => vi.unstubAllGlobals())

it('慢请求期间立刻给出静态稿，多个页面共用一次请求', async () => {
  const date = '2026-11-21'
  const day = staticDaily(date)
  const remote = { ...day, theorem: { ...day.theorem, title: '本月定稿' } }
  let release
  const fetch = vi.fn(() => new Promise(resolve => { release = resolve }))
  vi.stubGlobal('fetch', fetch)
  const first = fetchDaily(date)
  expect(fetchDaily(date)).toBe(first)
  expect(currentDaily(date)).toEqual(day)
  release(Response.json(remote))
  expect(await first).toEqual(remote)
  expect(currentDaily(date)).toEqual(remote)
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('请求失败、未配置路由或收到错日稿时，按日期退回同一句', async () => {
  const date = '2026-12-31'
  const fetch = vi.fn().mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(new Response('not found', { status: 404 }))
    .mockResolvedValueOnce(new Response('<html>'))
    .mockResolvedValueOnce(Response.json(staticDaily('2027-01-01')))
  vi.stubGlobal('fetch', fetch)
  for (let i = 0; i < 4; i++) expect(await fetchDaily(date)).toEqual(staticDaily(date))
})
