-- Additive, service-role-only identity and durable outbox contract for lead demo invitations.
-- This migration does not send mail, create auth users, convert leads, or schedule a worker.

begin;

create extension if not exists pgcrypto;

create table if not exists public.lead_demo_invitations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  demo_journey_id uuid not null references public.demo_journeys(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  normalized_email text not null,
  status text not null default 'planned'
    check (status in ('planned', 'sent', 'activated', 'link_expired', 'send_failed')),
  invitation_count integer not null default 1 check (invitation_count > 0),
  last_action_key uuid not null,
  last_outbox_id uuid references public.automation_outbox(id) on delete set null,
  planned_at timestamptz not null default now(),
  sent_at timestamptz,
  activated_at timestamptz,
  opened_at timestamptz,
  last_error_code text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_demo_invitations_lead_unique unique (lead_id),
  constraint lead_demo_invitations_auth_unique unique (auth_user_id),
  constraint lead_demo_invitations_profile_unique unique (profile_id),
  constraint lead_demo_invitations_email_unique unique (normalized_email),
  constraint lead_demo_invitations_email_normalized check (
    normalized_email = lower(btrim(normalized_email))
    and normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

create table if not exists public.lead_demo_invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.lead_demo_invitations(id) on delete restrict,
  action_key uuid not null,
  action_type text not null check (action_type in ('invite', 'resend', 'new_link')),
  outbox_id uuid references public.automation_outbox(id) on delete set null,
  status text not null default 'planned'
    check (status in ('planned', 'sent', 'opened', 'activated', 'link_expired', 'send_failed')),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_demo_invitation_attempts_action_unique unique (action_key)
);

create index if not exists lead_demo_invitations_journey_idx
  on public.lead_demo_invitations (demo_journey_id, updated_at desc);
create index if not exists lead_demo_invitation_attempts_invitation_idx
  on public.lead_demo_invitation_attempts (invitation_id, created_at desc);

alter table public.lead_demo_invitations enable row level security;
alter table public.lead_demo_invitation_attempts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_demo_invitations' and policyname = 'lead_demo_invitations_service_role_all') then
    create policy lead_demo_invitations_service_role_all on public.lead_demo_invitations for all to service_role using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_demo_invitation_attempts' and policyname = 'lead_demo_invitation_attempts_service_role_all') then
    create policy lead_demo_invitation_attempts_service_role_all on public.lead_demo_invitation_attempts for all to service_role using (true) with check (true);
  end if;
end
$$;

revoke all on public.lead_demo_invitations from public, anon, authenticated;
revoke all on public.lead_demo_invitation_attempts from public, anon, authenticated;
grant all on public.lead_demo_invitations to service_role;
grant all on public.lead_demo_invitation_attempts to service_role;

create or replace function public.plan_lead_demo_invitation(
  p_lead_id uuid,
  p_demo_journey_id uuid,
  p_auth_user_id uuid,
  p_profile_id uuid,
  p_normalized_email text,
  p_action_key uuid,
  p_action_type text,
  p_event_key text,
  p_outbox_idempotency_key text,
  p_effect_payload jsonb,
  p_occurred_at timestamptz
)
returns table (invitation_id uuid, attempt_id uuid, outbox_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_invitation_id uuid;
  resolved_attempt_id uuid;
  resolved_outbox_id uuid;
  was_duplicate boolean := false;
  event_result record;
begin
  if p_action_type not in ('invite', 'resend', 'new_link') then
    raise exception 'invalid_invitation_action' using errcode = '22023';
  end if;
  if p_normalized_email is null or p_normalized_email <> lower(btrim(p_normalized_email)) then
    raise exception 'invalid_normalized_email' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_effect_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_effect_payload' using errcode = '22023';
  end if;

  select attempts.invitation_id, attempts.id, attempts.outbox_id
    into resolved_invitation_id, resolved_attempt_id, resolved_outbox_id
  from public.lead_demo_invitation_attempts attempts
  where attempts.action_key = p_action_key;

  if resolved_attempt_id is not null then
    return query select resolved_invitation_id, resolved_attempt_id, resolved_outbox_id, true;
    return;
  end if;

  insert into public.lead_demo_invitations (
    lead_id, demo_journey_id, auth_user_id, profile_id, normalized_email,
    status, invitation_count, last_action_key, planned_at, updated_at
  ) values (
    p_lead_id, p_demo_journey_id, p_auth_user_id, p_profile_id, p_normalized_email,
    'planned', 1, p_action_key, p_occurred_at, p_occurred_at
  )
  on conflict (lead_id) do update set
    demo_journey_id = excluded.demo_journey_id,
    auth_user_id = excluded.auth_user_id,
    profile_id = excluded.profile_id,
    normalized_email = excluded.normalized_email,
    status = 'planned',
    invitation_count = public.lead_demo_invitations.invitation_count + 1,
    last_action_key = excluded.last_action_key,
    planned_at = excluded.planned_at,
    last_error_code = null,
    updated_at = excluded.updated_at
  returning id into resolved_invitation_id;

  select * into event_result
  from public.record_journey_event_and_enqueue(
    p_event_key,
    'lead.demo_invitation_planned',
    'lead',
    p_lead_id::text,
    null,
    null,
    jsonb_build_object('leadId', p_lead_id, 'demoJourneyId', p_demo_journey_id, 'actionType', p_action_type),
    'production',
    p_occurred_at,
    p_outbox_idempotency_key,
    'email.lead_demo_invitation',
    p_effect_payload || jsonb_build_object('invitationId', resolved_invitation_id, 'actionKey', p_action_key),
    p_occurred_at
  );
  resolved_outbox_id := event_result.outbox_id;
  if resolved_outbox_id is null then
    raise exception 'lead_demo_outbox_not_created' using errcode = 'P0001';
  end if;

  insert into public.lead_demo_invitation_attempts (invitation_id, action_key, action_type, outbox_id, status)
  values (resolved_invitation_id, p_action_key, p_action_type, resolved_outbox_id, 'planned')
  returning id into resolved_attempt_id;

  update public.lead_demo_invitations
  set last_outbox_id = resolved_outbox_id, updated_at = p_occurred_at
  where id = resolved_invitation_id;

  return query select resolved_invitation_id, resolved_attempt_id, resolved_outbox_id, was_duplicate;
end
$$;

revoke all on function public.plan_lead_demo_invitation(uuid, uuid, uuid, uuid, text, uuid, text, text, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.plan_lead_demo_invitation(uuid, uuid, uuid, uuid, text, uuid, text, text, text, jsonb, timestamptz) to service_role;

commit;
