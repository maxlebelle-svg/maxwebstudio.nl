\set ON_ERROR_STOP on
select coalesce(pg_catalog.json_agg(row_data order by function_name), '[]'::json)::text
from (
  select
    p.proname as function_name,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) as result_type,
    l.lanname as language,
    p.provolatile,
    p.proisstrict,
    p.proparallel,
    p.proleakproof,
    p.prosecdef,
    r.rolname as owner,
    p.proconfig,
    p.proacl::text as acl,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p.prosrc, 'UTF8'), 'sha256'), 'hex') as body_sha256,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(p.oid), 'UTF8'), 'sha256'), 'hex') as definition_sha256
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'
    and (p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)) in (
      ('current_app_role',''),
      ('current_profile_id',''),
      ('has_app_role','allowed_roles text[]'),
      ('is_admin_role',''),
      ('is_demo_context',''),
      ('is_demo_record','record_is_demo boolean, record_environment text'),
      ('is_staff_role',''),
      ('owns_customer','target_customer_id uuid')
    )
) row_data;
