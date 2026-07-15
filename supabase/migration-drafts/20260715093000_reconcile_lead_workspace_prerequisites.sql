-- PREREQUISITE MIGRATION: run before 026_sales_workspace_normalized_fields.sql.
-- DRAFT ONLY: do not apply without the production read-only preflight, backup and explicit approval.
-- MANUAL SQL EDITOR ROUTE: select project yxxahurphdbblkuxoeje, run
-- leads_workspace_prerequisite_precheck.sql, and continue only when overall_readiness=PASS.
-- Then run this complete file as one SQL Editor action and immediately run
-- leads_workspace_prerequisite_postcheck.sql. Stop on any error or blocking FAIL.
-- Do not run migration 026, another draft, a CLI migration command, push or deploy in this step.
-- Reconciles the already-designed lifecycle, assignment, calling, follow-up and attribution fields.
-- It does not add pipeline_stage, interest_level, priority or other workspace-normalization columns.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $$
declare
  missing_baseline text;
  invalid_types text;
  invalid_lifecycle text;
  invalid_call_outcomes text;
  invalid_next_action_types text;
  invalid_channels text;
  invalid_metadata text;
  invalid_references text;
  conflicting_assignments text;
begin
  if to_regclass('public.leads') is null then
    raise exception 'Prerequisite preflight failed: public.leads does not exist';
  end if;
  if to_regclass('auth.users') is null then
    raise exception 'Prerequisite preflight failed: auth.users does not exist';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
    into missing_baseline
  from (values
    ('id'), ('owner_id'), ('created_by'), ('assigned_to'), ('lead_status'), ('status'),
    ('metadata'), ('created_at'), ('updated_at'), ('external_source'), ('external_source_id')
  ) required(column_name)
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'leads' and c.column_name = required.column_name
  );
  if missing_baseline is not null then
    raise exception 'Prerequisite preflight failed: public.leads misses baseline columns: %', missing_baseline;
  end if;

  select string_agg(c.column_name || '=' || c.udt_name || ' (expected ' || expected.udt_name || ')', ', ' order by c.column_name)
    into invalid_types
  from information_schema.columns c
  join (values
    ('id', 'uuid'), ('owner_id', 'uuid'), ('created_by', 'uuid'), ('assigned_to', 'uuid'),
    ('lead_status', 'text'), ('status', 'text'), ('metadata', 'jsonb'),
    ('created_at', 'timestamptz'), ('updated_at', 'timestamptz'),
    ('assigned_user_id', 'uuid'), ('assigned_at', 'timestamptz'), ('assigned_by', 'uuid'),
    ('last_contacted_at', 'timestamptz'), ('last_contacted_by', 'uuid'), ('last_call_outcome', 'text'),
    ('next_action_type', 'text'), ('next_action_at', 'timestamptz'), ('next_action_note', 'text'),
    ('next_action_assigned_user_id', 'uuid'), ('next_action_created_automatically', 'bool'),
    ('appointment_at', 'timestamptz'), ('appointment_type', 'text'), ('appointment_location', 'text'),
    ('won_at', 'timestamptz'), ('won_by', 'uuid'), ('lost_at', 'timestamptz'), ('lost_by', 'uuid'),
    ('lost_reason', 'text'), ('lost_note', 'text'), ('acquisition_channel', 'text'),
    ('sourced_by_user_id', 'uuid'), ('closed_by_user_id', 'uuid')
  ) expected(column_name, udt_name) using (column_name)
  where c.table_schema = 'public' and c.table_name = 'leads' and c.udt_name <> expected.udt_name;
  if invalid_types is not null then
    raise exception 'Prerequisite preflight failed: incompatible leads column types: %', invalid_types;
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.leads'::regclass) then
    raise exception 'Prerequisite preflight failed: RLS is not enabled on public.leads';
  end if;
  if not has_table_privilege('service_role', 'public.leads', 'SELECT,INSERT,UPDATE') then
    raise exception 'Prerequisite preflight failed: service_role misses SELECT/INSERT/UPDATE on public.leads';
  end if;

  select string_agg(distinct coalesce(lead_status, '<NULL>'), ', ' order by coalesce(lead_status, '<NULL>'))
    into invalid_lifecycle
  from public.leads
  where lead_status is null or lower(btrim(lead_status)) not in (
    'new', 'reviewing', 'interesting', 'not_interesting', 'assigned', 'call_scheduled',
    'contact_attempted', 'contacted', 'follow_up', 'appointment_scheduled', 'demo_requested',
    'demo_building', 'demo_ready', 'demo_sent', 'proposal_sent', 'negotiation', 'won', 'lost', 'customer'
  );
  if invalid_lifecycle is not null then
    raise exception 'Prerequisite preflight failed: unmapped lead_status values: %', invalid_lifecycle;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='last_call_outcome') then
    select string_agg(distinct last_call_outcome, ', ' order by last_call_outcome)
      into invalid_call_outcomes
    from public.leads
    where nullif(btrim(last_call_outcome), '') is not null
      and lower(btrim(last_call_outcome)) not in (
        'not_called', 'called', 'contacted', 'interested', 'not_interested', 'no_answer',
        'voicemail_left', 'callback_requested', 'invalid_number', 'wrong_number', 'busy',
        'appointment_scheduled', 'demo_requested', 'proposal_requested', 'no_budget', 'later',
        'already_helped', 'business_closed'
      );
    if invalid_call_outcomes is not null then
      raise exception 'Prerequisite preflight failed: unknown last_call_outcome values: %', invalid_call_outcomes;
    end if;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='next_action_type') then
    select string_agg(distinct next_action_type, ', ' order by next_action_type)
      into invalid_next_action_types
    from public.leads
    where nullif(btrim(next_action_type), '') is not null
      and lower(btrim(next_action_type)) not in (
        'call', 'email', 'send_demo', 'create_demo', 'send_proposal',
        'follow_up', 'appointment', 'await_response', 'custom'
      );
    if invalid_next_action_types is not null then
      raise exception 'Prerequisite preflight failed: unknown next_action_type values: %', invalid_next_action_types;
    end if;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='acquisition_channel') then
    select string_agg(distinct acquisition_channel, ', ' order by acquisition_channel)
      into invalid_channels
    from public.leads
    where nullif(btrim(acquisition_channel), '') is not null
      and lower(btrim(acquisition_channel)) not in (
        'website', 'email', 'outbound_sales', 'referral', 'phone',
        'social', 'partner', 'manual', 'import', 'other'
      );
    if invalid_channels is not null then
      raise exception 'Prerequisite preflight failed: unknown acquisition_channel values: %', invalid_channels;
    end if;
  end if;

  select string_agg(distinct problem, ', ' order by problem)
    into invalid_metadata
  from (
    select 'lastCallOutcome=' || (metadata ->> 'lastCallOutcome') as problem
    from public.leads
    where nullif(btrim(metadata ->> 'lastCallOutcome'), '') is not null
      and lower(btrim(metadata ->> 'lastCallOutcome')) not in (
        'not_called', 'called', 'contacted', 'interested', 'not_interested', 'no_answer',
        'voicemail_left', 'callback_requested', 'invalid_number', 'wrong_number', 'busy',
        'appointment_scheduled', 'demo_requested', 'proposal_requested', 'no_budget', 'later',
        'already_helped', 'business_closed'
      )
    union all
    select 'callDisposition=' || (metadata ->> 'callDisposition')
    from public.leads
    where nullif(btrim(metadata ->> 'callDisposition'), '') is not null
      and lower(btrim(metadata ->> 'callDisposition')) not in (
        'not_called', 'called', 'no_answer', 'voicemail', 'callback', 'invalid_number', 'busy'
      )
    union all
    select 'nextActionType=' || (metadata ->> 'nextActionType')
    from public.leads
    where nullif(btrim(metadata ->> 'nextActionType'), '') is not null
      and lower(btrim(metadata ->> 'nextActionType')) not in (
        'call', 'email', 'send_demo', 'create_demo', 'send_proposal',
        'follow_up', 'appointment', 'await_response', 'custom'
      )
    union all
    select 'acquisitionChannel=' || (metadata ->> 'acquisitionChannel')
    from public.leads
    where nullif(btrim(metadata ->> 'acquisitionChannel'), '') is not null
      and lower(btrim(metadata ->> 'acquisitionChannel')) not in (
        'website', 'email', 'outbound_sales', 'referral', 'phone',
        'social', 'partner', 'manual', 'import', 'other'
      )
    union all
    select 'nextActionAt=' || (metadata ->> 'nextActionAt')
    from public.leads
    where nullif(btrim(metadata ->> 'nextActionAt'), '') is not null
      and not pg_input_is_valid(metadata ->> 'nextActionAt', 'timestamp with time zone')
  ) problems;
  if invalid_metadata is not null then
    raise exception 'Prerequisite preflight failed: invalid metadata backfill values: %', invalid_metadata;
  end if;

  select string_agg(id::text || ':' || reference_name || '=' || reference_value, ', ' order by id::text, reference_name)
    into invalid_references
  from (
    select l.id, refs.reference_name, refs.reference_value
    from public.leads l
    cross join lateral (values
      ('owner_id', l.owner_id::text),
      ('created_by', l.created_by::text),
      ('assigned_to', l.assigned_to::text),
      ('metadata.assignedUserId', l.metadata ->> 'assignedUserId'),
      ('metadata.nextActionAssignedUserId', l.metadata ->> 'nextActionAssignedUserId'),
      ('metadata.sourcedByUserId', l.metadata ->> 'sourcedByUserId'),
      ('metadata.closedByUserId', l.metadata ->> 'closedByUserId')
    ) refs(reference_name, reference_value)
    where nullif(refs.reference_value, '') is not null
      and (
        refs.reference_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or not exists (select 1 from auth.users u where u.id::text = refs.reference_value)
      )
  ) invalid;
  if invalid_references is not null then
    raise exception 'Prerequisite preflight failed: invalid or orphaned user references: %', invalid_references;
  end if;

  select string_agg(l.id::text, ', ' order by l.id::text)
    into conflicting_assignments
  from public.leads l
  where l.assigned_to is not null
    and nullif(l.metadata ->> 'assignedUserId', '') is not null
    and l.assigned_to::text <> l.metadata ->> 'assignedUserId';
  if conflicting_assignments is not null then
    raise exception 'Prerequisite preflight failed: assigned_to conflicts with metadata.assignedUserId for leads: %', conflicting_assignments;
  end if;

  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='assigned_user_id') then
    select string_agg(l.id::text, ', ' order by l.id::text)
      into conflicting_assignments
    from public.leads l
    where l.assigned_user_id is not null
      and (
        not exists (select 1 from auth.users u where u.id = l.assigned_user_id)
        or (l.assigned_to is not null and l.assigned_to <> l.assigned_user_id)
        or (nullif(l.metadata ->> 'assignedUserId', '') is not null and l.metadata ->> 'assignedUserId' <> l.assigned_user_id::text)
      );
    if conflicting_assignments is not null then
      raise exception 'Prerequisite preflight failed: assigned_user_id is orphaned or conflicts for leads: %', conflicting_assignments;
    end if;
  end if;
