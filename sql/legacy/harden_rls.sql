-- 历史综合授权脚本，涉及 comments、profiles、resources 和相册。
-- 会创建、删除和替换多张表的策略，不是当前数据库的权威快照。
-- 依赖目标库已有业务表；不能整段重跑来修复权限，也不能据此认定线上隔离。

create table if not exists public.profiles (
  id uuid not null references auth.users(id) on delete cascade primary key,
  email text,
  role text default 'user' check (role in ('user', 'admin', 'super_admin')),
  created_at timestamptz default now()
);

-- =========================================================================
-- 1. Admin check helpers.  SECURITY DEFINER functions let policies read
--    `public.profiles` without recursively triggering profiles RLS, and
--    they centralise the admin definition so we never need to do JSON
--    LIKE matching against `auth.users.raw_app_meta_data` or trust
--    `auth.jwt()` claims that a client could spoof.
--
--    Both helpers are intentionally NO-argument: they only ever check
--    `auth.uid()`.  This prevents an authenticated client from probing
--    "is user X an admin?" for arbitrary X (which the previous
--    `is_admin(uid uuid default auth.uid())` signature allowed via
--    `select public.is_admin('<someone-elses-uuid>')`).
--
--    Drop any previous parameterised signature first so re-running this
--    script on a project that already has the old function succeeds.
--
--    Idempotency footgun: a prior run of `harden_rls.sql` installed
--    policies in sections 3 and 4 below that call `public.is_admin()`.
--    Under the previous `is_admin(uid uuid default auth.uid())`
--    signature those policies depend on the parameterised function in
--    PostgreSQL's catalog, and `DROP FUNCTION` refuses to run while any
--    dependent policy still exists.  We therefore pre-emptively drop
--    every policy that could hold such a dependency BEFORE dropping
--    the old function (non-CASCADE).  Sections 3 and 4 will re-create
--    these policies further down using the new no-arg signature; the
--    second `drop policy if exists` for each of these names in those
--    sections is a harmless no-op on re-run.
--
--    `is_super_admin(uuid)` was never shipped, so its drop is purely
--    defensive — nothing should depend on it.
-- =========================================================================
drop policy if exists "comments_select_admin_ops"           on public.comments;
drop policy if exists "comments_insert_self"                on public.comments;
-- Historical policy name from an earlier draft of this script.  It is
-- already in the section-3 drop block below, but is repeated here in
-- case a prior database version installed it with a dependency on the
-- old `public.is_admin(uuid)` signature -- the function drop would
-- otherwise fail.
drop policy if exists "comments_insert_moderation_admin_only" on public.comments;
drop policy if exists "comments_update_own"                 on public.comments;
drop policy if exists "comments_delete_own_or_admin"        on public.comments;
drop policy if exists "albums_admin_write"                  on public.albums;
drop policy if exists "album_photos_admin_write"            on public.album_photos;
drop policy if exists "resources_admin_write"               on public.resources;

drop function if exists public.is_admin(uuid);
drop function if exists public.is_super_admin(uuid);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'super_admin'
  );
$$;

revoke all on function public.is_admin()       from public;
revoke all on function public.is_super_admin() from public;
grant execute on function public.is_admin()       to anon, authenticated, service_role;
grant execute on function public.is_super_admin() to anon, authenticated, service_role;

-- =========================================================================
-- 2. profiles
--    - RLS on.
--    - SELECT: own row only (the existing admin policies rely on
--      `EXISTS (... profiles WHERE id = auth.uid())` which is visible
--      to the user themselves, so no broader read is needed).
--    - UPDATE: super_admin only, and the new row must still be a valid
--      role to avoid privilege escalation via UPDATE-with-check.
--    - INSERT/DELETE: handled by the `handle_new_user()` trigger
--      (security definer) and `auth.users` cascade; no client policy.
-- =========================================================================
alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
drop policy if exists "Users can insert their own profile"      on public.profiles;
drop policy if exists "Users can update own profile"            on public.profiles;
drop policy if exists "Users can view own profile"              on public.profiles;
drop policy if exists "Super Admins can update roles"           on public.profiles;
drop policy if exists "profiles_select_own"                     on public.profiles;
drop policy if exists "profiles_update_super_admin"             on public.profiles;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ( auth.uid() = id );

