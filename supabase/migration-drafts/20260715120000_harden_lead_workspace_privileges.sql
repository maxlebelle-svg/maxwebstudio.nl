-- Max Webstudio - Lead workspace privilege hardening
-- SECURITY MIGRATION DRAFT - DO NOT APPLY WITHOUT THE PRODUCTION RUNBOOK.
-- Scope: remove proven non-row-scoped browser-role privileges and restrict the
-- six SECURITY DEFINER RLS helpers to the roles that demonstrably need them.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $preflight$
declare
  missing_roles text[];
  missing_functions text[];
  unsafe_functions text[];
begin
  select array_agg(required_role order by required_role)
  into missing_roles
  from unnest(array['anon', 'authenticated', 'service_role']) required_role
  where not exists (select 1 from pg_roles where rolname = required_role);

  if missing_roles is not null then
    raise exception 'Privilege hardening aborted: missing roles %', missing_roles;
  end if;

  if to_regclass('public.leads') is null
     or to_regclass('public.customer_timeline_events') is null then
    raise exception 'Privilege hardening aborted: required lead workspace tables are missing';
  end if;

  if has_schema_privilege('anon', 'public', 'CREATE')
     or has_schema_privilege('authenticated', 'public', 'CREATE') then
    raise exception 'Privilege hardening aborted: browser role has CREATE on schema public; investigate separately';
  end if;

  if not has_schema_privilege('anon', 'public', 'USAGE')
     or not has_schema_privilege('authenticated', 'public', 'USAGE')
     or not has_schema_privilege('service_role', 'public', 'USAGE') then
    raise exception 'Privilege hardening aborted: required schema public USAGE is missing';
  end if;

  if exists (
    select 1
    from unnest(array['public.leads'::regclass, 'public.customer_timeline_events'::regclass]) target(relid)
    join pg_class c on c.oid = target.relid
    where not c.relrowsecurity
  ) then
    raise exception 'Privilege hardening aborted: RLS is not enabled on every target table';
  end if;

  if exists (
    select 1
    from unnest(array['public.leads'::regclass, 'public.customer_timeline_events'::regclass]) target(relid)
    where not exists (select 1 from pg_policy p where p.polrelid = target.relid)
  ) then
    raise exception 'Privilege hardening aborted: a target table has no RLS policy';
  end if;

  if exists (
    select 1
    from unnest(array['SELECT', 'INSERT', 'UPDATE']) privilege_name
    where not has_table_privilege('authenticated', 'public.leads', privilege_name)
  ) then
    raise exception 'Privilege hardening aborted: authenticated Leads flow lacks SELECT, INSERT or UPDATE';
  end if;

  if exists (
    select 1
    from (values
      ('public.leads', 'SELECT'), ('public.leads', 'INSERT'), ('public.leads', 'UPDATE'),
      ('public.customer_timeline_events', 'SELECT'), ('public.customer_timeline_events', 'INSERT'),
      ('public.customer_timeline_events', 'UPDATE'), ('public.customer_timeline_events', 'DELETE')
    ) required(table_name, privilege_name)
    where not has_table_privilege('service_role', table_name, privilege_name)
  ) then
    raise exception 'Privilege hardening aborted: required service_role table privileges are missing';
  end if;

  -- A grant to PUBLIC would survive role-specific revokes and is outside the
  -- proven production finding, so fail closed instead of broadening this patch.
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
    where c.oid in ('public.leads'::regclass, 'public.customer_timeline_events'::regclass)
      and acl.grantee = 0
      and acl.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
  ) then
    raise exception 'Privilege hardening aborted: PUBLIC has a forbidden target-table privilege';
  end if;

  select array_agg(signature order by signature)
  into missing_functions
  from unnest(array[
    'public.current_app_role()',
    'public.current_profile_id()',
    'public.has_app_role(text[])',
    'public.is_admin_role()',
    'public.is_staff_role()',
    'public.owns_commercial_record(uuid)'
  ]) signature
  where to_regprocedure(signature) is null;

  if missing_functions is not null then
    raise exception 'Privilege hardening aborted: missing helper functions %', missing_functions;
  end if;

  select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text)
  into unsafe_functions
  from pg_proc p
  where p.oid = any(array[
    'public.current_app_role()'::regprocedure,
    'public.current_profile_id()'::regprocedure,
    'public.has_app_role(text[])'::regprocedure,
    'public.is_admin_role()'::regprocedure,
    'public.is_staff_role()'::regprocedure,
    'public.owns_commercial_record(uuid)'::regprocedure
  ])
    and (
      not p.prosecdef
      or not exists (
        select 1
        from unnest(coalesce(p.proconfig, array[]::text[])) setting
        where replace(setting, ' ', '') in ('search_path=public', 'search_path=public,pg_temp')
      )
    );

  if unsafe_functions is not null then
    raise exception 'Privilege hardening aborted: helper is not SECURITY DEFINER with a fixed safe search_path %', unsafe_functions;
  end if;
