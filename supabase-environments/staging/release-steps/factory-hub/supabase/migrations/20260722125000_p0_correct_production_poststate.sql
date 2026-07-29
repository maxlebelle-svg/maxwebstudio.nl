-- P0 production poststate correction.
-- Adds only the three proven legacy aliases, preserves source/external_source as independent
-- domain fields, and removes the exact staging-only smoke nonce implementation.
-- Migration history, including 20260721050000, is intentionally not rewritten.

begin;

do $preflight$
declare
  latest text;
  nonce_table oid := pg_catalog.to_regclass('public.p0_staging_smoke_nonces');
  nonce_rpc oid := pg_catalog.to_regprocedure('public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)');
  nonce_proc pg_catalog.pg_proc%rowtype;
  nonce_rel pg_catalog.pg_class%rowtype;
  expected_columns text[] := array[
    'scope:text:true',
    'nonce_fingerprint:text:true',
    'request_binding:text:true',
    'target_binding:text:true',
    'first_consumed_at:timestamp with time zone:true',
    'expires_at:timestamp with time zone:true'
  ];
  actual_columns text[];
  expected_constraints text[] := array[
    'p0_staging_smoke_nonces_nonce_check',
    'p0_staging_smoke_nonces_pkey',
    'p0_staging_smoke_nonces_request_check',
    'p0_staging_smoke_nonces_scope_check',
    'p0_staging_smoke_nonces_target_check',
    'p0_staging_smoke_nonces_time_check'
  ];
  actual_constraints text[];