end
$$;

alter table public.leads
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists last_contacted_by uuid,
  add column if not exists last_call_outcome text,
  add column if not exists next_action_type text,
  add column if not exists next_action_at timestamptz,
  add column if not exists next_action_note text,
  add column if not exists next_action_assigned_user_id uuid,
  add column if not exists next_action_created_automatically boolean,
  add column if not exists appointment_at timestamptz,
  add column if not exists appointment_type text,
  add column if not exists appointment_location text,
  add column if not exists won_at timestamptz,
  add column if not exists won_by uuid,
  add column if not exists lost_at timestamptz,
  add column if not exists lost_by uuid,
  add column if not exists lost_reason text,
  add column if not exists lost_note text,
  add column if not exists acquisition_channel text,
  add column if not exists sourced_by_user_id uuid,
  add column if not exists closed_by_user_id uuid;

-- Preserve explicit current assignment. assigned_to is a deprecated UUID compatibility bridge.
update public.leads
set assigned_user_id = coalesce(
  assigned_user_id,
  assigned_to,
  nullif(metadata ->> 'assignedUserId', '')::uuid
)
where assigned_user_id is null
  and coalesce(assigned_to::text, nullif(metadata ->> 'assignedUserId', '')) is not null;

-- Only explicit metadata values are backfilled; no historical actor or interest is inferred.
update public.leads
set
  last_call_outcome = coalesce(
    last_call_outcome,
    nullif(lower(btrim(metadata ->> 'lastCallOutcome')), ''),
    case lower(btrim(coalesce(metadata ->> 'callDisposition', '')))
      when 'not_called' then 'not_called'
      when 'called' then 'called'
      when 'no_answer' then 'no_answer'
      when 'voicemail' then 'voicemail_left'
      when 'callback' then 'callback_requested'
      when 'invalid_number' then 'invalid_number'
      when 'busy' then 'busy'
      else null
    end
  ),
  next_action_type = coalesce(next_action_type, nullif(lower(btrim(metadata ->> 'nextActionType')), '')),
  next_action_at = coalesce(next_action_at, nullif(metadata ->> 'nextActionAt', '')::timestamptz),
  next_action_note = coalesce(next_action_note, nullif(metadata ->> 'nextActionNote', '')),
  next_action_assigned_user_id = coalesce(next_action_assigned_user_id, nullif(metadata ->> 'nextActionAssignedUserId', '')::uuid),
  next_action_created_automatically = coalesce(
    next_action_created_automatically,
    case lower(btrim(coalesce(metadata ->> 'nextActionCreatedAutomatically', '')))
      when 'true' then true when 'false' then false else null
    end,
    false
  ),
  acquisition_channel = coalesce(acquisition_channel, nullif(lower(btrim(metadata ->> 'acquisitionChannel')), '')),
  sourced_by_user_id = coalesce(sourced_by_user_id, nullif(metadata ->> 'sourcedByUserId', '')::uuid),
  closed_by_user_id = coalesce(closed_by_user_id, nullif(metadata ->> 'closedByUserId', '')::uuid)
