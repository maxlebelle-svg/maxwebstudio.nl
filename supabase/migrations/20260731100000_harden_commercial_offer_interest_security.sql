-- Harden D1 interest access, lifecycle status and sensitive mail-log retention.
-- Forward-only. No contract, payment, invoice, subscription or onboarding side effects.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.commercial_offer_interest_tokens') is null
     or pg_catalog.to_regclass('public.email_logs') is null
     or pg_catalog.to_regprocedure('public.commercial_reserve_offer_dispatch_v1(uuid,uuid,uuid,text,text,text,timestamptz,text)') is null then
    raise exception using errcode='55000', message='Commercial offer D1 foundation is missing.';
  end if;
end
$preflight$;

alter table public.commercial_offer_interest_tokens
  add column revoked_by_profile_id uuid references public.profiles(id) on delete restrict,
  add column revoked_by_auth_user_id uuid references auth.users(id) on delete restrict,
  add column revoke_reason text check (revoke_reason is null or char_length(btrim(revoke_reason)) between 8 and 500);

create unique index commercial_offer_interest_one_active_unconfirmed_idx
  on public.commercial_offer_interest_tokens(offer_version_id)
  where confirmed_at is null and revoked_at is null;

alter table public.commercial_offers drop constraint commercial_offers_status_check;
alter table public.commercial_offers add constraint commercial_offers_status_check check (status in (
  'draft','ready_for_review','sent','viewed','interested','revoked','superseded','signed',
  'payment_pending','partially_paid','paid','accepted','expired','declined','failed'
));

alter table public.commercial_offer_versions drop constraint commercial_offer_versions_status_check;
alter table public.commercial_offer_versions add constraint commercial_offer_versions_status_check check (status in (
  'draft','ready_for_review','sent','viewed','interested','revoked','superseded','signed',
  'payment_pending','partially_paid','paid','accepted','expired','declined','failed'
));

alter table public.commercial_offer_events drop constraint commercial_offer_events_event_type_check;
alter table public.commercial_offer_events add constraint commercial_offer_events_event_type_check check (event_type in (
  'offer.created','offer.version_created','offer.changed','offer.ready_for_review',
  'offer.previewed','offer.test_mail_requested','offer.test_mail_sent','offer.send_reserved',
  'offer.sent','offer.email_resent','offer.dispatch_failed','offer.viewed','offer.revoked','offer.superseded',
  'offer.interest_confirmed','offer.interest_revoked','offer.interest_access_revoked',
  'offer.previous_interest_token_revoked','offer.sensitive_email_log_redacted',
  'offer.signature_requested','offer.signed','offer.payment_pending','offer.partially_paid',
  'offer.paid','offer.accepted','offer.expired','offer.declined','offer.failed','offer.custom_price_authorized'
));

