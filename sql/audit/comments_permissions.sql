-- 只读核查 comments 的列授权、表授权与行策略。
-- 以下三条 SELECT 展示执行时当前角色可见的配置，不记录也不证明此前生产状态。
-- 检查时要同时看表级 SELECT 与列级 SELECT：表级授权可能覆盖列级限制。
-- 不执行任何授权修改；是否允许某类访问，还需结合目标库的实际业务边界判断。

select grantee, column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'comments'
order by 1, 2;

-- ② 表级授权(表级 SELECT 会覆盖列级限制)
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'comments'
order by 1, 2;

-- ③ 行级策略(名字、角色、命令、USING、WITH CHECK)
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'comments'
order by cmd, policyname;