where (last_call_outcome is null and coalesce(nullif(metadata ->> 'lastCallOutcome', ''), nullif(metadata ->> 'callDisposition', '')) is not null)
   or (next_action_type is null and nullif(metadata ->> 'nextActionType', '') is not null)
   or (next_action_at is null and nullif(metadata ->> 'nextActionAt', '') is not null)
   or (next_action_note is null and nullif(metadata ->> 'nextActionNote', '') is not null)
   or (next_action_assigned_user_id is null and nullif(metadata ->> 'nextActionAssignedUserId', '') is not null)
   or next_action_created_automatically is null
   or (acquisition_channel is null and nullif(metadata ->> 'acquisitionChannel', '') is not null)
   or (sourced_by_user_id is null and nullif(metadata ->> 'sourcedByUserId', '') is not null)
   or (closed_by_user_id is null and nullif(metadata ->> 'closedByUserId', '') is not null);

alter table public.leads alter column next_action_created_automatically set default false;

-- Reconcile canonical value constraints. Unknown values were rejected before additive DDL.
alter table public.leads drop constraint if exists leads_lead_status_check;
alter table public.leads add constraint leads_lead_status_check check (lead_status in (
  'new', 'reviewing', 'interesting', 'not_interesting', 'assigned', 'call_scheduled',
  'contact_attempted', 'contacted', 'follow_up', 'appointment_scheduled', 'demo_requested',
  'demo_building', 'demo_ready', 'demo_sent', 'proposal_sent', 'negotiation', 'won', 'lost', 'customer'
)) not valid;

