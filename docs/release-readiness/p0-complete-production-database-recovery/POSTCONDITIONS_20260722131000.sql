\set ON_ERROR_STOP on
begin read only;
do $$ begin
  if exists (select 1 from unnest(array['company','name','website_url','source','normalized_domain','branch','region','converted_customer_id','converted_at']) n where not exists (
    select 1 from pg_catalog.pg_attribute where attrelid='public.leads'::regclass and attname=n and attnum>0 and not attisdropped
  )) or to_regclass('public.lead_intake_idempotency') is null
    or to_regprocedure('public.mws_create_lead_transactional_v1(jsonb,text,uuid,text,text)') is null
    or to_regprocedure('public.mws_get_lead_intake_result_v1(text)') is null
    or to_regprocedure('public.mws_sync_lead_legacy_aliases_v1()') is null
    or not exists (select 1 from pg_catalog.pg_trigger where tgrelid='public.leads'::regclass and tgname='sync_lead_legacy_aliases_v1' and not tgisinternal)
  then raise exception using errcode='55000', message='Transactional intake recovery postcondition failed.'; end if;
  if exists (select 1 from public.leads where company is distinct from company_name or name is distinct from contact_name or website_url is distinct from website)
  then raise exception using errcode='55000', message='Supported lead aliases are not synchronized.'; end if;
  if pg_catalog.pg_get_triggerdef((select oid from pg_catalog.pg_trigger where tgrelid='public.leads'::regclass and tgname='sync_lead_legacy_aliases_v1'),false) ~ '(source|external_source)'
  then raise exception using errcode='55000', message='Independent source fields entered the alias trigger.'; end if;
end $$;
rollback;
