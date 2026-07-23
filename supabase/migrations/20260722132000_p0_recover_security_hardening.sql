-- P0 production database recovery: role-helper search paths and least-privilege EXECUTE ACLs.
-- Existing helper bodies are preserved; the migration stops when their proven definitions drift.
begin;

do $preflight$
declare
  target record;
  proc record;
begin
  if current_user <> 'postgres' then
    raise exception using errcode='55000', message='P0 production database recovery must run as postgres.';
  end if;
  for target in select * from (values
    ('public.current_app_role()', $expected$
  select coalesce(p.role, 'anonymous')
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') in ('active', 'invited')
  limit 1
$expected$),
    ('public.current_profile_id()', $expected$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') in ('active', 'invited')
  limit 1
$expected$),
    ('public.has_app_role(text[])', $expected$
  select coalesce(public.current_app_role(), 'anonymous') = any(allowed_roles)
$expected$),
    ('public.is_admin_role()', $expected$
  select public.has_app_role(array['super_admin', 'admin'])
$expected$),
    ('public.is_demo_context()', $expected$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.status, 'active') = 'active'
      and (
        p.role = 'demo_user'
        or coalesce(p.is_demo, false) = true
        or coalesce(p.environment, '') = 'demo'
      )
  )
$expected$),
    ('public.is_demo_record(boolean,text)', $expected$
  select public.is_demo_context()
    and (coalesce(record_is_demo, false) = true or coalesce(record_environment, '') = 'demo')
$expected$),
    ('public.is_staff_role()', $expected$
  select public.has_app_role(array[
    'super_admin',
    'admin',
    'sales_manager',
    'sales_partner',
    'designer',
    'developer',
    'support'
  ])
$expected$),
    ('public.owns_customer(uuid)', $expected$
  select target_customer_id is not null
    and exists (
      select 1
      from public.customers c
      where c.id = target_customer_id
        and coalesce(c.status, 'active') <> 'archived'
        and (
          c.auth_user_id = auth.uid()
          or c.profile_id = public.current_profile_id()
        )
    )
$expected$)
  ) as expected(signature, body)
  loop
    select p.oid, p.prosrc, p.prosecdef, p.provolatile, p.proconfig, r.rolname as owner
      into proc
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid=p.proowner
    where p.oid=to_regprocedure(target.signature);
    if not found or proc.owner <> 'postgres' or not proc.prosecdef or proc.provolatile <> 's'
      or btrim(proc.prosrc) is distinct from btrim(target.body)
      or not (coalesce(proc.proconfig,array[]::text[]) && array['search_path=public','search_path=pg_catalog']::text[])
    then
      raise exception using errcode='55000', message=format('Role helper precondition failed: %s.', target.signature);
    end if;
  end loop;
  if exists (
    select 1 from unnest(array[
      'public.mws_normalize_company_name(text)','public.mws_normalize_domain(text)',
      'public.mws_normalize_phone(text)','public.set_updated_at()'
    ]) signature where to_regprocedure(signature) is null
  ) then
    raise exception using errcode='55000', message='Required internal helper is missing.';
  end if;
end
$preflight$;

alter function public.current_app_role() set search_path to 'pg_catalog';
alter function public.current_profile_id() set search_path to 'pg_catalog';
alter function public.has_app_role(text[]) set search_path to 'pg_catalog';
alter function public.is_admin_role() set search_path to 'pg_catalog';
alter function public.is_demo_context() set search_path to 'pg_catalog';
alter function public.is_demo_record(boolean,text) set search_path to 'pg_catalog';
alter function public.is_staff_role() set search_path to 'pg_catalog';
alter function public.owns_customer(uuid) set search_path to 'pg_catalog';

revoke execute on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated, service_role;
revoke execute on function public.current_profile_id() from public, anon;
grant execute on function public.current_profile_id() to authenticated, service_role;
revoke execute on function public.has_app_role(text[]) from public, anon;
grant execute on function public.has_app_role(text[]) to authenticated, service_role;
revoke execute on function public.is_admin_role() from public, anon;
grant execute on function public.is_admin_role() to authenticated, service_role;
revoke execute on function public.is_demo_context() from public, anon;
grant execute on function public.is_demo_context() to authenticated, service_role;
revoke execute on function public.is_demo_record(boolean,text) from public, anon;
grant execute on function public.is_demo_record(boolean,text) to authenticated, service_role;
revoke execute on function public.is_staff_role() from public, anon;
grant execute on function public.is_staff_role() to authenticated, service_role;
revoke execute on function public.owns_customer(uuid) from public, anon;
grant execute on function public.owns_customer(uuid) to authenticated, service_role;

do $acl$
declare
  signature text;
begin
  foreach signature in array array[
    'public.mws_normalize_company_name(text)','public.mws_normalize_domain(text)',
    'public.mws_normalize_phone(text)','public.set_updated_at()',
    'public.guard_email_log_snapshot()','public.set_email_log_updated_at()'
  ]
  loop
    if to_regprocedure(signature) is not null then
      if (select r.rolname from pg_catalog.pg_proc p join pg_catalog.pg_roles r on r.oid=p.proowner where p.oid=to_regprocedure(signature)) <> 'postgres' then
        raise exception using errcode='55000', message=format('Internal helper owner drift: %s.', signature);
      end if;
      execute format('revoke execute on function %s from public, anon, authenticated', signature);
      execute format('grant execute on function %s to service_role', signature);
    end if;
  end loop;
end
$acl$;

commit;
