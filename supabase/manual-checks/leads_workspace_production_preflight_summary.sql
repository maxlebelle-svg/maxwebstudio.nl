-- READ ONLY: exportable production preflight for the Leads Sales Workspace rollout.
-- Run as one statement in the Supabase SQL Editor and export the single final result table.

BEGIN READ ONLY;

WITH
relation_facts AS (
  SELECT
    to_regclass('public.leads') AS leads_oid,
    to_regclass('auth.users') AS users_oid,
    to_regclass('public.customer_timeline_events') AS timeline_oid
),
expected_columns(column_name, udt_name, required_before_prerequisite) AS (
  VALUES
    ('id', 'uuid', true),
    ('owner_id', 'uuid', true),
    ('created_by', 'uuid', true),
    ('assigned_to', 'uuid', true),
    ('lead_status', 'text', true),
    ('status', 'text', true),
    ('metadata', 'jsonb', true),
    ('created_at', 'timestamptz', true),
    ('updated_at', 'timestamptz', true),
    ('external_source', 'text', true),
    ('external_source_id', 'text', true),
    ('assigned_user_id', 'uuid', false),
    ('assigned_at', 'timestamptz', false),
    ('assigned_by', 'uuid', false),
    ('last_contacted_at', 'timestamptz', false),
    ('last_contacted_by', 'uuid', false),
    ('last_call_outcome', 'text', false),
    ('next_action_type', 'text', false),
    ('next_action_at', 'timestamptz', false),
    ('next_action_note', 'text', false),
    ('next_action_assigned_user_id', 'uuid', false),
    ('next_action_created_automatically', 'bool', false),
    ('appointment_at', 'timestamptz', false),
    ('appointment_type', 'text', false),
    ('appointment_location', 'text', false),
    ('won_at', 'timestamptz', false),
    ('won_by', 'uuid', false),
    ('lost_at', 'timestamptz', false),
    ('lost_by', 'uuid', false),
    ('lost_reason', 'text', false),
    ('lost_note', 'text', false),
    ('acquisition_channel', 'text', false),
    ('sourced_by_user_id', 'uuid', false),
    ('closed_by_user_id', 'uuid', false)
),
column_findings AS (
  SELECT
    count(*) FILTER (WHERE c.column_name IS NULL AND e.required_before_prerequisite)::bigint AS missing_required,
    count(*) FILTER (WHERE c.column_name IS NULL AND NOT e.required_before_prerequisite)::bigint AS missing_additive,
    count(*) FILTER (WHERE c.column_name IS NOT NULL AND c.udt_name <> e.udt_name)::bigint AS incompatible,
    coalesce(string_agg(
      CASE
        WHEN c.column_name IS NULL THEN e.column_name || '=missing' || CASE WHEN e.required_before_prerequisite THEN '(required)' ELSE '(additive)' END
        WHEN c.udt_name <> e.udt_name THEN e.column_name || '=' || c.udt_name || '(expected ' || e.udt_name || ')'
      END,
      ', ' ORDER BY e.column_name
    ) FILTER (WHERE c.column_name IS NULL OR c.udt_name <> e.udt_name), 'none') AS details
  FROM expected_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public'
   AND c.table_name = 'leads'
   AND c.column_name = e.column_name
),
table_findings AS (
  SELECT
    count(*) FILTER (WHERE relation_oid IS NULL)::bigint AS missing_count,
    coalesce(string_agg(relation_name, ', ' ORDER BY relation_name) FILTER (WHERE relation_oid IS NULL), 'none') AS missing_names
  FROM (VALUES
    ('auth.users', to_regclass('auth.users')),
    ('public.customer_timeline_events', to_regclass('public.customer_timeline_events')),
    ('public.leads', to_regclass('public.leads'))
  ) expected(relation_name, relation_oid)
),
lead_source AS MATERIALIZED (
  SELECT CASE
    WHEN leads_oid IS NULL THEN xmlparse(document '<root/>')
    ELSE xmlparse(document '<root>' || xmlserialize(content
      query_to_xml('SELECT to_jsonb(l)::text AS row_data FROM public.leads l', false, true, '')
      AS text) || '</root>')
  END AS rows_xml
  FROM relation_facts
),
lead_rows AS MATERIALIZED (
  SELECT row_data ->> 'id' AS id, row_data
  FROM lead_source
  CROSS JOIN LATERAL unnest(xpath('/root/row/row_data/text()', rows_xml)) item
  CROSS JOIN LATERAL (SELECT xmlserialize(content item AS text)::jsonb AS row_data) decoded
),
lead_values AS MATERIALIZED (
  SELECT
    id,
    row_data,
    row_data -> 'metadata' AS metadata,
    nullif(btrim(row_data ->> 'lead_status'), '') AS lead_status,
    nullif(btrim(row_data ->> 'last_call_outcome'), '') AS last_call_outcome,
    nullif(btrim(row_data ->> 'next_action_type'), '') AS next_action_type,
    nullif(btrim(row_data ->> 'acquisition_channel'), '') AS acquisition_channel
  FROM lead_rows
),
unknown_lifecycle AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(string_agg(value || '=' || value_count, ', ' ORDER BY value), 'none') AS details
  FROM (
    SELECT coalesce(lead_status, '<NULL_OR_EMPTY>') AS value, count(*)::text AS value_count
    FROM lead_values
    WHERE lead_status IS NULL OR lower(lead_status) NOT IN (
      'new', 'reviewing', 'interesting', 'not_interesting', 'assigned', 'call_scheduled',
      'contact_attempted', 'contacted', 'follow_up', 'appointment_scheduled', 'demo_requested',
      'demo_building', 'demo_ready', 'demo_sent', 'proposal_sent', 'negotiation', 'won', 'lost', 'customer'
    )
    GROUP BY lead_status
  ) invalid
),
unknown_call_outcomes AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(left(string_agg(source || ':' || value || '=' || value_count, ', ' ORDER BY source, value), 500), 'none') AS details
  FROM (
    SELECT source, value, count(*)::text AS value_count
    FROM (
      SELECT 'column'::text AS source, last_call_outcome AS value
      FROM lead_values
      WHERE last_call_outcome IS NOT NULL
      UNION ALL
      SELECT 'metadata.lastCallOutcome', nullif(btrim(metadata ->> 'lastCallOutcome'), '')
      FROM lead_values
      WHERE nullif(btrim(metadata ->> 'lastCallOutcome'), '') IS NOT NULL
      UNION ALL
      SELECT 'metadata.callDisposition',
        CASE lower(nullif(btrim(metadata ->> 'callDisposition'), ''))
          WHEN 'voicemail' THEN 'voicemail_left'
          WHEN 'callback' THEN 'callback_requested'
          ELSE lower(nullif(btrim(metadata ->> 'callDisposition'), ''))
        END
      FROM lead_values
      WHERE nullif(btrim(metadata ->> 'callDisposition'), '') IS NOT NULL
    ) candidates
    WHERE lower(value) NOT IN (
      'not_called', 'called', 'contacted', 'interested', 'not_interested', 'no_answer',
      'voicemail_left', 'callback_requested', 'invalid_number', 'wrong_number', 'busy',
      'appointment_scheduled', 'demo_requested', 'proposal_requested', 'no_budget', 'later',
      'already_helped', 'business_closed'
    )
    GROUP BY source, value
  ) invalid
),
unknown_action_types AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(left(string_agg(source || ':' || value || '=' || value_count, ', ' ORDER BY source, value), 500), 'none') AS details
  FROM (
    SELECT source, value, count(*)::text AS value_count
    FROM (
      SELECT 'column'::text AS source, next_action_type AS value
      FROM lead_values
      WHERE next_action_type IS NOT NULL
      UNION ALL
      SELECT 'metadata.nextActionType', nullif(btrim(metadata ->> 'nextActionType'), '')
      FROM lead_values
      WHERE nullif(btrim(metadata ->> 'nextActionType'), '') IS NOT NULL
    ) candidates
    WHERE lower(value) NOT IN (
      'call', 'email', 'send_demo', 'create_demo', 'send_proposal',
      'follow_up', 'appointment', 'await_response', 'custom'
    )
    GROUP BY source, value
  ) invalid
),
unknown_channels AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(left(string_agg(source || ':' || value || '=' || value_count, ', ' ORDER BY source, value), 500), 'none') AS details
  FROM (
    SELECT source, value, count(*)::text AS value_count
    FROM (
      SELECT 'column'::text AS source, acquisition_channel AS value
      FROM lead_values
      WHERE acquisition_channel IS NOT NULL
      UNION ALL
      SELECT 'metadata.acquisitionChannel', nullif(btrim(metadata ->> 'acquisitionChannel'), '')
      FROM lead_values
      WHERE nullif(btrim(metadata ->> 'acquisitionChannel'), '') IS NOT NULL
    ) candidates
    WHERE lower(value) NOT IN (
      'website', 'email', 'outbound_sales', 'referral', 'phone',
      'social', 'partner', 'manual', 'import', 'other'
    )
    GROUP BY source, value
  ) invalid
),
uuid_candidates AS MATERIALIZED (
  SELECT l.id AS lead_id, refs.reference_name, nullif(btrim(refs.reference_value), '') AS reference_value
  FROM lead_values l
  CROSS JOIN LATERAL (VALUES
    ('owner_id', l.row_data ->> 'owner_id'),
    ('assigned_to', l.row_data ->> 'assigned_to'),
    ('assigned_user_id', l.row_data ->> 'assigned_user_id'),
    ('created_by', l.row_data ->> 'created_by'),
    ('closed_by_user_id', l.row_data ->> 'closed_by_user_id'),
    ('metadata.assignedUserId', l.metadata ->> 'assignedUserId'),
    ('metadata.nextActionAssignedUserId', l.metadata ->> 'nextActionAssignedUserId'),
    ('metadata.sourcedByUserId', l.metadata ->> 'sourcedByUserId'),
    ('metadata.closedByUserId', l.metadata ->> 'closedByUserId')
  ) refs(reference_name, reference_value)
),
invalid_uuid_strings AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(left(string_agg(lead_id::text || ':' || reference_name || '=' || reference_value, ', ' ORDER BY lead_id, reference_name), 500), 'none') AS details
  FROM uuid_candidates
  WHERE reference_value IS NOT NULL
    AND reference_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
),
orphan_findings AS MATERIALIZED (
  SELECT c.reference_name, count(*)::bigint AS finding_count,
         coalesce(left(string_agg(c.lead_id::text || '=' || c.reference_value, ', ' ORDER BY c.lead_id), 500), 'none') AS details
  FROM uuid_candidates c
  WHERE c.reference_name IN ('owner_id', 'assigned_to', 'assigned_user_id', 'created_by', 'closed_by_user_id')
    AND c.reference_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND NOT EXISTS (
      SELECT 1
      FROM (
        SELECT xmlserialize(content item AS text) AS user_id
        FROM relation_facts
        CROSS JOIN LATERAL unnest(xpath(
          '/root/row/user_id/text()',
          CASE WHEN users_oid IS NULL THEN xmlparse(document '<root/>')
               ELSE xmlparse(document '<root>' || xmlserialize(content
                 query_to_xml('SELECT id::text AS user_id FROM auth.users', false, true, '')
                 AS text) || '</root>') END
        )) item
      ) users
      WHERE users.user_id = c.reference_value
    )
  GROUP BY c.reference_name
),
assignment_conflicts AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(left(string_agg(id::text, ', ' ORDER BY id), 500), 'none') AS details
  FROM lead_values
  WHERE (
      nullif(row_data ->> 'assigned_to', '') IS NOT NULL
      AND nullif(row_data ->> 'assigned_user_id', '') IS NOT NULL
      AND row_data ->> 'assigned_to' <> row_data ->> 'assigned_user_id'
    ) OR (
      nullif(metadata ->> 'assignedUserId', '') IS NOT NULL
      AND nullif(row_data ->> 'assigned_user_id', '') IS NOT NULL
      AND metadata ->> 'assignedUserId' <> row_data ->> 'assigned_user_id'
    ) OR (
      nullif(row_data ->> 'assigned_to', '') IS NOT NULL
      AND nullif(metadata ->> 'assignedUserId', '') IS NOT NULL
      AND row_data ->> 'assigned_to' <> metadata ->> 'assignedUserId'
    )
),
invalid_metadata_timestamps AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(left(string_agg(id::text || '=' || (metadata ->> 'nextActionAt'), ', ' ORDER BY id), 500), 'none') AS details
  FROM lead_values
  WHERE nullif(btrim(metadata ->> 'nextActionAt'), '') IS NOT NULL
    AND NOT pg_input_is_valid(metadata ->> 'nextActionAt', 'timestamp with time zone')
),
invalid_next_action_timestamps AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(left(string_agg(id::text || '=' || (row_data ->> 'next_action_at'), ', ' ORDER BY id), 500), 'none') AS details
  FROM lead_values
  WHERE nullif(btrim(row_data ->> 'next_action_at'), '') IS NOT NULL
    AND NOT pg_input_is_valid(row_data ->> 'next_action_at', 'timestamp with time zone')
),
null_distribution AS (
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE nullif(row_data ->> 'owner_id', '') IS NULL)::bigint AS owner_missing,
    count(*) FILTER (WHERE nullif(row_data ->> 'created_by', '') IS NULL)::bigint AS creator_missing,
    count(*) FILTER (WHERE nullif(row_data ->> 'assigned_to', '') IS NULL)::bigint AS legacy_assignment_missing,
    count(*) FILTER (WHERE nullif(row_data ->> 'assigned_user_id', '') IS NULL)::bigint AS assignment_missing,
    count(*) FILTER (WHERE nullif(row_data ->> 'last_call_outcome', '') IS NULL)::bigint AS call_outcome_missing,
    count(*) FILTER (WHERE nullif(row_data ->> 'next_action_at', '') IS NULL)::bigint AS next_action_missing,
    count(*) FILTER (WHERE nullif(row_data ->> 'acquisition_channel', '') IS NULL)::bigint AS channel_missing
  FROM lead_values
),
known_constraint_names(constraint_name) AS (
  VALUES
    ('leads_pkey'),
    ('leads_lead_status_check'),
    ('leads_last_call_outcome_check'),
    ('leads_next_action_type_check'),
    ('leads_acquisition_channel_check'),
    ('leads_owner_id_fkey'),
    ('leads_created_by_fkey'),
    ('leads_assigned_to_fkey'),
    ('leads_assigned_user_id_fkey'),
    ('leads_assigned_by_fkey'),
    ('leads_last_contacted_by_fkey'),
    ('leads_next_action_assigned_user_id_fkey'),
    ('leads_won_by_fkey'),
    ('leads_lost_by_fkey'),
    ('leads_sourced_by_user_id_fkey'),
    ('leads_closed_by_user_id_fkey'),
    ('leads_pipeline_stage_check'),
    ('leads_interest_level_check'),
    ('leads_priority_check'),
    ('leads_next_action_completed_by_fkey')
),
unexpected_constraints AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(left(string_agg(c.conname || ':' || pg_get_constraintdef(c.oid, true), ', ' ORDER BY c.conname), 700), 'none') AS details
  FROM pg_constraint c
  WHERE c.conrelid = (SELECT leads_oid FROM relation_facts)
    AND NOT EXISTS (SELECT 1 FROM known_constraint_names k WHERE k.constraint_name = c.conname)
),
unvalidated_constraints AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(string_agg(c.conname, ', ' ORDER BY c.conname), 'none') AS details
  FROM pg_constraint c
  WHERE c.conrelid IN (
    (SELECT leads_oid FROM relation_facts),
    (SELECT timeline_oid FROM relation_facts)
  )
    AND NOT c.convalidated
),
expected_indexes(index_name) AS (
  VALUES
    ('leads_assigned_user_id_idx'),
    ('leads_last_contacted_at_idx'),
    ('leads_last_call_outcome_idx'),
    ('leads_next_action_at_idx'),
    ('leads_next_action_assigned_user_id_idx'),
    ('leads_acquisition_channel_idx'),
    ('leads_sourced_by_user_id_idx'),
    ('leads_closed_by_user_id_idx')
),
missing_indexes AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(string_agg(e.index_name, ', ' ORDER BY e.index_name), 'none') AS details
  FROM expected_indexes e
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_indexes i
    WHERE i.schemaname = 'public' AND i.tablename = 'leads' AND i.indexname = e.index_name
  )
),
duplicate_indexes AS (
  SELECT coalesce(sum(index_count - 1), 0)::bigint AS finding_count,
         coalesce(left(string_agg(index_names, '; ' ORDER BY index_names), 700), 'none') AS details
  FROM (
    SELECT count(*)::bigint AS index_count, string_agg(c.relname, ', ' ORDER BY c.relname) AS index_names
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = (SELECT leads_oid FROM relation_facts)
    GROUP BY i.indkey::text, coalesce(pg_get_expr(i.indexprs, i.indrelid), ''), coalesce(pg_get_expr(i.indpred, i.indrelid), '')
    HAVING count(*) > 1
  ) duplicate_groups
),
timeline_source AS MATERIALIZED (
  SELECT CASE
    WHEN timeline_oid IS NULL THEN xmlparse(document '<root/>')
    ELSE xmlparse(document '<root>' || xmlserialize(content
      query_to_xml(
        'SELECT jsonb_build_object(''lead_id'', lead_id, ''idempotency_key'', metadata ->> ''idempotencyKey'')::text AS row_data FROM public.customer_timeline_events WHERE lead_id IS NOT NULL AND nullif(metadata ->> ''idempotencyKey'', '''') IS NOT NULL',
        false, true, ''
      )
      AS text) || '</root>')
  END AS rows_xml
  FROM relation_facts
),
timeline_rows AS MATERIALIZED (
  SELECT row_data
  FROM timeline_source
  CROSS JOIN LATERAL unnest(xpath('/root/row/row_data/text()', rows_xml)) item
  CROSS JOIN LATERAL (SELECT xmlserialize(content item AS text)::jsonb AS row_data) decoded
),
timeline_duplicates AS (
  SELECT count(*)::bigint AS finding_count,
         coalesce(left(string_agg(lead_id::text || ':' || idempotency_key || '=' || duplicate_count, ', ' ORDER BY lead_id, idempotency_key), 700), 'none') AS details
  FROM (
    SELECT row_data ->> 'lead_id' AS lead_id,
           row_data ->> 'idempotency_key' AS idempotency_key,
           count(*)::text AS duplicate_count
    FROM timeline_rows
    WHERE nullif(row_data ->> 'lead_id', '') IS NOT NULL
      AND nullif(row_data ->> 'idempotency_key', '') IS NOT NULL
    GROUP BY row_data ->> 'lead_id', row_data ->> 'idempotency_key'
    HAVING count(*) > 1
  ) duplicates
),
policy_facts AS (
  SELECT count(*)::bigint AS policy_count,
         coalesce(string_agg(policyname || ':' || cmd, ', ' ORDER BY policyname, cmd), 'none') AS details
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'leads'
),
privilege_facts AS (
  SELECT
    CASE WHEN to_regrole('service_role') IS NULL OR leads_oid IS NULL THEN false ELSE has_table_privilege(to_regrole('service_role'), leads_oid, 'SELECT,INSERT,UPDATE') END AS service_role_ok,
    CASE WHEN to_regrole('anon') IS NULL OR leads_oid IS NULL THEN false ELSE
      has_table_privilege(to_regrole('anon'), leads_oid, 'SELECT')
      OR has_table_privilege(to_regrole('anon'), leads_oid, 'INSERT')
      OR has_table_privilege(to_regrole('anon'), leads_oid, 'UPDATE')
      OR has_table_privilege(to_regrole('anon'), leads_oid, 'DELETE')
      OR has_table_privilege(to_regrole('anon'), leads_oid, 'TRUNCATE')
      OR has_table_privilege(to_regrole('anon'), leads_oid, 'REFERENCES')
      OR has_table_privilege(to_regrole('anon'), leads_oid, 'TRIGGER')
    END AS anon_too_broad,
    CASE WHEN to_regrole('authenticated') IS NULL OR leads_oid IS NULL THEN false ELSE
      has_table_privilege(to_regrole('authenticated'), leads_oid, 'DELETE')
      OR has_table_privilege(to_regrole('authenticated'), leads_oid, 'TRUNCATE')
      OR has_table_privilege(to_regrole('authenticated'), leads_oid, 'REFERENCES')
      OR has_table_privilege(to_regrole('authenticated'), leads_oid, 'TRIGGER')
    END AS authenticated_too_broad,
    to_regrole('service_role') IS NULL AS service_role_missing,
    to_regrole('anon') IS NULL AS anon_missing,
    to_regrole('authenticated') IS NULL AS authenticated_missing
  FROM relation_facts
),
raw_checks(check_order, check_name, status, finding_count, details, stop_condition) AS MATERIALIZED (
  SELECT 10, 'required_tables_exist', CASE WHEN missing_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         missing_count, 'missing=' || missing_names, true
  FROM table_findings

  UNION ALL
  SELECT 20, 'leads_column_types_compatible',
         CASE WHEN missing_required + incompatible > 0 THEN 'FAIL' WHEN missing_additive > 0 THEN 'WARN' ELSE 'PASS' END,
         missing_required + missing_additive + incompatible,
         'required_missing=' || missing_required || '; additive_missing=' || missing_additive || '; incompatible=' || incompatible || '; findings=' || details,
         true
  FROM column_findings

  UNION ALL
  SELECT 30, 'leads_rls_enabled',
         CASE WHEN coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = (SELECT leads_oid FROM relation_facts)), false) THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = (SELECT leads_oid FROM relation_facts)), false) THEN 0 ELSE 1 END,
         'rls_enabled=' || coalesce((SELECT relrowsecurity::text FROM pg_class WHERE oid = (SELECT leads_oid FROM relation_facts)), 'unknown'), true

  UNION ALL
  SELECT 40, 'leads_policies_exist', CASE WHEN policy_count > 0 THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN policy_count > 0 THEN 0 ELSE 1 END, 'policy_count=' || policy_count || '; policies=' || details, true
  FROM policy_facts

  UNION ALL
  SELECT 50, 'service_role_required_privileges',
         CASE WHEN service_role_ok AND NOT service_role_missing THEN 'PASS' ELSE 'FAIL' END,
         CASE WHEN service_role_ok AND NOT service_role_missing THEN 0 ELSE 1 END,
         'role_exists=' || (NOT service_role_missing) || '; select_insert_update=' || service_role_ok, true
  FROM privilege_facts

  UNION ALL
  SELECT 60, 'anon_authenticated_privileges_not_too_broad',
         CASE WHEN anon_missing OR authenticated_missing OR anon_too_broad OR authenticated_too_broad THEN 'FAIL' ELSE 'PASS' END,
         (anon_missing::int + authenticated_missing::int + anon_too_broad::int + authenticated_too_broad::int)::bigint,
         'anon_role_exists=' || (NOT anon_missing) || '; anon_any_table_privilege=' || anon_too_broad ||
         '; authenticated_role_exists=' || (NOT authenticated_missing) || '; authenticated_dangerous_privilege=' || authenticated_too_broad,
         true
  FROM privilege_facts

  UNION ALL
  SELECT 70, 'unknown_lifecycle_values', CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'invalid_values=' || details, true FROM unknown_lifecycle

  UNION ALL
  SELECT 80, 'unknown_call_outcome_values',
         CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='last_call_outcome') THEN 'WARN'
              WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'column_present=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='last_call_outcome') || '; invalid_values=' || details,
         true FROM unknown_call_outcomes

  UNION ALL
  SELECT 90, 'unknown_next_action_types',
         CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='next_action_type') THEN 'WARN'
              WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'column_present=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='next_action_type') || '; invalid_values=' || details,
         true FROM unknown_action_types

  UNION ALL
  SELECT 100, 'unknown_acquisition_channel_values',
         CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='acquisition_channel') THEN 'WARN'
              WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'column_present=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='acquisition_channel') || '; invalid_values=' || details,
         true FROM unknown_channels

  UNION ALL
  SELECT 110, 'invalid_uuid_strings', CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'invalid_references=' || details, true FROM invalid_uuid_strings

  UNION ALL
  SELECT 120, 'orphaned_owner_id', CASE WHEN coalesce(finding_count, 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
         coalesce(finding_count, 0), 'orphans=' || coalesce(details, 'none'), true
  FROM (SELECT 1) seed LEFT JOIN orphan_findings ON reference_name = 'owner_id'

  UNION ALL
  SELECT 125, 'orphaned_assigned_to', CASE WHEN coalesce(finding_count, 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
         coalesce(finding_count, 0), 'orphans=' || coalesce(details, 'none'), true
  FROM (SELECT 1) seed LEFT JOIN orphan_findings ON reference_name = 'assigned_to'

  UNION ALL
  SELECT 130, 'orphaned_assigned_user_id',
         CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='assigned_user_id') THEN 'WARN'
              WHEN coalesce(finding_count, 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
         coalesce(finding_count, 0), 'column_present=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='assigned_user_id') || '; orphans=' || coalesce(details, 'none'), true
  FROM (SELECT 1) seed LEFT JOIN orphan_findings ON reference_name = 'assigned_user_id'

  UNION ALL
  SELECT 140, 'orphaned_created_by', CASE WHEN coalesce(finding_count, 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
         coalesce(finding_count, 0), 'orphans=' || coalesce(details, 'none'), true
  FROM (SELECT 1) seed LEFT JOIN orphan_findings ON reference_name = 'created_by'

  UNION ALL
  SELECT 150, 'orphaned_closed_by_user_id',
         CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='closed_by_user_id') THEN 'WARN'
              WHEN coalesce(finding_count, 0) = 0 THEN 'PASS' ELSE 'FAIL' END,
         coalesce(finding_count, 0), 'column_present=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='closed_by_user_id') || '; orphans=' || coalesce(details, 'none'), true
  FROM (SELECT 1) seed LEFT JOIN orphan_findings ON reference_name = 'closed_by_user_id'

  UNION ALL
  SELECT 160, 'assignment_conflicts', CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'lead_ids=' || details, true FROM assignment_conflicts

  UNION ALL
  SELECT 170, 'invalid_metadata_timestamps', CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'metadata.nextActionAt=' || details, true FROM invalid_metadata_timestamps

  UNION ALL
  SELECT 180, 'invalid_next_action_timestamps',
         CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='next_action_at') THEN 'WARN'
              WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'column_present=' || EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='next_action_at') || '; invalid_values=' || details,
         true FROM invalid_next_action_timestamps

  UNION ALL
  SELECT 190, 'nullable_field_distribution',
         CASE WHEN total = 0 THEN 'WARN'
              WHEN owner_missing + creator_missing + legacy_assignment_missing + assignment_missing + call_outcome_missing + next_action_missing + channel_missing > 0 THEN 'WARN'
              ELSE 'PASS' END,
         (owner_missing + creator_missing + legacy_assignment_missing + assignment_missing + call_outcome_missing + next_action_missing + channel_missing)::bigint,
         'total=' || total || '; owner_missing=' || owner_missing || '; created_by_missing=' || creator_missing ||
         '; assigned_to_missing=' || legacy_assignment_missing || '; assigned_user_id_missing=' || assignment_missing ||
         '; call_outcome_missing=' || call_outcome_missing || '; next_action_at_missing=' || next_action_missing || '; channel_missing=' || channel_missing,
         false
  FROM null_distribution

  UNION ALL
  SELECT 200, 'unexpected_leads_constraints', CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'WARN' END,
         finding_count, 'unexpected=' || details, false FROM unexpected_constraints

  UNION ALL
  SELECT 210, 'unvalidated_constraints', CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'constraints=' || details, true FROM unvalidated_constraints

  UNION ALL
  SELECT 220, 'missing_required_indexes', CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'WARN' END,
         finding_count, 'missing=' || details || '; prerequisite migration creates these indexes', false FROM missing_indexes

  UNION ALL
  SELECT 230, 'duplicate_leads_indexes', CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'WARN' END,
         finding_count, 'duplicate_groups=' || details, false FROM duplicate_indexes

  UNION ALL
  SELECT 240, 'duplicate_timeline_idempotency_keys', CASE WHEN finding_count = 0 THEN 'PASS' ELSE 'FAIL' END,
         finding_count, 'duplicates=' || details, true FROM timeline_duplicates

  UNION ALL
  SELECT 250, 'total_leads', 'PASS', count(*)::bigint, 'row_count=' || count(*), false FROM lead_rows

  UNION ALL
  SELECT 260, 'total_customer_timeline_events', 'PASS',
         coalesce((xpath('/root/row/row_count/text()', rows_xml))[1]::text::bigint, 0),
         'row_count=' || coalesce((xpath('/root/row/row_count/text()', rows_xml))[1]::text, '0'), false
  FROM (
    SELECT CASE
      WHEN timeline_oid IS NULL THEN xmlparse(document '<root/>')
      ELSE xmlparse(document '<root>' || xmlserialize(content
        query_to_xml('SELECT count(*)::text AS row_count FROM public.customer_timeline_events', false, true, '')
        AS text) || '</root>')
    END AS rows_xml
    FROM relation_facts
  ) timeline_total
),
checks AS MATERIALIZED (
  SELECT
    r.check_order,
    r.check_name,
    CASE
      WHEN f.leads_oid IS NULL AND r.check_name IN (
        'unknown_lifecycle_values', 'unknown_call_outcome_values', 'unknown_next_action_types',
        'unknown_acquisition_channel_values', 'invalid_uuid_strings', 'orphaned_owner_id', 'orphaned_assigned_to',
        'orphaned_assigned_user_id', 'orphaned_created_by', 'orphaned_closed_by_user_id',
        'assignment_conflicts', 'invalid_metadata_timestamps', 'invalid_next_action_timestamps',
        'nullable_field_distribution', 'unexpected_leads_constraints',
        'missing_required_indexes', 'duplicate_leads_indexes', 'total_leads'
      ) THEN 'WARN'
      WHEN f.users_oid IS NULL AND r.check_name IN (
        'orphaned_owner_id', 'orphaned_assigned_to', 'orphaned_assigned_user_id', 'orphaned_created_by', 'orphaned_closed_by_user_id'
      ) THEN 'WARN'
      WHEN (f.leads_oid IS NULL OR f.timeline_oid IS NULL)
        AND r.check_name = 'unvalidated_constraints' AND r.finding_count = 0 THEN 'WARN'
      WHEN f.timeline_oid IS NULL AND r.check_name IN (
        'duplicate_timeline_idempotency_keys', 'total_customer_timeline_events'
      ) THEN 'WARN'
      ELSE r.status
    END AS status,
    r.finding_count,
    CASE
      WHEN f.leads_oid IS NULL AND r.check_name <> 'required_tables_exist' THEN 'not_checkable: public.leads is missing; ' || r.details
      WHEN f.users_oid IS NULL AND r.check_name LIKE 'orphaned_%' THEN 'not_checkable: auth.users is missing; ' || r.details
      WHEN f.timeline_oid IS NULL AND r.check_name IN ('unvalidated_constraints', 'duplicate_timeline_idempotency_keys', 'total_customer_timeline_events')
        THEN 'not_checkable: public.customer_timeline_events is missing; ' || r.details
      ELSE r.details
    END AS details,
    r.stop_condition
  FROM raw_checks r
  CROSS JOIN relation_facts f
),
overall AS (
  SELECT
    999 AS check_order,
    'overall_readiness'::text AS check_name,
    CASE WHEN count(*) FILTER (WHERE status = 'FAIL' AND stop_condition) = 0 THEN 'PASS' ELSE 'FAIL' END::text AS status,
    count(*) FILTER (WHERE status = 'FAIL' AND stop_condition)::bigint AS finding_count,
    'blocking_failures=' || count(*) FILTER (WHERE status = 'FAIL' AND stop_condition) ||
      '; warnings=' || count(*) FILTER (WHERE status = 'WARN') ||
      '; failed_checks=' || coalesce(string_agg(check_name, ', ' ORDER BY check_order) FILTER (WHERE status = 'FAIL' AND stop_condition), 'none') AS details,
    true AS stop_condition
  FROM checks
)
SELECT check_name, status, finding_count, details, stop_condition
FROM (
  SELECT check_order, check_name, status, finding_count, details, stop_condition FROM checks
  UNION ALL
  SELECT check_order, check_name, status, finding_count, details, stop_condition FROM overall
) exportable_preflight
ORDER BY check_order;

ROLLBACK;
