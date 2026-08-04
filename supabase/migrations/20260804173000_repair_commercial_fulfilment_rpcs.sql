begin;

do $preflight$
begin
  if to_regclass('public.commercial_offer_signing_transactions') is null
     or to_regclass('public.commercial_offer_fulfilment_runs') is null
     or to_regclass('public.commercial_offer_versions') is null
     or to_regclass('public.commercial_offers') is null then
    raise exception using errcode='42P01', message='Commercial fulfilment prerequisites are missing.';
  end if;
end
$preflight$;

create or replace function public.commercial_claim_signed_fulfilment_v1(
  input_provider_transaction_id text,
  input_provider_status integer
)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare signing_record public.commercial_offer_signing_transactions%rowtype;
declare offer_record public.commercial_offers%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare run_record public.commercial_offer_fulfilment_runs%rowtype;
declare event_key text;
begin
  select * into signing_record
  from public.commercial_offer_signing_transactions
  where provider='signhost' and provider_transaction_id=input_provider_transaction_id
  for update;
  if not found then raise exception using errcode='P0002',message='Commercial signing transaction not found.'; end if;

  select * into version_record from public.commercial_offer_versions where id=signing_record.offer_version_id for update;
  select * into offer_record from public.commercial_offers where id=signing_record.offer_id for update;

  update public.commercial_offer_signing_transactions
  set provider_status=input_provider_status,status='signed_pending_processing',
      signed_at=coalesce(signed_at,clock_timestamp()),last_postback_at=clock_timestamp(),updated_at=clock_timestamp()
  where id=signing_record.id;

  if version_record.status not in ('signed','payment_pending','partially_paid','paid','accepted') then
    update public.commercial_offer_versions
    set status='signed',signed_at=coalesce(signed_at,clock_timestamp()),updated_at=clock_timestamp()
    where id=version_record.id;
    if offer_record.current_version_id=version_record.id then
      update public.commercial_offers set status='signed',updated_at=clock_timestamp() where id=offer_record.id;
    end if;
    event_key := 'signhost:signed:' || signing_record.id::text;
    insert into public.commercial_offer_events(
      offer_id,offer_version_id,event_type,actor_role,previous_status,new_status,idempotency_key,safe_metadata
    ) values (
      offer_record.id,version_record.id,'offer.signed','provider',version_record.status,'signed',event_key,
      jsonb_build_object('provider','signhost','providerStatus',input_provider_status)
    ) on conflict(offer_id,idempotency_key) do nothing;
  end if;

  insert into public.commercial_offer_fulfilment_runs(offer_id,offer_version_id,signing_transaction_id,status)
  values(offer_record.id,version_record.id,signing_record.id,'processing')
  on conflict(offer_version_id) do update set
    status=case when public.commercial_offer_fulfilment_runs.status in ('pending','failed') then 'processing' else public.commercial_offer_fulfilment_runs.status end,
    attempt_count=case when public.commercial_offer_fulfilment_runs.status in ('pending','failed') then public.commercial_offer_fulfilment_runs.attempt_count+1 else public.commercial_offer_fulfilment_runs.attempt_count end,
    last_attempt_at=case when public.commercial_offer_fulfilment_runs.status in ('pending','failed') then clock_timestamp() else public.commercial_offer_fulfilment_runs.last_attempt_at end,
    updated_at=clock_timestamp()
  returning * into run_record;

  return jsonb_build_object(
    'runId',run_record.id,'status',run_record.status,'offerId',offer_record.id,
    'offerVersionId',version_record.id,'signingId',signing_record.id,
    'customerId',run_record.customer_id,'invoiceId',run_record.invoice_id,'projectId',run_record.project_id,
    'factoryProjectId',run_record.factory_project_id,'duplicate',run_record.status not in ('processing')
  );
end
$function$;

create or replace function public.commercial_finalize_fulfilment_v1(
  input_run_id uuid,
  input_status text,
  input_customer_id uuid,
  input_invoice_id uuid,
  input_project_id uuid,
  input_factory_project_id uuid,
  input_error_code text
)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare run_record public.commercial_offer_fulfilment_runs%rowtype;
declare target_offer_status text;
begin
  select * into run_record from public.commercial_offer_fulfilment_runs where id=input_run_id for update;
  if not found then raise exception using errcode='P0002',message='Fulfilment run not found.'; end if;
  if input_status not in ('payment_pending','ready_for_production','completed','failed') then
    raise exception using errcode='22023',message='Invalid fulfilment status.';
  end if;

  update public.commercial_offer_fulfilment_runs set
    status=input_status,
    customer_id=coalesce(input_customer_id,customer_id),
    invoice_id=coalesce(input_invoice_id,invoice_id),
    project_id=coalesce(input_project_id,project_id),
    factory_project_id=coalesce(input_factory_project_id,factory_project_id),
    checkout_url_created_at=case when input_status='payment_pending' then coalesce(checkout_url_created_at,clock_timestamp()) else checkout_url_created_at end,
    production_handover_at=case when input_status in ('ready_for_production','completed') then coalesce(production_handover_at,clock_timestamp()) else production_handover_at end,
    last_error_code=case when input_status='failed' then left(lower(coalesce(input_error_code,'fulfilment_failed')),120) else null end,
    updated_at=clock_timestamp()
  where id=run_record.id returning * into run_record;

  target_offer_status := case
    when input_status='payment_pending' then 'payment_pending'
    when input_status in ('ready_for_production','completed') then 'accepted'
    else null
  end;
  if target_offer_status is not null then
    update public.commercial_offer_versions
    set status=target_offer_status,
        accepted_at=case when target_offer_status='accepted' then coalesce(accepted_at,clock_timestamp()) else accepted_at end,
        updated_at=clock_timestamp()
    where id=run_record.offer_version_id;
    update public.commercial_offers set status=target_offer_status,updated_at=clock_timestamp()
    where id=run_record.offer_id and current_version_id=run_record.offer_version_id;
  end if;

  update public.commercial_offer_signing_transactions
  set status=case when input_status='failed' then status else 'completed' end,updated_at=clock_timestamp()
  where id=run_record.signing_transaction_id;

  return jsonb_build_object(
    'runId',run_record.id,'status',run_record.status,'customerId',run_record.customer_id,
    'invoiceId',run_record.invoice_id,'projectId',run_record.project_id
  );
end
$function$;

revoke all on function public.commercial_claim_signed_fulfilment_v1(text,integer) from public,anon,authenticated;
revoke all on function public.commercial_finalize_fulfilment_v1(uuid,text,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.commercial_claim_signed_fulfilment_v1(text,integer) to service_role;
grant execute on function public.commercial_finalize_fulfilment_v1(uuid,text,uuid,uuid,uuid,uuid,text) to service_role;

notify pgrst,'reload schema';
commit;
