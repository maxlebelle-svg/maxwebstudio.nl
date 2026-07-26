-- P0 production policy correction for the proven three-policy poststate.
-- Preserves the proven legacy admin/sales ALL policy and grants sales_manager only SELECT + UPDATE.
begin;

do $preflight$
declare
  policy_count integer;
  current_set_digest text;
begin
  if current_user <> 'postgres' then
    raise exception using errcode='55000', message='P0 policy correction must run as postgres.';
  end if;
  if pg_catalog.to_regclass('public.leads') is null
    or pg_catalog.to_regprocedure('public.mws_sync_lead_legacy_aliases_v1()') is null
    or exists (
      select 1 from pg_catalog.pg_attribute
      where attrelid='public.leads'::regclass and attname in ('company_name','contact_name','website')
        and attnum>0 and not attisdropped
      having count(*)<>3
    )
    or pg_catalog.to_regclass('public.p0_staging_smoke_nonces') is not null
    or pg_catalog.to_regprocedure('public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)') is not null
  then
    raise exception using errcode='55000', message='Poststate correction must complete before policy correction.';
  end if;

  select count(*), pg_catalog.md5(pg_catalog.string_agg(
    pg_catalog.concat_ws('|',policyname,cmd,permissive,roles::text,qual,with_check),
    '||' order by policyname))
  into policy_count,current_set_digest
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='leads';

  if policy_count<>3 then
    raise exception using errcode='55000', message=pg_catalog.format('Expected exactly three proven leads policies; found %s.',policy_count);
  end if;
  if exists (
    select 1 from (values
      ('leads_admin_sales_manage','ALL','PERMISSIVE',array['public']::name[],'4d73e7c456f1742b2b340dbe304b8f41'),
      ('leads_demo_read','SELECT','PERMISSIVE',array['public']::name[],'3d31c9dad234b800b629e6116e77f6c0'),
      ('leads_support_developer_read','SELECT','PERMISSIVE',array['public']::name[],'b593fea9298cc99969925524f1b884b7')
    ) expected(name,command,permissive,roles,digest)
    where not exists (
      select 1 from pg_catalog.pg_policies p
      where p.schemaname='public' and p.tablename='leads'
        and p.policyname=expected.name and p.cmd=expected.command
        and p.permissive=expected.permissive and p.roles=expected.roles
        and pg_catalog.md5(pg_catalog.concat_ws('|',p.cmd,p.permissive,p.roles::text,p.qual,p.with_check))=expected.digest
    )
  ) then
    raise exception using errcode='55000', message=pg_catalog.format('Proven leads policy definition drift; set digest=%s.',coalesce(current_set_digest,'<none>'));
  end if;
  if current_set_digest<>'7b92c1fd863906fa5ca06a82e15e9d79' then
    raise exception using errcode='55000', message=pg_catalog.format('Proven leads policy set drift; digest=%s.',coalesce(current_set_digest,'<none>'));
  end if;
end
$preflight$;

drop policy leads_admin_sales_manage on public.leads;

create policy leads_admin_sales_manage
on public.leads as permissive for all to public
using (public.has_app_role(array['super_admin','admin','sales']))
with check (public.has_app_role(array['super_admin','admin','sales']));

create policy leads_sales_manager_select
on public.leads as permissive for select to public
using (public.has_app_role(array['sales_manager']));

create policy leads_sales_manager_update
on public.leads as permissive for update to public
using (public.has_app_role(array['sales_manager']))
with check (public.has_app_role(array['sales_manager']));

do $postcondition$
begin
  if (select count(*) from pg_catalog.pg_policy where polrelid='public.leads'::regclass)<>5 then
    raise exception using errcode='55000', message='Expected five-policy leads poststate.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_policy
    where polrelid='public.leads'::regclass and polname like 'leads_sales_manager_%'
      and polcmd in ('*','a','d')
  ) then
    raise exception using errcode='55000', message='Sales manager retains ALL, INSERT or DELETE policy.';
  end if;
  if not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='leads' and policyname='leads_sales_manager_select' and cmd='SELECT')
    or not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='leads' and policyname='leads_sales_manager_update' and cmd='UPDATE' and qual=with_check)
  then
    raise exception using errcode='55000', message='Sales-manager SELECT/UPDATE policies missing or asymmetric.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='public' and tablename='leads' and policyname='leads_admin_sales_manage'
      and (coalesce(qual,'') like '%sales_manager%' or coalesce(with_check,'') like '%sales_manager%')
  ) then
    raise exception using errcode='55000', message='Combined ALL policy still includes sales_manager.';
  end if;
end
$postcondition$;

commit;
