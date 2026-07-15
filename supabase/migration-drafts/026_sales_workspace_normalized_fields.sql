-- DRAFT ONLY: do not apply to production without an explicit rollout decision.
-- Adds orthogonal Sales Workspace state without replacing the legacy lifecycle columns.

do $$
begin
  if to_regclass('public.leads') is null then
    raise exception 'Preflight failed: public.leads does not exist';
  end if;
end $$;

alter table public.leads
  add column if not exists pipeline_stage text,
  add column if not exists call_disposition text,
  add column if not exists interest_level text,
  add column if not exists priority text not null default 'normal',
  add column if not exists is_favorite boolean not null default false,
  add column if not exists next_action_completed_at timestamptz,
  add column if not exists next_action_completed_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz;

-- Backward-compatible mapping: only populate the new nullable columns when absent.
update public.leads
set pipeline_stage = case coalesce(lead_status, status, '')
  when 'contacted' then 'contacted'
  when 'interesting' then 'interested'
  when 'appointment_scheduled' then 'demo_planned'
  when 'demo_requested' then 'demo_planned'
  when 'demo_building' then 'demo_in_progress'
  when 'demo_ready' then 'demo_in_progress'
  when 'demo_sent' then 'demo_sent'
  when 'proposal_sent' then 'awaiting_feedback'
  when 'negotiation' then 'awaiting_feedback'
  when 'won' then 'approved'
  when 'customer' then 'customer'
  when 'lost' then 'closed'
  when 'not_interesting' then 'closed'
  else 'new'
end
where pipeline_stage is null;

update public.leads
set call_disposition = case coalesce(last_call_outcome, '')
  when 'contacted' then 'called'
  when 'interested' then 'called'
  when 'no_answer' then 'no_answer'
  when 'voicemail_left' then 'voicemail'
  when 'callback_requested' then 'callback'
  when 'wrong_number' then 'invalid_number'
  when 'busy' then 'busy'
  else 'not_called'
end
where call_disposition is null;

update public.leads
set interest_level = case
  when last_call_outcome = 'not_interested' then 'not_interested'
  when last_call_outcome = 'interested' then 'interested'
  when coalesce(lead_score, 0) >= 80 then 'hot'
  else 'unsure'
end
where interest_level is null;

alter table public.leads
  alter column pipeline_stage set default 'new',
  alter column pipeline_stage set not null,
  alter column call_disposition set default 'not_called',
  alter column call_disposition set not null,
  alter column interest_level set default 'unsure',
  alter column interest_level set not null;

alter table public.leads drop constraint if exists leads_pipeline_stage_check;
alter table public.leads add constraint leads_pipeline_stage_check check (pipeline_stage in (
  'new', 'contacted', 'interested', 'demo_planned', 'demo_in_progress', 'demo_sent',
  'awaiting_feedback', 'approved', 'awaiting_payment', 'customer', 'closed'
));

alter table public.leads drop constraint if exists leads_call_disposition_check;
alter table public.leads add constraint leads_call_disposition_check check (call_disposition in (
  'not_called', 'called', 'no_answer', 'voicemail', 'callback', 'invalid_number', 'busy'
));

alter table public.leads drop constraint if exists leads_interest_level_check;
alter table public.leads add constraint leads_interest_level_check check (interest_level in (
  'hot', 'interested', 'unsure', 'not_interested'
));

alter table public.leads drop constraint if exists leads_priority_check;
alter table public.leads add constraint leads_priority_check check (priority in ('high', 'normal', 'low'));

create index if not exists leads_pipeline_stage_updated_idx on public.leads(pipeline_stage, updated_at desc);
create index if not exists leads_call_disposition_idx on public.leads(call_disposition) where call_disposition <> 'not_called';
create index if not exists leads_interest_priority_idx on public.leads(interest_level, priority);
create index if not exists leads_open_next_action_idx on public.leads(next_action_at, priority) where next_action_at is not null and next_action_completed_at is null;
create index if not exists leads_active_owner_idx on public.leads(assigned_user_id, pipeline_stage, updated_at desc) where archived_at is null;

comment on column public.leads.pipeline_stage is 'Commercial pipeline stage, separate from call disposition and interest.';
comment on column public.leads.call_disposition is 'Outcome/status of the latest calling workflow.';
comment on column public.leads.interest_level is 'Explicit commercial interest classification.';
comment on column public.leads.priority is 'Lead work-priority: high, normal or low.';

-- Existing RLS remains enabled and applies automatically to the new columns. No policy is weakened here.