-- Route the super_admin check through `public.is_super_admin()` so the
-- policy does NOT self-reference `public.profiles`.  A bare `select ...
-- from public.profiles` inside a profiles policy is evaluated with this
-- same RLS in force, which at best forces every super_admin write to
-- pass through `profiles_select_own` (subtly correct only for the
-- common case) and at worst triggers recursion errors.  The
-- SECURITY DEFINER helper bypasses RLS on the lookup row and keeps the
-- policy intent explicit.
create policy "profiles_update_super_admin"
on public.profiles
for update
to authenticated
using ( public.is_super_admin() )
with check (
  public.is_super_admin()
  -- Prevent a super_admin from writing an invalid role string.
  and role in ('user', 'admin', 'super_admin')
);

-- =========================================================================
-- 3. comments  (also holds the ops_queue rows on album_id = 0)
--    Frontend contract (src/lib/opsQueue.js, src/components/Comments.jsx):
--      * Public comments are rows with album_id <> 0.
--      * Ops-queue submissions are rows with album_id = 0 and content
--        prefixed by `__mathclass_ops__::{...}`.
--      * Moderation receipts are ops-queue rows whose envelope `kind`
--        is "moderation".  They must NOT be forgeable by ordinary
--        users, otherwise a peer can spoof a "deleted" / "published"
--        notice into someone else's case file.
--
--    2026-09-03: every moderation-marker test below uses the
--    whitespace-tolerant regex
--        content ~ '"kind"[[:space:]]*:[[:space:]]*"moderation"'
--    instead of the exact `like '%"kind":"moderation"%'` that earlier
--    revisions of this file used.  The exact LIKE was bypassable: a client
--    that hand-builds the envelope as `"kind" : "moderation"` (any
--    whitespace around the colon) slipped past the insert guard while the
--    frontend's JSON.parse still decoded it as a moderation receipt.  The
--    regex is the same form the live DB has carried since 2026-06-11
--    (enable_rls.sql section 8); this file now matches it so re-applying
--    harden_rls.sql can no longer downgrade the guard.
-- =========================================================================
alter table public.comments enable row level security;

-- Drop every comments policy this repo has ever named, in any file, so
-- the final state is whatever this script defines.
drop policy if exists "Enable read access for all users"                                            on public.comments;
drop policy if exists "Public published comments are viewable by everyone"                           on public.comments;
drop policy if exists "Authenticated users can read own ops submissions"                             on public.comments;
drop policy if exists "Authenticated users can read moderation receipts for own ops submissions"     on public.comments;
drop policy if exists "Admins can read all ops submissions"                                          on public.comments;
drop policy if exists "Enable insert for authenticated users only"                                   on public.comments;
drop policy if exists "Enable update for users based on user_id"                                     on public.comments;
drop policy if exists "Enable delete for users based on user_id"                                     on public.comments;
drop policy if exists "Users can delete their own comments"                                          on public.comments;
drop policy if exists "Users can delete own comments OR admins can delete any"                       on public.comments;
-- 2026-09-04 线上核查发现的手工第三套策略名(见 sql/audit/comments_permissions.sql),一并纳入 drop 清单,
-- 否则重跑本文件会把它们留在原地、叠加出第二套。
drop policy if exists "Users can insert their own comments"                                          on public.comments;
drop policy if exists "Authenticated users can read own comments or admins can read al"              on public.comments;
drop policy if exists "Users can update their own comments"                                          on public.comments;
drop policy if exists "comments_select_public"                                                       on public.comments;
drop policy if exists "comments_select_own_ops"                                                      on public.comments;
drop policy if exists "comments_select_receipts_for_me"                                              on public.comments;
drop policy if exists "comments_select_admin_ops"                                                    on public.comments;
drop policy if exists "comments_insert_self"                                                         on public.comments;
drop policy if exists "comments_insert_moderation_admin_only"                                        on public.comments;
drop policy if exists "comments_update_own"                                                          on public.comments;
drop policy if exists "comments_delete_own_or_admin"                                                 on public.comments;

