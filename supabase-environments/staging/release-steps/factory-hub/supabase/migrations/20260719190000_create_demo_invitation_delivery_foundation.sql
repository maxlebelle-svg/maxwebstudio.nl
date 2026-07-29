-- RC1.6B: durable, idempotent demo invitation delivery and preview-open tracking.
-- This migration creates storage and bounded RPCs only. It never calls a provider.

begin;

create extension if not exists pgcrypto;

create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  direction text not null default 'outbound',
  status text not null default 'planned',
  provider text not null default 'resend',
  provider_message_id text null,
  provider_metadata jsonb not null default '{}'::jsonb,
  message_type text not null default 'generic',
  template_key text null,
  template_name text null,
  template_id text null,
  template_version integer null,
  from_email text null,
  from_name text null,
  to_email text not null,
  normalized_recipient_email text not null,
  to_name text null,
  reply_to text null,
  subject text not null,
  html_body text null,
  text_body text null,
  customer_id uuid null,
  lead_id uuid null,
  invoice_id uuid null,
  project_id uuid null,
  demo_journey_id uuid null,
  preview_version_id uuid null,
  preview_version integer null,
  preview_checksum text null,
  preview_token_fingerprint text null,
  preview_url text null,
  public_reference text null,
  idempotency_key text not null,
  owner_user_id uuid null,
  triggered_by text null,
  triggered_by_user_id uuid null,
  created_by text not null,
  attempt_count integer not null default 0,
  claimed_at timestamptz null,
  claimed_by text null,
  claim_token_hash text null,
  send_started_at timestamptz null,
  sent_at timestamptz null,
  last_error_at timestamptz null,
  error_code text null,
  error_category text null,
  error_message text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_logs_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete set null,
  constraint email_logs_lead_id_fkey foreign key (lead_id) references public.leads(id) on delete set null,
  constraint email_logs_demo_journey_id_fkey foreign key (demo_journey_id) references public.demo_journeys(id) on delete restrict,
  constraint email_logs_preview_version_id_fkey foreign key (preview_version_id) references public.website_preview_versions(id) on delete restrict,
  constraint email_logs_status_check check (status in ('planned','sending','sent','failed','delivery_unknown','cancelled','pending','delivered','bounced','complained','opened','clicked')),
  constraint email_logs_direction_check check (direction in ('outbound','inbound')),
  constraint email_logs_recipient_check check (normalized_recipient_email = lower(btrim(to_email)) and normalized_recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint email_logs_idempotency_key_check check (idempotency_key ~ '^[0-9a-f]{64}$'),
  constraint email_logs_attempt_count_check check (attempt_count >= 0),
  constraint email_logs_provider_metadata_check check (jsonb_typeof(provider_metadata) = 'object'),
  constraint email_logs_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint email_logs_demo_invitation_snapshot_check check (
    message_type <> 'demo_preview_invitation'
    or (
      direction = 'outbound'
      and demo_journey_id is not null and preview_version_id is not null
      and preview_version > 0 and preview_checksum ~ '^[0-9a-f]{64}$'
      and preview_token_fingerprint ~ '^[0-9a-f]{64}$'
      and nullif(btrim(preview_url), '') is not null
      and public_reference ~ '^[0-9a-f]{64}$'
      and nullif(btrim(template_id), '') is not null and template_version > 0
      and owner_user_id is not null
    )
  ),
  constraint email_logs_sending_claim_check check (
    status <> 'sending'
    or (claimed_at is not null and send_started_at is not null and nullif(btrim(claimed_by), '') is not null and claim_token_hash ~ '^[0-9a-f]{64}$')
  ),
  constraint email_logs_sent_result_check check (status <> 'sent' or (sent_at is not null and nullif(btrim(provider_message_id), '') is not null)),
  constraint email_logs_unknown_result_check check (status <> 'delivery_unknown' or last_error_at is not null),
  constraint email_logs_idempotency_key_unique unique (idempotency_key),
  constraint email_logs_public_reference_unique unique (public_reference)
);