end
$preflight$;

revoke truncate, references, trigger on table public.leads from anon, authenticated;
revoke truncate, references, trigger on table public.customer_timeline_events from anon, authenticated;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.current_profile_id() from public, anon;
revoke execute on function public.has_app_role(text[]) from public, anon;
revoke execute on function public.is_admin_role() from public, anon;
revoke execute on function public.is_staff_role() from public, anon;
revoke execute on function public.owns_commercial_record(uuid) from public, anon;

-- These helpers are called by authenticated RLS policies. Explicit grants also
-- make the intended ACL independent of PostgreSQL's default PUBLIC EXECUTE.
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.has_app_role(text[]) to authenticated, service_role;
grant execute on function public.is_admin_role() to authenticated, service_role;
grant execute on function public.is_staff_role() to authenticated, service_role;
grant execute on function public.owns_commercial_record(uuid) to authenticated, service_role;

do $postcheck$
declare
  forbidden_count integer;
  invalid_function_count integer;
begin
  select count(*)
  into forbidden_count
  from unnest(array['anon', 'authenticated']) role_name
  cross join unnest(array['public.leads', 'public.customer_timeline_events']) table_name
  cross join unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER']) privilege_name
  where has_table_privilege(role_name, table_name, privilege_name);

  if forbidden_count <> 0 then
    raise exception 'Privilege hardening failed: % forbidden effective table privileges remain', forbidden_count;
  end if;

  if has_schema_privilege('anon', 'public', 'CREATE')
     or has_schema_privilege('authenticated', 'public', 'CREATE') then
    raise exception 'Privilege hardening failed: browser role still has CREATE on schema public';
  end if;

  if exists (
    select 1
    from (values
      ('authenticated', 'public.leads', 'SELECT'),
      ('authenticated', 'public.leads', 'INSERT'),
      ('authenticated', 'public.leads', 'UPDATE'),
      ('service_role', 'public.leads', 'SELECT'),
      ('service_role', 'public.leads', 'INSERT'),
      ('service_role', 'public.leads', 'UPDATE'),
      ('service_role', 'public.customer_timeline_events', 'SELECT'),
      ('service_role', 'public.customer_timeline_events', 'INSERT'),
      ('service_role', 'public.customer_timeline_events', 'UPDATE'),
      ('service_role', 'public.customer_timeline_events', 'DELETE')
    ) required(role_name, table_name, privilege_name)
    where not has_table_privilege(role_name, table_name, privilege_name)
  ) then
    raise exception 'Privilege hardening failed: a required table privilege was lost';
  end if;

  select count(*)
  into invalid_function_count
  from unnest(array[
    'public.current_app_role()',
    'public.current_profile_id()',
    'public.has_app_role(text[])',
    'public.is_admin_role()',
    'public.is_staff_role()',
    'public.owns_commercial_record(uuid)'
  ]) signature
  where has_function_privilege('anon', signature, 'EXECUTE')
     or not has_function_privilege('authenticated', signature, 'EXECUTE')
     or not has_function_privilege('service_role', signature, 'EXECUTE');

  if invalid_function_count <> 0 then
    raise exception 'Privilege hardening failed: % helper function ACLs are unsafe', invalid_function_count;
  end if;
end
$postcheck$;

commit;

-- Rollback guidance (security approval required): application rollback needs no
-- database rollback. Regranting the removed table privileges or PUBLIC/anon
-- function EXECUTE would restore the proven exposure and is not recommended.
-- If an independently approved ACL snapshot proves a grant was intentional,
-- restore only that exact grant in a new, reviewed transaction.