-- 2026-09-04:不再创建面向 public/anon 的 SELECT 策略。前端没有公开留言墙
-- (src 里读 comments 的只有 src/lib/opsQueue.js 的管理员事务队列),线上自 2026-09-03
-- 核查起也没有匿名读策略;此前这里的 comments_select_public(album_id <> 0 对所有人可读)
-- 会在重跑时把匿名读重新打开。anon 的列级 SELECT 授权保留在第 5 节,但没有策略放行任何行。

-- SELECT: a contributor sees their own ops-queue rows.
create policy "comments_select_own_ops"
on public.comments
for select
to authenticated
using (
  album_id = 0
  and auth.uid() = user_id
);

-- SELECT: a contributor sees moderation receipts that explicitly target
-- their user id.  Pattern matching on `content` is unavoidable without a
-- schema change (content is a text column), but combined with the
-- moderation-insert policy below, only admins can write rows that
-- satisfy this filter, so the pattern cannot be weaponised by peers.
create policy "comments_select_receipts_for_me"
on public.comments
for select
to authenticated
using (
  album_id = 0
  and content like '\_\_mathclass\_ops\_\_::%' escape '\'
  and content ~ '"kind"[[:space:]]*:[[:space:]]*"moderation"'
  and content like ('%"targetUserId":"' || auth.uid()::text || '"%')
);

-- SELECT: admins can read every ops-queue row (needed by ModerationCenter).
create policy "comments_select_admin_ops"
on public.comments
for select
to authenticated
using (
  album_id = 0
  and public.is_admin()
);

-- INSERT: a user can only insert rows where user_id = auth.uid(), AND
-- moderation envelopes are admin-only.  This is the key hardening: a
-- regular user can no longer forge `__mathclass_ops__::{"kind":"moderation",...}`
-- rows that satisfy `comments_select_receipts_for_me`.
create policy "comments_insert_self"
on public.comments
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    -- Regular comment (any album_id <> 0): unrestricted content.
    album_id is distinct from 0
    or
    -- Ops-queue, non-moderation envelope: anyone may submit gallery /
    -- resource drafts so long as the moderation marker is absent.
    (
      album_id = 0
      and content !~ '"kind"[[:space:]]*:[[:space:]]*"moderation"'
    )
    or
    -- Ops-queue, moderation envelope: admins only.
    (
      album_id = 0
      and content ~ '"kind"[[:space:]]*:[[:space:]]*"moderation"'
      and public.is_admin()
    )
  )
);

-- UPDATE: only the row owner, and they cannot change ownership or
-- escalate a row into a moderation envelope.
create policy "comments_update_own"
on public.comments
for update
to authenticated
using ( auth.uid() = user_id )
with check (
  auth.uid() = user_id
  and (
    album_id is distinct from 0
    or content !~ '"kind"[[:space:]]*:[[:space:]]*"moderation"'
    or public.is_admin()
  )
);

-- DELETE: row owner or admin.
create policy "comments_delete_own_or_admin"
on public.comments
for delete
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin()
);

-- =========================================================================
-- 4. albums / album_photos / resources
--    Public SELECT stays open (these are the published surface);
--    write operations are admin-only and route through is_admin().
-- =========================================================================
alter table public.albums       enable row level security;
alter table public.album_photos enable row level security;
alter table public.resources    enable row level security;

drop policy if exists "Public albums are viewable by everyone"        on public.albums;
drop policy if exists "Admins can manage albums"                       on public.albums;
drop policy if exists "albums_select_public"                           on public.albums;
drop policy if exists "albums_admin_write"                             on public.albums;

create policy "albums_select_public"
on public.albums
for select
to public
using ( true );

create policy "albums_admin_write"
on public.albums
for all
to authenticated
using       ( public.is_admin() )
with check  ( public.is_admin() );

drop policy if exists "Public album photos are viewable by everyone"  on public.album_photos;
drop policy if exists "Admins can manage album photos"                 on public.album_photos;
drop policy if exists "album_photos_select_public"                     on public.album_photos;
drop policy if exists "album_photos_admin_write"                       on public.album_photos;

create policy "album_photos_select_public"
on public.album_photos
for select
to public
using ( true );

create policy "album_photos_admin_write"
on public.album_photos
for all
to authenticated
using       ( public.is_admin() )
with check  ( public.is_admin() );