create table public.demo_preview_accesses (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null,
  preview_version_id uuid not null,
  email_log_id uuid null,
  preview_version integer not null,
  preview_checksum text not null,
  tracking_key text not null,
  first_opened_at timestamptz not null,
  last_opened_at timestamptz not null,
  total_open_count integer not null default 1,
  deduplicated_open_count integer not null default 1,
  last_deduplicated_bucket timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_preview_accesses_journey_fkey foreign key (demo_journey_id) references public.demo_journeys(id) on delete restrict,
  constraint demo_preview_accesses_preview_fkey foreign key (preview_version_id) references public.website_preview_versions(id) on delete restrict,
  constraint demo_preview_accesses_email_log_fkey foreign key (email_log_id) references public.email_logs(id) on delete restrict,
  constraint demo_preview_accesses_version_check check (preview_version > 0),
  constraint demo_preview_accesses_checksum_check check (preview_checksum ~ '^[0-9a-f]{64}$'),
  constraint demo_preview_accesses_tracking_key_check check (tracking_key ~ '^[0-9a-f]{64}$'),
  constraint demo_preview_accesses_counts_check check (total_open_count >= deduplicated_open_count and deduplicated_open_count > 0),
  constraint demo_preview_accesses_time_check check (first_opened_at <= last_opened_at),
  constraint demo_preview_accesses_tracking_unique unique (demo_journey_id, preview_version_id, tracking_key)
);

create index email_logs_journey_created_idx on public.email_logs (demo_journey_id, created_at desc) where demo_journey_id is not null;
create index email_logs_preview_created_idx on public.email_logs (preview_version_id, created_at desc) where preview_version_id is not null;
create index email_logs_lead_created_idx on public.email_logs (lead_id, created_at desc) where lead_id is not null;
create index email_logs_customer_created_idx on public.email_logs (customer_id, created_at desc) where customer_id is not null;
create index email_logs_status_updated_idx on public.email_logs (status, updated_at);
create index email_logs_provider_message_idx on public.email_logs (provider_message_id) where provider_message_id is not null;
create index email_logs_recipient_created_idx on public.email_logs (normalized_recipient_email, created_at desc);
create index demo_preview_accesses_journey_idx on public.demo_preview_accesses (demo_journey_id, last_opened_at desc);
create index demo_preview_accesses_email_log_idx on public.demo_preview_accesses (email_log_id) where email_log_id is not null;

create function public.assert_demo_invitation_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare jwt_role text;
begin
  jwt_role := nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    exception when others then jwt_role := null;
    end;
  end if;
  if jwt_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Demo invitation RPC requires service_role.';
  end if;
end;
$function$;

create function public.set_email_log_updated_at()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin new.updated_at := pg_catalog.clock_timestamp(); return new; end;
$function$;

create function public.guard_email_log_snapshot()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin
  if old.message_type = 'demo_preview_invitation' and (
    old.idempotency_key is distinct from new.idempotency_key or old.demo_journey_id is distinct from new.demo_journey_id
    or old.preview_version_id is distinct from new.preview_version_id or old.preview_version is distinct from new.preview_version
    or old.preview_checksum is distinct from new.preview_checksum or old.preview_token_fingerprint is distinct from new.preview_token_fingerprint
    or old.preview_url is distinct from new.preview_url or old.public_reference is distinct from new.public_reference
    or old.normalized_recipient_email is distinct from new.normalized_recipient_email
    or old.template_id is distinct from new.template_id or old.template_version is distinct from new.template_version
  ) then
    raise exception using errcode = '55000', message = 'Demo invitation snapshots are immutable.';
  end if;
  return new;
end;
$function$;

create trigger email_logs_set_updated_at before update on public.email_logs for each row execute function public.set_email_log_updated_at();
create trigger email_logs_guard_snapshot before update on public.email_logs for each row execute function public.guard_email_log_snapshot();

