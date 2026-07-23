\set ON_ERROR_STOP on
begin read only;
do $$
begin
  if exists (select 1 from unnest(array['business_event_contracts','business_events','business_event_consumptions','lead_intake_idempotency','lead_intake_abuse_requests']) n where to_regclass('public.'||n) is null) then
    raise exception using errcode='55000', message='Required P0 table is missing.';
  end if;
  if exists (select 1 from unnest(array[
    'public.record_business_event(text,uuid,text,smallint,timestamp with time zone,text,text,text,text,uuid,uuid,text,text,uuid,text,jsonb)',
    'public.validate_lead_created_v1(jsonb)','public.mws_create_lead_transactional_v1(jsonb,text,uuid,text,text)',
    'public.mws_get_lead_intake_result_v1(text)','public.mws_check_lead_intake_abuse_v1(text,text,text,text,text)',
    'public.mws_cleanup_lead_intake_abuse_v1(integer)'
  ]) signature where to_regprocedure(signature) is null) then
    raise exception using errcode='55000', message='Required P0 function is missing.';
  end if;
  if to_regclass('public.p0_staging_smoke_nonces') is not null
    or exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'mws_%smoke%')
  then
    raise exception using errcode='55000', message='Staging-only smoke object exists.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('record_business_event','mws_create_lead_transactional_v1','mws_get_lead_intake_result_v1','mws_check_lead_intake_abuse_v1')
      and (not p.prosecdef or not coalesce(p.proconfig,array[]::text[]) @> array['search_path=pg_catalog']::text[])
  ) then raise exception using errcode='55000', message='SECURITY DEFINER/search_path postcondition failed.'; end if;
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('mws_create_lead_transactional_v1','mws_get_lead_intake_result_v1','mws_check_lead_intake_abuse_v1')
      and (pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') or not pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE'))
  ) then raise exception using errcode='55000', message='P0 RPC ACL postcondition failed.'; end if;
  if exists (
    select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('business_event_contracts','business_events','business_event_consumptions','lead_intake_idempotency','lead_intake_abuse_requests') and not c.relrowsecurity
  ) then raise exception using errcode='55000', message='P0 RLS postcondition failed.'; end if;
  if exists (
    select 1 from unnest(array['company','name','website_url','source','normalized_domain','branch','region','converted_customer_id','converted_at']) name
    where not exists (
      select 1 from pg_catalog.pg_attribute a where a.attrelid='public.leads'::regclass
        and a.attname=name and a.attnum>0 and not a.attisdropped
    )
  ) then raise exception using errcode='55000', message='Required additive compatibility column is missing.'; end if;
  if to_regprocedure('public.mws_sync_lead_legacy_aliases_v1()') is null
    or not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.leads'::regclass and tgname='sync_lead_legacy_aliases_v1' and not tgisinternal)
  then raise exception using errcode='55000', message='Lead compatibility synchronization layer is missing.'; end if;
  if exists (
    select 1 from public.leads
    where company is distinct from company_name or name is distinct from contact_name
      or website_url is distinct from website
  ) then raise exception using errcode='55000', message='Lead compatibility aliases are not synchronized.'; end if;
  if exists (
    select 1 from (values
      ('leads_admin_manage','*'),('leads_sales_manager_select','r'),('leads_sales_manager_update','w'),
      ('leads_sales_partner_insert_own','a'),('leads_sales_partner_select_own','r'),('leads_sales_partner_update_own','w')
    ) expected(name,cmd)
    where not exists (select 1 from pg_catalog.pg_policy p where p.polrelid='public.leads'::regclass and p.polname=expected.name and p.polcmd=expected.cmd and p.polpermissive)
  ) or (select count(*) from pg_catalog.pg_policy where polrelid='public.leads'::regclass) <> 6
  then raise exception using errcode='55000', message='Hardened leads policy set is missing or drifted.'; end if;
  if exists (
    select 1 from pg_catalog.pg_policy where polrelid='public.leads'::regclass
      and polname like 'leads_sales_manager_%' and polcmd in ('*','a','d')
  ) then raise exception using errcode='55000', message='Sales-manager INSERT/DELETE/ALL policy remains.'; end if;
  if exists (
    select 1 from (values
      ('leads_admin_manage',array['43df6bdb018364dc7cf7bb4a9e87ac31']),
      ('leads_sales_partner_insert_own',array['fc2343f412229a8a3768ddffb53bf94e','d8c460068c5dc4d3c00ad9dbd52bde95']),
      ('leads_sales_partner_select_own',array['b5ec8e3fe60894c733cba73c213d3775','0fdcc0bd9140cb9a36284eecddda6a3b']),
      ('leads_sales_partner_update_own',array['538c5eda9c72250066d86c9670a8806b','3c860c48c88e992113c7958a7118c360'])
    ) expected(name,digests)
    where not exists (
      select 1 from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where p.polrelid='public.leads'::regclass and p.polname=expected.name
        and md5(concat_ws('|',n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive::text,p.polroles::text,
          regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g'),
          regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g'))) = any(expected.digests)
    )
  ) then raise exception using errcode='55000', message='Preserved admin/partner policy definition drifted.'; end if;
  if (select regexp_replace(pg_catalog.pg_get_expr(polqual,polrelid),'[[:space:]]+',' ','g') from pg_catalog.pg_policy where polrelid='public.leads'::regclass and polname='leads_sales_manager_select')
      is distinct from '(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.auth_user_id = auth.uid()) AND (p.role = ''sales_manager''::text) AND (p.status = ANY (ARRAY[''active''::text, ''invited''::text])))))'
    or (select polwithcheck is not null from pg_catalog.pg_policy where polrelid='public.leads'::regclass and polname='leads_sales_manager_select')
    or (select regexp_replace(pg_catalog.pg_get_expr(polqual,polrelid),'[[:space:]]+',' ','g') from pg_catalog.pg_policy where polrelid='public.leads'::regclass and polname='leads_sales_manager_update')
      is distinct from '(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.auth_user_id = auth.uid()) AND (p.role = ''sales_manager''::text) AND (p.status = ANY (ARRAY[''active''::text, ''invited''::text])))))'
    or (select regexp_replace(pg_catalog.pg_get_expr(polwithcheck,polrelid),'[[:space:]]+',' ','g') from pg_catalog.pg_policy where polrelid='public.leads'::regclass and polname='leads_sales_manager_update')
      is distinct from '(EXISTS ( SELECT 1 FROM profiles p WHERE ((p.auth_user_id = auth.uid()) AND (p.role = ''sales_manager''::text) AND (p.status = ANY (ARRAY[''active''::text, ''invited''::text])))))'
  then raise exception using errcode='55000', message='Sales-manager SELECT/UPDATE policy semantics drifted.'; end if;
end $$;
select jsonb_build_object(
  'leadCreatedContract',(select to_jsonb(c) from (select event_type,event_version,lifecycle_status,validator_key,registered_by_migration from public.business_event_contracts where event_type='lead.created' and event_version=1)c),
  'p0Tables',(select jsonb_agg(relname order by relname) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname in ('business_event_contracts','business_events','business_event_consumptions','lead_intake_idempotency','lead_intake_abuse_requests')),
  'stagingSmokeTable',to_regclass('public.p0_staging_smoke_nonces')
);
rollback;
