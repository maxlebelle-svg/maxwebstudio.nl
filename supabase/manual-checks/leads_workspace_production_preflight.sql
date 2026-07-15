-- READ ONLY: run manually in the Supabase SQL Editor for project yxxahurphdbblkuxoeje.
-- This script intentionally performs no DDL, DML or side-effecting function calls.

begin read only;

-- 1. Columns and exact PostgreSQL data types.
select
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'leads'
order by c.ordinal_position;

-- 2. Constraints, validation state and definitions.
select
  con.conname,
  con.contype,
  con.convalidated,
  pg_get_constraintdef(con.oid, true) as definition
from pg_constraint con
where con.conrelid = 'public.leads'::regclass
order by con.contype, con.conname;

-- 3. Indexes.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'leads'
order by indexname;

-- 4. RLS state and policies.
select c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
where c.oid = 'public.leads'::regclass;

select policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'leads'
order by policyname;

-- 5. Table grants. Column additions inherit these table-level grants.
select grantee, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'leads'
order by grantee, privilege_type;

-- 6. Current lifecycle/legacy status values and counts.
select
  coalesce(nullif(lower(btrim(lead_status)), ''), '<NULL_OR_EMPTY>') as lead_status,
  coalesce(nullif(lower(btrim(status)), ''), '<NULL_OR_EMPTY>') as legacy_status,
  count(*) as lead_count
from public.leads
group by 1, 2
order by 1, 2;

-- 7. NULL/empty counts. to_jsonb keeps this query valid before optional columns exist.
select
  count(*) as total_leads,
  count(*) filter (where nullif(to_jsonb(l) ->> 'owner_id', '') is null) as owner_id_missing,
  count(*) filter (where nullif(to_jsonb(l) ->> 'created_by', '') is null) as created_by_missing,
  count(*) filter (where nullif(to_jsonb(l) ->> 'assigned_to', '') is null) as assigned_to_missing,
  count(*) filter (where nullif(to_jsonb(l) ->> 'assigned_user_id', '') is null) as assigned_user_id_missing,
  count(*) filter (where nullif(to_jsonb(l) ->> 'last_call_outcome', '') is null) as last_call_outcome_missing,
  count(*) filter (where nullif(to_jsonb(l) ->> 'next_action_type', '') is null) as next_action_type_missing,
  count(*) filter (where nullif(to_jsonb(l) ->> 'next_action_at', '') is null) as next_action_at_missing,
  count(*) filter (where nullif(to_jsonb(l) ->> 'acquisition_channel', '') is null) as acquisition_channel_missing,
  count(*) filter (where nullif(to_jsonb(l) ->> 'closed_by_user_id', '') is null) as closed_by_user_id_missing
from public.leads l;

-- 8. Metadata values used by prerequisite/workspace backfills. Only value/count pairs are shown.
select metadata_key, coalesce(nullif(metadata_value, ''), '<NULL_OR_EMPTY>') as metadata_value, count(*) as lead_count
from public.leads l
cross join lateral (values
  ('assignedUserId', l.metadata ->> 'assignedUserId'),
  ('lastCallOutcome', l.metadata ->> 'lastCallOutcome'),
  ('callDisposition', l.metadata ->> 'callDisposition'),
  ('nextActionType', l.metadata ->> 'nextActionType'),
  ('nextActionAt', l.metadata ->> 'nextActionAt'),
  ('nextActionAssignedUserId', l.metadata ->> 'nextActionAssignedUserId'),
  ('acquisitionChannel', l.metadata ->> 'acquisitionChannel'),
  ('sourcedByUserId', l.metadata ->> 'sourcedByUserId'),
  ('closedByUserId', l.metadata ->> 'closedByUserId'),
  ('pipelineStage', l.metadata ->> 'pipelineStage'),
  ('interestLevel', l.metadata ->> 'interestLevel'),
  ('priority', l.metadata ->> 'priority')
) values_to_check(metadata_key, metadata_value)
group by metadata_key, metadata_value
order by metadata_key, metadata_value;