create function public.plan_demo_invitation(
  input_demo_journey_id uuid, input_preview_version_id uuid,
  input_template_id text, input_template_version integer, input_recipient_email text,
  input_subject text, input_html_body text, input_text_body text,
  input_idempotency_key text, input_public_reference text,
  input_preview_token_fingerprint text, input_created_by text, input_requesting_user_id uuid default null
)
returns table (email_log_id uuid, status text, created boolean, owner_user_id uuid, preview_url text, public_reference text, provider_message_id text)
language plpgsql security definer set search_path = pg_catalog
as $function$
declare
  journey_record public.demo_journeys%rowtype;
  preview_record public.website_preview_versions%rowtype;
  lead_record public.leads%rowtype;
  log_record public.email_logs%rowtype;
  normalized_email text := pg_catalog.lower(pg_catalog.btrim(input_recipient_email));
  expected_key text;
  expected_reference text;
  delivery_url text;
  resolved_owner uuid;
  did_create boolean := false;
begin
  perform public.assert_demo_invitation_service_role();
  if input_template_version < 1 or nullif(pg_catalog.btrim(input_template_id),'') is null
     or nullif(pg_catalog.btrim(input_created_by),'') is null
     or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or nullif(pg_catalog.btrim(input_subject),'') is null
     or nullif(pg_catalog.btrim(input_html_body),'') is null
     or nullif(pg_catalog.btrim(input_text_body),'') is null then
    raise exception using errcode = '22023', message = 'Demo invitation input is incomplete.';
  end if;

  select * into journey_record from public.demo_journeys where id=input_demo_journey_id for share;
  if not found then raise exception using errcode='P0002', message='Demo journey not found.'; end if;
  select * into preview_record from public.website_preview_versions
    where id=input_preview_version_id and demo_journey_id=input_demo_journey_id and is_active for share;
  if not found then raise exception using errcode='23514', message='Active preview version does not match the demo journey.'; end if;
  if journey_record.preview_token is distinct from preview_record.preview_token
     or journey_record.preview_url is distinct from preview_record.preview_url then
    raise exception using errcode='23514', message='Journey and active preview binding do not match.';
  end if;
  if input_preview_token_fingerprint is distinct from encode(public.digest(preview_record.preview_token,'sha256'),'hex') then
    raise exception using errcode='23514', message='Preview token fingerprint does not match.';
  end if;
  if journey_record.email is not null and pg_catalog.lower(pg_catalog.btrim(journey_record.email)) <> normalized_email then
    raise exception using errcode='23514', message='Recipient does not match the demo journey.';
  end if;

  expected_key := encode(public.digest(
    'demo_preview_invitation' || chr(10) || input_demo_journey_id::text || chr(10) || input_preview_version_id::text || chr(10)
    || pg_catalog.btrim(input_template_id) || chr(10) || input_template_version::text || chr(10) || normalized_email,
    'sha256'),'hex');
  expected_reference := encode(public.digest('demo_invitation_public' || chr(10) || expected_key,'sha256'),'hex');
  if input_idempotency_key is distinct from expected_key or input_public_reference is distinct from expected_reference then
    raise exception using errcode='23514', message='Demo invitation identity is invalid.';
  end if;

  if journey_record.lead_id is not null then
    select * into lead_record from public.leads where id=journey_record.lead_id for share;
    if not found then raise exception using errcode='23503', message='Demo journey lead was not found.'; end if;
    resolved_owner := coalesce(lead_record.assigned_user_id, input_requesting_user_id, lead_record.assigned_by);
  else
    resolved_owner := input_requesting_user_id;
  end if;
  if resolved_owner is null then
    select id into resolved_owner from public.profiles
    where lower(coalesce(status,'active')) in ('active','invited')
      and lower(coalesce(role,'')) in ('super_admin','admin','sales','sales_manager','sales_partner')
    order by created_at, id limit 1;
  end if;
  if resolved_owner is null then raise exception using errcode='23514', message='No responsible owner is available for the demo invitation.'; end if;

  delivery_url := preview_record.preview_url || case when position('?' in preview_record.preview_url)>0 then '&' else '?' end
    || 'invitation=' || expected_reference;
  if position(delivery_url in input_html_body)=0 or position(delivery_url in input_text_body)=0 then
    raise exception using errcode='23514', message='Demo invitation content is not bound to the planned preview URL.';
  end if;

  insert into public.email_logs (
    status, provider, message_type, template_key, template_name, template_id, template_version,
    to_email, normalized_recipient_email, subject, html_body, text_body,
    customer_id, lead_id, demo_journey_id, preview_version_id, preview_version, preview_checksum,
    preview_token_fingerprint, preview_url, public_reference, idempotency_key, owner_user_id,
    triggered_by, triggered_by_user_id, created_by
  ) values (
    'planned','resend','demo_preview_invitation',pg_catalog.btrim(input_template_id),'Persoonlijke demo-uitnodiging',
    pg_catalog.btrim(input_template_id),input_template_version,normalized_email,normalized_email,
    pg_catalog.btrim(input_subject),input_html_body,input_text_body,
    journey_record.customer_id,journey_record.lead_id,journey_record.id,preview_record.id,preview_record.version,preview_record.package_checksum,
    input_preview_token_fingerprint,delivery_url,expected_reference,expected_key,resolved_owner,
    'demo_journey',input_requesting_user_id,pg_catalog.btrim(input_created_by)
  ) on conflict (idempotency_key) do nothing returning * into log_record;
  if log_record.id is null then
    select * into log_record from public.email_logs where idempotency_key=expected_key;
  else did_create := true;
  end if;
  if log_record.demo_journey_id <> input_demo_journey_id or log_record.preview_version_id <> input_preview_version_id
     or log_record.normalized_recipient_email <> normalized_email then
    raise exception using errcode='23514', message='Existing invitation does not match the logical request.';
  end if;
  return query select log_record.id,log_record.status,did_create,log_record.owner_user_id,log_record.preview_url,log_record.public_reference,log_record.provider_message_id;