alter table public.leads drop constraint if exists leads_last_call_outcome_check;
alter table public.leads add constraint leads_last_call_outcome_check check (
  last_call_outcome is null or last_call_outcome in (
    'not_called', 'called', 'contacted', 'interested', 'not_interested', 'no_answer',
    'voicemail_left', 'callback_requested', 'invalid_number', 'wrong_number', 'busy',
    'appointment_scheduled', 'demo_requested', 'proposal_requested', 'no_budget', 'later',
    'already_helped', 'business_closed'
  )
) not valid;

alter table public.leads drop constraint if exists leads_next_action_type_check;
alter table public.leads add constraint leads_next_action_type_check check (
  next_action_type is null or next_action_type in (
    'call', 'email', 'send_demo', 'create_demo', 'send_proposal',
    'follow_up', 'appointment', 'await_response', 'custom'
  )
) not valid;

alter table public.leads drop constraint if exists leads_acquisition_channel_check;
alter table public.leads add constraint leads_acquisition_channel_check check (
  acquisition_channel is null or acquisition_channel in (
    'website', 'email', 'outbound_sales', 'referral', 'phone',
    'social', 'partner', 'manual', 'import', 'other'
  )
) not valid;

alter table public.leads validate constraint leads_lead_status_check;
alter table public.leads validate constraint leads_last_call_outcome_check;
alter table public.leads validate constraint leads_next_action_type_check;
alter table public.leads validate constraint leads_acquisition_channel_check;

