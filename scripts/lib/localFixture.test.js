import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createLocalFixture, FIXTURE_PASSWORD, FIXTURE_USERS } from './localFixture.mjs'

function clientFor(fixture) {
  return createClient('https://fixture.invalid', 'local-fixture', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options = {}) => {
      const result = fixture.handle({ url, method: options.method, headers: Object.fromEntries(new Headers(options.headers)), body: options.body ? JSON.parse(options.body) : {} })
      return new Response(result.status === 204 ? null : JSON.stringify(result.json), { status: result.status, headers: { 'Content-Type': 'application/json' } })
    } },
  })
}

describe('本地假数据使用真实 SDK', () => {
  it('能够保存并重读进度，拒绝旧版本覆盖和另一个账号读取', async () => {
    const fixture = createLocalFixture()
    const alice = clientFor(fixture), bob = clientFor(fixture)
    expect((await alice.auth.signInWithPassword({ email: FIXTURE_USERS[0].email, password: FIXTURE_PASSWORD })).error).toBeNull()
    const row = { user_id: FIXTURE_USERS[0].id, word_id: 'fr-bonjour', updated_at: '2026-10-05T04:00:00Z', proficiency_level: 1 }
    expect((await alice.from('review_states').insert(row).select().maybeSingle()).data).toEqual(row)
    const updated = { ...row, proficiency_level: 2, updated_at: '2026-10-06T04:00:00Z' }
    expect((await alice.from('review_states').update(updated).eq('user_id', row.user_id).eq('word_id', row.word_id).eq('updated_at', row.updated_at).select().maybeSingle()).data).toEqual(updated)
    expect((await alice.from('review_states').update(row).eq('user_id', row.user_id).eq('word_id', row.word_id).eq('updated_at', row.updated_at).select().maybeSingle()).data).toBeNull()
    expect((await alice.from('review_states').select().eq('user_id', row.user_id)).data).toEqual([updated])
    await bob.auth.signInWithPassword({ email: FIXTURE_USERS[1].email, password: FIXTURE_PASSWORD })
    expect((await bob.from('review_states').select().eq('user_id', row.user_id)).error).not.toBeNull()
    expect((await bob.from('review_states').select().eq('user_id', FIXTURE_USERS[1].id)).data).toEqual([])
  })

  it('改密码后可以退出并用新密码登录，假接口不会把未知请求伪装成成功', async () => {
    const fixture = createLocalFixture()
    const client = clientFor(fixture)
    await client.auth.signInWithPassword({ email: FIXTURE_USERS[0].email, password: FIXTURE_PASSWORD })
    expect((await client.auth.updateUser({ password: 'changed-fixture-password' })).error).toBeNull()
    await client.auth.signOut()
    expect((await client.auth.signInWithPassword({ email: FIXTURE_USERS[0].email, password: 'changed-fixture-password' })).error).toBeNull()
    expect((await client.from('unknown_table').select()).status).toBe(404)
  })
})
