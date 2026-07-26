-- CX2 Sprint 3: passwordless account activation, bound to the DCA-1 exchange session.
-- Staging-first, forward-only. This migration sends no e-mail and creates no fixture data.

begin;

create table if not exists public.cx2_magic_link_challenges (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.lead_demo_invitations(id) on delete restrict,
  activation_link_id uuid not null references public.client_activation_links(id) on delete restrict,
  exchange_session_id uuid not null references public.client_activation_exchange_sessions(id) on delete restrict,
  state_hash text not null,
  status text not null default 'prepared',
  expires_at timestamptz not null,
  sent_at timestamptz null,
  consumed_at timestamptz null,
  verified_auth_user_id uuid null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cx2_magic_link_challenges_state_hash_check check (state_hash ~ '^[0-9a-f]{64}$'),
  constraint cx2_magic_link_challenges_status_check check (status in ('prepared','sent','consumed','expired','superseded')),
  constraint cx2_magic_link_challenges_expiry_check check (expires_at > created_at),
  constraint cx2_magic_link_challenges_state_unique unique (state_hash)
);

create index if not exists cx2_magic_link_challenges_invitation_idx
  on public.cx2_magic_link_challenges (invitation_id, created_at desc);
create unique index if not exists cx2_magic_link_challenges_one_live_idx
  on public.cx2_magic_link_challenges (invitation_id)
  where status in ('prepared','sent');

alter table public.cx2_magic_link_challenges enable row level security;
alter table public.cx2_magic_link_challenges force row level security;
revoke all on table public.cx2_magic_link_challenges from public, anon, authenticated;
grant all on table public.cx2_magic_link_challenges to service_role;

