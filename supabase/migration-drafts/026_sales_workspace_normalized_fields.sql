-- WORKSPACE NORMALIZATION MIGRATION: run after 20260715093000_reconcile_lead_workspace_prerequisites.sql.
-- DRAFT ONLY: do not apply to production without an explicit rollout decision.
-- Adds orthogonal Sales Workspace state without replacing lifecycle, calling or attribution fields.
-- Prerequisite migrations must already provide the canonical lifecycle, calling, assignment and timeline fields.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $$
declare
  missing_columns text;
  invalid_lifecycle_values text;
  invalid_pipeline_values text;
  invalid_interest_values text;
  invalid_priority_values text;
  duplicate_timeline_keys text;
begin
  if to_regclass('public.leads') is null then
    raise exception 'Preflight failed: public.leads does not exist';
  end if;
  if to_regclass('public.customer_timeline_events') is null then
    raise exception 'Preflight failed: public.customer_timeline_events does not exist';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
    into missing_columns
  from (values
    ('leads', 'id'), ('leads', 'lead_status'), ('leads', 'last_call_outcome'),
    ('leads', 'next_action_at'), ('leads', 'assigned_user_id'),
    ('leads', 'metadata'), ('leads', 'updated_at'),
    ('customer_timeline_events', 'lead_id'), ('customer_timeline_events', 'metadata')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = required.table_name
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Preflight failed: prerequisite migrations are missing columns: %', missing_columns;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.leads'::regclass) then
    raise exception 'Preflight failed: RLS is not enabled on public.leads';
  end if;
  if not has_table_privilege('service_role', 'public.leads', 'SELECT,INSERT,UPDATE') then
    raise exception 'Preflight failed: service_role misses required leads grants';
  end if;

  select string_agg(distinct coalesce(lead_status, '<NULL>'), ', ' order by coalesce(lead_status, '<NULL>'))
    into invalid_lifecycle_values
  from public.leads
  where lead_status is null or lower(btrim(lead_status)) not in (
    'new', 'reviewing', 'interesting', 'not_interesting', 'assigned',
    'call_scheduled', 'contact_attempted', 'contacted', 'follow_up',
    'appointment_scheduled', 'demo_requested', 'demo_building', 'demo_ready',
    'demo_sent', 'proposal_sent', 'negotiation', 'won', 'lost', 'customer'
  );
  if invalid_lifecycle_values is not null then
    raise exception 'Preflight failed: unmapped lead_status values: %', invalid_lifecycle_values;
  end if;

  select string_agg(distinct metadata ->> 'pipelineStage', ', ' order by metadata ->> 'pipelineStage')
    into invalid_pipeline_values
  from public.leads
  where nullif(btrim(metadata ->> 'pipelineStage'), '') is not null
    and lower(btrim(metadata ->> 'pipelineStage')) not in (
      'new', 'contacted', 'interested', 'demo_planned', 'demo_in_progress', 'demo_sent',
      'awaiting_feedback', 'approved', 'awaiting_payment', 'customer', 'closed'
    );
  if invalid_pipeline_values is not null then
    raise exception 'Preflight failed: unmapped metadata.pipelineStage values: %', invalid_pipeline_values;
  end if;

  select string_agg(distinct metadata ->> 'interestLevel', ', ' order by metadata ->> 'interestLevel')
    into invalid_interest_values
  from public.leads
  where nullif(btrim(metadata ->> 'interestLevel'), '') is not null
    and lower(btrim(metadata ->> 'interestLevel')) not in ('hot', 'interested', 'unsure', 'not_interested');
  if invalid_interest_values is not null then
    raise exception 'Preflight failed: unmapped metadata.interestLevel values: %', invalid_interest_values;
  end if;

  select string_agg(distinct metadata ->> 'priority', ', ' order by metadata ->> 'priority')
    into invalid_priority_values
  from public.leads
  where nullif(btrim(metadata ->> 'priority'), '') is not null
    and lower(btrim(metadata ->> 'priority')) not in ('high', 'normal', 'low');
  if invalid_priority_values is not null then
    raise exception 'Preflight failed: unmapped metadata.priority values: %', invalid_priority_values;
  end if;

  select string_agg(lead_id::text || ':' || (metadata ->> 'idempotencyKey'), ', ')
    into duplicate_timeline_keys
  from (
    select lead_id, metadata
    from public.customer_timeline_events
    where lead_id is not null and nullif(metadata ->> 'idempotencyKey', '') is not null
  ) events
  group by lead_id, metadata ->> 'idempotencyKey'
  having count(*) > 1
  limit 1;
  if duplicate_timeline_keys is not null then
    raise exception 'Preflight failed: duplicate lead timeline idempotency keys exist: %', duplicate_timeline_keys;
  end if;
end
$$;

