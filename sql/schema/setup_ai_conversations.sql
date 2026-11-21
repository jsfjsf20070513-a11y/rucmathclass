-- 依赖 setup_ai_history.sql。分段、迁移旧消息和授权在同一事务内生效。
begin;

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legacy_day date,
  unique (user_id, id),
  unique (user_id, legacy_day)
);

alter table public.ai_messages add column if not exists conversation_id uuid;

-- 旧版没有段号。北京时间同一天、同一账号的消息保留原有顺序，标题取第一条提问。
with old as (
  select *, (created_at at time zone 'Asia/Shanghai')::date as day
  from public.ai_messages where conversation_id is null
), titles as (
  select distinct on (user_id, day) user_id, day,
    nullif(left(trim(split_part(content, E'\n[此问题附有图片', 1)), 200), '') as title
  from old where role = 'user' order by user_id, day, created_at, id
)
insert into public.ai_conversations (user_id, legacy_day, title, created_at, updated_at)
select o.user_id, o.day, coalesce(t.title, '对话'), min(o.created_at), max(o.created_at)
from old o left join titles t using (user_id, day)
group by o.user_id, o.day, t.title;

update public.ai_messages m set conversation_id = c.id
from public.ai_conversations c
where m.conversation_id is null and c.user_id = m.user_id
  and c.legacy_day = (m.created_at at time zone 'Asia/Shanghai')::date;

alter table public.ai_messages alter column conversation_id set not null;
alter table public.ai_messages drop constraint if exists ai_messages_conversation_owner;
alter table public.ai_messages add constraint ai_messages_conversation_owner
  foreign key (user_id, conversation_id) references public.ai_conversations (user_id, id) on delete cascade;

create index if not exists ai_conversations_recent_idx on public.ai_conversations (user_id, updated_at desc, id desc);
create index if not exists ai_messages_thread_idx on public.ai_messages (user_id, conversation_id, created_at desc, id desc);

alter table public.ai_conversations enable row level security;
drop policy if exists ai_conversations_select_own on public.ai_conversations;
create policy ai_conversations_select_own on public.ai_conversations
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists ai_conversations_insert_own on public.ai_conversations;
create policy ai_conversations_insert_own on public.ai_conversations
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists ai_conversations_update_own on public.ai_conversations;
create policy ai_conversations_update_own on public.ai_conversations
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists ai_conversations_delete_own on public.ai_conversations;
create policy ai_conversations_delete_own on public.ai_conversations
  for delete to authenticated using (auth.uid() = user_id);

revoke all on public.ai_conversations from public, anon, authenticated;
grant select, insert, delete, update (updated_at) on public.ai_conversations to authenticated;

-- 迁移时仍开着的旧页面可能继续写入不带段号的消息。
create or replace function public.assign_legacy_ai_conversation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.ai_conversations (user_id, title, legacy_day, created_at, updated_at)
  values (new.user_id, coalesce(nullif(left(trim(new.content), 200), ''), '对话'),
    (new.created_at at time zone 'Asia/Shanghai')::date, new.created_at, new.created_at)
  on conflict (user_id, legacy_day) do update
    set updated_at = greatest(ai_conversations.updated_at, excluded.updated_at)
  returning id into new.conversation_id;
  return new;
end;
$$;
revoke all on function public.assign_legacy_ai_conversation() from public, anon, authenticated;
drop trigger if exists ai_messages_assign_legacy on public.ai_messages;
create trigger ai_messages_assign_legacy before insert on public.ai_messages
  for each row when (new.conversation_id is null) execute function public.assign_legacy_ai_conversation();

-- 收到完整回答后才落库。首轮建段、两条消息和目录时间一起提交。
create or replace function public.save_ai_turn(p_user_id uuid, p_id uuid, p_title text, p_question text, p_reply text)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved_at timestamptz;
begin
  if p_user_id is distinct from owner_id then
    raise exception 'Account changed' using errcode = '42501';
  end if;
  if p_title is not null then
    insert into public.ai_conversations (id, user_id, title)
      values (p_id, owner_id, p_title) on conflict (id) do nothing;
  end if;
  update public.ai_conversations
    set updated_at = greatest(clock_timestamp(), updated_at + interval '2 microseconds')
    where user_id = owner_id and id = p_id returning updated_at into strict saved_at;
  insert into public.ai_messages (user_id, conversation_id, role, content, created_at)
    values (owner_id, p_id, 'user', p_question, saved_at - interval '1 microsecond'),
           (owner_id, p_id, 'model', p_reply, saved_at);
  return saved_at;
end;
$$;
revoke all on function public.save_ai_turn(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.save_ai_turn(uuid, uuid, text, text, text) to authenticated;

commit;
