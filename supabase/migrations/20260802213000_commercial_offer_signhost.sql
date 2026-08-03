-- Customer-facing definitive offer signing through Signhost.
-- A personal proposal remains non-binding; only a verified provider postback can mark an offer signed.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.commercial_offer_interest_tokens') is null
     or pg_catalog.to_regprocedure('public.commercial_reserve_offer_dispatch_v1(uuid,uuid,uuid,text,text,text,timestamptz,text)') is null then
    raise exception using errcode='55000', message='Commercial offer mail phase is missing.';
  end if;
end
$preflight$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('commercial-private-documents','commercial-private-documents',false,15728640,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.commercial_offer_signing_access_tokens (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.commercial_offers(id) on delete restrict,
  offer_version_id uuid not null references public.commercial_offer_versions(id) on delete restrict,
  dispatch_id uuid not null unique references public.commercial_offer_mail_dispatches(id) on delete restrict,
  token_sha256 text not null unique check(token_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  started_at timestamptz,
  revoked_at timestamptz,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);

create table public.commercial_offer_signing_transactions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.commercial_offers(id) on delete restrict,
  offer_version_id uuid not null unique references public.commercial_offer_versions(id) on delete restrict,
  access_token_id uuid not null unique references public.commercial_offer_signing_access_tokens(id) on delete restrict,
  provider text not null default 'signhost' check(provider='signhost'),
  provider_transaction_id text unique,
  provider_file_id text,
  provider_status integer,
  status text not null default 'creating' check(status in ('creating','waiting_for_signer','signed','rejected','expired','cancelled','failed')),
  signer_name text not null check(char_length(btrim(signer_name)) between 2 and 160),
  signer_role text not null check(char_length(btrim(signer_role)) between 2 and 120),
  signer_email_sha256 text not null check(signer_email_sha256 ~ '^[a-f0-9]{64}$'),
  signer_phone_sha256 text check(signer_phone_sha256 is null or signer_phone_sha256 ~ '^[a-f0-9]{64}$'),
  authority_confirmed_at timestamptz not null,
  unsigned_document_path text,
  unsigned_document_sha256 text check(unsigned_document_sha256 is null or unsigned_document_sha256 ~ '^[a-f0-9]{64}$'),
  signed_document_path text,
  signed_document_sha256 text check(signed_document_sha256 is null or signed_document_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_path text,
  receipt_sha256 text check(receipt_sha256 is null or receipt_sha256 ~ '^[a-f0-9]{64}$'),
  requested_at timestamptz,
  signed_at timestamptz,
  last_postback_at timestamptz,
  failure_code text,
  idempotency_key text not null unique check(char_length(idempotency_key) between 16 and 180),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index commercial_offer_signing_access_version_idx on public.commercial_offer_signing_access_tokens(offer_version_id,created_at desc);
create index commercial_offer_signing_provider_idx on public.commercial_offer_signing_transactions(provider,provider_transaction_id);
alter table public.commercial_offer_signing_access_tokens enable row level security;
alter table public.commercial_offer_signing_access_tokens force row level security;
alter table public.commercial_offer_signing_transactions enable row level security;
alter table public.commercial_offer_signing_transactions force row level security;

create function public.commercial_reserve_offer_dispatch_v2(
  input_actor_profile_id uuid,input_actor_auth_user_id uuid,input_offer_version_id uuid,
  input_dispatch_kind text,input_recipient_sha256 text,input_token_sha256 text,
  input_token_expires_at timestamptz,input_idempotency_key text
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare result jsonb; declare version_record public.commercial_offer_versions%rowtype; declare dispatch_uuid uuid;
begin
  select * into version_record from public.commercial_offer_versions where id=input_offer_version_id;
  if not found then raise exception using errcode='P0002',message='Offer version not found.'; end if;
  result := public.commercial_reserve_offer_dispatch_v1(input_actor_profile_id,input_actor_auth_user_id,input_offer_version_id,input_dispatch_kind,input_recipient_sha256,input_token_sha256,input_token_expires_at,input_idempotency_key);
  if input_dispatch_kind='definitive' and coalesce(version_record.snapshot->>'offerPurpose','personal_proposal')='definitive_offer' then
    dispatch_uuid := (result->>'dispatchId')::uuid;
    update public.commercial_offer_interest_tokens set revoked_at=coalesce(revoked_at,clock_timestamp()) where dispatch_id=dispatch_uuid;
    update public.commercial_offer_signing_access_tokens set revoked_at=clock_timestamp()
      where offer_version_id=input_offer_version_id and started_at is null and revoked_at is null and dispatch_id<>dispatch_uuid;
    insert into public.commercial_offer_signing_access_tokens(offer_id,offer_version_id,dispatch_id,token_sha256,expires_at,created_by_profile_id)
      select version_record.offer_id,version_record.id,dispatch_uuid,input_token_sha256,input_token_expires_at,input_actor_profile_id
      where coalesce((result->>'duplicate')::boolean,false)=false
      on conflict(dispatch_id) do nothing;
  end if;
  return result || jsonb_build_object('offerPurpose',coalesce(version_record.snapshot->>'offerPurpose','personal_proposal'));
end
$function$;

create function public.commercial_finalize_offer_signature_v1(
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
    values(tx.offer_id,tx.offer_version_id,'offer.signed','signhost_webhook',version_record.status,'signed','signhost:'||tx.id||':signed',jsonb_build_object('provider','signhost','transactionIdSha256',encode(extensions.digest(tx.provider_transaction_id,'sha256'),'hex'),'receiptStored',true))
    on conflict(offer_id,idempotency_key) do nothing;
  end if;
  return jsonb_build_object('signed',input_status='signed','duplicate',false,'offerId',tx.offer_id,'offerVersionId',tx.offer_version_id);
end
$function$;

revoke all on public.commercial_offer_signing_access_tokens,public.commercial_offer_signing_transactions from public,anon,authenticated,service_role;
grant select,insert,update on public.commercial_offer_signing_access_tokens,public.commercial_offer_signing_transactions to service_role;
revoke all on function public.commercial_reserve_offer_dispatch_v2(uuid,uuid,uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.commercial_finalize_offer_signature_v1(uuid,text,integer,text,text,text,text) from public,anon,authenticated;
grant execute on function public.commercial_reserve_offer_dispatch_v2(uuid,uuid,uuid,text,text,text,timestamptz,text) to service_role;
grant execute on function public.commercial_finalize_offer_signature_v1(uuid,text,integer,text,text,text,text) to service_role;

comment on table public.commercial_offer_signing_transactions is 'Provider-backed B2B signature evidence. Only a verified Signhost postback may finalize an offer.';
notify pgrst,'reload schema';
commit;
