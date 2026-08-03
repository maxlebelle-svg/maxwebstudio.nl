-- Commercial offer phase 2: Signhost evidence, idempotent fulfilment claims,
-- payment preparation and production handover state. Forward-only.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.commercial_offers') is null
     or pg_catalog.to_regclass('public.commercial_offer_versions') is null
     or pg_catalog.to_regclass('public.commercial_offer_events') is null
     or pg_catalog.to_regclass('public.commercial_offer_interest_tokens') is null
     or pg_catalog.to_regclass('public.commercial_offer_signing_access_tokens') is null
     or pg_catalog.to_regclass('public.commercial_offer_signing_transactions') is null
     or pg_catalog.to_regprocedure('public.commercial_finalize_offer_signature_v1(uuid,text,integer,text,text,text,text)') is null
     or pg_catalog.to_regclass('public.customers') is null
     or pg_catalog.to_regclass('public.invoices') is null
     or pg_catalog.to_regclass('public.projects') is null
     or pg_catalog.to_regclass('public.factory_projects') is null then
    raise exception using errcode='55000', message='Commercial Signhost or phase 2 prerequisites are missing.';
  end if;
end
$preflight$;

-- Extend the canonical customer-link Signhost transaction instead of creating a
-- second, incompatible table. Both entry routes retain their own authorization
-- evidence while sharing provider postback and fulfilment state.
alter table public.commercial_offer_signing_transactions
  add column signing_origin text not null default 'customer_link',
  add column requested_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column requested_by_auth_user_id uuid references auth.users(id) on delete restrict;

alter table public.commercial_offer_signing_transactions
  alter column access_token_id drop not null,
  alter column signer_role drop not null,
  alter column authority_confirmed_at drop not null;

alter table public.commercial_offer_signing_transactions
  drop constraint commercial_offer_signing_transactions_status_check,
  add constraint commercial_offer_signing_transactions_status_check check (status in (
    'creating','waiting_for_signer','signed','signed_pending_processing','completed',
    'rejected','expired','cancelled','failed'
  )),
  add constraint commercial_offer_signing_origin_check check (
    (signing_origin='customer_link' and access_token_id is not null and signer_role is not null and authority_confirmed_at is not null)
    or
    (signing_origin='staff_direct' and requested_by_profile_id is not null and requested_by_auth_user_id is not null)
  );

create table public.commercial_offer_fulfilment_runs (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.commercial_offers(id) on delete restrict,
  offer_version_id uuid not null references public.commercial_offer_versions(id) on delete restrict,
  signing_transaction_id uuid not null references public.commercial_offer_signing_transactions(id) on delete restrict,
  status text not null default 'pending' check (status in (
    'pending','processing','payment_pending','ready_for_production','completed','failed'
  )),
  customer_id uuid references public.customers(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  factory_project_id uuid references public.factory_projects(id) on delete restrict,
  checkout_url_created_at timestamptz,
  production_handover_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 100),
  last_attempt_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint commercial_offer_fulfilment_version_unique unique (offer_version_id),
  constraint commercial_offer_fulfilment_signing_unique unique (signing_transaction_id)
);

create index commercial_offer_fulfilment_retry_idx
  on public.commercial_offer_fulfilment_runs(status,updated_at)
  where status in ('pending','failed');

alter table public.commercial_offer_signing_transactions enable row level security;
alter table public.commercial_offer_signing_transactions force row level security;
alter table public.commercial_offer_fulfilment_runs enable row level security;
alter table public.commercial_offer_fulfilment_runs force row level security;

create policy commercial_offer_signing_staff_read on public.commercial_offer_signing_transactions
for select to authenticated using (public.has_app_role(array['super_admin','admin','sales_manager','sales_partner','sales']));

create policy commercial_offer_fulfilment_staff_read on public.commercial_offer_fulfilment_runs
for select to authenticated using (public.has_app_role(array['super_admin','admin','sales_manager','sales_partner','sales']));

create function public.commercial_reserve_signature_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_offer_version_id uuid,
  input_signer_name text,
  input_signer_email text,
  input_idempotency_key text
)
returns jsonb
language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare offer_record public.commercial_offers%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare signing_record public.commercial_offer_signing_transactions%rowtype;
declare actor_role text;
begin
  select * into version_record from public.commercial_offer_versions where id=input_offer_version_id for update;
  if not found then raise exception using errcode='P0002',message='Offer version not found.'; end if;
  select * into offer_record from public.commercial_offers where id=version_record.offer_id for update;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if offer_record.current_version_id<>version_record.id or version_record.status not in ('sent','viewed') or version_record.has_non_binding_lines then
    raise exception using errcode='23514',message='Offer is not ready for signature.';
  end if;
  if not exists(select 1 from public.commercial_offer_interest_tokens where offer_version_id=version_record.id and confirmed_at is not null and revoked_at is null) then
    raise exception using errcode='23514',message='Customer interest must be confirmed before signature.';
  end if;
  if char_length(btrim(coalesce(input_signer_name,''))) not between 2 and 160
     or input_signer_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or char_length(input_idempotency_key) not between 16 and 180 then
    raise exception using errcode='22023',message='Signature reservation input is invalid.';
  end if;
  select * into signing_record from public.commercial_offer_signing_transactions where offer_version_id=version_record.id;
  if found then
    return jsonb_build_object('signingId',signing_record.id,'status',signing_record.status,'providerTransactionId',signing_record.provider_transaction_id,'providerFileId',signing_record.provider_file_id,'duplicate',true);
  end if;
  insert into public.commercial_offer_signing_transactions(
    offer_id,offer_version_id,signing_origin,signer_name,signer_email_sha256,idempotency_key,
    provider_file_id,requested_by_profile_id,requested_by_auth_user_id
  ) values (
    offer_record.id,version_record.id,'staff_direct',btrim(input_signer_name),
    encode(extensions.digest(lower(btrim(input_signer_email)),'sha256'),'hex'),input_idempotency_key,
    gen_random_uuid()::text,input_actor_profile_id,input_actor_auth_user_id
  ) returning * into signing_record;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.signature_requested',input_actor_profile_id,input_actor_auth_user_id,actor_role,version_record.status,version_record.status,input_idempotency_key || ':event',jsonb_build_object('provider','signhost'));
  return jsonb_build_object('signingId',signing_record.id,'status',signing_record.status,'providerFileId',signing_record.provider_file_id,'duplicate',false);
