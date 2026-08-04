-- Repair commercial Signhost checksum calls for projects where pgcrypto lives
-- exclusively in the extensions schema and exposes digest(bytea,text).
begin;

do $preflight$
begin
  if pg_catalog.to_regprocedure('public.commercial_finalize_offer_signature_v1(uuid,text,integer,text,text,text,text)') is null
     or pg_catalog.to_regclass('public.commercial_offer_signing_transactions') is null
     or pg_catalog.to_regclass('public.commercial_offer_fulfilment_runs') is null then
    raise exception using errcode='55000', message='Commercial Signhost prerequisites are missing.';
  end if;
  if pg_catalog.to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception using errcode='55000', message='extensions.digest(bytea,text) is missing.';
  end if;
end
$preflight$;

-- Production can contain the fulfilment table and RPCs while the staff-direct
-- reservation extension was never installed. Reconcile that safe partial state
-- before replacing the digest callers.
alter table public.commercial_offer_signing_transactions
  add column if not exists signing_origin text not null default 'customer_link',
  add column if not exists requested_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists requested_by_auth_user_id uuid references auth.users(id) on delete restrict;

alter table public.commercial_offer_signing_transactions
  alter column access_token_id drop not null,
  alter column signer_role drop not null,
  alter column authority_confirmed_at drop not null;

alter table public.commercial_offer_signing_transactions
  drop constraint if exists commercial_offer_signing_transactions_status_check,
  drop constraint if exists commercial_offer_signing_origin_check;

alter table public.commercial_offer_signing_transactions
  add constraint commercial_offer_signing_transactions_status_check check (status in (
    'creating','waiting_for_signer','signed','signed_pending_processing','completed',
    'rejected','expired','cancelled','failed'
  )),
  add constraint commercial_offer_signing_origin_check check (
    (signing_origin='customer_link' and access_token_id is not null and signer_role is not null and authority_confirmed_at is not null)
    or
    (signing_origin='staff_direct' and requested_by_profile_id is not null and requested_by_auth_user_id is not null)
  );

create or replace function public.commercial_finalize_offer_signature_v1(
  input_signing_transaction_id uuid,input_status text,input_provider_status integer,
  input_signed_document_path text,input_signed_document_sha256 text,input_receipt_path text,input_receipt_sha256 text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare tx public.commercial_offer_signing_transactions%rowtype; declare version_record public.commercial_offer_versions%rowtype;
begin
  if input_status not in ('waiting_for_signer','signed','rejected','expired','cancelled','failed') then raise exception using errcode='22023',message='Invalid signing status.'; end if;
  select * into tx from public.commercial_offer_signing_transactions where id=input_signing_transaction_id for update;
  if not found then raise exception using errcode='P0002',message='Signing transaction not found.'; end if;
  select * into version_record from public.commercial_offer_versions where id=tx.offer_version_id for update;
  if tx.status='signed' then return jsonb_build_object('signed',true,'duplicate',true,'offerVersionId',tx.offer_version_id); end if;
  if input_status='signed' and (input_signed_document_sha256 !~ '^[a-f0-9]{64}$' or input_receipt_sha256 !~ '^[a-f0-9]{64}$') then
    raise exception using errcode='22023',message='Signed artifacts are incomplete.';
  end if;
  update public.commercial_offer_signing_transactions set status=input_status,provider_status=input_provider_status,
    signed_document_path=case when input_status='signed' then input_signed_document_path else signed_document_path end,
    signed_document_sha256=case when input_status='signed' then input_signed_document_sha256 else signed_document_sha256 end,
    receipt_path=case when input_status='signed' then input_receipt_path else receipt_path end,
    receipt_sha256=case when input_status='signed' then input_receipt_sha256 else receipt_sha256 end,
    signed_at=case when input_status='signed' then coalesce(signed_at,clock_timestamp()) else signed_at end,
    last_postback_at=clock_timestamp(),updated_at=clock_timestamp() where id=tx.id;
  if input_status='signed' then
    update public.commercial_offer_versions set status='signed',signed_at=coalesce(signed_at,clock_timestamp()),updated_at=clock_timestamp() where id=tx.offer_version_id;
    update public.commercial_offers set status='signed',updated_at=clock_timestamp() where id=tx.offer_id;
    insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
    values(tx.offer_id,tx.offer_version_id,'offer.signed','signhost_webhook',version_record.status,'signed','signhost:'||tx.id||':signed',jsonb_build_object('provider','signhost','transactionIdSha256',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(tx.provider_transaction_id,'UTF8'),'sha256'),'hex'),'receiptStored',true))
    on conflict(offer_id,idempotency_key) do nothing;
  end if;
  return jsonb_build_object('signed',input_status='signed','duplicate',false,'offerId',tx.offer_id,'offerVersionId',tx.offer_version_id);
end
$function$;

create or replace function public.commercial_reserve_signature_v1(
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
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(lower(btrim(input_signer_email)),'UTF8'),'sha256'),'hex'),input_idempotency_key,
    gen_random_uuid()::text,input_actor_profile_id,input_actor_auth_user_id
  ) returning * into signing_record;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.signature_requested',input_actor_profile_id,input_actor_auth_user_id,actor_role,version_record.status,version_record.status,input_idempotency_key || ':event',jsonb_build_object('provider','signhost'));
  return jsonb_build_object('signingId',signing_record.id,'status',signing_record.status,'providerFileId',signing_record.provider_file_id,'duplicate',false);
end
$function$;

revoke all on function public.commercial_finalize_offer_signature_v1(uuid,text,integer,text,text,text,text) from public,anon,authenticated;
revoke all on function public.commercial_reserve_signature_v1(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.commercial_finalize_offer_signature_v1(uuid,text,integer,text,text,text,text) to service_role;
grant execute on function public.commercial_reserve_signature_v1(uuid,uuid,uuid,text,text,text) to service_role;

notify pgrst,'reload schema';
commit;
