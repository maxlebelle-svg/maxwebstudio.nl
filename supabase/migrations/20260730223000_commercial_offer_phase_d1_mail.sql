-- Phase D1: bounded preview/test/definitive-mail evidence and non-binding interest tokens.
-- Forward-only. No contract, payment, invoice, subscription or onboarding side effects.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.commercial_offer_events') is null
     or pg_catalog.to_regprocedure('public.commercial_assert_relationship_access(uuid,uuid,text,uuid)') is null then
    raise exception using errcode='55000', message='Commercial offer foundation is missing.';
  end if;
end
$preflight$;

alter table public.commercial_offer_events drop constraint commercial_offer_events_event_type_check;
alter table public.commercial_offer_events add constraint commercial_offer_events_event_type_check check (event_type in (
  'offer.created','offer.version_created','offer.changed','offer.ready_for_review',
  'offer.previewed','offer.test_mail_requested','offer.test_mail_sent','offer.send_reserved',
  'offer.sent','offer.dispatch_failed','offer.viewed','offer.revoked','offer.superseded',
  'offer.interest_confirmed','offer.interest_revoked','offer.signature_requested','offer.signed',
  'offer.payment_pending','offer.partially_paid','offer.paid','offer.accepted','offer.expired',
  'offer.declined','offer.failed','offer.custom_price_authorized'
));

create table public.commercial_offer_mail_dispatches (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.commercial_offers(id) on delete restrict,
  offer_version_id uuid not null references public.commercial_offer_versions(id) on delete restrict,
  dispatch_kind text not null check (dispatch_kind in ('test','definitive')),
  recipient_sha256 text not null check (recipient_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'reserved' check (status in ('reserved','sent','failed')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 180),
  actor_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id) on delete restrict,
  provider_message_id_sha256 text check (provider_message_id_sha256 is null or provider_message_id_sha256 ~ '^[a-f0-9]{64}$'),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_-]{2,80}$'),
  reserved_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint commercial_offer_mail_dispatch_idempotency unique (offer_id,idempotency_key)
);

create index commercial_offer_mail_dispatch_version_idx on public.commercial_offer_mail_dispatches(offer_version_id,dispatch_kind,created_at desc);
create index commercial_offer_mail_dispatch_actor_rate_idx on public.commercial_offer_mail_dispatches(actor_profile_id,created_at desc);