end;
$function$;

create function public.claim_demo_invitation(input_email_log_id uuid, input_claim_token text, input_claimed_by text)
returns table (email_log_id uuid, status text, claimed boolean, attempt_count integer, preview_url text, provider_message_id text)
language plpgsql security definer set search_path = pg_catalog
as $function$
declare log_record public.email_logs%rowtype; did_claim boolean := false;
begin
  perform public.assert_demo_invitation_service_role();
  if char_length(pg_catalog.btrim(input_claim_token)) < 32 or nullif(pg_catalog.btrim(input_claimed_by),'') is null then
    raise exception using errcode='22023', message='Provider claim input is invalid.';
  end if;
  update public.email_logs as logs set status='sending',attempt_count=logs.attempt_count+1,claimed_at=clock_timestamp(),
    claimed_by=pg_catalog.btrim(input_claimed_by),claim_token_hash=encode(public.digest(input_claim_token,'sha256'),'hex'),send_started_at=clock_timestamp()
  where logs.id=input_email_log_id and logs.message_type='demo_preview_invitation' and logs.status='planned'
  returning * into log_record;
  if log_record.id is null then select * into log_record from public.email_logs where id=input_email_log_id; else did_claim := true; end if;
  if log_record.id is null then raise exception using errcode='P0002', message='Demo invitation not found.'; end if;
  return query select log_record.id,log_record.status,did_claim,log_record.attempt_count,log_record.preview_url,log_record.provider_message_id;
end;
$function$;