end
$function$;

create function public.commercial_claim_signed_fulfilment_v1(
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
  select * into signing_record from public.commercial_offer_signing_transactions where provider='signhost' and provider_transaction_id=input_provider_transaction_id for update;
  if not found then raise exception using errcode='P0002',message='Commercial signing transaction not found.'; end if;
  select * into version_record from public.commercial_offer_versions where id=signing_record.offer_version_id for update;
  select * into offer_record from public.commercial_offers where id=signing_record.offer_id for update;
  update public.commercial_offer_signing_transactions set provider_status=input_provider_status,status='signed_pending_processing',signed_at=coalesce(signed_at,clock_timestamp()),last_postback_at=clock_timestamp(),updated_at=clock_timestamp() where id=signing_record.id;
  if version_record.status not in ('signed','payment_pending','partially_paid','paid','accepted') then
    update public.commercial_offer_versions set status='signed',signed_at=coalesce(signed_at,clock_timestamp()),updated_at=clock_timestamp() where id=version_record.id;
    if offer_record.current_version_id=version_record.id then update public.commercial_offers set status='signed',updated_at=clock_timestamp() where id=offer_record.id; end if;
    event_key := 'signhost:signed:' || signing_record.id::text;
    insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
    values(offer_record.id,version_record.id,'offer.signed','provider',version_record.status,'signed',event_key,jsonb_build_object('provider','signhost','providerStatus',input_provider_status))
    on conflict(offer_id,idempotency_key) do nothing;
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
    'factoryProjectId',run_record.factory_project_id,
    'duplicate',run_record.status not in ('processing')
  );
end
$function$;

create function public.commercial_finalize_fulfilment_v1(
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
  if input_status not in ('payment_pending','ready_for_production','completed','failed') then raise exception using errcode='22023',message='Invalid fulfilment status.'; end if;
  update public.commercial_offer_fulfilment_runs set
    status=input_status,
    customer_id=coalesce(input_customer_id,customer_id),invoice_id=coalesce(input_invoice_id,invoice_id),project_id=coalesce(input_project_id,project_id),
    factory_project_id=coalesce(input_factory_project_id,factory_project_id),
    checkout_url_created_at=case when input_status='payment_pending' then coalesce(checkout_url_created_at,clock_timestamp()) else checkout_url_created_at end,
    production_handover_at=case when input_status in ('ready_for_production','completed') then coalesce(production_handover_at,clock_timestamp()) else production_handover_at end,
    last_error_code=case when input_status='failed' then left(lower(coalesce(input_error_code,'fulfilment_failed')),120) else null end,
    updated_at=clock_timestamp()
  where id=run_record.id returning * into run_record;
  target_offer_status := case when input_status='payment_pending' then 'payment_pending' when input_status in ('ready_for_production','completed') then 'accepted' else null end;
  if target_offer_status is not null then
    update public.commercial_offer_versions set status=target_offer_status,accepted_at=case when target_offer_status='accepted' then coalesce(accepted_at,clock_timestamp()) else accepted_at end,updated_at=clock_timestamp() where id=run_record.offer_version_id;
    update public.commercial_offers set status=target_offer_status,updated_at=clock_timestamp() where id=run_record.offer_id and current_version_id=run_record.offer_version_id;
  end if;
  update public.commercial_offer_signing_transactions set status=case when input_status='failed' then status else 'completed' end,updated_at=clock_timestamp() where id=run_record.signing_transaction_id;
  return jsonb_build_object('runId',run_record.id,'status',run_record.status,'customerId',run_record.customer_id,'invoiceId',run_record.invoice_id,'projectId',run_record.project_id);
end
$function$;

revoke all on public.commercial_offer_signing_transactions,public.commercial_offer_fulfilment_runs from public,anon,authenticated,service_role;
grant select on public.commercial_offer_signing_transactions,public.commercial_offer_fulfilment_runs to authenticated,service_role;
grant insert,update on public.commercial_offer_signing_transactions,public.commercial_offer_fulfilment_runs to service_role;

revoke all on function public.commercial_reserve_signature_v1(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.commercial_claim_signed_fulfilment_v1(text,integer) from public,anon,authenticated;
revoke all on function public.commercial_finalize_fulfilment_v1(uuid,text,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.commercial_reserve_signature_v1(uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.commercial_claim_signed_fulfilment_v1(text,integer) to service_role;
grant execute on function public.commercial_finalize_fulfilment_v1(uuid,text,uuid,uuid,uuid,uuid,text) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('commercial-private-documents','commercial-private-documents',false,15728640,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

notify pgrst,'reload schema';
commit;
