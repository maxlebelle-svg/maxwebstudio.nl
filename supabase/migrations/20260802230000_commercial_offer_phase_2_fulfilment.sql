-- Commercial offer phase 2: idempotent invoice, Mollie payment and Factory handover
-- after the existing verified Signhost signature finalizer. Forward-only.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.commercial_offer_signing_transactions') is null
     or pg_catalog.to_regprocedure('public.commercial_finalize_offer_signature_v1(uuid,text,integer,text,text,text,text)') is null
     or pg_catalog.to_regclass('public.customers') is null
     or pg_catalog.to_regclass('public.invoices') is null
     or pg_catalog.to_regclass('public.projects') is null
     or pg_catalog.to_regclass('public.factory_projects') is null then
    raise exception using errcode='55000', message='Commercial phase 2 prerequisites are missing.';
  end if;
end
$preflight$;

create table public.commercial_offer_fulfilment_runs (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.commercial_offers(id) on delete restrict,
  offer_version_id uuid not null unique references public.commercial_offer_versions(id) on delete restrict,
  signing_transaction_id uuid not null unique references public.commercial_offer_signing_transactions(id) on delete restrict,
  status text not null default 'pending' check(status in ('pending','processing','payment_pending','ready_for_production','completed','failed')),
  customer_id uuid references public.customers(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  project_id uuid references public.projects(id) on delete restrict,
  factory_project_id uuid references public.factory_projects(id) on delete restrict,
  attempt_count integer not null default 0 check(attempt_count between 0 and 100),
  last_attempt_at timestamptz,
  checkout_url_created_at timestamptz,
  production_handover_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index commercial_offer_fulfilment_retry_idx on public.commercial_offer_fulfilment_runs(status,updated_at) where status in ('pending','failed');
alter table public.commercial_offer_fulfilment_runs enable row level security;
alter table public.commercial_offer_fulfilment_runs force row level security;
create policy commercial_offer_fulfilment_staff_read on public.commercial_offer_fulfilment_runs
for select to authenticated using(public.has_app_role(array['super_admin','admin','sales_manager','sales_partner','sales']));

create function public.commercial_claim_signed_fulfilment_v1(input_signing_transaction_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare tx public.commercial_offer_signing_transactions%rowtype;
declare offer_record public.commercial_offers%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare run_record public.commercial_offer_fulfilment_runs%rowtype;
declare prior_status text;
begin
  select * into tx from public.commercial_offer_signing_transactions where id=input_signing_transaction_id for update;
  if not found then raise exception using errcode='P0002',message='Signing transaction not found.'; end if;
  if tx.status<>'signed' or tx.signed_document_sha256 is null or tx.receipt_sha256 is null then
    raise exception using errcode='23514',message='Only a verified complete signature can start fulfilment.';
  end if;
  select * into version_record from public.commercial_offer_versions where id=tx.offer_version_id for update;
  select * into offer_record from public.commercial_offers where id=tx.offer_id for update;
  if offer_record.current_version_id<>version_record.id or version_record.status not in ('signed','payment_pending','paid','accepted') then
    raise exception using errcode='23514',message='Signed offer is not the current fulfilment source.';
  end if;
  select status into prior_status from public.commercial_offer_fulfilment_runs where offer_version_id=version_record.id;
  insert into public.commercial_offer_fulfilment_runs(offer_id,offer_version_id,signing_transaction_id,status,attempt_count,last_attempt_at)
  values(offer_record.id,version_record.id,tx.id,'processing',1,clock_timestamp())
  on conflict(offer_version_id) do update set
    status=case when public.commercial_offer_fulfilment_runs.status in ('pending','failed') then 'processing' else public.commercial_offer_fulfilment_runs.status end,
    attempt_count=case when public.commercial_offer_fulfilment_runs.status in ('pending','failed') then public.commercial_offer_fulfilment_runs.attempt_count+1 else public.commercial_offer_fulfilment_runs.attempt_count end,
    last_attempt_at=case when public.commercial_offer_fulfilment_runs.status in ('pending','failed') then clock_timestamp() else public.commercial_offer_fulfilment_runs.last_attempt_at end,
    updated_at=clock_timestamp()
  returning * into run_record;
  return jsonb_build_object('runId',run_record.id,'status',run_record.status,'offerId',run_record.offer_id,
    'offerVersionId',run_record.offer_version_id,'customerId',run_record.customer_id,'invoiceId',run_record.invoice_id,
    'projectId',run_record.project_id,'factoryProjectId',run_record.factory_project_id,
    'duplicate',coalesce(prior_status,'') not in ('','pending','failed'));
end
$function$;

create function public.commercial_finalize_fulfilment_v1(
  input_run_id uuid,input_status text,input_customer_id uuid,input_invoice_id uuid,
  input_project_id uuid,input_factory_project_id uuid,input_error_code text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare run_record public.commercial_offer_fulfilment_runs%rowtype;
declare target_offer_status text;
begin
  if input_status not in ('payment_pending','ready_for_production','completed','failed') then raise exception using errcode='22023',message='Invalid fulfilment status.'; end if;
  select * into run_record from public.commercial_offer_fulfilment_runs where id=input_run_id for update;
  if not found then raise exception using errcode='P0002',message='Fulfilment run not found.'; end if;
  update public.commercial_offer_fulfilment_runs set status=input_status,
    customer_id=coalesce(input_customer_id,customer_id),invoice_id=coalesce(input_invoice_id,invoice_id),
    project_id=coalesce(input_project_id,project_id),factory_project_id=coalesce(input_factory_project_id,factory_project_id),
    checkout_url_created_at=case when input_status='payment_pending' then coalesce(checkout_url_created_at,clock_timestamp()) else checkout_url_created_at end,
    production_handover_at=case when input_status in ('ready_for_production','completed') then coalesce(production_handover_at,clock_timestamp()) else production_handover_at end,
    last_error_code=case when input_status='failed' then left(lower(coalesce(input_error_code,'fulfilment_failed')),120) else null end,
    updated_at=clock_timestamp() where id=run_record.id returning * into run_record;
  target_offer_status:=case when input_status='payment_pending' then 'payment_pending'
    when input_status in ('ready_for_production','completed') and run_record.invoice_id is not null then 'paid'
    when input_status in ('ready_for_production','completed') then 'accepted' else null end;
  if target_offer_status is not null then
    update public.commercial_offer_versions set status=target_offer_status,
      paid_at=case when target_offer_status='paid' then coalesce(paid_at,clock_timestamp()) else paid_at end,
      accepted_at=case when target_offer_status='accepted' then coalesce(accepted_at,clock_timestamp()) else accepted_at end,
      updated_at=clock_timestamp() where id=run_record.offer_version_id;
    update public.commercial_offers set status=target_offer_status,updated_at=clock_timestamp()
      where id=run_record.offer_id and current_version_id=run_record.offer_version_id;
  end if;
  return jsonb_build_object('runId',run_record.id,'status',run_record.status,'customerId',run_record.customer_id,
    'invoiceId',run_record.invoice_id,'projectId',run_record.project_id,'factoryProjectId',run_record.factory_project_id);
end
$function$;

revoke all on public.commercial_offer_fulfilment_runs from public,anon,authenticated,service_role;
grant select on public.commercial_offer_fulfilment_runs to authenticated,service_role;
grant insert,update on public.commercial_offer_fulfilment_runs to service_role;
revoke all on function public.commercial_claim_signed_fulfilment_v1(uuid) from public,anon,authenticated;
revoke all on function public.commercial_finalize_fulfilment_v1(uuid,text,uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.commercial_claim_signed_fulfilment_v1(uuid) to service_role;
grant execute on function public.commercial_finalize_fulfilment_v1(uuid,text,uuid,uuid,uuid,uuid,text) to service_role;
comment on table public.commercial_offer_fulfilment_runs is 'Idempotent post-signature invoice, payment and production handover state.';
notify pgrst,'reload schema';
commit;
