-- Phase 2: additive customer journey automation foundations.
-- This migration creates storage and an atomic event/outbox entrypoint only.
-- It does not schedule workers, send email, or change existing mail flows.

create extension if not exists pgcrypto;

create table if not exists public.journey_definitions (
  id uuid primary key default gen_random_uuid(),
  definition_key text not null,
  version integer not null check (version > 0),
  product_code text,
  journey_type text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'retired')),
  config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config) = 'object'),
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  retired_at timestamptz,
  constraint journey_definitions_key_version_unique unique (definition_key, version),
  constraint journey_definitions_key_format check (definition_key ~ '^[a-z0-9][a-z0-9._-]{2,127}$'),
  constraint journey_definitions_type_format check (journey_type ~ '^[a-z][a-z0-9._-]{2,127}$')
);

create table if not exists public.journey_instances (
  id uuid primary key default gen_random_uuid(),
  instance_key text not null,
  definition_id uuid not null references public.journey_definitions(id) on delete restrict,
  customer_id uuid,
  project_id uuid,
  order_id text,
  product_code text,
  journey_type text not null,
  definition_version integer not null check (definition_version > 0),
  current_phase text,
  current_step text,
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'cancelled', 'needs_review')),
  next_step_at timestamptz,
  assignee_auth_user_id uuid,
  environment text not null default 'production'
    check (environment in ('production', 'test', 'demo')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journey_instances_instance_key_unique unique (instance_key),
  constraint journey_instances_key_format check (instance_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,191}$')
);

create table if not exists public.journey_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  customer_id uuid,
  journey_instance_id uuid references public.journey_instances(id) on delete set null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  environment text not null default 'production'
    check (environment in ('production', 'test', 'demo')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint journey_events_event_key_unique unique (event_key),
  constraint journey_events_type_format check (event_type ~ '^[a-z][a-z0-9._-]{2,127}$'),
  constraint journey_events_entity_type_format check (entity_type ~ '^[a-z][a-z0-9_-]{1,63}$')
);

