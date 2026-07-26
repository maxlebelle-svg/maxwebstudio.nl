-- DCA-1 security closure: exchange URL-fragment tokens for short server-only sessions.
-- Forward-only, idempotent, staging-first. This migration sends nothing.

begin;

create table if not exists public.client_activation_exchange_sessions (
  id uuid primary key default gen_random_uuid(),
  activation_link_id uuid not null references public.client_activation_links(id) on delete restrict,
  invitation_id uuid not null references public.lead_demo_invitations(id) on delete restrict,
  preview_publication_id uuid not null references public.public_preview_publications(id) on delete restrict,
  preview_version_id uuid not null references public.website_preview_versions(id) on delete restrict,
  session_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  revoked_at timestamptz null,
  correlation_id uuid not null,
  constraint client_activation_exchange_sessions_hash_check check (session_hash ~ '^[0-9a-f]{64}$'),
  constraint client_activation_exchange_sessions_expiry_check check (expires_at > created_at),
  constraint client_activation_exchange_sessions_hash_unique unique (session_hash),
  constraint client_activation_exchange_sessions_correlation_unique unique (correlation_id)
);

create unique index if not exists client_activation_exchange_sessions_one_live_idx
  on public.client_activation_exchange_sessions (activation_link_id)
  where revoked_at is null;
create index if not exists client_activation_exchange_sessions_expiry_idx
  on public.client_activation_exchange_sessions (expires_at)
  where revoked_at is null;

alter table public.client_activation_exchange_sessions enable row level security;
alter table public.client_activation_exchange_sessions force row level security;
revoke all on table public.client_activation_exchange_sessions from public, anon, authenticated;
grant all on table public.client_activation_exchange_sessions to service_role;

create table if not exists public.client_activation_exchange_rate_limits (
  rate_key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint client_activation_exchange_rate_limits_hash_check check (rate_key_hash ~ '^[0-9a-f]{64}$'),
  constraint client_activation_exchange_rate_limits_attempts_check check (attempts >= 0)
);

alter table public.client_activation_exchange_rate_limits enable row level security;
alter table public.client_activation_exchange_rate_limits force row level security;
revoke all on table public.client_activation_exchange_rate_limits from public, anon, authenticated;
grant all on table public.client_activation_exchange_rate_limits to service_role;