create table public.commercial_offer_interest_tokens (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.commercial_offers(id) on delete restrict,
  offer_version_id uuid not null references public.commercial_offer_versions(id) on delete restrict,
  dispatch_id uuid not null unique references public.commercial_offer_mail_dispatches(id) on delete restrict,
  token_sha256 text not null unique check (token_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  revoked_at timestamptz,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  constraint commercial_offer_interest_token_state check (confirmed_at is null or revoked_at is null)
);

create index commercial_offer_interest_version_idx on public.commercial_offer_interest_tokens(offer_version_id,created_at desc);

alter table public.commercial_offer_mail_dispatches enable row level security;
alter table public.commercial_offer_mail_dispatches force row level security;
alter table public.commercial_offer_interest_tokens enable row level security;
alter table public.commercial_offer_interest_tokens force row level security;

create function public.commercial_record_offer_preview_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_offer_version_id uuid,
  input_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare offer_record public.commercial_offers%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare actor_role text;
declare event_record public.commercial_offer_events%rowtype;
begin
  select * into version_record from public.commercial_offer_versions where id=input_offer_version_id;
  if not found then raise exception using errcode='P0002', message='Offer version not found.'; end if;
  select * into offer_record from public.commercial_offers where id=version_record.offer_id;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if offer_record.current_version_id is distinct from version_record.id or version_record.status <> 'ready_for_review'
     or version_record.has_non_binding_lines or offer_record.demo_journey_id is null then
    raise exception using errcode='23514', message='Offer version is not preview-ready.';
  end if;
  if char_length(input_idempotency_key) not between 16 and 180 then raise exception using errcode='22023', message='Invalid idempotency key.'; end if;
  select * into event_record from public.commercial_offer_events where offer_id=offer_record.id and idempotency_key=input_idempotency_key;
  if found then return jsonb_build_object('offerVersionId',version_record.id,'duplicate',true,'occurredAt',event_record.occurred_at); end if;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.previewed',input_actor_profile_id,input_actor_auth_user_id,actor_role,version_record.status,version_record.status,input_idempotency_key,jsonb_build_object('channel','composer'))
  returning * into event_record;
  return jsonb_build_object('offerVersionId',version_record.id,'duplicate',false,'occurredAt',event_record.occurred_at);
end
$function$;

create function public.commercial_reserve_offer_dispatch_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_offer_version_id uuid,
  input_dispatch_kind text,
  input_recipient_sha256 text,
  input_token_sha256 text,
  input_token_expires_at timestamptz,
  input_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare offer_record public.commercial_offers%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare actor_role text;
declare dispatch_record public.commercial_offer_mail_dispatches%rowtype;
declare revoked_count integer := 0;
begin
  select * into version_record from public.commercial_offer_versions where id=input_offer_version_id for update;
  if not found then raise exception using errcode='P0002', message='Offer version not found.'; end if;
  select * into offer_record from public.commercial_offers where id=version_record.offer_id for update;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if input_dispatch_kind not in ('test','definitive') or input_recipient_sha256 is null or input_recipient_sha256 !~ '^[a-f0-9]{64}$'
     or char_length(input_idempotency_key) not between 16 and 180 then
    raise exception using errcode='22023', message='Invalid mail dispatch reservation.';
  end if;
  select * into dispatch_record from public.commercial_offer_mail_dispatches where offer_id=offer_record.id and idempotency_key=input_idempotency_key;
  if found then return jsonb_build_object('dispatchId',dispatch_record.id,'status',dispatch_record.status,'kind',dispatch_record.dispatch_kind,'duplicate',true); end if;
  if offer_record.current_version_id is distinct from version_record.id or version_record.status not in ('ready_for_review','sent')
     or version_record.has_non_binding_lines or offer_record.demo_journey_id is null then
    raise exception using errcode='23514', message='Offer version is not dispatch-ready.';
  end if;
  if input_dispatch_kind='test' and version_record.status <> 'ready_for_review' then
    raise exception using errcode='23514', message='Test mail is only available before definitive send.';
  end if;
  if not exists(select 1 from public.commercial_offer_events where offer_version_id=version_record.id and event_type='offer.previewed') then
    raise exception using errcode='23514', message='Preview evidence is required.';
  end if;
  if input_dispatch_kind='test' then
    if input_token_sha256 is not null or input_token_expires_at is not null then raise exception using errcode='22023', message='Test mail cannot create an interest token.'; end if;
    if (select count(*) from public.commercial_offer_mail_dispatches where actor_profile_id=input_actor_profile_id and dispatch_kind='test' and created_at > clock_timestamp()-interval '1 hour') >= 10 then
      raise exception using errcode='55000', message='Test mail rate limit reached.';
    end if;
  else
    if input_token_sha256 is null or input_token_sha256 !~ '^[a-f0-9]{64}$' or input_token_expires_at is null or input_token_expires_at not between clock_timestamp()+interval '1 hour' and clock_timestamp()+interval '31 days' then
      raise exception using errcode='22023', message='Invalid interest token reservation.';
    end if;
    if not exists(select 1 from public.commercial_offer_mail_dispatches where offer_version_id=version_record.id and dispatch_kind='test' and status='sent') then
      raise exception using errcode='23514', message='Successful test mail evidence is required.';
    end if;
    if (select count(*) from public.commercial_offer_mail_dispatches where offer_version_id=version_record.id and dispatch_kind='definitive' and created_at > clock_timestamp()-interval '24 hours') >= 3 then
      raise exception using errcode='55000', message='Definitive mail rate limit reached.';
    end if;
  end if;
  insert into public.commercial_offer_mail_dispatches(offer_id,offer_version_id,dispatch_kind,recipient_sha256,idempotency_key,actor_profile_id,actor_auth_user_id)
  values(offer_record.id,version_record.id,input_dispatch_kind,input_recipient_sha256,input_idempotency_key,input_actor_profile_id,input_actor_auth_user_id)
  returning * into dispatch_record;
  if input_dispatch_kind='definitive' then
    update public.commercial_offer_interest_tokens set revoked_at=clock_timestamp()
      where offer_version_id=version_record.id and confirmed_at is null and revoked_at is null;
    get diagnostics revoked_count = row_count;
    if revoked_count > 0 then
      insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
      values(offer_record.id,version_record.id,'offer.interest_revoked',input_actor_profile_id,input_actor_auth_user_id,actor_role,version_record.status,version_record.status,input_idempotency_key || ':revoke-prior',jsonb_build_object('count',revoked_count,'reason','superseded_by_resend'));
    end if;
    insert into public.commercial_offer_interest_tokens(offer_id,offer_version_id,dispatch_id,token_sha256,expires_at,created_by_profile_id)
    values(offer_record.id,version_record.id,dispatch_record.id,input_token_sha256,input_token_expires_at,input_actor_profile_id);
  end if;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,case when input_dispatch_kind='test' then 'offer.test_mail_requested' else 'offer.send_reserved' end,input_actor_profile_id,input_actor_auth_user_id,actor_role,version_record.status,version_record.status,input_idempotency_key || ':event',jsonb_build_object('dispatchKind',input_dispatch_kind));
  return jsonb_build_object('dispatchId',dispatch_record.id,'status','reserved','kind',input_dispatch_kind,'duplicate',false);