create or replace function public.cx2_prepare_magic_link(
  input_session_hash text,
  input_state_hash text,
  input_expires_at timestamptz
)
returns table (
  challenge_id uuid,
  intended_email text,
  auth_user_id uuid,
  resend_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  audit_now timestamptz := pg_catalog.clock_timestamp();
  session_record public.client_activation_exchange_sessions%rowtype;
  invitation_record public.lead_demo_invitations%rowtype;
  link_record public.client_activation_links%rowtype;
  challenge_record public.cx2_magic_link_challenges%rowtype;
  recent_count integer;
begin
  perform public.dca_0_assert_service_role();
  if input_session_hash !~ '^[0-9a-f]{64}$'
     or input_state_hash !~ '^[0-9a-f]{64}$'
     or input_expires_at <= audit_now
     or input_expires_at > audit_now + interval '15 minutes' then
    raise exception using errcode = '22023', message = 'CX2 activation request is invalid.';
  end if;

  select * into session_record
  from public.client_activation_exchange_sessions
  where session_hash = input_session_hash
  for update;
  if not found or session_record.revoked_at is not null or session_record.expires_at <= audit_now then
    raise exception using errcode = '55000', message = 'CX2 activation session is not active.';
  end if;

  select * into invitation_record from public.lead_demo_invitations
  where id = session_record.invitation_id for update;
  select * into link_record from public.client_activation_links
  where id = session_record.activation_link_id for update;
  if invitation_record.id is null or link_record.id is null
     or invitation_record.status in ('activated','revoked','link_expired','send_failed')
     or link_record.status not in ('active','opened')
     or link_record.expires_at <= audit_now
     or invitation_record.id is distinct from link_record.lead_demo_invitation_id
     or invitation_record.normalized_email is distinct from link_record.intended_email
     or invitation_record.preview_version_id is distinct from link_record.preview_version_id then
    raise exception using errcode = '55000', message = 'CX2 invitation binding is not active.';
  end if;
  if not exists (
    select 1
    from public.leads lead
    join public.demo_journeys journey on journey.id = invitation_record.demo_journey_id
    join public.website_preview_versions preview on preview.id = link_record.preview_version_id
    join public.public_preview_publications publication on publication.id = link_record.preview_publication_id
    where lead.id = link_record.lead_id and journey.lead_id = lead.id
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
    raise exception using errcode = '23514', message = 'CX2 preview ownership is no longer valid.';
  end if;

  select count(*) into recent_count
  from public.cx2_magic_link_challenges
  where invitation_id = invitation_record.id and created_at > audit_now - interval '1 hour';
  if recent_count >= 5 then
    raise exception using errcode = '54000', message = 'CX2 resend limit reached.';
  end if;

  select * into challenge_record
  from public.cx2_magic_link_challenges
  where invitation_id = invitation_record.id and status in ('prepared','sent')
  for update;
  if challenge_record.id is not null
     and challenge_record.created_at > audit_now - interval '60 seconds' then
    raise exception using errcode = '55000', message = 'CX2 resend cooldown is active.';
  end if;
  if challenge_record.id is not null then
    update public.cx2_magic_link_challenges
    set status = 'superseded', updated_at = audit_now
    where id = challenge_record.id;
  end if;

  insert into public.cx2_magic_link_challenges (
    invitation_id, activation_link_id, exchange_session_id, state_hash, expires_at
  ) values (
    invitation_record.id, link_record.id, session_record.id, input_state_hash, input_expires_at
  ) returning * into challenge_record;

  return query select challenge_record.id, link_record.intended_email,
    invitation_record.auth_user_id, 60;
end
$function$;

create or replace function public.cx2_mark_magic_link_sent(input_challenge_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  perform public.dca_0_assert_service_role();
  update public.cx2_magic_link_challenges
  set status = 'sent', sent_at = coalesce(sent_at, pg_catalog.clock_timestamp()),
      updated_at = pg_catalog.clock_timestamp()
  where id = input_challenge_id and status = 'prepared' and expires_at > pg_catalog.clock_timestamp();
  return found;
end
$function$;

create or replace function public.cx2_complete_magic_link(
  input_state_hash text,
  input_auth_user_id uuid
)
returns table (
  customer_id uuid,
  profile_id uuid,
  preview_version_id uuid,
  customer_created boolean,
  portal_path text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  audit_now timestamptz := pg_catalog.clock_timestamp();
  challenge_record public.cx2_magic_link_challenges%rowtype;
  session_record public.client_activation_exchange_sessions%rowtype;
  invitation_record public.lead_demo_invitations%rowtype;
  link_record public.client_activation_links%rowtype;
  lead_record public.leads%rowtype;
  profile_record public.profiles%rowtype;
  customer_record public.customers%rowtype;
  auth_email text;
  matching_customers integer;
  did_create boolean := false;
begin
  perform public.dca_0_assert_service_role();
  if input_state_hash !~ '^[0-9a-f]{64}$' or input_auth_user_id is null then
    raise exception using errcode = '22023', message = 'CX2 callback is invalid.';
  end if;

  select * into challenge_record from public.cx2_magic_link_challenges
  where state_hash = input_state_hash for update;
  if not found or challenge_record.status not in ('prepared','sent')
     or challenge_record.expires_at <= audit_now then
    raise exception using errcode = '55000', message = 'CX2 callback is no longer active.';
  end if;

  select lower(btrim(email)) into auth_email from auth.users
  where id = input_auth_user_id and email_confirmed_at is not null;
  if auth_email is null then
    raise exception using errcode = '42501', message = 'CX2 verified identity is required.';
  end if;

  select * into session_record from public.client_activation_exchange_sessions
  where id = challenge_record.exchange_session_id for update;
  select * into invitation_record from public.lead_demo_invitations
  where id = challenge_record.invitation_id for update;
  select * into link_record from public.client_activation_links
  where id = challenge_record.activation_link_id for update;
  if session_record.id is null or invitation_record.id is null or link_record.id is null
     or session_record.revoked_at is not null or session_record.expires_at <= audit_now
     or invitation_record.status in ('activated','revoked','link_expired','send_failed')
     or link_record.status not in ('active','opened') or link_record.expires_at <= audit_now
     or invitation_record.auth_user_id is distinct from input_auth_user_id
     or auth_email is distinct from invitation_record.normalized_email
     or auth_email is distinct from link_record.intended_email then
    raise exception using errcode = '23514', message = 'CX2 verified identity does not match the invitation.';
  end if;

  select * into lead_record from public.leads where id = link_record.lead_id for update;
  select * into profile_record from public.profiles where id = invitation_record.profile_id for update;
  if lead_record.id is null or profile_record.id is null
     or profile_record.auth_user_id is distinct from input_auth_user_id
     or lower(btrim(coalesce(profile_record.email, ''))) is distinct from auth_email then
    raise exception using errcode = '23514', message = 'CX2 profile ownership is ambiguous.';
  end if;
  if not exists (
    select 1
    from public.demo_journeys journey
    join public.website_preview_versions preview on preview.demo_journey_id = journey.id
    join public.public_preview_publications publication on publication.preview_version_id = preview.id
    where journey.id = invitation_record.demo_journey_id and journey.lead_id = lead_record.id
      and preview.id = link_record.preview_version_id
      and publication.id = link_record.preview_publication_id
      and publication.enabled = true and publication.revoked_at is null
      and (
        (lead_record.converted_customer_id is null and link_record.customer_id is null
          and publication.relationship_type = 'lead' and publication.relationship_id = lead_record.id)
        or
        (lead_record.converted_customer_id is not null and link_record.customer_id = lead_record.converted_customer_id
          and publication.relationship_type = 'customer' and publication.relationship_id = lead_record.converted_customer_id)
      )
  ) then
    raise exception using errcode = '23514', message = 'CX2 callback preview ownership mismatch.';
  end if;

  select count(*) into matching_customers
  from public.customers customer
  where customer.archived_at is null and customer.deleted_at is null
    and (customer.auth_user_id = input_auth_user_id
      or customer.profile_id = profile_record.id
      or lower(btrim(coalesce(customer.email, ''))) = auth_email);
  if matching_customers > 1 then
    raise exception using errcode = '21000', message = 'CX2 customer ownership is ambiguous.';
  end if;

  if lead_record.converted_customer_id is not null then
    select * into customer_record from public.customers
    where id = lead_record.converted_customer_id for update;
    if customer_record.id is null or matching_customers <> 1
       or customer_record.auth_user_id is distinct from input_auth_user_id
       or customer_record.profile_id is distinct from profile_record.id then
      raise exception using errcode = '23514', message = 'CX2 converted customer ownership mismatch.';
    end if;
  elsif matching_customers = 1 then
    select * into customer_record from public.customers customer
    where customer.archived_at is null and customer.deleted_at is null
      and (customer.auth_user_id = input_auth_user_id
        or customer.profile_id = profile_record.id
        or lower(btrim(coalesce(customer.email, ''))) = auth_email)
    for update;
    if customer_record.auth_user_id is distinct from input_auth_user_id
       or customer_record.profile_id is distinct from profile_record.id then
      raise exception using errcode = '23514', message = 'CX2 existing customer ownership mismatch.';
    end if;
  else
    if profile_record.role is distinct from 'demo_user' then
      raise exception using errcode = '23514', message = 'CX2 provisional profile is invalid.';
    end if;
    insert into public.customers (
      profile_id, auth_user_id, name, company, email, phone, status, portal_status,
      is_demo, environment, metadata
    ) values (
      profile_record.id, input_auth_user_id, lead_record.name, lead_record.company,
      auth_email, lead_record.phone, 'active', 'active', lead_record.is_demo,
      lead_record.environment, jsonb_build_object('activationContract','CX2_MAGIC_LINK_V1')
    ) returning * into customer_record;
    did_create := true;
  end if;

  if link_record.customer_id is not null and link_record.customer_id is distinct from customer_record.id then
    raise exception using errcode = '23514', message = 'CX2 activation customer mismatch.';
  end if;
  if exists (
    select 1 from public.website_preview_versions preview
    where preview.id = link_record.preview_version_id
      and preview.customer_id is not null and preview.customer_id <> customer_record.id
  ) then
    raise exception using errcode = '23514', message = 'CX2 preview customer mismatch.';
  end if;
  if exists (
    select 1 from public.website_preview_versions preview
    join public.projects project on project.id = preview.project_id
    where preview.id = link_record.preview_version_id and project.customer_id <> customer_record.id
  ) then
    raise exception using errcode = '23514', message = 'CX2 project customer mismatch.';
  end if;

  update public.profiles set role = 'customer', status = 'active', updated_at = audit_now
  where id = profile_record.id;
  update public.leads
  set converted_customer_id = customer_record.id,
      converted_at = coalesce(converted_at, audit_now), updated_at = audit_now
  where id = lead_record.id;
  update public.website_preview_versions as target_preview
  set customer_id = customer_record.id, updated_at = audit_now
  where target_preview.id = link_record.preview_version_id and target_preview.customer_id is null;
  update public.public_preview_publications
  set relationship_type = 'customer', relationship_id = customer_record.id, updated_at = audit_now
  where id = link_record.preview_publication_id
    and relationship_type = 'lead' and relationship_id = lead_record.id;

  if not exists (
    select 1 from public.public_preview_publications publication
    where publication.id = link_record.preview_publication_id
      and publication.relationship_type = 'customer'
      and publication.relationship_id = customer_record.id
      and publication.preview_version_id = link_record.preview_version_id
      and publication.enabled = true and publication.revoked_at is null
  ) then
    raise exception using errcode = '23514', message = 'CX2 publication ownership could not be transferred.';
  end if;

  update public.client_activation_links
  set customer_id = customer_record.id, status = 'activated', activated_at = audit_now
  where id = link_record.id;
  update public.lead_demo_invitations
  set status = 'activated', activated_at = audit_now, dca_phase = 'account_activated'
  where id = invitation_record.id;
  update public.client_activation_exchange_sessions
  set revoked_at = coalesce(revoked_at, audit_now)
  where activation_link_id = link_record.id and revoked_at is null;
  update public.cx2_magic_link_challenges
  set status = case when id = challenge_record.id then 'consumed' else 'superseded' end,
      consumed_at = case when id = challenge_record.id then audit_now else consumed_at end,
      verified_auth_user_id = case when id = challenge_record.id then input_auth_user_id else verified_auth_user_id end,
      updated_at = audit_now
  where invitation_id = invitation_record.id and status in ('prepared','sent');

  return query select customer_record.id, profile_record.id, link_record.preview_version_id,
    did_create, '/klantportaal.html?view=website'::text;
end
$function$;

revoke all on function public.cx2_prepare_magic_link(text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.cx2_prepare_magic_link(text,text,timestamptz) to service_role;
revoke all on function public.cx2_mark_magic_link_sent(uuid) from public, anon, authenticated;
grant execute on function public.cx2_mark_magic_link_sent(uuid) to service_role;
revoke all on function public.cx2_complete_magic_link(text,uuid) from public, anon, authenticated;
grant execute on function public.cx2_complete_magic_link(text,uuid) to service_role;

commit;
