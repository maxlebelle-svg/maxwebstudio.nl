-- 021_structured_intake_approval_email_flow.sql
-- Structured client intake, asset metadata, Super Admin approval gates and 5-day client email flow.
-- Safe to run after 018_demo_journey_workflow.sql, 019_ai_website_factory_v1.sql and 020_project_workspaces.sql.

alter table if exists public.demo_journeys
  add column if not exists intake_json jsonb not null default '{}'::jsonb,
  add column if not exists intake_summary text,
  add column if not exists intake_completeness integer not null default 0 check (intake_completeness >= 0 and intake_completeness <= 100),
  add column if not exists asset_metadata jsonb not null default '[]'::jsonb,
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'preview_approved', 'delivery_approved', 'rejected')),
  add column if not exists preview_approved_by uuid,
  add column if not exists preview_approved_at timestamptz,
  add column if not exists delivery_approved_by uuid,
  add column if not exists delivery_approved_at timestamptz;

create table if not exists public.lead_intakes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  demo_journey_id uuid references public.demo_journeys(id) on delete cascade,
  workspace_slug text,
  intake_status text not null default 'incomplete'
    check (intake_status in ('incomplete', 'complete', 'ready_for_preview')),
  required_total integer not null default 0,
  required_completed integer not null default 0,
  completeness integer not null default 0 check (completeness >= 0 and completeness <= 100),
  answers jsonb not null default '{}'::jsonb,
  summary text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_intakes_lead_id_idx on public.lead_intakes(lead_id);
create index if not exists lead_intakes_demo_journey_id_idx on public.lead_intakes(demo_journey_id);

create table if not exists public.lead_intake_answers (
  id uuid primary key default gen_random_uuid(),
  lead_intake_id uuid not null references public.lead_intakes(id) on delete cascade,
  answer_key text not null,
  answer_value jsonb not null default 'null'::jsonb,
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lead_intake_id, answer_key)
);

create table if not exists public.lead_assets (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  demo_journey_id uuid references public.demo_journeys(id) on delete cascade,
  workspace_slug text,
  asset_kind text not null check (asset_kind in ('logo', 'photo', 'document', 'other')),
  file_name text not null,
  file_type text,
  file_size bigint,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  upload_status text not null default 'metadata_only'
    check (upload_status in ('metadata_only', 'uploaded', 'failed')),
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists lead_assets_lead_id_idx on public.lead_assets(lead_id);
create index if not exists lead_assets_demo_journey_id_idx on public.lead_assets(demo_journey_id);

create table if not exists public.client_email_flows (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid,
  demo_journey_id uuid not null references public.demo_journeys(id) on delete cascade,
  current_day integer not null default 1 check (current_day between 1 and 5),
  flow_status text not null default 'draft'
    check (flow_status in ('draft', 'ready', 'paused', 'completed')),
  preview_approval_required boolean not null default true,
  delivery_approval_required boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (demo_journey_id)
);

create table if not exists public.client_email_events (
  id uuid primary key default gen_random_uuid(),
  client_email_flow_id uuid references public.client_email_flows(id) on delete cascade,
  demo_journey_id uuid not null references public.demo_journeys(id) on delete cascade,
  email_type text not null check (email_type in (
    'day1_received',
    'day2_concept',
    'day3_preview_ready',
    'day4_feedback_refinement',
    'day5_delivery_ready'
  )),
  subject text,
  body text,
  send_status text not null default 'draft'
    check (send_status in ('draft', 'ready', 'blocked_pending_approval', 'sent', 'failed')),
  requires_approval boolean not null default false,
  approved_by uuid,
  approved_at timestamptz,
  sent_by uuid,
  sent_at timestamptz,
  diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.lead_intakes enable row level security;
alter table if exists public.lead_intake_answers enable row level security;
alter table if exists public.lead_assets enable row level security;
alter table if exists public.client_email_flows enable row level security;
alter table if exists public.client_email_events enable row level security;

drop policy if exists "lead_intakes_staff_manage" on public.lead_intakes;
create policy "lead_intakes_staff_manage"
on public.lead_intakes
for all
to authenticated
using (true)
with check (true);

drop policy if exists "lead_intake_answers_staff_manage" on public.lead_intake_answers;
create policy "lead_intake_answers_staff_manage"
on public.lead_intake_answers
for all
to authenticated
using (true)
with check (true);

drop policy if exists "lead_assets_staff_manage" on public.lead_assets;
create policy "lead_assets_staff_manage"
on public.lead_assets
for all
to authenticated
using (true)
with check (true);

drop policy if exists "client_email_flows_staff_manage" on public.client_email_flows;
create policy "client_email_flows_staff_manage"
on public.client_email_flows
for all
to authenticated
using (true)
with check (true);

drop policy if exists "client_email_events_staff_manage" on public.client_email_events;
create policy "client_email_events_staff_manage"
on public.client_email_events
for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.lead_intakes to authenticated;
grant select, insert, update, delete on public.lead_intake_answers to authenticated;
grant select, insert, update, delete on public.lead_assets to authenticated;
grant select, insert, update, delete on public.client_email_flows to authenticated;
grant select, insert, update, delete on public.client_email_events to authenticated;
