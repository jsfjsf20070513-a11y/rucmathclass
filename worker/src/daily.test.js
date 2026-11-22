import { afterEach, expect, it, vi } from 'vitest'
import worker from './index.js'
import { getDailyContent } from './dailyStore.js'
import { staticDaily } from '../../src/lib/dailyContent.js'

const date = '2028-02-29'
const midnight = Date.parse(date + 'T00:00:00+08:00')
const stored = { ...staticDaily(date), parole: { text: 'Un jour de plus.', note: '多出的一天。', author: 'Parole du jour', src: '原创' } }
const env = { LECTURE: { get: vi.fn() } }
const request = (path, init) => worker.fetch(new Request('https://rucmathclass.com/api/daily/' + path, init), env)
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

it('北京时间闰日零点才开放当天稿件，提前写入也读不到', async () => {
  vi.useFakeTimers().setSystemTime(midnight - 1)
  env.LECTURE.get.mockResolvedValue(stored)
  for (const path of [date, '2028-02-30', '2028-2-29', '', date + '/extra']) {
    expect((await request(path)).status).toBe(404)
  }
  expect(env.LECTURE.get).not.toHaveBeenCalled()
  vi.setSystemTime(midnight)
  expect(await (await request(date)).json()).toEqual(stored)
  expect(env.LECTURE.get).toHaveBeenCalledWith('daily:' + date, 'json')
  expect(await getDailyContent(env)).toEqual(stored)
})

it('匿名与带账号请求取得相同的 Parole，沿用现有 CORS', async () => {
  vi.useFakeTimers().setSystemTime(midnight)
  env.LECTURE.get.mockResolvedValue(stored)
  for (const headers of [{}, { Authorization: 'Bearer sample-a' }, { Authorization: 'Bearer sample-b' }]) {
    const response = await request(date + '?x=1', { headers: { ...headers, Origin: 'https://www.rucmathclass.com' } })
    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://www.rucmathclass.com')
    expect((await response.json()).parole).toEqual(stored.parole)
  }
  expect((await request(date, { method: 'POST' })).status).toBe(405)
  expect((await request(date, { method: 'OPTIONS' })).status).toBe(204)
})

it('两端按同一日期退回静态稿，KV 缺稿、错日及读取失败均可用', async () => {
  vi.useFakeTimers().setSystemTime(midnight)
  env.LECTURE.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...stored, date: '2028-02-28' }).mockRejectedValueOnce(new Error('unavailable'))
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request(date)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(staticDaily(date))
  }
  expect(staticDaily('2028-03-01').parole).not.toEqual(staticDaily(date).parole)
})
