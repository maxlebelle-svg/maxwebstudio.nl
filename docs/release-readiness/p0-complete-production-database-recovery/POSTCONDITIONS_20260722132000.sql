\set ON_ERROR_STOP on
begin read only;
do $$
declare
  target record;
  proc record;
begin
  for target in select * from (values
    ('public.current_app_role()', '6322fb41da9ce9f41bebd2e6cbcada75'),
    ('public.current_profile_id()', 'b19e72feb01c693cd9ac50c43cd84fe8'),
    ('public.has_app_role(text[])', '758e7890a2e5c5462b9aceaefd1e7075'),
    ('public.is_admin_role()', 'fbce955c11004112e48397b6739fbda9'),
    ('public.is_demo_context()', 'b3377b8c97c3bab2bdda601a723ffdd6'),
    ('public.is_demo_record(boolean,text)', '3b8ce552ce6250a304145c1dbfe668dd'),
    ('public.is_staff_role()', '32c3b54fabca5c307ed46c31a848d849'),
    ('public.owns_customer(uuid)', 'd645be607b2452ebab4361d7d0ff6ef3')
  ) expected(signature, body_md5)
  loop
    select p.oid, p.proowner, p.prosecdef, p.provolatile, p.proconfig, p.proacl,
      owner.rolname owner, md5(btrim(p.prosrc)) body_md5
    into proc
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles owner on owner.oid=p.proowner
    where p.oid=to_regprocedure(target.signature);

    if not found or proc.owner <> 'postgres' or not proc.prosecdef or proc.provolatile <> 's'
      or proc.body_md5 <> target.body_md5
      or not coalesce(proc.proconfig,array[]::text[]) @> array['search_path=pg_catalog']::text[]
      or not pg_catalog.has_function_privilege('authenticated',proc.oid,'EXECUTE')
      or not pg_catalog.has_function_privilege('service_role',proc.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('anon',proc.oid,'EXECUTE')
      or exists (
        select 1
        from pg_catalog.aclexplode(coalesce(proc.proacl,pg_catalog.acldefault('f',proc.proowner))) acl
        where acl.grantee=0 and acl.privilege_type='EXECUTE'
      )
    then
      raise exception using errcode='55000', message=format('Role-helper security postcondition failed: %s.',target.signature);
    end if;
  end loop;
end
$$;
rollback;