begin
  if current_user <> 'postgres' then
    raise exception using errcode='55000', message='P0 poststate correction must run as postgres.';
  end if;

  select max(version) into latest from supabase_migrations.schema_migrations;
  if latest is distinct from '20260721050000' then
    raise exception using errcode='55000',
      message=pg_catalog.format('Expected proven poststate baseline 20260721050000; found %s.',coalesce(latest,'<none>'));
  end if;
  if exists (
    select 1 from supabase_migrations.schema_migrations
    where version in ('20260722120000','20260722121000','20260722122000','20260722123000','20260722124000','20260722125000')
  ) then
    raise exception using errcode='55000', message='A superseded reconciliation or correction version is already registered.';
  end if;

  if pg_catalog.to_regclass('public.leads') is null then
    raise exception using errcode='55000', message='Required table public.leads is missing.';
  end if;
  if exists (
    select 1 from (values
      ('company','text'),('name','text'),('website_url','text'),
      ('source','text'),('external_source','text'),('external_source_id','text')
    ) required(name,type)
    where not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid='public.leads'::regclass and a.attname=required.name
        and a.attnum>0 and not a.attisdropped
        and pg_catalog.format_type(a.atttypid,a.atttypmod)=required.type
    )
  ) then
    raise exception using errcode='55000', message='Required V2/source lead columns are missing or drifted.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid='public.leads'::regclass and a.attname in ('company_name','contact_name','website')
      and a.attnum>0 and not a.attisdropped
  ) then
    raise exception using errcode='55000', message='One or more legacy alias columns already exist.';
  end if;
  if pg_catalog.to_regprocedure('public.mws_sync_lead_legacy_aliases_v1()') is not null
    or exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.leads'::regclass and tgname='sync_lead_legacy_aliases_v1' and not tgisinternal)
  then
    raise exception using errcode='55000', message='Legacy alias synchronization already exists.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid='public.leads'::regclass and tgname='set_leads_updated_at'
      and not tgisinternal and tgenabled='O'
  ) then
    raise exception using errcode='55000', message='Expected enabled set_leads_updated_at trigger is missing.';
  end if;

  perform pg_catalog.set_config(
    'p0_poststate_correction.preexisting_lead_digest',
    coalesce((
      select pg_catalog.md5(pg_catalog.string_agg(pg_catalog.to_jsonb(l)::text,'|' order by l.id))
      from public.leads l
    ),'EMPTY'),true
  );
  perform pg_catalog.set_config(
    'p0_poststate_correction.source_semantics_digest',
    coalesce((
      select pg_catalog.md5(pg_catalog.string_agg(
        pg_catalog.jsonb_build_array(id,external_source,external_source_id,source)::text,'|' order by id))
      from public.leads
    ),'EMPTY'),true
  );

  if nonce_table is null or nonce_rpc is null then
    raise exception using errcode='55000', message='The exact staging nonce table and RPC must both exist.';
  end if;

  select * into nonce_rel from pg_catalog.pg_class where oid=nonce_table;
  if nonce_rel.relkind <> 'r' or pg_catalog.pg_get_userbyid(nonce_rel.relowner) <> 'postgres'
    or not nonce_rel.relrowsecurity or nonce_rel.relforcerowsecurity
  then
    raise exception using errcode='55000', message='Staging nonce table owner, type or RLS state drifted.';
  end if;
  if exists (
    select 1 from pg_catalog.aclexplode(coalesce(nonce_rel.relacl,pg_catalog.acldefault('r',nonce_rel.relowner))) acl
    where acl.grantee in (
      0,
      coalesce((select oid from pg_catalog.pg_roles where rolname='anon'),0),
      coalesce((select oid from pg_catalog.pg_roles where rolname='authenticated'),0),
      coalesce((select oid from pg_catalog.pg_roles where rolname='service_role'),0)
    )
  ) then
    raise exception using errcode='55000', message='Unexpected staging nonce table privilege exists.';
  end if;

  select pg_catalog.array_agg(
    a.attname || ':' || pg_catalog.format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text
    order by a.attnum
  ) into actual_columns
  from pg_catalog.pg_attribute a
  where a.attrelid=nonce_table and a.attnum>0 and not a.attisdropped;
  if actual_columns is distinct from expected_columns then
    raise exception using errcode='55000', message='Staging nonce table columns drifted.';
  end if;

  select pg_catalog.array_agg(conname order by conname) into actual_constraints
  from pg_catalog.pg_constraint where conrelid=nonce_table;
  if actual_constraints is distinct from expected_constraints
    or not exists (select 1 from pg_catalog.pg_constraint where conrelid=nonce_table and conname='p0_staging_smoke_nonces_pkey' and contype='p')
    or not exists (select 1 from pg_catalog.pg_constraint where conrelid=nonce_table and conname='p0_staging_smoke_nonces_scope_check' and pg_catalog.pg_get_expr(conbin,conrelid) like '%p0_staging_smoke_v1%')
    or not exists (select 1 from pg_catalog.pg_constraint where conrelid=nonce_table and conname='p0_staging_smoke_nonces_target_check' and pg_catalog.pg_get_expr(conbin,conrelid) like '%9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e%')
    or not exists (select 1 from pg_catalog.pg_constraint where conrelid=nonce_table and conname='p0_staging_smoke_nonces_time_check' and (pg_catalog.pg_get_expr(conbin,conrelid) like '%1 hour%' or pg_catalog.pg_get_expr(conbin,conrelid) like '%01:00:00%'))
  then
    raise exception using errcode='55000', message='Staging nonce constraints drifted.';
  end if;
  if (select count(*) from pg_catalog.pg_index where indrelid=nonce_table) <> 2
    or not exists (
      select 1 from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid
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
    or not nonce_proc.prosecdef or nonce_proc.provolatile <> 'v' or nonce_proc.proisstrict
    or not coalesce(nonce_proc.proconfig,array[]::text[]) @> array['search_path=pg_catalog']::text[]
    or pg_catalog.md5(nonce_proc.prosrc) <> 'd8c167d8460e2aaf4db2541d8870f652'
  then
    raise exception using errcode='55000', message='Staging nonce RPC definition or security metadata drifted.';
  end if;
  if exists (
    select 1 from pg_catalog.aclexplode(coalesce(nonce_proc.proacl,pg_catalog.acldefault('f',nonce_proc.proowner))) acl
    where acl.privilege_type='EXECUTE' and acl.grantee in (
      0,
      coalesce((select oid from pg_catalog.pg_roles where rolname='anon'),0),
      coalesce((select oid from pg_catalog.pg_roles where rolname='authenticated'),0)
    )
  ) or not exists (
    select 1 from pg_catalog.aclexplode(coalesce(nonce_proc.proacl,pg_catalog.acldefault('f',nonce_proc.proowner))) acl
    join pg_catalog.pg_roles r on r.oid=acl.grantee
    where acl.privilege_type='EXECUTE' and r.rolname='service_role'
  ) then
    raise exception using errcode='55000', message='Staging nonce RPC ACL drifted.';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid<>nonce_rpc and pg_catalog.strpos(p.prosrc,'p0_staging_smoke_nonces')>0
  ) or exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid<>nonce_rpc and pg_catalog.strpos(p.prosrc,'mws_consume_p0_staging_smoke_nonce_v1')>0
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

alter table public.leads
  add column company_name text,
  add column contact_name text,
  add column website text;

comment on column public.leads.company_name is 'Legacy compatibility alias for company; synchronized without changing source semantics.';
comment on column public.leads.contact_name is 'Legacy compatibility alias for name; synchronized without changing source semantics.';
comment on column public.leads.website is 'Legacy compatibility alias for website_url; synchronized without changing source semantics.';

