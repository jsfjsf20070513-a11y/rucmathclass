import { expect, it, vi } from 'vitest'
import { createLectureAnswers } from './lectureAnswers'
import { answerStorage, lectureAnswersKey, mergePicks } from './lectureAnswerStorage'
import { syncLectureDay } from './lectureAnswersBackend'
import { fakeSupabase } from '../test/fakeSupabase'

const day = '2026-11-19', earlier = '2026-11-18'
const a = { key: 'A', at: 50 }, b = { key: 'B', at: 100 }
function setup() {
  const entries = new Map()
  const disk = {
    getItem: (key) => entries.get(key) ?? null, removeItem: (key) => entries.delete(key),
    setItem: vi.fn((key, value) => entries.set(key, value)),
  }
  const local = answerStorage(disk)
  const db = fakeSupabase()
  const sync = vi.fn((...args) => syncLectureDay(...args, db))
  const account = (userId) => createLectureAnswers({ userId, local, sync, now: () => 100 })
  return { account, local, disk, db, sync }
}

it('claims all guest dates once at login, keeps newer cloud picks, and leaves the next account empty', async () => {
  const { account, disk, db, local } = setup()
  disk.setItem('mcw_lecture_answers_v1', JSON.stringify({ [day]: { 0: 'A', 1: 'B', invalid: [] }, [earlier]: { 0: 'Vrai' } }))
  db.rows.push({ user_id: 'alice', day, answers: { 0: b }, updated_at: new Date(10).toISOString() })
  const guest = account(null)
  await guest.start()
  expect(guest.getSnapshot()[day][0]).toEqual({ key: 'A', at: 0 })
  guest.stop()
  const alice = account('alice')
  await alice.start()
  expect(alice.getSnapshot()).toEqual({ [earlier]: { 0: { key: 'Vrai', at: 0 } }, [day]: { 0: b, 1: { key: 'B', at: 0 } } })
  expect(db.rows.map((r) => r.day).sort()).toEqual([earlier, day])
  expect(local.read('alice')[day].pending).toBe(false)
  const bob = account('bob')
  await bob.start()
  expect(bob.getSnapshot()).toEqual({})
  expect(local.read('guest')).toEqual({})
})

it('waits for confirmation, isolates late requests and keeps new picks in click order', async () => {
  const { account, sync, db } = setup()
  const alice = account('alice')
  await alice.start()
  let resolve, called
  const started = new Promise((done) => { called = done })
  sync.mockImplementationOnce(() => new Promise((done) => { resolve = done; called() }))
  const first = alice.choose(day, 0, 'A')
  await started
  expect(alice.getSnapshot()[day]).toBeUndefined()
  alice.stop()
  const bob = account('bob')
  await bob.start()
  resolve({ 0: a })
  await first
  expect(alice.getSnapshot()).toEqual({})
  expect(bob.getSnapshot()).toEqual({})
  await Promise.all([bob.choose(day, 0, 'B'), bob.choose(day, 0, 'A'), bob.choose(day, 1, 'B')])
  expect(db.rows).toHaveLength(1)
  expect(db.rows[0]).toMatchObject({ user_id: 'bob', answers: { 0: { key: 'A', at: 101 }, 1: { key: 'B', at: 102 } } })
})

it('confirms offline picks only after local persistence, then retries the original timestamps', async () => {
  const { account, local, disk, sync, db } = setup()
  const alice = account('alice')
  await alice.start()
  sync.mockRejectedValueOnce({ code: 'PGRST205' })
  await alice.choose(day, 0, 'B')
  expect(alice.getSnapshot()[day]).toEqual({ 0: b })
  expect(local.read('alice')[day].pending).toBe(true)
  db.rows.push({ user_id: 'alice', day, answers: { 1: a }, updated_at: new Date(20).toISOString() })
  await alice.retryPending()
  expect(db.rows[0].answers).toEqual({ 0: b, 1: a })
  expect(local.read('alice')[day].pending).toBe(false)
  const guest = account(null)
  await guest.start()
  disk.setItem.mockImplementationOnce(() => { throw new Error('quota') })
  await guest.choose(day, 1, 'A')
  expect(guest.getSnapshot()).toEqual({})
  sync.mockRejectedValueOnce(new Error('offline'))
  disk.setItem.mockImplementationOnce(() => { throw new Error('quota') })
  await alice.choose(day, 2, 'A')
  expect(alice.getSnapshot()[day][2]).toBeUndefined()
  disk.setItem.mockImplementationOnce(() => { throw new Error('quota') })
  await alice.choose(day, 2, 'C')
  expect(alice.getSnapshot()[day][2].key).toBe('C')
})

it('merges concurrent insert/update and recovers an acknowledged-on-server write whose reply was lost', async () => {
  const { db } = setup()
  const put = (choices) => syncLectureDay('alice', day, choices, new AbortController().signal, db)
  db.beforeWrite = () => {
    db.beforeWrite = null
    db.rows.push({ user_id: 'alice', day, answers: { 1: b }, updated_at: new Date(1).toISOString() })
  }
  expect(await put({ 0: a })).toEqual({ 0: a, 1: b })
  db.beforeWrite = () => {
    db.beforeWrite = null
    db.rows[0].answers[0] = { key: 'C', at: 300 }
    db.rows[0].updated_at = new Date(Date.parse(db.rows[0].updated_at) + 1).toISOString()
  }
  expect(await put({ 0: b, 2: a })).toEqual({ 0: { key: 'C', at: 300 }, 1: b, 2: a })
  db.loseNextWriteResponse()
  await expect(put({ 3: a })).rejects.toBeTruthy()
  const revisions = db.rows[0].updated_at
  expect((await put({ 3: a }))[3]).toEqual(a)
  expect(db.rows[0].updated_at).toBe(revisions)
})

it('reads again before saving another tab’s answers and ignores invalid local entries', async () => {
  const { account, disk } = setup()
  disk.setItem(lectureAnswersKey, 'broken')
  const tab1 = account(null), tab2 = account(null)
  await tab1.start()
  await tab2.start()
  await tab1.choose(day, 0, 'B')
  await tab2.choose(day, 1, 'C')
  tab1.refresh()
  expect(tab1.getSnapshot()[day]).toEqual({ 0: b, 1: { key: 'C', at: 100 } })
  expect(mergePicks({ 0: [], 1: { key: 'A', at: -1 }, nope: 'B', 3: 'too-long-an-option' })).toEqual({})
})
