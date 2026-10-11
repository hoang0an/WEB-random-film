-- Read-only inventory; requires reviewed project/ref outside SQL Editor.
-- Before bootstrap: six application tables must be absent. If any exists, STOP.
begin read only;
select current_database(), current_user, version();
select n.nspname as schema_name,c.relname,c.relrowsecurity,
  has_table_privilege('anon',c.oid,'SELECT') as anon_read,
  has_table_privilege('authenticated',c.oid,'SELECT') as member_read,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as direct_write
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('profiles','groups','members','group_movies','ratings','comments');
select n.nspname as schema_name,p.oid::regprocedure as signature,
  p.prosecdef, p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as member_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('public','private') order by 1,2;
select tgname,tgenabled from pg_trigger where tgrelid='auth.users'::regclass and not tgisinternal;
commit;
-- After baseline/migration: count each of the six tables separately, compare
-- pre/post snapshots. Expected: six RLS=true, anon_read=false, direct_write=false;
-- baseline/new public RPCs member_execute=true and anon_execute=false.