alter table public.leads disable trigger set_leads_updated_at;
update public.leads
set company_name=company,
    contact_name=name,
    website=website_url;
alter table public.leads enable trigger set_leads_updated_at;

create function public.mws_sync_lead_legacy_aliases_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $compatibility$
begin
  if tg_op='INSERT' then
    if new.company is not null and new.company_name is not null and new.company is distinct from new.company_name then
      raise exception using errcode='23514', constraint='leads_company_compatibility_conflict', message='lead compatibility conflict: company';
    end if;
    if new.name is not null and new.contact_name is not null and new.name is distinct from new.contact_name then
      raise exception using errcode='23514', constraint='leads_name_compatibility_conflict', message='lead compatibility conflict: name';
    end if;
    if new.website_url is not null and new.website is not null and new.website_url is distinct from new.website then
      raise exception using errcode='23514', constraint='leads_website_compatibility_conflict', message='lead compatibility conflict: website';
    end if;
    new.company:=coalesce(new.company,new.company_name);
    new.company_name:=coalesce(new.company_name,new.company);
    new.name:=coalesce(new.name,new.contact_name);
    new.contact_name:=coalesce(new.contact_name,new.name);
    new.website_url:=coalesce(new.website_url,new.website);
    new.website:=coalesce(new.website,new.website_url);
  else
    if new.company is distinct from old.company and new.company_name is distinct from old.company_name and new.company is distinct from new.company_name then
      raise exception using errcode='23514', constraint='leads_company_compatibility_conflict', message='lead compatibility conflict: company';
    elsif new.company is distinct from old.company then new.company_name:=new.company;
    elsif new.company_name is distinct from old.company_name then new.company:=new.company_name;
    end if;
    if new.name is distinct from old.name and new.contact_name is distinct from old.contact_name and new.name is distinct from new.contact_name then
      raise exception using errcode='23514', constraint='leads_name_compatibility_conflict', message='lead compatibility conflict: name';
    elsif new.name is distinct from old.name then new.contact_name:=new.name;
    elsif new.contact_name is distinct from old.contact_name then new.name:=new.contact_name;
    end if;
    if new.website_url is distinct from old.website_url and new.website is distinct from old.website and new.website_url is distinct from new.website then
      raise exception using errcode='23514', constraint='leads_website_compatibility_conflict', message='lead compatibility conflict: website';
    elsif new.website_url is distinct from old.website_url then new.website:=new.website_url;
    elsif new.website is distinct from old.website then new.website_url:=new.website;
    end if;
  end if;
  return new;
end
$compatibility$;

alter function public.mws_sync_lead_legacy_aliases_v1() owner to postgres;
revoke all on function public.mws_sync_lead_legacy_aliases_v1() from public,anon,authenticated,service_role;

create trigger sync_lead_legacy_aliases_v1
before insert or update of company,company_name,name,contact_name,website_url,website
on public.leads for each row execute function public.mws_sync_lead_legacy_aliases_v1();

drop function public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text);
drop table public.p0_staging_smoke_nonces;

do $postcondition$
declare
  current_lead_digest text;
  current_source_digest text;
begin
  select coalesce(pg_catalog.md5(pg_catalog.string_agg(
    (pg_catalog.to_jsonb(l)-'company_name'-'contact_name'-'website')::text,'|' order by l.id)),'EMPTY')
    into current_lead_digest from public.leads l;
  if current_lead_digest is distinct from pg_catalog.current_setting('p0_poststate_correction.preexisting_lead_digest') then
    raise exception using errcode='55000', message='A pre-existing non-alias lead field changed.';
  end if;
  select coalesce(pg_catalog.md5(pg_catalog.string_agg(
    pg_catalog.jsonb_build_array(id,external_source,external_source_id,source)::text,'|' order by id)),'EMPTY')
    into current_source_digest from public.leads;
  if current_source_digest is distinct from pg_catalog.current_setting('p0_poststate_correction.source_semantics_digest') then
    raise exception using errcode='55000', message='Independent source semantics changed.';
  end if;
  if exists (
    select 1 from public.leads
    where company is distinct from company_name
       or name is distinct from contact_name
       or website_url is distinct from website
  ) then
    raise exception using errcode='55000', message='A supported legacy alias is not synchronized.';
  end if;
  if pg_catalog.to_regclass('public.p0_staging_smoke_nonces') is not null
    or pg_catalog.to_regprocedure('public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)') is not null
  then
    raise exception using errcode='55000', message='A staging nonce object remains.';
  end if;
end
$postcondition$;

commit;
