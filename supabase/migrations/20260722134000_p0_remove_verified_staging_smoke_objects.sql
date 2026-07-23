-- P0 production database recovery: remove only the exact, empty staging smoke
-- replay implementation when it is present. A fully absent pair is a safe no-op.
begin;

do $preflight$
declare
  nonce_table oid := pg_catalog.to_regclass('public.p0_staging_smoke_nonces');
  nonce_rpc oid := pg_catalog.to_regprocedure('public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)');
  nonce_proc pg_catalog.pg_proc%rowtype;
  nonce_rel pg_catalog.pg_class%rowtype;
  actual_columns text[];
  actual_constraints text[];
begin
  if current_user <> 'postgres' then
    raise exception using errcode='55000', message='P0 staging-object cleanup must run as postgres.';
  end if;

  if nonce_table is null and nonce_rpc is null then
    return;
  end if;
  if nonce_table is null or nonce_rpc is null then
    raise exception using errcode='55000', message='Partial staging nonce installation detected.';
  end if;

  select * into nonce_rel from pg_catalog.pg_class where oid=nonce_table;
  if nonce_rel.relkind <> 'r'
    or pg_catalog.pg_get_userbyid(nonce_rel.relowner) <> 'postgres'
    or not nonce_rel.relrowsecurity
    or nonce_rel.relforcerowsecurity
  then
    raise exception using errcode='55000', message='Staging nonce table identity or security metadata drifted.';
  end if;

  select pg_catalog.array_agg(
    a.attname || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text
    order by a.attnum
  ) into actual_columns
  from pg_catalog.pg_attribute a
  where a.attrelid=nonce_table and a.attnum>0 and not a.attisdropped;
  if actual_columns is distinct from array[
    'scope:text:true','nonce_fingerprint:text:true','request_binding:text:true',
    'target_binding:text:true','first_consumed_at:timestamp with time zone:true',
    'expires_at:timestamp with time zone:true'
  ]::text[] then
    raise exception using errcode='55000', message='Staging nonce table columns drifted.';
  end if;

  select pg_catalog.array_agg(conname order by conname) into actual_constraints
  from pg_catalog.pg_constraint where conrelid=nonce_table;
  if actual_constraints is distinct from array[
    'p0_staging_smoke_nonces_nonce_check','p0_staging_smoke_nonces_pkey',
    'p0_staging_smoke_nonces_request_check','p0_staging_smoke_nonces_scope_check',
    'p0_staging_smoke_nonces_target_check','p0_staging_smoke_nonces_time_check'
  ]::text[]
    or not exists (
      select 1 from pg_catalog.pg_constraint
      where conrelid=nonce_table and conname='p0_staging_smoke_nonces_scope_check'
        and pg_catalog.pg_get_expr(conbin,conrelid) like '%p0_staging_smoke_v1%'
    )
    or not exists (
      select 1 from pg_catalog.pg_constraint
      where conrelid=nonce_table and conname='p0_staging_smoke_nonces_target_check'
        and pg_catalog.pg_get_expr(conbin,conrelid) like '%9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e%'
    )
  then
    raise exception using errcode='55000', message='Staging nonce constraints drifted.';
  end if;

  if (select count(*) from pg_catalog.pg_index where indrelid=nonce_table) <> 2
    or not exists (
      select 1 from pg_catalog.pg_index i
      join pg_catalog.pg_class c on c.oid=i.indexrelid
      where i.indrelid=nonce_table and c.relname='p0_staging_smoke_nonces_expires_idx'
        and pg_catalog.pg_get_indexdef(i.indexrelid) like '%(expires_at)%'
    )
  then
    raise exception using errcode='55000', message='Staging nonce indexes drifted.';
  end if;
  if (select count(*) from public.p0_staging_smoke_nonces) <> 0 then
    raise exception using errcode='55000', message='Staging nonce table is not empty.';
  end if;

  select * into nonce_proc from pg_catalog.pg_proc where oid=nonce_rpc;
  if pg_catalog.pg_get_userbyid(nonce_proc.proowner) <> 'postgres'
    or not nonce_proc.prosecdef
    or nonce_proc.provolatile <> 'v'
    or nonce_proc.proisstrict
    or not coalesce(nonce_proc.proconfig,array[]::text[]) @> array['search_path=pg_catalog']::text[]
    or pg_catalog.md5(nonce_proc.prosrc) <> 'd8c167d8460e2aaf4db2541d8870f652'
  then
    raise exception using errcode='55000', message='Staging nonce RPC definition or security metadata drifted.';
  end if;

  if exists (
    select 1
    from pg_catalog.aclexplode(coalesce(nonce_proc.proacl,pg_catalog.acldefault('f',nonce_proc.proowner))) acl
    where acl.privilege_type='EXECUTE' and acl.grantee in (
      0,
      coalesce((select oid from pg_catalog.pg_roles where rolname='anon'),0),
      coalesce((select oid from pg_catalog.pg_roles where rolname='authenticated'),0)
    )
  ) or not exists (
    select 1
    from pg_catalog.aclexplode(coalesce(nonce_proc.proacl,pg_catalog.acldefault('f',nonce_proc.proowner))) acl
    join pg_catalog.pg_roles r on r.oid=acl.grantee
    where acl.privilege_type='EXECUTE' and r.rolname='service_role'
  ) then
    raise exception using errcode='55000', message='Staging nonce RPC ACL drifted.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid<>nonce_rpc and (
      pg_catalog.strpos(p.prosrc,'p0_staging_smoke_nonces')>0
      or pg_catalog.strpos(p.prosrc,'mws_consume_p0_staging_smoke_nonce_v1')>0
    )
  ) or exists (
    select 1 from pg_catalog.pg_views v
    where pg_catalog.strpos(v.definition,'p0_staging_smoke_nonces')>0
       or pg_catalog.strpos(v.definition,'mws_consume_p0_staging_smoke_nonce_v1')>0
  ) or exists (
    select 1 from pg_catalog.pg_constraint c
    where c.confrelid=nonce_table and c.conrelid<>nonce_table
  ) then
    raise exception using errcode='55000', message='Unknown dependency on a staging nonce object exists.';
  end if;
end
$preflight$;

drop function if exists public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text);
drop table if exists public.p0_staging_smoke_nonces;

do $postcondition$
begin
  if pg_catalog.to_regclass('public.p0_staging_smoke_nonces') is not null
    or pg_catalog.to_regprocedure('public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)') is not null
  then
    raise exception using errcode='55000', message='A staging nonce object remains after cleanup.';
  end if;
end
$postcondition$;

commit;