create function public.complete_demo_invitation(
  input_email_log_id uuid, input_claim_token text, input_outcome text,
  input_provider_message_id text default null, input_provider_metadata jsonb default '{}'::jsonb,
  input_error_code text default null, input_error_category text default null, input_error_message text default null
)
returns table (email_log_id uuid, status text, provider_message_id text, sent_at timestamptz)
language plpgsql security definer set search_path = pg_catalog
as $function$
declare log_record public.email_logs%rowtype; now_value timestamptz := clock_timestamp();
begin
  perform public.assert_demo_invitation_service_role();
  if input_outcome not in ('sent','failed','delivery_unknown') or jsonb_typeof(coalesce(input_provider_metadata,'{}'::jsonb)) <> 'object' then
    raise exception using errcode='22023', message='Provider outcome is invalid.';
  end if;
  select * into log_record from public.email_logs where id=input_email_log_id for update;
  if not found then raise exception using errcode='P0002', message='Demo invitation not found.'; end if;
  if log_record.status='sent' then return query select log_record.id,log_record.status,log_record.provider_message_id,log_record.sent_at; return; end if;
  if log_record.status <> 'sending' or log_record.claim_token_hash is distinct from encode(public.digest(input_claim_token,'sha256'),'hex') then
    raise exception using errcode='55000', message='Demo invitation provider claim is invalid.';
  end if;
  if input_outcome='sent' and nullif(pg_catalog.btrim(input_provider_message_id),'') is null then
    raise exception using errcode='22023', message='Successful provider outcome requires a message id.';
  end if;
  update public.email_logs set status=input_outcome,provider_message_id=nullif(pg_catalog.btrim(input_provider_message_id),''),
    provider_metadata=coalesce(input_provider_metadata,'{}'::jsonb),sent_at=case when input_outcome='sent' then now_value else null end,
    last_error_at=case when input_outcome<>'sent' then now_value else null end,error_code=nullif(pg_catalog.btrim(input_error_code),''),
    error_category=nullif(pg_catalog.btrim(input_error_category),''),error_message=left(nullif(pg_catalog.btrim(input_error_message),''),500)
  where id=log_record.id returning * into log_record;
  if input_outcome='sent' then
    update public.demo_journeys set demo_status='preview_verstuurd',last_email_status='sent:demo_preview_invitation',
      last_email_sent_at=now_value,next_email_type='day4_feedback_refinement',follow_up_at=now_value+interval '24 hours',
      assigned_to=coalesce(nullif(assigned_to,''),log_record.owner_user_id::text),updated_by=log_record.created_by
    where id=log_record.demo_journey_id;
    if log_record.lead_id is not null then
      update public.leads set lead_status='demo_sent',assigned_user_id=coalesce(assigned_user_id,log_record.owner_user_id),
        assigned_at=coalesce(assigned_at,now_value),next_action_type='follow_up',
        next_action_note='Controleer of de lead de persoonlijke demo heeft bekeken en neem contact op.',
        next_action_at=now_value+interval '24 hours',next_action_assigned_user_id=log_record.owner_user_id,
        next_action_created_automatically=true,last_contacted_at=now_value,last_activity_at=now_value
      where id=log_record.lead_id;
    end if;
    insert into public.demo_journey_events (demo_journey_id,event_type,title,description,visible_to_customer,created_by)
      select log_record.demo_journey_id,'email','Persoonlijke demo verstuurd','De persoonlijke demo-uitnodiging is verzonden.',false,log_record.created_by
      where not exists (select 1 from public.demo_journey_events where demo_journey_id=log_record.demo_journey_id and event_type='email' and description='mail:'||log_record.id::text);
  end if;
  return query select log_record.id,log_record.status,log_record.provider_message_id,log_record.sent_at;
end;
$function$;

create function public.record_demo_preview_open(
  input_demo_journey_id uuid, input_preview_token_fingerprint text, input_invitation_reference text default null
)
returns table (access_id uuid, first_opened_at timestamptz, last_opened_at timestamptz, total_open_count integer, deduplicated_open_count integer, preview_version_id uuid, email_log_id uuid)
language plpgsql security definer set search_path = pg_catalog
as $function$
declare preview_record public.website_preview_versions%rowtype; mail_record public.email_logs%rowtype;
  access_record public.demo_preview_accesses%rowtype; tracking_value text; now_value timestamptz:=clock_timestamp(); bucket_value timestamptz;