create table if not exists public.automation_outbox (
  id uuid primary key default gen_random_uuid(),
  journey_event_id uuid not null references public.journey_events(id) on delete restrict,
  event_key text not null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  customer_id uuid,
  journey_instance_id uuid references public.journey_instances(id) on delete set null,
  effect_type text not null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  processed_at timestamptz,
  last_error_code text,
  last_error_message text,
  idempotency_key text not null,
  environment text not null default 'production'
    check (environment in ('production', 'test', 'demo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_outbox_idempotency_key_unique unique (idempotency_key),
  constraint automation_outbox_event_effect_unique unique (journey_event_id, effect_type),
  constraint automation_outbox_effect_type_format check (effect_type ~ '^[a-z][a-z0-9._-]{2,127}$')
);

create table if not exists public.automation_executions (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.automation_outbox(id) on delete restrict,
  automation_key text not null,
  trigger_event_type text not null,
  template_key text,
  template_version integer check (template_version is null or template_version > 0),
  provider text,
  provider_message_id text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled', 'dead_letter')),
  delivery_status text not null default 'not_sent'
    check (delivery_status in ('not_sent', 'queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed')),
  engagement_status text not null default 'unknown'
    check (engagement_status in ('unknown', 'opened', 'clicked', 'unsubscribed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  last_error_message text,
  idempotency_key text not null,
  environment text not null default 'production'
    check (environment in ('production', 'test', 'demo')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_executions_idempotency_key_unique unique (idempotency_key),
  constraint automation_executions_outbox_automation_unique unique (outbox_id, automation_key)
);

create table if not exists public.provider_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  provider_message_id text,
  payload_hash text,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  signature_verified boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled', 'dead_letter')),
  processed_at timestamptz,
  last_error_code text,
  last_error_message text,
  environment text not null default 'production'
    check (environment in ('production', 'test', 'demo')),
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_webhook_events_provider_event_unique unique (provider, provider_event_id),
  constraint provider_webhook_events_provider_format check (provider ~ '^[a-z][a-z0-9_-]{1,63}$'),
  constraint provider_webhook_events_type_format check (event_type ~ '^[a-z][a-z0-9._-]{2,127}$')
);

create index if not exists journey_definitions_published_idx
  on public.journey_definitions (definition_key, version desc)
  where status = 'published';
create index if not exists journey_instances_customer_status_idx
  on public.journey_instances (customer_id, status, updated_at desc);
create index if not exists journey_instances_project_idx
  on public.journey_instances (project_id, updated_at desc);
create index if not exists journey_events_entity_idx
  on public.journey_events (entity_type, entity_id, occurred_at desc);
create index if not exists journey_events_instance_idx
  on public.journey_events (journey_instance_id, occurred_at desc);
create index if not exists automation_outbox_dispatch_idx
  on public.automation_outbox (status, next_attempt_at, created_at)
  where status in ('pending', 'failed');
create index if not exists automation_executions_outbox_idx
  on public.automation_executions (outbox_id, created_at desc);
create index if not exists automation_executions_provider_message_idx
  on public.automation_executions (provider, provider_message_id)
  where provider_message_id is not null;
create index if not exists provider_webhook_events_message_idx
  on public.provider_webhook_events (provider, provider_message_id, occurred_at desc)
  where provider_message_id is not null;

alter table public.journey_definitions enable row level security;
alter table public.journey_instances enable row level security;
alter table public.journey_events enable row level security;
alter table public.automation_outbox enable row level security;
alter table public.automation_executions enable row level security;
alter table public.provider_webhook_events enable row level security;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'journey_definitions',
    'journey_instances',
    'journey_events',
    'automation_outbox',
    'automation_executions',
    'provider_webhook_events'
  ] loop
    policy_name := table_name || '_service_role_all';
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for all to service_role using (true) with check (true)',
        policy_name,
        table_name
      );
    end if;
  end loop;
end
$$;

revoke all on public.journey_definitions from anon, authenticated;
revoke all on public.journey_instances from anon, authenticated;
revoke all on public.journey_events from anon, authenticated;
revoke all on public.automation_outbox from anon, authenticated;
revoke all on public.automation_executions from anon, authenticated;
revoke all on public.provider_webhook_events from anon, authenticated;

grant all on public.journey_definitions to service_role;
grant all on public.journey_instances to service_role;
grant all on public.journey_events to service_role;
grant all on public.automation_outbox to service_role;
grant all on public.automation_executions to service_role;
grant all on public.provider_webhook_events to service_role;

create or replace function public.record_journey_event_and_enqueue(
  p_event_key text,
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_customer_id uuid,
  p_journey_instance_id uuid,
  p_payload jsonb,
  p_environment text,
  p_occurred_at timestamptz,
  p_outbox_idempotency_key text default null,
  p_effect_type text default null,
  p_effect_payload jsonb default '{}'::jsonb,
  p_next_attempt_at timestamptz default null
)
returns table (event_id uuid, outbox_id uuid, duplicate boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_event_id uuid;
  resolved_event_id uuid;
  inserted_outbox_id uuid;
  resolved_outbox_id uuid;
begin
  insert into public.journey_events (
    event_key,
    event_type,
    entity_type,
    entity_id,
    customer_id,
    journey_instance_id,
    payload,
    environment,
    occurred_at
  ) values (
    p_event_key,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_customer_id,
    p_journey_instance_id,
    coalesce(p_payload, '{}'::jsonb),
    p_environment,
    p_occurred_at
  )
  on conflict (event_key) do nothing
  returning id into inserted_event_id;

  if inserted_event_id is null then
    select id into resolved_event_id
    from public.journey_events
    where event_key = p_event_key;
  else
    resolved_event_id := inserted_event_id;
  end if;

  if p_outbox_idempotency_key is not null and p_effect_type is not null then
    insert into public.automation_outbox (
      journey_event_id,
      event_key,
      event_type,
      entity_type,
      entity_id,
      customer_id,
      journey_instance_id,
      effect_type,
      payload,
      idempotency_key,
      environment,
      next_attempt_at
    ) values (
      resolved_event_id,
      p_event_key,
      p_event_type,
      p_entity_type,
      p_entity_id,
      p_customer_id,
      p_journey_instance_id,
      p_effect_type,
      coalesce(p_effect_payload, '{}'::jsonb),
      p_outbox_idempotency_key,
      p_environment,
      coalesce(p_next_attempt_at, now())
    )
    on conflict do nothing
    returning id into inserted_outbox_id;

    if inserted_outbox_id is null then
      select id into resolved_outbox_id
      from public.automation_outbox
      where idempotency_key = p_outbox_idempotency_key
         or (journey_event_id = resolved_event_id and effect_type = p_effect_type)
      order by created_at asc
      limit 1;
    else
      resolved_outbox_id := inserted_outbox_id;
    end if;
  end if;

  return query select
    resolved_event_id,
    resolved_outbox_id,
    inserted_event_id is null;
end
$$;

revoke all on function public.record_journey_event_and_enqueue(
  text, text, text, text, uuid, uuid, jsonb, text, timestamptz, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.record_journey_event_and_enqueue(
  text, text, text, text, uuid, uuid, jsonb, text, timestamptz, text, text, jsonb, timestamptz
) to service_role;
