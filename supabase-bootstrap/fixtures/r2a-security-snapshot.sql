\set ON_ERROR_STOP on
with target_names(name) as (
  values ('current_app_role'),('current_profile_id'),('has_app_role'),('is_admin_role'),('is_demo_context'),('is_demo_record'),('is_staff_role'),('owns_customer')
),
non_target_definers as (
  select p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as args, p.proconfig, p.proacl::text as acl,
         r.rolname as owner, pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  join pg_catalog.pg_roles r on r.oid=p.proowner
  where n.nspname='public' and p.prosecdef and p.proname not in (select name from target_names)
  order by p.proname, args
),
policies as (
  select n.nspname, c.relname, p.polname, p.polcmd, p.polpermissive, p.polroles::text,
         pg_catalog.pg_get_expr(p.polqual,p.polrelid) as using_expression,
         pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid) as check_expression
  from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  order by n.nspname,c.relname,p.polname
),
rls as (
  select n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and n.nspname in ('public','storage')
  order by n.nspname,c.relname
),
table_acl as (
  select n.nspname,c.relname,c.relacl::text
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p','S') and n.nspname='public'
  order by c.relkind,n.nspname,c.relname
),
buckets as (
  select id,name,public,file_size_limit,allowed_mime_types from storage.buckets order by id
),
policy_references as (
  select p.oid
  from pg_catalog.pg_policy p
  where exists (
    select 1 from target_names t
    where pg_catalog.strpos(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),t.name)>0
       or pg_catalog.strpos(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),t.name)>0
  )
)
select pg_catalog.json_build_object(
  'non_target_definers_sha256', pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.json_agg(x)::text from non_target_definers x),'[]'),'UTF8'),'sha256'),'hex'),
  'policies_sha256', pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.json_agg(x)::text from policies x),'[]'),'UTF8'),'sha256'),'hex'),
  'policy_count', (select count(*) from policies),
  'target_policy_reference_count', (select count(*) from policy_references),
  'rls_sha256', pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.json_agg(x)::text from rls x),'[]'),'UTF8'),'sha256'),'hex'),
  'table_acl_sha256', pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.json_agg(x)::text from table_acl x),'[]'),'UTF8'),'sha256'),'hex'),
  'buckets_sha256', pg_catalog.encode(extensions.digest(pg_catalog.convert_to(coalesce((select pg_catalog.json_agg(x)::text from buckets x),'[]'),'UTF8'),'sha256'),'hex'),
  'storage_object_count', (select count(*) from storage.objects),
  'auth_user_count', (select count(*) from auth.users)
)::text;
