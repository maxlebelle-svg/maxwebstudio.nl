-- RC1.2B: canonical Demo Journey storage required for sales validation.
--
-- Relationship contract:
-- - a canonical journey may belong to a lead, a customer, or both during conversion;
-- - a controlled manual/unlinked journey is allowed only while it retains a stable
--   business, contact, or e-mail identity;
-- - deleting a related lead or customer detaches that relation without deleting
--   the journey or the remaining parent record.

begin;

create table public.demo_journeys (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid null,
  customer_id uuid null,
  business_name text null,
  contact_name text null,
  email text null,
  phone text null,
  website_url text null,
  demo_status text not null default 'geen_demo',
  generated_briefing text null,
  preview_url text null,
  preview_token text null,
  preview_package jsonb not null default '{}'::jsonb,
  preview_generated_at timestamptz null,
  feedback text null,
  internal_notes text null,
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
  constraint demo_journeys_lead_id_fkey
    foreign key (lead_id) references public.leads(id) on delete set null,
  constraint demo_journeys_customer_id_fkey
    foreign key (customer_id) references public.customers(id) on delete set null,
  constraint demo_journeys_relationship_identity_check check (
    lead_id is not null
    or customer_id is not null
    or nullif(btrim(business_name), '') is not null
    or nullif(btrim(contact_name), '') is not null
    or nullif(btrim(email), '') is not null
  ),
  constraint demo_journeys_preview_token_check check (
    preview_token is null or nullif(btrim(preview_token), '') is not null
  ),
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

comment on table public.demo_journeys is
  'Canonical Demo Journey storage for lead, customer, or controlled transition workflows.';
comment on constraint demo_journeys_relationship_identity_check on public.demo_journeys is
  'Allows lead-only, customer-only, both during conversion, or a controlled unlinked journey with stable contact identity.';

create table public.demo_journey_events (
  id uuid primary key default gen_random_uuid(),
  demo_journey_id uuid not null,
  event_type text null,
  title text null,
  description text null,
  visible_to_customer boolean not null default false,
  created_at timestamptz not null default now(),
  created_by text null,
  constraint demo_journey_events_demo_journey_id_fkey
    foreign key (demo_journey_id) references public.demo_journeys(id) on delete cascade
);

create index demo_journeys_lead_id_idx
  on public.demo_journeys (lead_id);
create index demo_journeys_customer_id_idx
  on public.demo_journeys (customer_id);
create index demo_journeys_status_idx
  on public.demo_journeys (demo_status);
create index demo_journeys_follow_up_at_idx
  on public.demo_journeys (follow_up_at);
create unique index demo_journeys_preview_token_unique_idx
  on public.demo_journeys (preview_token)
  where preview_token is not null;
create index demo_journey_events_journey_idx
  on public.demo_journey_events (demo_journey_id, created_at);
create index demo_journey_events_customer_visible_idx
  on public.demo_journey_events (demo_journey_id, visible_to_customer, created_at);

create function public.set_demo_journey_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;

revoke all privileges on function public.set_demo_journey_updated_at()
  from public, anon, authenticated;
grant execute on function public.set_demo_journey_updated_at()
  to service_role;

create trigger demo_journeys_set_updated_at
before update on public.demo_journeys
for each row
execute function public.set_demo_journey_updated_at();

alter table public.demo_journeys enable row level security;
alter table public.demo_journey_events enable row level security;

revoke all privileges on table public.demo_journeys
  from public, anon, authenticated, service_role;
revoke all privileges on table public.demo_journey_events
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.demo_journeys
  to service_role;
grant select, insert, update, delete on table public.demo_journey_events
  to service_role;

create policy demo_journeys_no_direct_client_access
on public.demo_journeys
for all
to anon, authenticated
using (false)
with check (false);

create policy demo_journey_events_no_direct_client_access
on public.demo_journey_events
for all
to anon, authenticated
using (false)
with check (false);

commit;