create or replace function public.commercial_reserve_offer_dispatch_v1(
  input_actor_profile_id uuid,input_actor_auth_user_id uuid,input_offer_version_id uuid,
  input_dispatch_kind text,input_recipient_sha256 text,input_token_sha256 text,
  input_token_expires_at timestamptz,input_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare offer_record public.commercial_offers%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare actor_role text;
declare dispatch_record public.commercial_offer_mail_dispatches%rowtype;
declare revoked_count integer := 0;
begin
  select * into version_record from public.commercial_offer_versions where id=input_offer_version_id for update;
  if not found then raise exception using errcode='P0002',message='Offer version not found.'; end if;
  select * into offer_record from public.commercial_offers where id=version_record.offer_id for update;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if input_dispatch_kind not in ('test','definitive') or input_recipient_sha256 is null or input_recipient_sha256 !~ '^[a-f0-9]{64}$'
     or char_length(input_idempotency_key) not between 16 and 180 then
    raise exception using errcode='22023',message='Invalid mail dispatch reservation.';
  end if;
  select * into dispatch_record from public.commercial_offer_mail_dispatches where offer_id=offer_record.id and idempotency_key=input_idempotency_key;
  if found then return jsonb_build_object('dispatchId',dispatch_record.id,'status',dispatch_record.status,'kind',dispatch_record.dispatch_kind,'duplicate',true); end if;
  if offer_record.current_version_id is distinct from version_record.id or version_record.status not in ('ready_for_review','sent')
     or version_record.has_non_binding_lines or offer_record.demo_journey_id is null then
    raise exception using errcode='23514',message='Offer version is not dispatch-ready.';
  end if;
  if exists(select 1 from public.commercial_offer_interest_tokens where offer_version_id=version_record.id and confirmed_at is not null) then
    raise exception using errcode='23514',message='Confirmed interest cannot create a new access token.';
  end if;
  if input_dispatch_kind='test' and version_record.status <> 'ready_for_review' then
    raise exception using errcode='23514',message='Test mail is only available before definitive send.';
  end if;
  if not exists(select 1 from public.commercial_offer_events where offer_version_id=version_record.id and event_type='offer.previewed') then
    raise exception using errcode='23514',message='Preview evidence is required.';
  end if;
  if input_dispatch_kind='test' then
    if input_token_sha256 is not null or input_token_expires_at is not null then raise exception using errcode='22023',message='Test mail cannot create an interest token.'; end if;
    if (select count(*) from public.commercial_offer_mail_dispatches where actor_profile_id=input_actor_profile_id and dispatch_kind='test' and created_at>clock_timestamp()-interval '1 hour')>=10 then
      raise exception using errcode='55000',message='Test mail rate limit reached.';
    end if;
  else
    if input_token_sha256 is null or input_token_sha256 !~ '^[a-f0-9]{64}$' or input_token_expires_at is null
       or input_token_expires_at not between clock_timestamp()+interval '1 hour' and clock_timestamp()+interval '31 days' then
      raise exception using errcode='22023',message='Invalid interest token reservation.';
    end if;
    if not exists(select 1 from public.commercial_offer_mail_dispatches where offer_version_id=version_record.id and dispatch_kind='test' and status='sent') then
      raise exception using errcode='23514',message='Successful test mail evidence is required.';
    end if;
    if (select count(*) from public.commercial_offer_mail_dispatches where offer_version_id=version_record.id and dispatch_kind='definitive' and created_at>clock_timestamp()-interval '24 hours')>=3 then
      raise exception using errcode='55000',message='Definitive mail rate limit reached.';
    end if;
  end if;
  insert into public.commercial_offer_mail_dispatches(offer_id,offer_version_id,dispatch_kind,recipient_sha256,idempotency_key,actor_profile_id,actor_auth_user_id)
  values(offer_record.id,version_record.id,input_dispatch_kind,input_recipient_sha256,input_idempotency_key,input_actor_profile_id,input_actor_auth_user_id)
  returning * into dispatch_record;
  if input_dispatch_kind='definitive' then
    update public.commercial_offer_interest_tokens
      set revoked_at=clock_timestamp(),revoked_by_profile_id=input_actor_profile_id,revoked_by_auth_user_id=input_actor_auth_user_id,revoke_reason='Vervangen door opnieuw verzonden beveiligde link.'
      where offer_version_id=version_record.id and confirmed_at is null and revoked_at is null;
    get diagnostics revoked_count=row_count;
    if revoked_count>0 then
      insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
      values(offer_record.id,version_record.id,'offer.previous_interest_token_revoked',input_actor_profile_id,input_actor_auth_user_id,actor_role,'Vervangen door opnieuw verzonden beveiligde link.',version_record.status,version_record.status,input_idempotency_key||':revoke-prior',jsonb_build_object('count',revoked_count));
    end if;
    insert into public.commercial_offer_interest_tokens(offer_id,offer_version_id,dispatch_id,token_sha256,expires_at,created_by_profile_id)
    values(offer_record.id,version_record.id,dispatch_record.id,input_token_sha256,input_token_expires_at,input_actor_profile_id);
  end if;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,case when input_dispatch_kind='test' then 'offer.test_mail_requested' else 'offer.send_reserved' end,input_actor_profile_id,input_actor_auth_user_id,actor_role,version_record.status,version_record.status,input_idempotency_key||':event',jsonb_build_object('dispatchKind',input_dispatch_kind));
  return jsonb_build_object('dispatchId',dispatch_record.id,'status','reserved','kind',input_dispatch_kind,'duplicate',false);
end
$function$;