end
$function$;

create function public.commercial_finalize_offer_dispatch_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_dispatch_id uuid,
  input_sent boolean,
  input_provider_message_id_sha256 text,
  input_failure_code text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare dispatch_record public.commercial_offer_mail_dispatches%rowtype;
declare offer_record public.commercial_offers%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare actor_role text;
declare new_dispatch_status text;
declare event_name text;
begin
  select * into dispatch_record from public.commercial_offer_mail_dispatches where id=input_dispatch_id for update;
  if not found then raise exception using errcode='P0002', message='Mail dispatch not found.'; end if;
  select * into offer_record from public.commercial_offers where id=dispatch_record.offer_id for update;
  select * into version_record from public.commercial_offer_versions where id=dispatch_record.offer_version_id for update;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if dispatch_record.status <> 'reserved' then return jsonb_build_object('dispatchId',dispatch_record.id,'status',dispatch_record.status,'duplicate',true); end if;
  if input_sent and (input_provider_message_id_sha256 is null or input_provider_message_id_sha256 !~ '^[a-f0-9]{64}$') then raise exception using errcode='22023', message='Provider evidence hash is invalid.'; end if;
  new_dispatch_status := case when input_sent then 'sent' else 'failed' end;
  update public.commercial_offer_mail_dispatches set status=new_dispatch_status,provider_message_id_sha256=case when input_sent then input_provider_message_id_sha256 end,
    failure_code=case when input_sent then null else coalesce(nullif(left(regexp_replace(lower(coalesce(input_failure_code,'provider_failed')),'[^a-z0-9_-]+','_','g'),80),''),'provider_failed') end,completed_at=clock_timestamp()
    where id=dispatch_record.id;
  if input_sent and dispatch_record.dispatch_kind='definitive' then
    update public.commercial_offer_versions set status='sent',sent_at=clock_timestamp(),updated_at=clock_timestamp() where id=version_record.id;
    update public.commercial_offers set status='sent',updated_at=clock_timestamp() where id=offer_record.id;
    event_name := 'offer.sent';
  elsif input_sent then event_name := 'offer.test_mail_sent';
  else event_name := 'offer.dispatch_failed'; end if;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,event_name,input_actor_profile_id,input_actor_auth_user_id,actor_role,case when input_sent then null else 'Mailprovider heeft verzending niet bevestigd.' end,version_record.status,case when input_sent and dispatch_record.dispatch_kind='definitive' then 'sent' else version_record.status end,dispatch_record.idempotency_key || ':final',jsonb_build_object('dispatchKind',dispatch_record.dispatch_kind,'result',new_dispatch_status));
  return jsonb_build_object('dispatchId',dispatch_record.id,'status',new_dispatch_status,'kind',dispatch_record.dispatch_kind,'duplicate',false);
end
$function$;