begin
  perform public.assert_demo_invitation_service_role();
  select * into preview_record from public.website_preview_versions where demo_journey_id=input_demo_journey_id and is_active for share;
  if not found or encode(public.digest(preview_record.preview_token,'sha256'),'hex') is distinct from input_preview_token_fingerprint then
    raise exception using errcode='42501', message='Preview binding is invalid.';
  end if;
  if nullif(pg_catalog.btrim(input_invitation_reference),'') is not null then
    select logs.* into mail_record from public.email_logs as logs where logs.public_reference=pg_catalog.btrim(input_invitation_reference)
      and logs.demo_journey_id=input_demo_journey_id and logs.preview_version_id=preview_record.id and logs.status='sent';
    if not found then raise exception using errcode='42501', message='Invitation binding is invalid.'; end if;
    tracking_value:=encode(public.digest('invitation'||chr(10)||mail_record.public_reference,'sha256'),'hex');
  else
    tracking_value:=encode(public.digest('legacy'||chr(10)||input_demo_journey_id::text||chr(10)||preview_record.id::text,'sha256'),'hex');
  end if;
  bucket_value:=date_trunc('hour',now_value);
  insert into public.demo_preview_accesses (demo_journey_id,preview_version_id,email_log_id,preview_version,preview_checksum,
    tracking_key,first_opened_at,last_opened_at,total_open_count,deduplicated_open_count,last_deduplicated_bucket)
  values (input_demo_journey_id,preview_record.id,mail_record.id,preview_record.version,preview_record.package_checksum,
    tracking_value,now_value,now_value,1,1,bucket_value)
  on conflict on constraint demo_preview_accesses_tracking_unique do update set
    last_opened_at=excluded.last_opened_at,total_open_count=public.demo_preview_accesses.total_open_count+1,
    deduplicated_open_count=public.demo_preview_accesses.deduplicated_open_count+
      case when public.demo_preview_accesses.last_deduplicated_bucket<excluded.last_deduplicated_bucket then 1 else 0 end,
    last_deduplicated_bucket=greatest(public.demo_preview_accesses.last_deduplicated_bucket,excluded.last_deduplicated_bucket),updated_at=excluded.last_opened_at
  returning * into access_record;
  if access_record.total_open_count=1 then
    insert into public.demo_journey_events (demo_journey_id,event_type,title,description,visible_to_customer,created_by)
    values (input_demo_journey_id,'preview_opened','Preview voor het eerst bekeken','preview_access:'||access_record.id::text,false,'public_preview');
  end if;
  return query select access_record.id,access_record.first_opened_at,access_record.last_opened_at,
    access_record.total_open_count,access_record.deduplicated_open_count,access_record.preview_version_id,access_record.email_log_id;
end;
$function$;

alter table public.email_logs enable row level security;
alter table public.demo_preview_accesses enable row level security;
revoke all privileges on table public.email_logs from public,anon,authenticated,service_role;
revoke all privileges on table public.demo_preview_accesses from public,anon,authenticated,service_role;
grant select,insert,update on table public.email_logs to service_role;
grant select on table public.demo_preview_accesses to service_role;
create policy email_logs_no_direct_client_access on public.email_logs for all to anon,authenticated using(false) with check(false);
create policy demo_preview_accesses_no_direct_client_access on public.demo_preview_accesses for all to anon,authenticated using(false) with check(false);

revoke all on function public.assert_demo_invitation_service_role() from public,anon,authenticated,service_role;
revoke all on function public.plan_demo_invitation(uuid,uuid,text,integer,text,text,text,text,text,text,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.claim_demo_invitation(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.complete_demo_invitation(uuid,text,text,text,jsonb,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.record_demo_preview_open(uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.plan_demo_invitation(uuid,uuid,text,integer,text,text,text,text,text,text,text,text,uuid) to service_role;
grant execute on function public.claim_demo_invitation(uuid,text,text) to service_role;
grant execute on function public.complete_demo_invitation(uuid,text,text,text,jsonb,text,text,text) to service_role;
grant execute on function public.record_demo_preview_open(uuid,text,text) to service_role;

commit;
