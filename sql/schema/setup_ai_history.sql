-- AI 对话历史表与按账号隔离的策略定义，供核对结构。
-- 依赖 auth.users。执行前必须核对目标库已有表、授权和策略；不能从此文件判断实例是否共享。

create table if not exists public.ai_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role       text        not null,
  content    text        not null,
  created_at timestamptz not null default now(),
  constraint ai_messages_role_check check (role in ('user', 'model')),
  constraint ai_messages_content_len check (char_length(content) <= 20000)
);

-- 按用户 + 时间取历史:where user_id = ? order by created_at
create index if not exists ai_messages_user_idx
  on public.ai_messages (user_id, created_at);

-- 2) Row-level security ------------------------------------------------------
alter table public.ai_messages enable row level security;

-- SELECT: 只读自己的行。
drop policy if exists "ai_messages_select_own" on public.ai_messages;
create policy "ai_messages_select_own"
on public.ai_messages
for select
using ( auth.uid() = user_id );

-- INSERT: 只能创建归属自己的行。
drop policy if exists "ai_messages_insert_own" on public.ai_messages;
create policy "ai_messages_insert_own"
on public.ai_messages
for insert
with check ( auth.uid() = user_id );

-- DELETE: 只能删自己的行(用于「清空历史」)。
drop policy if exists "ai_messages_delete_own" on public.ai_messages;
create policy "ai_messages_delete_own"
on public.ai_messages
for delete
using ( auth.uid() = user_id );

-- 不开放 UPDATE:对话历史只追加/清空,不原地改写。