create function public.commercial_revoke_offer_interest_v1(input_actor_profile_id uuid,input_actor_auth_user_id uuid,input_offer_version_id uuid,input_reason text,input_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare offer_record public.commercial_offers%rowtype; declare version_record public.commercial_offer_versions%rowtype; declare actor_role text; declare affected integer;
begin
  select * into version_record from public.commercial_offer_versions where id=input_offer_version_id;
  if not found then raise exception using errcode='P0002',message='Offer version not found.'; end if;
  select * into offer_record from public.commercial_offers where id=version_record.offer_id;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if char_length(btrim(coalesce(input_reason,'')))<8 or char_length(input_idempotency_key) not between 16 and 180 then raise exception using errcode='22023',message='Revocation reason or key is invalid.'; end if;
  if exists(select 1 from public.commercial_offer_events where offer_id=offer_record.id and idempotency_key=input_idempotency_key) then return jsonb_build_object('offerVersionId',version_record.id,'duplicate',true); end if;
  update public.commercial_offer_interest_tokens set revoked_at=clock_timestamp() where offer_version_id=version_record.id and confirmed_at is null and revoked_at is null;
  get diagnostics affected=row_count;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.interest_revoked',input_actor_profile_id,input_actor_auth_user_id,actor_role,btrim(input_reason),version_record.status,version_record.status,input_idempotency_key,jsonb_build_object('count',affected,'reason','manual'));
  return jsonb_build_object('offerVersionId',version_record.id,'revokedCount',affected,'duplicate',false);
end
$function$;

create function public.commercial_confirm_offer_interest_v1(input_token_sha256 text,input_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare token_record public.commercial_offer_interest_tokens%rowtype; declare offer_record public.commercial_offers%rowtype; declare version_record public.commercial_offer_versions%rowtype;
begin
  if input_token_sha256 !~ '^[a-f0-9]{64}$' or char_length(input_idempotency_key) not between 16 and 180 then raise exception using errcode='22023',message='Interest confirmation is invalid.'; end if;
  select * into token_record from public.commercial_offer_interest_tokens where token_sha256=input_token_sha256 for update;
  if not found then raise exception using errcode='P0002',message='Interest token not found.'; end if;
  if token_record.revoked_at is not null or token_record.expires_at<=clock_timestamp() then raise exception using errcode='23514',message='Interest token is no longer valid.'; end if;
  select * into offer_record from public.commercial_offers where id=token_record.offer_id;
  select * into version_record from public.commercial_offer_versions where id=token_record.offer_version_id;
  if token_record.confirmed_at is not null then return jsonb_build_object('confirmed',true,'duplicate',true,'confirmedAt',token_record.confirmed_at); end if;
  update public.commercial_offer_interest_tokens set confirmed_at=clock_timestamp() where id=token_record.id returning * into token_record;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.interest_confirmed','customer_interest',version_record.status,version_record.status,input_idempotency_key,jsonb_build_object('nonBinding',true,'channel','interest_page'));
  return jsonb_build_object('confirmed',true,'duplicate',false,'confirmedAt',token_record.confirmed_at);
end
$function$;

revoke all on public.commercial_offer_mail_dispatches,public.commercial_offer_interest_tokens from public,anon,authenticated,service_role;
grant select on public.commercial_offer_mail_dispatches,public.commercial_offer_interest_tokens to service_role;
revoke all on function public.commercial_record_offer_preview_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.commercial_reserve_offer_dispatch_v1(uuid,uuid,uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.commercial_finalize_offer_dispatch_v1(uuid,uuid,uuid,boolean,text,text) from public,anon,authenticated;
revoke all on function public.commercial_revoke_offer_interest_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.commercial_confirm_offer_interest_v1(text,text) from public,anon,authenticated;
grant execute on function public.commercial_record_offer_preview_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.commercial_reserve_offer_dispatch_v1(uuid,uuid,uuid,text,text,text,timestamptz,text) to service_role;
grant execute on function public.commercial_finalize_offer_dispatch_v1(uuid,uuid,uuid,boolean,text,text) to service_role;
grant execute on function public.commercial_revoke_offer_interest_v1(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.commercial_confirm_offer_interest_v1(text,text) to service_role;

comment on table public.commercial_offer_mail_dispatches is 'Bounded mail reservations with hashed recipients and provider evidence; no raw tokens.';
comment on table public.commercial_offer_interest_tokens is 'Hashed, version-scoped, expiring and revocable non-binding interest tokens.';
notify pgrst, 'reload schema';
commit;
