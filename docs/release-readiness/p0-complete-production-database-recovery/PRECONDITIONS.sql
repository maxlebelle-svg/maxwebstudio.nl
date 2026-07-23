\set ON_ERROR_STOP on
-- External gate must first target-lock Supabase projectref yxxahurphdbblkuxoeje.
begin read only;
select current_database() as database_name, current_user as execution_user;
select version, name from supabase_migrations.schema_migrations order by version desc limit 20;
do $$
declare latest text;
begin
  select max(version) into latest from supabase_migrations.schema_migrations;
  if latest is distinct from '20260718190000' then
    raise exception using errcode='55000', message=format('Expected production baseline 20260718190000; found %s.',coalesce(latest,'<none>'));
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version in ('20260722130000','20260722131000','20260722132000','20260722133000','20260722134000','20260722135000')) then
    raise exception using errcode='55000', message='A reconciliation migration version is already registered.';
  end if;
  if (to_regclass('public.p0_staging_smoke_nonces') is null)
     <> (to_regprocedure('public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)') is null)
  then raise exception using errcode='55000', message='Partial staging nonce object pair exists.'; end if;
  if to_regclass('public.leads') is null then
    raise exception using errcode='55000', message='Production leads table is missing.';
  end if;
  if exists (
    select 1 from unnest(array['company_name','contact_name','website','external_source']) name
    where not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid='public.leads'::regclass and a.attname=name and a.attnum>0 and not a.attisdropped
        and pg_catalog.format_type(a.atttypid,a.atttypmod)='text'
    )
  ) then raise exception using errcode='55000', message='Proven V1 leads aliases are missing or drifted.'; end if;
  if exists (
    select 1 from unnest(array['company','name','website_url','source','normalized_domain','branch','region','converted_customer_id','converted_at']) name
    where exists (select 1 from pg_catalog.pg_attribute a where a.attrelid='public.leads'::regclass and a.attname=name and a.attnum>0 and not a.attisdropped)
  ) then raise exception using errcode='55000', message='V2 compatibility columns already exist.'; end if;
  if (select count(*) from pg_catalog.pg_policy where polrelid='public.leads'::regclass) <> 5
    or (select md5(string_agg(concat_ws('|',p.polname,p.polcmd,p.polpermissive::text,p.polroles::text,
      regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g'),
      regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g')),'||' order by p.polname))
      from pg_catalog.pg_policy p where p.polrelid='public.leads'::regclass) <> all(array['4ccfec448672edc3d019454a8c9983e0','56acbf792c58f4a0cda49eea79dedfcb'])
  then raise exception using errcode='55000', message='Proven five-policy leads baseline drifted.'; end if;
end $$;
select n.nspname as schema_name,c.relname,c.relkind,c.relrowsecurity,c.relacl
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('business_event_contracts','business_events','business_event_consumptions','lead_intake_idempotency','lead_intake_abuse_requests','p0_staging_smoke_nonces')
order by c.relname;
rollback;
