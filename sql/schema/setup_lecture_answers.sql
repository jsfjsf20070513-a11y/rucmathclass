-- 每个账号每天一行。answers 按题号保存选项和作答时间。
begin;

create table if not exists public.lecture_answers (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  day        date        not null,
  answers    jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  constraint lecture_answers_object check (jsonb_typeof(answers) = 'object'),
  constraint lecture_answers_size check (octet_length(answers::text) <= 16384)
);

alter table public.lecture_answers enable row level security;
drop policy if exists lecture_answers_select_own on public.lecture_answers;
create policy lecture_answers_select_own on public.lecture_answers
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists lecture_answers_insert_own on public.lecture_answers;
create policy lecture_answers_insert_own on public.lecture_answers
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists lecture_answers_update_own on public.lecture_answers;
create policy lecture_answers_update_own on public.lecture_answers
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

revoke all on public.lecture_answers from public, anon, authenticated;
grant select, insert, update on public.lecture_answers to authenticated;
commit;
