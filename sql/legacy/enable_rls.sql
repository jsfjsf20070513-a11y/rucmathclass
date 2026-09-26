-- 历史 comments 与角色权限脚本，保留原 SQL 供追溯。
-- 包含已退役相册、审核业务的权限，不能整段重跑来修复当前数据库。

alter table "public"."comments" enable row level security;

-- ---------------------------------------------------------------------
-- 1) is_admin() helper
-- ---------------------------------------------------------------------
-- 使用 SECURITY DEFINER 让 RLS 子句无需对 profiles 表设额外读权限即可
-- 查询当前用户角色；STABLE 让 PG 在单条 SQL 内复用结果，避免对每行
-- 评估时重复打 profiles 表。
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('admin', 'super_admin')
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- 2) 清除历史策略，统一重建
-- ---------------------------------------------------------------------
drop policy if exists "Enable read access for all users" on "public"."comments";
drop policy if exists "Public published comments are viewable by everyone" on "public"."comments";
drop policy if exists "Authenticated users can read own ops submissions" on "public"."comments";
drop policy if exists "Authenticated users can read moderation receipts for own ops submissions" on "public"."comments";
drop policy if exists "Admins can read all ops submissions and moderation receipts" on "public"."comments";
drop policy if exists "Enable insert for authenticated users only" on "public"."comments";
drop policy if exists "Authenticated users can insert restricted comments" on "public"."comments";
drop policy if exists "Enable update for users based on user_id" on "public"."comments";
drop policy if exists "Authenticated users can update restricted comments" on "public"."comments";
drop policy if exists "Enable delete for users based on user_id" on "public"."comments";

-- ---------------------------------------------------------------------
-- 3) SELECT 策略
-- ---------------------------------------------------------------------

-- 公开留言：任何访客可读所有"非 OPS"的留言
create policy "Public published comments are viewable by everyone"
on "public"."comments"
as permissive
for select
to public
using (
  album_id is distinct from 0
);

-- 投稿者可以读自己提交的 OPS 草稿
create policy "Authenticated users can read own ops submissions"
on "public"."comments"
as permissive
for select
to authenticated
using (
  album_id = 0
  and auth.uid() = user_id
);

-- 投稿者可以读那些 targetUserId 是自己的审核收据
create policy "Authenticated users can read moderation receipts for own ops submissions"
on "public"."comments"
as permissive
for select
to authenticated
using (
  album_id = 0
  and content like '%"kind":"moderation"%'
  and content like ('%"targetUserId":"' || auth.uid()::text || '"%')
);

-- 管理员可以读所有 OPS 草稿与审核收据（用于后台审核中心）
create policy "Admins can read all ops submissions and moderation receipts"
on "public"."comments"
as permissive
for select
to authenticated
using (
  album_id = 0
  and public.is_admin()
);

-- ---------------------------------------------------------------------
-- 4) INSERT 策略（核心安全加固）
-- ---------------------------------------------------------------------
-- 三类记录分别用 WITH CHECK 表达式区分。`left(content, 19)` 精确匹配
-- OPS 前缀 '__mathclass_ops__::' (19 字符)，避免 LIKE 通配符歧义。
create policy "Authenticated users can insert restricted comments"
on "public"."comments"
as permissive
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (
    -- (A) 普通留言：必须挂在真实相册下，且不能伪装成 OPS 前缀
    (
      album_id is distinct from 0
      and (content is null or left(content, 19) <> '__mathclass_ops__::')
    )
    -- (B) OPS gallery / resource 草稿：任意已登录用户可写，禁止 moderation 关键字
    or (
      album_id = 0
      and left(content, 19) = '__mathclass_ops__::'
      and content not like '%"kind":"moderation"%'
    )
    -- (C) 审核收据：仅管理员可写
    or (
      album_id = 0
      and left(content, 19) = '__mathclass_ops__::'
      and content like '%"kind":"moderation"%'
      and public.is_admin()
    )
  )
);

-- ---------------------------------------------------------------------
-- 5) UPDATE 策略（防止"正常 INSERT 后 UPDATE 篡改"绕过）
-- ---------------------------------------------------------------------
create policy "Authenticated users can update restricted comments"
on "public"."comments"
as permissive
for update
to authenticated
using (
  auth.uid() = user_id
)
with check (
  auth.uid() = user_id
  and (
    (
      album_id is distinct from 0
      and (content is null or left(content, 19) <> '__mathclass_ops__::')
    )
    or (
      album_id = 0
      and left(content, 19) = '__mathclass_ops__::'
      and content not like '%"kind":"moderation"%'
    )
    or (
      album_id = 0
      and left(content, 19) = '__mathclass_ops__::'
      and content like '%"kind":"moderation"%'
      and public.is_admin()
    )
  )
);

-- ---------------------------------------------------------------------
-- 6) DELETE 策略
-- ---------------------------------------------------------------------
-- 普通用户删自己的；管理员可删任何 OPS 区记录（审核驳回流程）
create policy "Enable delete for users based on user_id"
on "public"."comments"
as permissive
for delete
to authenticated
using (
  auth.uid() = user_id
  or (album_id = 0 and public.is_admin())
);

-- ---------------------------------------------------------------------
-- 7) 列级权限：anon 不得读取 user_email（PII —— 全班学号邮箱）
-- ---------------------------------------------------------------------
-- RLS 已对 anon 隐藏 OPS 区行（album_id = 0），但公开留言行若保持默认
-- 全列授权，任何人可用 anon key 直接 `select=user_email` 批量拉取邮箱。
-- 注意：列级授权生效后 anon 的裸 select('*') 会报错，前端公开留言查询
-- 必须显式列出列（见 Comments.jsx）。authenticated 保留默认全列（管理端
-- ManageHub / OPS 协作区需要 user_email，且这些行已有行级策略保护）。
revoke select on public.comments from anon;
grant select (id, album_id, content, user_id, user_nickname, created_at)
  on public.comments to anon;

-- ---------------------------------------------------------------------
-- 8) INSERT 加固：非管理员不得伪造 moderation 信封（2026-06-11 已在线上应用）
-- ---------------------------------------------------------------------
-- 背景：OPS 区（album_id=0）用 content 里的 __mathclass_ops__::{json} 信封承载
-- gallery/resource 投稿与 moderation 审核回执。线上 INSERT 策略原本只校验
-- auth.uid()=user_id，任何登录用户都能插入 kind=moderation 的伪造回执，污染
-- 管理端 ManageHub（admin 可读全部）。此处用 **容忍空格的正则**（不是精确
-- LIKE，避免 `"kind" : "moderation"` 这类带空格绕过)拦截非管理员的 moderation
-- 信封；正则作用于 text 不会抛错，且不误伤正常评论与 gallery/resource 投稿。
-- 注意：线上策略名为 "Users can insert their own comments"（与本文件其它策略名
-- 不完全一致，因线上 DB 是历史演进的混合体）。
alter policy "Users can insert their own comments" on public.comments
with check (
  (auth.uid() = user_id)
  and (
    exists (select 1 from public.profiles
            where profiles.id = auth.uid()
              and profiles.role = any(array['admin'::text, 'super_admin'::text]))
    or content !~ '"kind"[[:space:]]*:[[:space:]]*"moderation"'
  )
);