create or replace function public.commercial_finalize_offer_dispatch_v1(input_actor_profile_id uuid,input_actor_auth_user_id uuid,input_dispatch_id uuid,input_sent boolean,input_provider_message_id_sha256 text,input_failure_code text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare dispatch_record public.commercial_offer_mail_dispatches%rowtype; declare offer_record public.commercial_offers%rowtype; declare version_record public.commercial_offer_versions%rowtype;
declare actor_role text; declare new_dispatch_status text; declare event_name text; declare earlier_sent integer;
begin
  select * into dispatch_record from public.commercial_offer_mail_dispatches where id=input_dispatch_id for update;
  if not found then raise exception using errcode='P0002',message='Mail dispatch not found.'; end if;
  select * into offer_record from public.commercial_offers where id=dispatch_record.offer_id for update;
  select * into version_record from public.commercial_offer_versions where id=dispatch_record.offer_version_id for update;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if dispatch_record.status<>'reserved' then return jsonb_build_object('dispatchId',dispatch_record.id,'status',dispatch_record.status,'duplicate',true); end if;
  if input_sent and (input_provider_message_id_sha256 is null or input_provider_message_id_sha256 !~ '^[a-f0-9]{64}$') then raise exception using errcode='22023',message='Provider evidence hash is invalid.'; end if;
  select count(*) into earlier_sent from public.commercial_offer_mail_dispatches where offer_version_id=version_record.id and dispatch_kind=dispatch_record.dispatch_kind and status='sent';
  new_dispatch_status := case when input_sent then 'sent' else 'failed' end;
  update public.commercial_offer_mail_dispatches set status=new_dispatch_status,provider_message_id_sha256=case when input_sent then input_provider_message_id_sha256 end,
    failure_code=case when input_sent then null else coalesce(nullif(left(regexp_replace(lower(coalesce(input_failure_code,'provider_failed')),'[^a-z0-9_-]+','_','g'),80),''),'provider_failed') end,completed_at=clock_timestamp()
    where id=dispatch_record.id;
  if input_sent and dispatch_record.dispatch_kind='definitive' then
    update public.commercial_offer_versions set status='sent',sent_at=coalesce(sent_at,clock_timestamp()),updated_at=clock_timestamp() where id=version_record.id;
    update public.commercial_offers set status='sent',updated_at=clock_timestamp() where id=offer_record.id;
    event_name := case when earlier_sent>0 then 'offer.email_resent' else 'offer.sent' end;
  elsif input_sent then event_name := 'offer.test_mail_sent'; else event_name := 'offer.dispatch_failed'; end if;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,event_name,input_actor_profile_id,input_actor_auth_user_id,actor_role,case when input_sent then null else 'Mailprovider heeft verzending niet bevestigd.' end,version_record.status,case when input_sent and dispatch_record.dispatch_kind='definitive' then 'sent' else version_record.status end,dispatch_record.idempotency_key||':final',jsonb_build_object('dispatchKind',dispatch_record.dispatch_kind,'result',new_dispatch_status));
  return jsonb_build_object('dispatchId',dispatch_record.id,'status',new_dispatch_status,'kind',dispatch_record.dispatch_kind,'duplicate',false);
end
$function$;

