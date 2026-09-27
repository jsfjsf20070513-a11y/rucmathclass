-- 只读：现役表及 resources 管理员规则所依赖的 profiles。
-- 只读系统目录，不查询聊天、背词、资源内容或个人资料。
-- 检查时同时看表授权和 RLS；任何一项都不能单独证明最终访问范围。

with targets as (
  select c.oid, c.relname, c.relowner, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and c.relname in ('review_states', 'ai_messages', 'resources', 'profiles')
), facts as (
  select relname::text as table_name, 'table'::text as kind,
    jsonb_build_object('owner', pg_get_userbyid(relowner), 'rls_enabled', relrowsecurity, 'rls_forced', relforcerowsecurity) as details
  from targets
  union all
  select p.tablename, 'policy',
    jsonb_build_object('name', p.policyname, 'roles', p.roles, 'command', p.cmd,
      'permissive', p.permissive, 'using', p.qual, 'with_check', p.with_check)
  from pg_policies p join targets t on t.relname = p.tablename
  where p.schemaname = 'public'
  union all
  select g.table_name::text, 'table_grant',
    jsonb_build_object('role', g.grantee, 'privileges', array_agg(g.privilege_type order by g.privilege_type))
  from information_schema.table_privileges g join targets t on t.relname = g.table_name
  where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'PUBLIC')
  group by g.table_name, g.grantee
  union all
  select g.table_name::text, 'extra_column_grant',
    jsonb_build_object('role', g.grantee, 'column', g.column_name, 'privilege', g.privilege_type)
  from information_schema.column_privileges g join targets t on t.relname = g.table_name
  where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'PUBLIC')
    and not exists (
      select 1 from information_schema.table_privileges p
      where p.table_schema = g.table_schema and p.table_name = g.table_name
        and p.grantee = g.grantee and p.privilege_type = g.privilege_type
    )
)
select * from facts order by table_name, kind, details::text;

select r.rolname, r.rolsuper, r.rolbypassrls, r.rolinherit,
  has_schema_privilege(r.rolname, 'public', 'CREATE') as public_create,
  (select array_agg(parent.rolname order by parent.rolname)
   from pg_auth_members m join pg_roles parent on parent.oid = m.roleid
   where m.member = r.oid) as member_of
from pg_roles r where r.rolname in ('anon', 'authenticated');

-- 新建表的默认授权单独核对，避免只修现有表却漏掉以后的建表行为。
select pg_get_userbyid(d.defaclrole) as object_creator,
  coalesce(n.nspname, '(all schemas)') as schema_name,
  coalesce(r.rolname, 'PUBLIC') as grantee,
  array_agg(a.privilege_type order by a.privilege_type) as new_table_privileges
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
left join pg_roles r on r.oid = a.grantee
where d.defaclobjtype = 'r' and (d.defaclnamespace = 0 or n.nspname = 'public')
  and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))
group by d.defaclrole, n.nspname, r.rolname
order by object_creator, schema_name, grantee;
