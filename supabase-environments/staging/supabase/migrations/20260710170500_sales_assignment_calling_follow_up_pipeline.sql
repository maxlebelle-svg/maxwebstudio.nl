-- Sales assignment, calling and follow-up pipeline.
-- Non-destructive extension of the central public.leads lifecycle.

alter table public.leads
  add column if not exists last_contacted_by uuid,
  add column if not exists last_call_outcome text,
  add column if not exists next_action_type text,
  add column if not exists next_action_note text,
  add column if not exists next_action_assigned_user_id uuid,
  add column if not exists next_action_created_automatically boolean not null default false,
  add column if not exists appointment_at timestamptz,
  add column if not exists appointment_type text,
  add column if not exists appointment_location text,
  add column if not exists won_at timestamptz,
  add column if not exists won_by uuid,
  add column if not exists lost_at timestamptz,
  add column if not exists lost_by uuid,
  add column if not exists lost_reason text,
  add column if not exists lost_note text;

alter table public.leads
  drop constraint if exists leads_lead_status_check;

alter table public.leads
  add constraint leads_lead_status_check check (
    lead_status in (
      'new',
      'reviewing',
      'interesting',
      'not_interesting',
      'assigned',
      'call_scheduled',
      'contact_attempted',
      'contacted',
      'follow_up',
      'appointment_scheduled',
      'demo_requested',
      'demo_building',
      'demo_ready',
      'demo_sent',
      'proposal_sent',
      'negotiation',
      'won',
      'lost',
      'customer'
    )
  );

alter table public.leads
  drop constraint if exists leads_next_action_type_check;

alter table public.leads
  add constraint leads_next_action_type_check check (
    next_action_type is null
    or next_action_type in (
      'call',
      'email',
      'send_demo',
      'create_demo',
      'send_proposal',
      'follow_up',
      'appointment',
      'await_response',
      'custom'
    )
  );

create index if not exists leads_next_action_at_idx
  on public.leads(next_action_at)
  where next_action_at is not null;

create index if not exists leads_next_action_assigned_user_id_idx
  on public.leads(next_action_assigned_user_id)
  where next_action_assigned_user_id is not null;

create index if not exists leads_last_contacted_at_idx
  on public.leads(last_contacted_at desc)
  where last_contacted_at is not null;

create index if not exists leads_last_call_outcome_idx
  on public.leads(last_call_outcome)
  where last_call_outcome is not null and last_call_outcome <> '';

comment on column public.leads.next_action_type is 'Current active sales next action for the lead.';
comment on column public.leads.next_action_at is 'Scheduled timestamp for the active sales next action.';
comment on column public.leads.next_action_note is 'Short note for the active sales next action.';
comment on column public.leads.last_call_outcome is 'Last registered call/contact outcome for sales follow-up.';