-- 9. Assignment values for manual reconciliation. Review in SQL Editor; do not export to fixtures/logs.
select
  l.id as lead_id,
  to_jsonb(l) ->> 'owner_id' as owner_id,
  to_jsonb(l) ->> 'assigned_to' as legacy_assigned_to,
  to_jsonb(l) ->> 'assigned_user_id' as assigned_user_id,
  to_jsonb(l) ->> 'created_by' as created_by,
  l.metadata ->> 'assignedUserId' as metadata_assigned_user_id,
  l.metadata ->> 'assignedUserEmail' as metadata_assigned_user_email
from public.leads l
where coalesce(
  to_jsonb(l) ->> 'owner_id',
  to_jsonb(l) ->> 'assigned_to',
  to_jsonb(l) ->> 'assigned_user_id',
  l.metadata ->> 'assignedUserId',
  l.metadata ->> 'assignedUserEmail'
) is not null
order by l.id;

-- 10. Orphaned UUID references, including optional columns through to_jsonb.
with candidate_references as (
  select l.id as lead_id, reference_name, reference_value
  from public.leads l
  cross join lateral (values
    ('owner_id', to_jsonb(l) ->> 'owner_id'),
    ('created_by', to_jsonb(l) ->> 'created_by'),
    ('assigned_to', to_jsonb(l) ->> 'assigned_to'),
    ('assigned_user_id', to_jsonb(l) ->> 'assigned_user_id'),
    ('assigned_by', to_jsonb(l) ->> 'assigned_by'),
    ('last_contacted_by', to_jsonb(l) ->> 'last_contacted_by'),
    ('next_action_assigned_user_id', to_jsonb(l) ->> 'next_action_assigned_user_id'),
    ('sourced_by_user_id', to_jsonb(l) ->> 'sourced_by_user_id'),
    ('closed_by_user_id', to_jsonb(l) ->> 'closed_by_user_id')
  ) refs(reference_name, reference_value)
)
select lead_id, reference_name, reference_value
from candidate_references r
where nullif(reference_value, '') is not null
  and (
    reference_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not exists (select 1 from auth.users u where u.id::text = r.reference_value)
  )
order by lead_id, reference_name;

-- 11. Conflicting legacy/current assignment. owner_id is intentionally not compared: it has different semantics.
select
  l.id as lead_id,
  to_jsonb(l) ->> 'assigned_to' as legacy_assigned_to,
  to_jsonb(l) ->> 'assigned_user_id' as assigned_user_id,
  l.metadata ->> 'assignedUserId' as metadata_assigned_user_id
from public.leads l
where (
    nullif(to_jsonb(l) ->> 'assigned_to', '') is not null
    and nullif(to_jsonb(l) ->> 'assigned_user_id', '') is not null
    and to_jsonb(l) ->> 'assigned_to' <> to_jsonb(l) ->> 'assigned_user_id'
  ) or (
    nullif(l.metadata ->> 'assignedUserId', '') is not null
    and nullif(to_jsonb(l) ->> 'assigned_user_id', '') is not null
    and l.metadata ->> 'assignedUserId' <> to_jsonb(l) ->> 'assigned_user_id'
  )
order by l.id;

-- 12. Timeline totals, lead linkage and idempotency-key duplicates.
select
  count(*) as total_events,
  count(*) filter (where lead_id is not null) as lead_events,
  count(*) filter (where lead_id is null) as events_without_lead,
  count(distinct lead_id) filter (where lead_id is not null) as leads_with_events
from public.customer_timeline_events;

select event_type, count(*) as event_count
from public.customer_timeline_events
where lead_id is not null
group by event_type
order by event_type;

select lead_id, metadata ->> 'idempotencyKey' as idempotency_key, count(*) as duplicate_count
from public.customer_timeline_events
where lead_id is not null and nullif(metadata ->> 'idempotencyKey', '') is not null
group by lead_id, metadata ->> 'idempotencyKey'
having count(*) > 1
order by duplicate_count desc, lead_id;

rollback;