-- Add only missing single-column auth foreign keys, then validate every matching key.
do $$
declare
  item record;
  column_number smallint;
  constraint_record record;
begin
  for item in select * from (values
    ('owner_id', 'leads_owner_id_fkey'),
    ('created_by', 'leads_created_by_fkey'),
    ('assigned_to', 'leads_assigned_to_fkey'),
    ('assigned_user_id', 'leads_assigned_user_id_fkey'),
    ('assigned_by', 'leads_assigned_by_fkey'),
    ('last_contacted_by', 'leads_last_contacted_by_fkey'),
    ('next_action_assigned_user_id', 'leads_next_action_assigned_user_id_fkey'),
    ('won_by', 'leads_won_by_fkey'),
    ('lost_by', 'leads_lost_by_fkey'),
    ('sourced_by_user_id', 'leads_sourced_by_user_id_fkey'),
    ('closed_by_user_id', 'leads_closed_by_user_id_fkey')
  ) definitions(column_name, constraint_name)
  loop
    select attnum into column_number
    from pg_attribute
    where attrelid = 'public.leads'::regclass and attname = item.column_name and not attisdropped;

    if not exists (
      select 1 from pg_constraint
      where conrelid = 'public.leads'::regclass
        and confrelid = 'auth.users'::regclass
        and contype = 'f'
        and conkey = array[column_number]::smallint[]
    ) then
      execute format(
        'alter table public.leads add constraint %I foreign key (%I) references auth.users(id) on delete set null not valid',
        item.constraint_name,
        item.column_name
      );
    end if;
  end loop;

  for constraint_record in
    select conname from pg_constraint
    where conrelid = 'public.leads'::regclass
      and confrelid = 'auth.users'::regclass
      and contype = 'f'
      and not convalidated
  loop
    execute format('alter table public.leads validate constraint %I', constraint_record.conname);
  end loop;
end
$$;

create index if not exists leads_assigned_user_id_idx on public.leads(assigned_user_id) where assigned_user_id is not null;
create index if not exists leads_last_contacted_at_idx on public.leads(last_contacted_at desc) where last_contacted_at is not null;
create index if not exists leads_last_call_outcome_idx on public.leads(last_call_outcome) where last_call_outcome is not null;
create index if not exists leads_next_action_at_idx on public.leads(next_action_at) where next_action_at is not null;
create index if not exists leads_next_action_assigned_user_id_idx on public.leads(next_action_assigned_user_id) where next_action_assigned_user_id is not null;
create index if not exists leads_acquisition_channel_idx on public.leads(acquisition_channel) where acquisition_channel is not null;
create index if not exists leads_sourced_by_user_id_idx on public.leads(sourced_by_user_id) where sourced_by_user_id is not null;
create index if not exists leads_closed_by_user_id_idx on public.leads(closed_by_user_id) where closed_by_user_id is not null;

comment on column public.leads.owner_id is 'Current commercial owner; distinct from the assigned sales executor.';
comment on column public.leads.assigned_to is 'Deprecated UUID compatibility bridge; new writes use assigned_user_id.';
comment on column public.leads.assigned_user_id is 'Current sales executor; nullable auth.users reference.';
comment on column public.leads.created_by is 'Immutable record creator/audit actor; never inferred or overwritten.';
comment on column public.leads.closed_by_user_id is 'Explicit sale closer; set only by the win action and never historically inferred.';
comment on column public.leads.last_call_outcome is 'Canonical latest call/contact outcome; no parallel call_disposition column.';
comment on column public.leads.next_action_type is 'Type of the current active follow-up action.';
comment on column public.leads.next_action_at is 'Scheduled time of the current active follow-up action.';
comment on column public.leads.next_action_assigned_user_id is 'Auth user responsible for the current follow-up action.';
comment on column public.leads.external_source is 'Technical lead source/system; no duplicate lead_source column.';
comment on column public.leads.acquisition_channel is 'Explicit commercial acquisition channel; null means unknown.';
comment on column public.leads.won_at is 'Explicit successful sale timestamp; no duplicate converted_at is introduced.';

-- Existing RLS policies and table-level grants remain unchanged.
-- Application rollback: stop writes to the new canonical fields and keep legacy/metadata reads enabled.
-- Do not drop populated columns or erase assigned_to until a separately approved deprecation migration exists.

commit;
