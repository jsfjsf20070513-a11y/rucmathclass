import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { it } from 'vitest'

it('keeps legitimate flows and row isolation while restricting excess database grants', async () => {
  // A fresh in-memory PostgreSQL instance. No connection URL, production token,
  // environment credential, or user data is read by this verification.
  const db = new PGlite()
  const a = '11111111-1111-4111-8111-111111111111'
  const b = '22222222-2222-4222-8222-222222222222'
  const admin = '33333333-3333-4333-8333-333333333333'
  const sql = async (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8')
  const policySnapshot = async () => (await db.query("select tablename, policyname, roles, cmd, qual, with_check from pg_policies where schemaname='public' order by tablename, policyname")).rows
  const tables = ['review_states', 'ai_messages', 'resources', 'profiles']
  const recordSnapshot = async () => Promise.all(tables.map(async (table) =>
    (await db.query(`select to_jsonb(record) as record from public.${table} record order by to_jsonb(record)::text`)).rows))
  const asUser = async (id) => {
    await db.exec('reset role; set role authenticated;')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
  }
  const denied = async (query) => assert.rejects(db.query(query), (error) => error.code === '42501')
  const ownRows = async (table) => {
    const rows = (await db.query(`select user_id from public.${table}`)).rows
    assert.ok(rows.length > 0)
    assert.ok(rows.every(({ user_id }) => user_id === a))
  }

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
      grant usage on schema public, auth to anon, authenticated;
      -- Exercise schema definitions even when a host gives new tables broad defaults.
      alter default privileges in schema public grant all on tables to anon, authenticated;
      insert into auth.users values ('${a}'), ('${b}'), ('${admin}');
    `)
    await db.exec(await sql('sql/schema/setup_vocabulary.sql'))
    await db.exec(await sql('sql/schema/setup_ai_history.sql'))
    assert.equal((await db.query("select has_table_privilege('anon', 'public.ai_messages', 'SELECT') as allowed")).rows[0].allowed, false)
    assert.equal((await db.query("select has_table_privilege('authenticated', 'public.ai_messages', 'UPDATE') as allowed")).rows[0].allowed, false)
    assert.equal((await db.query("select has_table_privilege('authenticated', 'public.review_states', 'TRUNCATE') as allowed")).rows[0].allowed, false)
    await db.exec(`
      create table public.profiles (id uuid primary key, role text);
      create table public.resources (id bigint primary key, title text);
      alter table public.profiles enable row level security;
      alter table public.resources enable row level security;
      create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
      create policy "Public resources are viewable by everyone" on public.resources for select using (true);
      create policy "Admins can manage resources" on public.resources for all to authenticated
        using (exists(select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')))
        with check (exists(select 1 from public.profiles where id = auth.uid() and role in ('admin', 'super_admin')));
      insert into public.profiles values ('${a}', 'user'), ('${b}', 'user'), ('${admin}', 'admin');
      insert into public.resources values (1, 'fixture resource');
      insert into public.review_states (user_id, word_id) values ('${a}', 'fixture-a'), ('${b}', 'fixture-b');
      insert into public.ai_messages (user_id, role, content) values ('${a}', 'user', 'fixture-a'), ('${b}', 'user', 'fixture-b');
      -- Reproduce the table grants observed in the production catalog.
      revoke all on public.resources, public.profiles from anon;
      grant all on public.review_states, public.ai_messages, public.resources, public.profiles to authenticated;
      grant all on public.ai_messages to anon;
      grant select on public.resources to anon;
    `)
    const before = await policySnapshot()
    const recordsBefore = await recordSnapshot()
    const fix = await sql('sql/schema/restrict_app_table_grants.sql')
    await db.exec(fix)
    await db.exec(fix)
    assert.deepEqual(await policySnapshot(), before)
    assert.deepEqual(await recordSnapshot(), recordsBefore)
    for (const table of tables) {
      for (const role of ['anon', 'authenticated']) {
        const row = (await db.query(`select has_table_privilege($1, $2, 'TRUNCATE') as truncate,
          has_table_privilege($1, $2, 'REFERENCES') as references,
          has_table_privilege($1, $2, 'TRIGGER') as trigger,
          has_table_privilege($1, $2, 'MAINTAIN') as maintain`, [role, `public.${table}`])).rows[0]
        assert.deepEqual(row, { truncate: false, references: false, trigger: false, maintain: false })
      }
    }

    await db.exec('set role anon;')
    await denied('select * from public.ai_messages')
    await denied('select * from public.review_states')
    await denied('select * from public.profiles')
    await denied('truncate public.ai_messages')
    assert.equal((await db.query('select title from public.resources')).rows.length, 1)

    await asUser(a)
    await ownRows('review_states')
    await ownRows('ai_messages')
    await db.query('insert into public.ai_messages (user_id, role, content) values ($1, $2, $3)', [a, 'user', 'new fixture'])
    await denied(`insert into public.ai_messages (user_id, role, content) values ('${b}', 'user', 'must fail')`)
    await denied("update public.ai_messages set content = 'must fail'")
    await denied('truncate public.ai_messages')
    assert.equal((await db.query('delete from public.ai_messages where user_id=$1 returning id', [b])).rows.length, 0)
    assert.equal((await db.query('delete from public.ai_messages where content=$1 returning id', ['new fixture'])).rows.length, 1)
    await db.exec(`insert into public.review_states (user_id, word_id, proficiency_level) values ('${a}', 'fixture-a', 2)
      on conflict (user_id, word_id) do update set proficiency_level=excluded.proficiency_level;`)
    assert.equal((await db.query("select proficiency_level from public.review_states where word_id='fixture-a'")).rows[0].proficiency_level, 2)
    await denied(`insert into public.review_states (user_id, word_id) values ('${b}', 'must-fail')`)
    assert.equal((await db.query('update public.review_states set proficiency_level=99 where user_id=$1 returning word_id', [b])).rows.length, 0)
    assert.equal((await db.query('delete from public.review_states where user_id=$1 returning word_id', [b])).rows.length, 0)
    assert.deepEqual((await db.query('select id from public.profiles')).rows, [{ id: a }])
    await denied("update public.profiles set role='admin'")
    assert.equal((await db.query("update public.resources set title='must fail' returning id")).rows.length, 0)

    await asUser(admin)
    assert.equal((await db.query("update public.resources set title='admin fixture' where id=1 returning id")).rows.length, 1)
    await db.query("insert into public.resources values (2, 'admin addition')")
    assert.equal((await db.query('delete from public.resources where id=2 returning id')).rows.length, 1)

    await db.exec('reset role;')
    const audit = await db.exec(await sql('sql/audit/app_permissions.sql'))
    assert.ok(audit[0].rows.length >= 10)
    assert.equal(audit[1].rows.length, 2)
    assert.equal(audit[2].rows.length, 2)
    await db.exec('alter table public.ai_messages disable row level security;')
    await assert.rejects(db.exec(fix), /RLS/)
    await db.exec('rollback;')
  } finally { await db.close() }
}, 30000)