drop policy if exists "Public resources are viewable by everyone"     on public.resources;
drop policy if exists "Admins can manage resources"                    on public.resources;
drop policy if exists "resources_select_public"                        on public.resources;
drop policy if exists "resources_admin_write"                          on public.resources;

create policy "resources_select_public"
on public.resources
for select
to public
using ( true );

create policy "resources_admin_write"
on public.resources
for all
to authenticated
using       ( public.is_admin() )
with check  ( public.is_admin() );

-- =========================================================================
-- 5. anon role grants (defense in depth).
--    Supabase's PostgREST exposes whatever the anon role has table
--    privileges on, gated by RLS.  We want anon to be able to SELECT
--    the published surfaces only, never write anywhere.
-- =========================================================================
revoke all on public.profiles      from anon;
revoke all on public.comments      from anon;
revoke all on public.albums        from anon;
revoke all on public.album_photos  from anon;
revoke all on public.resources     from anon;

-- comments: column-level grant — anon must NOT read user_email (PII: the
-- student-id mailboxes of the whole class).  RLS already hides ops rows
-- (album_id = 0) from anon, but public comment rows would otherwise expose
-- every commenter's email via a direct PostgREST `select=user_email` call.
-- NOTE: with column-level privileges a bare `select=*` fails for anon, so
-- any frontend read of comments must request columns explicitly (the only
-- live reader today is src/lib/opsQueue.js; the old Comments.jsx is gone).
grant select (id, album_id, content, user_id, user_nickname, created_at)
  on public.comments to anon;
grant select on public.albums       to anon;
grant select on public.album_photos to anon;
grant select on public.resources    to anon;

-- -------------------------------------------------------------------------
-- 2026-09-03: authenticated must NOT read comments.user_email either.
--
-- Gap: earlier revisions of this file gave `authenticated` a table-level
-- SELECT on public.comments while only `anon` got the column-level grant
-- above.  Combined with `comments_select_public` (to public, album_id <> 0)
-- that let ANY self-registered account read every public commenter's
-- user_email via `select=user_email` -- the PII fence only held for
-- logged-out callers.  The live DB never had this exact state (it is a
-- historical hybrid, see docs/mathclass-line-restart-2026-08-13.md and
-- enable_rls.sql section 7), but every time harden_rls.sql was re-applied
-- as the "canonical" state the gap would have re-opened.
--
-- Fix: SELECT for authenticated becomes column-level, identical to anon's
-- list.  INSERT / UPDATE / DELETE stay table-level on purpose:
--   * src/lib/opsQueue.js still writes `user_email: user.email` on insert
--     (the moderation trail needs a contact address the admin can read in
--     the Supabase dashboard).  Write-allowed / read-denied is exactly the
--     shape we want: the column is a server-side record, not a client
--     surface.  A column-level INSERT excluding user_email would break that
--     write with 42501.
--   * UPDATE / DELETE are row-gated by comments_update_own /
--     comments_delete_own_or_admin; the column list is irrelevant there.
--
-- Client contract: with column-level SELECT a bare `select=*` (including
-- the implicit RETURNING of `.insert(...).select()`) fails with 42501 for
-- authenticated as well, so every client read of comments must list its
-- columns explicitly -- see OPS_QUEUE_SELECT_COLUMNS in src/lib/opsQueue.js.
-- The revoke first makes this block idempotent: re-running it never
-- accumulates a table-level SELECT on top of the column grant.
-- -------------------------------------------------------------------------
revoke select on public.comments from authenticated;
grant select (id, album_id, content, user_id, user_nickname, created_at)
  on public.comments to authenticated;
-- 早期给过 ALL,把用不到且绕过 RLS 的 TRUNCATE/TRIGGER/REFERENCES 一并收回(2026-09-04 线上已执行)。
revoke truncate, trigger, references on public.comments from authenticated;
grant insert, update, delete on public.comments      to authenticated;

-- Remaining tables: authenticated retains full DML; RLS policies above
-- are what actually constrain behaviour.
grant select, insert, update, delete on public.albums        to authenticated;
grant select, insert, update, delete on public.album_photos  to authenticated;
grant select, insert, update, delete on public.resources     to authenticated;
grant select, update                 on public.profiles      to authenticated;
