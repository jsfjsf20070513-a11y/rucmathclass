-- 生产权限变更，执行需要用户明确授权；前端和 Worker 发布不运行本文件。
-- 根据 2026-09-27 的线上元数据、两仓实际读写操作准备。
-- 执行前先运行 sql/audit/app_permissions.sql，核对当前库和权限是否仍相符。
-- 仅收紧浏览器角色的表授权，不修改记录、RLS 策略、账号或站点归属。
-- 资源管理员仍由原有 profiles.role 策略判断；profiles 当前只允许读自己的资料。

begin;

do $$
begin
  if (
    select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
      and c.relname in ('review_states', 'ai_messages', 'resources', 'profiles')
  ) <> 4 then
    raise exception '目标表缺失或 RLS 未开启；停止修改，请重新只读核验。';
  end if;
end;
$$;

revoke all privileges on table public.review_states, public.ai_messages,
  public.resources, public.profiles from anon, authenticated;

grant select, insert, update, delete on public.review_states to authenticated;
grant select, insert, delete on public.ai_messages to authenticated;
grant select on public.resources to anon;
grant select, insert, update, delete on public.resources to authenticated;
grant select on public.profiles to authenticated;

commit;
