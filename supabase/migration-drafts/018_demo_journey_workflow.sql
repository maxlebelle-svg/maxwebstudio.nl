-- Demo Journey MVP
-- Purpose: central storage for sales-managed demo customer journeys.

create extension if not exists pgcrypto;

create table if not exists public.demo_journeys (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null,
  customer_id uuid null,
  business_name text,
  contact_name text,
  email text,
  phone text,
  website_url text,
  demo_status text not null default 'geen_demo',
  generated_briefing text,
  preview_url text,
  preview_token text null,
  preview_package jsonb not null default '{}'::jsonb,
  preview_generated_at timestamptz null,
  feedback text,
  internal_notes text,
  follow_up_at timestamptz null,
  assigned_to text null,
  email_flow_enabled boolean not null default false,
  last_email_status text null,
  last_email_sent_at timestamptz null,
  next_email_type text null,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demo_journeys_demo_status_check check (
    demo_status in (
      'geen_demo',
      'aanvraag_ontvangen',
      'briefing_klaar',
      'intern_in_productie',
      'interne_preview_klaar',
      'preview_ingepland_voor_klant',
      'preview_verstuurd',
      'feedback_ontvangen',
      'aanpassingen_bezig',
      'definitieve_versie_klaar',
      'belafspraak_gepland',
      'verkocht',
      'afgewezen'
    )
  )
);

create table if not exists public.demo_journey_events (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null references public.demo_journeys(id) on delete cascade,
  event_type text,
  title text,
  description text,
  visible_to_customer boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text null
);

create index if not exists demo_journeys_lead_id_idx on public.demo_journeys(lead_id);
create index if not exists demo_journeys_customer_id_idx on public.demo_journeys(customer_id);
create index if not exists demo_journeys_status_idx on public.demo_journeys(demo_status);
create index if not exists demo_journeys_follow_up_at_idx on public.demo_journeys(follow_up_at);
create index if not exists demo_journeys_preview_token_idx on public.demo_journeys(preview_token);
create index if not exists demo_journey_events_journey_idx on public.demo_journey_events(demo_journey_id, created_at);
create index if not exists demo_journey_events_customer_visible_idx on public.demo_journey_events(demo_journey_id, visible_to_customer, created_at);

create or replace function public.set_demo_journey_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists demo_journeys_set_updated_at on public.demo_journeys;
create trigger demo_journeys_set_updated_at
before update on public.demo_journeys
for each row
execute function public.set_demo_journey_updated_at();

alter table public.demo_journeys enable row level security;
alter table public.demo_journey_events enable row level security;

-- Netlify functions use the service role for staff workflows.
grant select, insert, update on public.demo_journeys to service_role;
grant select, insert, update, delete on public.demo_journey_events to service_role;

-- Keep direct anon/authenticated access closed by default.
drop policy if exists "demo_journeys_no_direct_anon_access" on public.demo_journeys;
create policy "demo_journeys_no_direct_anon_access"
on public.demo_journeys
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "demo_journey_events_no_direct_anon_access" on public.demo_journey_events;
create policy "demo_journey_events_no_direct_anon_access"
on public.demo_journey_events
for all
to anon, authenticated
using (false)
with check (false);