create or replace function public.commercial_revoke_offer_interest_v1(input_actor_profile_id uuid,input_actor_auth_user_id uuid,input_offer_version_id uuid,input_reason text,input_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare offer_record public.commercial_offers%rowtype; declare version_record public.commercial_offer_versions%rowtype; declare actor_role text; declare affected integer;
begin
  select * into version_record from public.commercial_offer_versions where id=input_offer_version_id for update;
  if not found then raise exception using errcode='P0002',message='Offer version not found.'; end if;
  select * into offer_record from public.commercial_offers where id=version_record.offer_id;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if actor_role not in ('super_admin','admin') then raise exception using errcode='42501',message='Interest revocation requires an administrator.'; end if;
  if char_length(btrim(coalesce(input_reason,''))) not between 8 and 500 or char_length(input_idempotency_key) not between 16 and 180 then raise exception using errcode='22023',message='Revocation reason or key is invalid.'; end if;
  if exists(select 1 from public.commercial_offer_events where offer_id=offer_record.id and idempotency_key=input_idempotency_key) then return jsonb_build_object('offerVersionId',version_record.id,'duplicate',true,'revokedCount',0); end if;
  update public.commercial_offer_interest_tokens set revoked_at=clock_timestamp(),revoked_by_profile_id=input_actor_profile_id,revoked_by_auth_user_id=input_actor_auth_user_id,revoke_reason=btrim(input_reason)
    where offer_version_id=version_record.id and confirmed_at is null and revoked_at is null;
  get diagnostics affected=row_count;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.interest_access_revoked',input_actor_profile_id,input_actor_auth_user_id,actor_role,btrim(input_reason),version_record.status,version_record.status,input_idempotency_key,jsonb_build_object('count',affected));
  return jsonb_build_object('offerVersionId',version_record.id,'revokedCount',affected,'duplicate',false);
end
$function$;

create or replace function public.commercial_confirm_offer_interest_v1(input_token_sha256 text,input_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare token_record public.commercial_offer_interest_tokens%rowtype; declare offer_record public.commercial_offers%rowtype; declare version_record public.commercial_offer_versions%rowtype;
begin
  if input_token_sha256 !~ '^[a-f0-9]{64}$' or char_length(input_idempotency_key) not between 16 and 180 then raise exception using errcode='22023',message='Interest confirmation is invalid.'; end if;
  select * into token_record from public.commercial_offer_interest_tokens where token_sha256=input_token_sha256 for update;
  if not found then raise exception using errcode='P0002',message='Interest token not found.'; end if;
  if token_record.revoked_at is not null or token_record.expires_at<=clock_timestamp() then raise exception using errcode='23514',message='Interest token is no longer valid.'; end if;
  select * into offer_record from public.commercial_offers where id=token_record.offer_id for update;
  select * into version_record from public.commercial_offer_versions where id=token_record.offer_version_id for update;
  if token_record.confirmed_at is not null then return jsonb_build_object('confirmed',true,'duplicate',true,'confirmedAt',token_record.confirmed_at,'status','interested'); end if;
  if offer_record.current_version_id is distinct from version_record.id or version_record.status not in ('sent','viewed') or offer_record.status not in ('sent','viewed') then
    raise exception using errcode='23514',message='Interest token does not target the current sent version.';
  end if;
  update public.commercial_offer_interest_tokens set confirmed_at=clock_timestamp() where id=token_record.id returning * into token_record;
  update public.commercial_offer_versions set status='interested',updated_at=clock_timestamp() where id=version_record.id;
  update public.commercial_offers set status='interested',updated_at=clock_timestamp() where id=offer_record.id;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_role,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.interest_confirmed','customer_interest',version_record.status,'interested',input_idempotency_key,jsonb_build_object('nonBinding',true,'channel','interest_page','tokenRecordId',token_record.id));
  return jsonb_build_object('confirmed',true,'duplicate',false,'confirmedAt',token_record.confirmed_at,'status','interested');
end
$function$;

create function public.commercial_redact_offer_email_logs_v1(input_actor_profile_id uuid,input_actor_auth_user_id uuid,input_offer_version_id uuid,input_reason text,input_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $function$
declare offer_record public.commercial_offers%rowtype; declare version_record public.commercial_offer_versions%rowtype; declare actor_role text; declare affected integer;
begin
  select * into version_record from public.commercial_offer_versions where id=input_offer_version_id;
  if not found then raise exception using errcode='P0002',message='Offer version not found.'; end if;
  select * into offer_record from public.commercial_offers where id=version_record.offer_id;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if actor_role not in ('super_admin','admin') then raise exception using errcode='42501',message='Mail-log redaction requires an administrator.'; end if;
  if char_length(btrim(coalesce(input_reason,''))) not between 8 and 500 or char_length(input_idempotency_key) not between 16 and 180 then raise exception using errcode='22023',message='Redaction reason or key is invalid.'; end if;
  if exists(select 1 from public.commercial_offer_events where offer_id=offer_record.id and idempotency_key=input_idempotency_key) then return jsonb_build_object('offerVersionId',version_record.id,'duplicate',true,'redactedCount',0); end if;
  update public.email_logs set html_body=null,text_body=null,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('contentRedacted',true,'redactionType','commercial_offer_interest_access','redactedAt',clock_timestamp()),updated_at=clock_timestamp()
    where template_key='commercial_offer_definitive' and (html_body is not null or text_body is not null)
      and ((offer_record.relationship_type='lead' and lead_id=offer_record.relationship_id) or (offer_record.relationship_type='customer' and customer_id=offer_record.relationship_id));
  get diagnostics affected=row_count;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.sensitive_email_log_redacted',input_actor_profile_id,input_actor_auth_user_id,actor_role,btrim(input_reason),version_record.status,version_record.status,input_idempotency_key,jsonb_build_object('count',affected,'fields',jsonb_build_array('html_body','text_body')));
  return jsonb_build_object('offerVersionId',version_record.id,'redactedCount',affected,'duplicate',false);
end
$function$;

revoke all on function public.commercial_redact_offer_email_logs_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.commercial_redact_offer_email_logs_v1(uuid,uuid,uuid,text,text) to service_role;

comment on function public.commercial_redact_offer_email_logs_v1(uuid,uuid,uuid,text,text) is 'Admin-only, audited removal of sensitive definitive-offer message bodies.';
notify pgrst, 'reload schema';
commit;