create or replace function public.dca_1_consume_exchange_rate_limit(input_rate_key_hash text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  limit_record public.client_activation_exchange_rate_limits%rowtype;
  audit_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform public.dca_0_assert_service_role();
  if input_rate_key_hash !~ '^[0-9a-f]{64}$' then return false; end if;

  insert into public.client_activation_exchange_rate_limits (rate_key_hash, window_started_at, attempts, updated_at)
  values (input_rate_key_hash, audit_now, 0, audit_now)
  on conflict (rate_key_hash) do nothing;

  select * into limit_record
  from public.client_activation_exchange_rate_limits
  where rate_key_hash = input_rate_key_hash
  for update;

  if limit_record.window_started_at <= audit_now - interval '5 minutes' then
    update public.client_activation_exchange_rate_limits
    set window_started_at = audit_now, attempts = 1, updated_at = audit_now
    where rate_key_hash = input_rate_key_hash;
    return true;
  end if;
  if limit_record.attempts >= 10 then return false; end if;
  update public.client_activation_exchange_rate_limits
  set attempts = attempts + 1, updated_at = audit_now
  where rate_key_hash = input_rate_key_hash;
  return true;
end
$function$;

create or replace function public.dca_1_revoke_exchange_sessions_on_link_status()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if new.status not in ('active','opened') or new.revoked_at is not null then
    update public.client_activation_exchange_sessions
    set revoked_at = coalesce(revoked_at, pg_catalog.clock_timestamp())
    where activation_link_id = new.id and revoked_at is null;
  end if;
  return new;
end
$function$;

drop trigger if exists dca_1_revoke_exchange_sessions_on_link_status on public.client_activation_links;
create trigger dca_1_revoke_exchange_sessions_on_link_status
after update of status, revoked_at on public.client_activation_links
for each row execute function public.dca_1_revoke_exchange_sessions_on_link_status();

create or replace function public.dca_1_exchange_activation_token(
  input_activation_token text,
  input_session_hash text,
  input_correlation_id uuid,
  input_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  token_digest text;
  audit_now timestamptz := pg_catalog.clock_timestamp();
  link_record public.client_activation_links%rowtype;
  invitation_record public.lead_demo_invitations%rowtype;
begin
  perform public.dca_0_assert_service_role();
  if input_activation_token !~ '^[0-9a-f]{64}$'
     or input_session_hash !~ '^[0-9a-f]{64}$'
     or input_correlation_id is null
     or input_expires_at <= audit_now
     or input_expires_at > audit_now + interval '30 minutes' then
    return false;
  end if;

  token_digest := public.dca_0_sha256(input_activation_token);
  select * into link_record
  from public.client_activation_links
  where token_hash = token_digest
  for update;
  if not found or link_record.status not in ('active','opened') then return false; end if;
  if link_record.expires_at <= audit_now then
    update public.client_activation_links set status = 'expired' where id = link_record.id;
    update public.lead_demo_invitations set status = 'link_expired', dca_phase = 'expired'
      where id = link_record.lead_demo_invitation_id;
    return false;
  end if;

  select * into invitation_record
  from public.lead_demo_invitations
  where id = link_record.lead_demo_invitation_id
  for update;
  if not found or invitation_record.status in ('revoked','link_expired','send_failed','activated')
     or invitation_record.lead_id is distinct from link_record.lead_id
     or invitation_record.preview_version_id is distinct from link_record.preview_version_id then
    return false;
  end if;

  if not exists (
    select 1
    from public.leads lead
    join public.demo_journeys journey on journey.id = invitation_record.demo_journey_id
    join public.website_preview_versions preview on preview.id = link_record.preview_version_id
    join public.public_preview_publications publication on publication.id = link_record.preview_publication_id
    where lead.id = link_record.lead_id
      and journey.lead_id = lead.id
      and preview.demo_journey_id = journey.id
      and publication.preview_version_id = preview.id
      and publication.enabled = true
      and publication.revoked_at is null
      and (
        (lead.converted_customer_id is null and link_record.customer_id is null
          and publication.relationship_type = 'lead' and publication.relationship_id = lead.id)
        or
        (lead.converted_customer_id is not null and link_record.customer_id = lead.converted_customer_id
          and publication.relationship_type = 'customer' and publication.relationship_id = lead.converted_customer_id)
      )
  ) then return false; end if;

  update public.client_activation_exchange_sessions
  set revoked_at = coalesce(revoked_at, audit_now)
  where activation_link_id = link_record.id and revoked_at is null;

  insert into public.client_activation_exchange_sessions (
    activation_link_id, invitation_id, preview_publication_id, preview_version_id,
    session_hash, expires_at, correlation_id
  ) values (
    link_record.id, invitation_record.id, link_record.preview_publication_id, link_record.preview_version_id,
    input_session_hash, least(input_expires_at, link_record.expires_at), input_correlation_id
  );

  update public.client_activation_links
  set status = 'opened', opened_at = coalesce(opened_at, audit_now)
  where id = link_record.id;
  update public.lead_demo_invitations
  set opened_at = coalesce(opened_at, audit_now), dca_phase = 'link_opened'
  where id = invitation_record.id;
  return true;
end
$function$;

create or replace function public.dca_1_resolve_exchange_session(input_session_hash text)
returns table (
  activation_link_id uuid,
  invitation_id uuid,
  lead_id uuid,
  customer_id uuid,
  project_id uuid,
  preview_publication_id uuid,
  preview_version_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  audit_now timestamptz := pg_catalog.clock_timestamp();
  session_record public.client_activation_exchange_sessions%rowtype;
  link_record public.client_activation_links%rowtype;
  invitation_record public.lead_demo_invitations%rowtype;
begin
  perform public.dca_0_assert_service_role();
  if input_session_hash !~ '^[0-9a-f]{64}$' then return; end if;

  select * into session_record
  from public.client_activation_exchange_sessions
  where session_hash = input_session_hash
  for update;
  if not found or session_record.revoked_at is not null then return; end if;
  if session_record.expires_at <= audit_now then
    update public.client_activation_exchange_sessions set revoked_at = audit_now where id = session_record.id;
    return;
  end if;

  select * into link_record from public.client_activation_links where id = session_record.activation_link_id for update;
  if not found or link_record.status not in ('active','opened') or link_record.expires_at <= audit_now then
    update public.client_activation_exchange_sessions set revoked_at = audit_now where id = session_record.id;
    if link_record.id is not null and link_record.expires_at <= audit_now then
      update public.client_activation_links set status = 'expired' where id = link_record.id;
    end if;
    return;
  end if;

  select * into invitation_record from public.lead_demo_invitations where id = session_record.invitation_id for share;
  if not found or invitation_record.status in ('revoked','link_expired','send_failed','activated')
     or session_record.invitation_id is distinct from link_record.lead_demo_invitation_id
     or session_record.preview_publication_id is distinct from link_record.preview_publication_id
     or session_record.preview_version_id is distinct from link_record.preview_version_id then
    update public.client_activation_exchange_sessions set revoked_at = audit_now where id = session_record.id;
    return;
  end if;

  if not exists (
    select 1
    from public.leads lead
    join public.demo_journeys journey on journey.id = invitation_record.demo_journey_id
    join public.website_preview_versions preview on preview.id = session_record.preview_version_id
    join public.public_preview_publications publication on publication.id = session_record.preview_publication_id
    where lead.id = link_record.lead_id
      and journey.lead_id = lead.id
      and preview.demo_journey_id = journey.id
      and publication.preview_version_id = preview.id
      and publication.enabled = true and publication.revoked_at is null
      and (
        (lead.converted_customer_id is null and link_record.customer_id is null
          and publication.relationship_type = 'lead' and publication.relationship_id = lead.id)
        or
        (lead.converted_customer_id is not null and link_record.customer_id = lead.converted_customer_id
          and publication.relationship_type = 'customer' and publication.relationship_id = lead.converted_customer_id)
      )
  ) then
    update public.client_activation_exchange_sessions set revoked_at = audit_now where id = session_record.id;
    return;
  end if;

  update public.client_activation_exchange_sessions set last_used_at = audit_now where id = session_record.id;
  return query select link_record.id, invitation_record.id, link_record.lead_id,
    link_record.customer_id, link_record.project_id, link_record.preview_publication_id,
    link_record.preview_version_id;
end
$function$;

revoke all on function public.dca_1_consume_exchange_rate_limit(text) from public, anon, authenticated;
grant execute on function public.dca_1_consume_exchange_rate_limit(text) to service_role;
revoke all on function public.dca_1_exchange_activation_token(text,text,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.dca_1_exchange_activation_token(text,text,uuid,timestamptz) to service_role;
revoke all on function public.dca_1_resolve_exchange_session(text) from public, anon, authenticated;
grant execute on function public.dca_1_resolve_exchange_session(text) to service_role;
revoke all on function public.dca_1_revoke_exchange_sessions_on_link_status() from public, anon, authenticated, service_role;

-- Legacy token-in-path resolver is intentionally no longer callable by the runtime.
revoke all on function public.dca_1_open_personal_start(text) from public, anon, authenticated, service_role;

commit;