alter table public.leads
  add column if not exists pipeline_stage text,
  add column if not exists interest_level text,
  add column if not exists priority text,
  add column if not exists is_favorite boolean,
  add column if not exists next_action_completed_at timestamptz,
  add column if not exists next_action_completed_by uuid,
  add column if not exists archived_at timestamptz;

do $$
declare
  invalid_types text;
begin
  select string_agg(c.column_name || '=' || c.data_type, ', ' order by c.column_name)
    into invalid_types
  from information_schema.columns c
  join (values
    ('pipeline_stage', 'text'), ('interest_level', 'text'), ('priority', 'text'),
    ('is_favorite', 'boolean'), ('next_action_completed_at', 'timestamp with time zone'),
    ('next_action_completed_by', 'uuid'), ('archived_at', 'timestamp with time zone')
  ) expected(column_name, data_type) using (column_name)
  where c.table_schema = 'public' and c.table_name = 'leads' and c.data_type <> expected.data_type;
  if invalid_types is not null then
    raise exception 'Validation failed: Sales Workspace columns have unexpected types: %', invalid_types;
  end if;
end
$$;

-- Preserve valid pre-migration metadata writes first, then map the canonical lifecycle.
update public.leads
set pipeline_stage = coalesce(
  nullif(lower(btrim(metadata ->> 'pipelineStage')), ''),
  case lower(btrim(coalesce(lead_status, 'new')))
    when 'interesting' then 'interested'
    when 'contact_attempted' then 'contacted'
    when 'contacted' then 'contacted'
    when 'follow_up' then 'contacted'
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
)
where pipeline_stage is null;

update public.leads
set interest_level = coalesce(
  nullif(lower(btrim(metadata ->> 'interestLevel')), ''),
  case lower(btrim(coalesce(last_call_outcome, '')))
    when 'not_interested' then 'not_interested'
    when 'interested' then 'interested'
    else 'unsure'
  end
)
where interest_level is null;

update public.leads
set priority = coalesce(nullif(lower(btrim(metadata ->> 'priority')), ''), 'normal')
where priority is null;

update public.leads set is_favorite = false where is_favorite is null;

alter table public.leads
  alter column pipeline_stage set default 'new',
  alter column interest_level set default 'unsure',
  alter column priority set default 'normal',
  alter column is_favorite set default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.leads'::regclass and conname = 'leads_pipeline_stage_check') then
    alter table public.leads add constraint leads_pipeline_stage_check check (pipeline_stage in (
      'new', 'contacted', 'interested', 'demo_planned', 'demo_in_progress', 'demo_sent',
      'awaiting_feedback', 'approved', 'awaiting_payment', 'customer', 'closed'
    )) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.leads'::regclass and conname = 'leads_interest_level_check') then
    alter table public.leads add constraint leads_interest_level_check check (interest_level in (
      'hot', 'interested', 'unsure', 'not_interested'
    )) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.leads'::regclass and conname = 'leads_priority_check') then
    alter table public.leads add constraint leads_priority_check check (priority in ('high', 'normal', 'low')) not valid;
  end if;
end
$$;

alter table public.leads validate constraint leads_pipeline_stage_check;
alter table public.leads validate constraint leads_interest_level_check;
alter table public.leads validate constraint leads_priority_check;

alter table public.leads
  alter column pipeline_stage set not null,
  alter column interest_level set not null,
  alter column priority set not null,
  alter column is_favorite set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_next_action_completed_by_fkey'
  ) then
    alter table public.leads
      add constraint leads_next_action_completed_by_fkey
      foreign key (next_action_completed_by) references auth.users(id) on delete set null not valid;
  end if;
end
$$;
alter table public.leads validate constraint leads_next_action_completed_by_fkey;

create index if not exists leads_pipeline_stage_updated_idx on public.leads(pipeline_stage, updated_at desc);
create index if not exists leads_interest_priority_idx on public.leads(interest_level, priority);
create index if not exists leads_open_next_action_idx on public.leads(next_action_at, priority)
  where next_action_at is not null and next_action_completed_at is null;
create index if not exists leads_active_owner_idx on public.leads(assigned_user_id, pipeline_stage, updated_at desc)
  where archived_at is null;
create unique index if not exists customer_timeline_events_lead_idempotency_uidx
  on public.customer_timeline_events(lead_id, (metadata ->> 'idempotencyKey'))
  where lead_id is not null and nullif(metadata ->> 'idempotencyKey', '') is not null;

comment on column public.leads.pipeline_stage is 'Commercial workspace phase, separate from lifecycle and call outcome.';
comment on column public.leads.interest_level is 'Explicit commercial interest classification; unknown values remain unsure.';
comment on column public.leads.priority is 'Lead work-priority: high, normal or low.';

-- Existing RLS and table-level grants remain unchanged and automatically cover the new columns.
-- Application rollback: stop normalized writes and keep legacy/metadata reads; do not drop populated columns.

commit;
