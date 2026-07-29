-- Food Demo Bundle: additive, staging-first foundation.
-- Existing website previews and the frozen Silverado Food runtime are untouched.

create table if not exists public.food_demo_bundles (
  id uuid primary key default gen_random_uuid(),
  relationship_type text not null check (relationship_type in ('lead','customer')),
  relationship_id uuid not null,
  lead_id uuid null references public.leads(id) on delete restrict,
  customer_id uuid null references public.customers(id) on delete restrict,
  factory_project_id uuid null references public.factory_projects(id) on delete set null,
  demo_type text not null default 'food' check (demo_type = 'food'),
  display_name text not null check (char_length(display_name) between 2 and 160),
  blueprint_key text not null,
  blueprint_version integer not null check (blueprint_version > 0),
  storefront_url text not null,
  dashboard_url text not null,
  dashboard_deeplink text not null,
  qr_asset_url text not null,
  storefront_status text not null default 'unchecked' check (storefront_status in ('unchecked','reachable','unreachable')),
  dashboard_status text not null default 'unchecked' check (dashboard_status in ('unchecked','reachable','unreachable')),
  invitation_status text not null default 'not_sent' check (invitation_status in ('not_sent','ready','sent','send_failed','revoked','expired')),
  recipient_email text null,
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz null,
  revoked_at timestamptz null,
  expires_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint food_demo_bundles_one_relationship check (
    (relationship_type='lead' and lead_id=relationship_id and customer_id is null)
    or (relationship_type='customer' and customer_id=relationship_id and lead_id is null)
  ),
  constraint food_demo_bundles_https_urls check (
    storefront_url ~ '^https://' and dashboard_url ~ '^https://' and dashboard_deeplink ~ '^https://' and qr_asset_url ~ '^/'
  ),
  constraint food_demo_bundles_recipient_check check (
    recipient_email is null or recipient_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  unique (relationship_type, relationship_id, demo_type, blueprint_key)
);

create index if not exists food_demo_bundles_relationship_idx on public.food_demo_bundles(relationship_type, relationship_id, updated_at desc);
create index if not exists food_demo_bundles_status_idx on public.food_demo_bundles(invitation_status, updated_at desc);

create table if not exists public.food_demo_bundle_dispatches (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.food_demo_bundles(id) on delete restrict,
  action_type text not null check (action_type in ('test','send','resend')),
  action_key text not null check (char_length(action_key) between 16 and 160),
  recipient_kind text not null check (recipient_kind in ('internal_test','relationship')),
  status text not null default 'reserved' check (status in ('reserved','sent','failed')),
  provider_message_id text null,
  error_code text null,
  requested_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz null,
  unique(bundle_id, action_key)
);

create table if not exists public.food_demo_bundle_events (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.food_demo_bundles(id) on delete restrict,
  event_type text not null,
  action_key text null,
  actor_profile_id uuid null references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists food_demo_bundle_events_bundle_idx on public.food_demo_bundle_events(bundle_id, occurred_at desc);
create unique index if not exists food_demo_bundle_events_action_unique on public.food_demo_bundle_events(bundle_id, action_key) where action_key is not null;

create or replace function public.food_demo_bundle_events_append_only()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='55000', message='Food demo bundle events are append-only.';
end;
$$;
drop trigger if exists food_demo_bundle_events_append_only_guard on public.food_demo_bundle_events;
create trigger food_demo_bundle_events_append_only_guard before update or delete on public.food_demo_bundle_events
for each row execute function public.food_demo_bundle_events_append_only();

create table if not exists public.food_demo_bundle_rate_limits (
  actor_profile_id uuid not null,
  action_scope text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key(actor_profile_id, action_scope)
);

create or replace function public.consume_food_demo_bundle_rate_limit(
  input_actor_profile_id uuid, input_action_scope text, input_max_attempts integer default 5
) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.food_demo_bundle_rate_limits%rowtype; t timestamptz:=clock_timestamp();
begin
  if input_actor_profile_id is null or input_action_scope not in ('test','send','resend') or input_max_attempts < 1 then return false; end if;
  insert into public.food_demo_bundle_rate_limits(actor_profile_id,action_scope,window_started_at,attempts,updated_at)
  values(input_actor_profile_id,input_action_scope,t,0,t) on conflict do nothing;
  select * into r from public.food_demo_bundle_rate_limits where actor_profile_id=input_actor_profile_id and action_scope=input_action_scope for update;
  if r.window_started_at <= t - interval '10 minutes' then
    update public.food_demo_bundle_rate_limits set window_started_at=t,attempts=1,updated_at=t where actor_profile_id=input_actor_profile_id and action_scope=input_action_scope;
    return true;
  end if;
  if r.attempts >= input_max_attempts then return false; end if;
  update public.food_demo_bundle_rate_limits set attempts=attempts+1,updated_at=t where actor_profile_id=input_actor_profile_id and action_scope=input_action_scope;
  return true;
end;
$$;

alter table public.food_demo_bundles enable row level security;
alter table public.food_demo_bundles force row level security;
alter table public.food_demo_bundle_dispatches enable row level security;
alter table public.food_demo_bundle_dispatches force row level security;
alter table public.food_demo_bundle_events enable row level security;
alter table public.food_demo_bundle_events force row level security;
alter table public.food_demo_bundle_rate_limits enable row level security;
alter table public.food_demo_bundle_rate_limits force row level security;

revoke all on public.food_demo_bundles, public.food_demo_bundle_dispatches, public.food_demo_bundle_events, public.food_demo_bundle_rate_limits from public, anon, authenticated;
grant all on public.food_demo_bundles, public.food_demo_bundle_dispatches, public.food_demo_bundle_events, public.food_demo_bundle_rate_limits to service_role;
revoke all on function public.food_demo_bundle_events_append_only() from public, anon, authenticated;
revoke all on function public.consume_food_demo_bundle_rate_limit(uuid,text,integer) from public, anon, authenticated;
grant execute on function public.consume_food_demo_bundle_rate_limit(uuid,text,integer) to service_role;

comment on table public.food_demo_bundles is 'Canonical two-link Food demo presentation and invitation bundle; does not own Food tenant runtime data.';
comment on table public.food_demo_bundle_events is 'Append-only audit trail without credentials, tokens, or unnecessary recipient PII.';
