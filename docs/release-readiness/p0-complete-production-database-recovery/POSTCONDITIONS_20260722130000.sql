\set ON_ERROR_STOP on
begin read only;
do $$ begin
  if exists (select 1 from unnest(array['business_event_contracts','business_events','business_event_consumptions']) n where to_regclass('public.'||n) is null)
    or to_regprocedure('public.record_business_event(text,uuid,text,smallint,timestamp with time zone,text,text,text,text,uuid,uuid,text,text,uuid,text,jsonb)') is null
    or to_regprocedure('public.validate_lead_created_v1(jsonb)') is null
    or not exists (select 1 from public.business_event_contracts where event_type='lead.created' and event_version=1 and lifecycle_status='active' and validator_key='lead_created_v1')
  then raise exception using errcode='55000', message='Business-event recovery postcondition failed.'; end if;
end $$;
rollback;
