-- Max Webstudio - prerequisite migration precheck for project yxxahurphdbblkuxoeje.
-- Run manually in that project's Supabase SQL Editor. Read-only; exactly one resultset.

BEGIN READ ONLY;

WITH
expected_tables(object_name) AS (
  VALUES ('public.leads'), ('public.customer_timeline_events'), ('auth.users')
),
relations AS MATERIALIZED (
  SELECT
    to_regclass('public.leads') AS leads_oid,
    to_regclass('public.customer_timeline_events') AS timeline_oid,
    to_regclass('auth.users') AS users_oid,
    to_regclass('supabase_migrations.schema_migrations') AS history_oid
),
expected_legacy_columns(column_name, udt_name) AS (
  VALUES
    ('id', 'uuid'), ('owner_id', 'uuid'), ('created_by', 'uuid'), ('assigned_to', 'uuid'),
    ('lead_status', 'text'), ('status', 'text'), ('external_source', 'text'),
    ('external_source_id', 'text'), ('metadata', 'jsonb'),
    ('created_at', 'timestamptz'), ('updated_at', 'timestamptz')
),
expected_prerequisite_columns(column_name, udt_name) AS (
  VALUES
    ('assigned_user_id', 'uuid'), ('assigned_at', 'timestamptz'), ('assigned_by', 'uuid'),
    ('last_contacted_at', 'timestamptz'), ('last_contacted_by', 'uuid'), ('last_call_outcome', 'text'),
    ('next_action_type', 'text'), ('next_action_at', 'timestamptz'), ('next_action_note', 'text'),
    ('next_action_assigned_user_id', 'uuid'), ('next_action_created_automatically', 'bool'),
    ('appointment_at', 'timestamptz'), ('appointment_type', 'text'), ('appointment_location', 'text'),
    ('won_at', 'timestamptz'), ('won_by', 'uuid'), ('lost_at', 'timestamptz'), ('lost_by', 'uuid'),
    ('lost_reason', 'text'), ('lost_note', 'text'), ('acquisition_channel', 'text'),
    ('sourced_by_user_id', 'uuid'), ('closed_by_user_id', 'uuid')
),
expected_checks(constraint_name) AS (
  VALUES ('leads_lead_status_check'), ('leads_last_call_outcome_check'),
         ('leads_next_action_type_check'), ('leads_acquisition_channel_check')
),
expected_indexes(index_name) AS (
  VALUES ('leads_assigned_user_id_idx'), ('leads_last_contacted_at_idx'),
         ('leads_last_call_outcome_idx'), ('leads_next_action_at_idx'),
         ('leads_next_action_assigned_user_id_idx'), ('leads_acquisition_channel_idx'),
         ('leads_sourced_by_user_id_idx'), ('leads_closed_by_user_id_idx')
),
expected_policies(table_name, policy_name, command_name) AS (
  VALUES
    ('customer_timeline_events', 'customer_timeline_events_service_role_all', 'ALL'),
    ('leads', 'leads_admin_manage', 'ALL'),
    ('leads', 'leads_sales_manager_read_update', 'ALL'),
    ('leads', 'leads_sales_partner_insert_own', 'INSERT'),
    ('leads', 'leads_sales_partner_select_own', 'SELECT'),
    ('leads', 'leads_sales_partner_update_own', 'UPDATE')
),
helper_functions(signature) AS (
  VALUES ('public.current_app_role()'), ('public.current_profile_id()'),
         ('public.has_app_role(text[])'), ('public.is_admin_role()'),
         ('public.is_staff_role()'), ('public.owns_commercial_record(uuid)')
),
browser_roles(role_name) AS (VALUES ('anon'), ('authenticated')),
forbidden_privileges(privilege_name) AS (VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')),
target_tables(table_name) AS (VALUES ('public.leads'), ('public.customer_timeline_events')),
lead_source AS MATERIALIZED (
  SELECT CASE WHEN leads_oid IS NULL THEN xmlparse(document '<root/>') ELSE
    xmlparse(document '<root>' || xmlserialize(content query_to_xml(
      'SELECT to_jsonb(l)::text AS row_data FROM public.leads l', false, true, '') AS text) || '</root>')
  END AS rows_xml
  FROM relations
),
lead_rows AS MATERIALIZED (
  SELECT xmlserialize(content item AS text)::jsonb AS row_data
  FROM lead_source CROSS JOIN LATERAL unnest(xpath('/root/row/row_data/text()', rows_xml)) item
),
user_source AS MATERIALIZED (
  SELECT CASE WHEN users_oid IS NULL THEN xmlparse(document '<root/>') ELSE
    xmlparse(document '<root>' || xmlserialize(content query_to_xml(
      'SELECT id::text AS user_id FROM auth.users', false, true, '') AS text) || '</root>')
  END AS rows_xml
  FROM relations
),
user_ids AS MATERIALIZED (
  SELECT xmlserialize(content item AS text) AS user_id
  FROM user_source CROSS JOIN LATERAL unnest(xpath('/root/row/user_id/text()', rows_xml)) item
),
timeline_total AS MATERIALIZED (
  SELECT CASE WHEN timeline_oid IS NULL THEN 0::bigint ELSE
    coalesce((xpath('/row/row_count/text()', query_to_xml(
      'SELECT count(*)::text AS row_count FROM public.customer_timeline_events', false, true, '')))[1]::text::bigint, 0)
  END AS row_count
  FROM relations
),
history_status AS MATERIALIZED (
  SELECT history_oid IS NOT NULL AS table_visible,
    CASE WHEN history_oid IS NULL THEN false ELSE coalesce(
      (xpath('/row/applied/text()', query_to_xml(
        'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text = ''20260715093000'')::text AS applied',
        false, true, '')))[1]::text::boolean, false)
    END AS applied
  FROM relations
),
policy_actual AS MATERIALIZED (
  SELECT tablename AS table_name, policyname AS policy_name, cmd AS command_name,
         roles::text AS roles, coalesce(qual, '') AS using_expression,
         coalesce(with_check, '') AS check_expression
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('leads', 'customer_timeline_events')
),
policy_contract AS MATERIALIZED (
  SELECT
    (SELECT count(*) FROM expected_policies e WHERE NOT EXISTS (
      SELECT 1 FROM policy_actual a WHERE (a.table_name, a.policy_name, a.command_name) = (e.table_name, e.policy_name, e.command_name)
    )) +
    (SELECT count(*) FROM policy_actual a WHERE NOT EXISTS (
      SELECT 1 FROM expected_policies e WHERE (e.table_name, e.policy_name, e.command_name) = (a.table_name, a.policy_name, a.command_name)
    )) AS finding_count,
    md5(coalesce(string_agg(concat_ws('|', table_name, policy_name, command_name, roles, using_expression, check_expression), E'\n'
      ORDER BY table_name, policy_name, command_name), '')) AS fingerprint,
    coalesce(string_agg(table_name || '.' || policy_name || ':' || command_name, ', ' ORDER BY table_name, policy_name), 'none') AS policies
  FROM policy_actual
),
function_facts AS MATERIALIZED (
  SELECT h.signature, p.oid,
    p.prosecdef,
    EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, array[]::text[])) setting
      WHERE replace(setting, ' ', '') IN ('search_path=public', 'search_path=public,pg_temp')) AS safe_search_path,
    CASE WHEN p.oid IS NULL OR to_regrole('anon') IS NULL THEN false
      ELSE has_function_privilege(to_regrole('anon'), p.oid, 'EXECUTE') END AS anon_execute,
    CASE WHEN p.oid IS NULL OR to_regrole('authenticated') IS NULL THEN false
      ELSE has_function_privilege(to_regrole('authenticated'), p.oid, 'EXECUTE') END AS authenticated_execute,
    CASE WHEN p.oid IS NULL OR to_regrole('service_role') IS NULL THEN false
      ELSE has_function_privilege(to_regrole('service_role'), p.oid, 'EXECUTE') END AS service_role_execute,
    EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE') AS public_execute
  FROM helper_functions h LEFT JOIN pg_proc p ON p.oid = to_regprocedure(h.signature)
),
legacy_column_findings AS (
  SELECT count(*)::bigint AS finding_count,
    coalesce(string_agg(e.column_name || ':expected=' || e.udt_name || ':actual=' || coalesce(c.udt_name, 'missing'), ', ' ORDER BY e.column_name), 'none') AS details
  FROM expected_legacy_columns e LEFT JOIN information_schema.columns c
    ON c.table_schema = 'public' AND c.table_name = 'leads' AND c.column_name = e.column_name
  WHERE c.column_name IS NULL OR c.udt_name <> e.udt_name
),
prerequisite_schema_state AS (
  SELECT
    (SELECT count(*) FROM expected_prerequisite_columns e JOIN information_schema.columns c
      ON c.table_schema='public' AND c.table_name='leads' AND c.column_name=e.column_name AND c.udt_name=e.udt_name) AS correct_columns,
    (SELECT count(*) FROM expected_checks e JOIN pg_constraint c
      ON c.conrelid=(SELECT leads_oid FROM relations) AND c.conname=e.constraint_name AND c.convalidated) AS validated_checks,
    (SELECT count(*) FROM expected_indexes e JOIN pg_indexes i
      ON i.schemaname='public' AND i.tablename='leads' AND i.indexname=e.index_name) AS present_indexes
),
data_findings AS MATERIALIZED (
  SELECT
    count(*) FILTER (WHERE nullif(btrim(row_data->>'lead_status'), '') IS NULL OR lower(btrim(row_data->>'lead_status')) NOT IN
      ('new','reviewing','interesting','not_interesting','assigned','call_scheduled','contact_attempted','contacted','follow_up','appointment_scheduled','demo_requested','demo_building','demo_ready','demo_sent','proposal_sent','negotiation','won','lost','customer'))::bigint AS lifecycle,
    count(*) FILTER (WHERE nullif(btrim(coalesce(row_data->>'last_call_outcome', row_data#>>'{metadata,lastCallOutcome}')), '') IS NOT NULL
      AND lower(btrim(coalesce(row_data->>'last_call_outcome', row_data#>>'{metadata,lastCallOutcome}'))) NOT IN
      ('not_called','called','contacted','interested','not_interested','no_answer','voicemail_left','callback_requested','invalid_number','wrong_number','busy','appointment_scheduled','demo_requested','proposal_requested','no_budget','later','already_helped','business_closed'))::bigint AS call_outcomes,
    count(*) FILTER (WHERE nullif(btrim(coalesce(row_data->>'next_action_type', row_data#>>'{metadata,nextActionType}')), '') IS NOT NULL
      AND lower(btrim(coalesce(row_data->>'next_action_type', row_data#>>'{metadata,nextActionType}'))) NOT IN
      ('call','email','send_demo','create_demo','send_proposal','follow_up','appointment','await_response','custom'))::bigint AS action_types,
    count(*) FILTER (WHERE nullif(btrim(coalesce(row_data->>'acquisition_channel', row_data#>>'{metadata,acquisitionChannel}')), '') IS NOT NULL
      AND lower(btrim(coalesce(row_data->>'acquisition_channel', row_data#>>'{metadata,acquisitionChannel}'))) NOT IN
      ('website','email','outbound_sales','referral','phone','social','partner','manual','import','other'))::bigint AS channels,
    count(*) FILTER (WHERE
      (nullif(btrim(row_data#>>'{metadata,lastCallOutcome}'),'') IS NOT NULL AND lower(btrim(row_data#>>'{metadata,lastCallOutcome}')) NOT IN
        ('not_called','called','contacted','interested','not_interested','no_answer','voicemail_left','callback_requested','invalid_number','wrong_number','busy','appointment_scheduled','demo_requested','proposal_requested','no_budget','later','already_helped','business_closed')) OR
      (nullif(btrim(row_data#>>'{metadata,callDisposition}'),'') IS NOT NULL AND lower(btrim(row_data#>>'{metadata,callDisposition}')) NOT IN
        ('not_called','called','no_answer','voicemail','callback','invalid_number','busy')) OR
      (nullif(btrim(row_data#>>'{metadata,nextActionType}'),'') IS NOT NULL AND lower(btrim(row_data#>>'{metadata,nextActionType}')) NOT IN
        ('call','email','send_demo','create_demo','send_proposal','follow_up','appointment','await_response','custom')) OR
      (nullif(btrim(row_data#>>'{metadata,acquisitionChannel}'),'') IS NOT NULL AND lower(btrim(row_data#>>'{metadata,acquisitionChannel}')) NOT IN
        ('website','email','outbound_sales','referral','phone','social','partner','manual','import','other'))
    )::bigint AS metadata_values,
    count(*) FILTER (WHERE nullif(btrim(row_data#>>'{metadata,nextActionAt}'), '') IS NOT NULL
      AND NOT pg_input_is_valid(row_data#>>'{metadata,nextActionAt}', 'timestamp with time zone'))::bigint AS metadata_timestamps,
    count(*) FILTER (WHERE nullif(btrim(row_data->>'next_action_at'), '') IS NOT NULL
      AND NOT pg_input_is_valid(row_data->>'next_action_at', 'timestamp with time zone'))::bigint AS next_action_timestamps,
    count(*) FILTER (WHERE
      (nullif(row_data->>'assigned_to','') IS NOT NULL AND nullif(row_data->>'assigned_user_id','') IS NOT NULL AND row_data->>'assigned_to' <> row_data->>'assigned_user_id') OR
      (nullif(row_data#>>'{metadata,assignedUserId}','') IS NOT NULL AND nullif(row_data->>'assigned_user_id','') IS NOT NULL AND row_data#>>'{metadata,assignedUserId}' <> row_data->>'assigned_user_id') OR
      (nullif(row_data->>'assigned_to','') IS NOT NULL AND nullif(row_data#>>'{metadata,assignedUserId}','') IS NOT NULL AND row_data->>'assigned_to' <> row_data#>>'{metadata,assignedUserId}'))::bigint AS assignment_conflicts
  FROM lead_rows
),
references_to_check AS MATERIALIZED (
  SELECT row_data->>'id' AS lead_id, ref_name, ref_value
  FROM lead_rows CROSS JOIN LATERAL (VALUES
    ('owner_id', row_data->>'owner_id'), ('created_by', row_data->>'created_by'), ('assigned_to', row_data->>'assigned_to'),
    ('assigned_user_id', row_data->>'assigned_user_id'), ('assigned_by', row_data->>'assigned_by'),
    ('last_contacted_by', row_data->>'last_contacted_by'), ('next_action_assigned_user_id', row_data->>'next_action_assigned_user_id'),
    ('won_by', row_data->>'won_by'), ('lost_by', row_data->>'lost_by'), ('sourced_by_user_id', row_data->>'sourced_by_user_id'),
    ('closed_by_user_id', row_data->>'closed_by_user_id'), ('metadata.assignedUserId', row_data#>>'{metadata,assignedUserId}'),
    ('metadata.nextActionAssignedUserId', row_data#>>'{metadata,nextActionAssignedUserId}'),
    ('metadata.sourcedByUserId', row_data#>>'{metadata,sourcedByUserId}'), ('metadata.closedByUserId', row_data#>>'{metadata,closedByUserId}')
  ) refs(ref_name, ref_value)
  WHERE nullif(btrim(ref_value), '') IS NOT NULL
),
reference_findings AS (
  SELECT count(*)::bigint AS finding_count,
    coalesce(left(string_agg(lead_id || ':' || ref_name || '=' || ref_value, ', ' ORDER BY lead_id, ref_name), 700), 'none') AS details
  FROM references_to_check r
  WHERE r.ref_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     OR NOT EXISTS (SELECT 1 FROM user_ids u WHERE u.user_id = r.ref_value)
),
raw_checks(check_order, check_name, status, finding_count, details, blocking) AS MATERIALIZED (
  SELECT 10, 'database_identity', CASE WHEN current_database()='postgres' AND current_setting('transaction_read_only')='on' THEN 'PASS' ELSE 'FAIL' END,
    (current_database()<>'postgres')::int + (current_setting('transaction_read_only')<>'on')::int,
    'projectref_must_be_confirmed_in_SQL_Editor=yxxahurphdbblkuxoeje; database=' || current_database() || '; user=' || current_user ||
    '; server=' || coalesce(inet_server_addr()::text,'local') || ':' || coalesce(inet_server_port()::text,'local') || '; read_only=' || current_setting('transaction_read_only'), true
  UNION ALL
  SELECT 20, 'required_tables_exist', CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END, count(*)::bigint,
    'missing=' || coalesce(string_agg(object_name, ', ' ORDER BY object_name), 'none'), true FROM expected_tables WHERE to_regclass(object_name) IS NULL
  UNION ALL
  SELECT 30, 'authoritative_row_counts', CASE WHEN (SELECT count(*) FROM lead_rows)=12 AND (SELECT row_count FROM timeline_total)=37 THEN 'PASS' ELSE 'FAIL' END,
    abs((SELECT count(*) FROM lead_rows)-12)::bigint + abs((SELECT row_count FROM timeline_total)-37),
    'leads=' || (SELECT count(*) FROM lead_rows) || '/12; customer_timeline_events=' || (SELECT row_count FROM timeline_total) || '/37', true
  UNION ALL
  SELECT 40, 'target_rls_enabled', CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END, count(*)::bigint,
    'disabled_or_missing=' || coalesce(string_agg(table_name, ', ' ORDER BY table_name), 'none'), true
    FROM target_tables t LEFT JOIN pg_class c ON c.oid=to_regclass(t.table_name) WHERE c.oid IS NULL OR NOT c.relrowsecurity
  UNION ALL
  SELECT 50, 'policy_contract_and_fingerprint', CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END, finding_count::bigint,
    'fingerprint_md5=' || fingerprint || '; policies=' || policies, true FROM policy_contract
  UNION ALL
  SELECT 60, 'legacy_columns_compatible', CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END, finding_count, details, true FROM legacy_column_findings
  UNION ALL
  SELECT 70, 'privilege_hardening_active', CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END, count(*)::bigint,
    'violations=' || coalesce(string_agg(finding, ', ' ORDER BY finding), 'none'), true FROM (
      SELECT r.role_name || ':' || t.table_name || ':' || p.privilege_name AS finding
      FROM browser_roles r CROSS JOIN target_tables t CROSS JOIN forbidden_privileges p
      WHERE to_regrole(r.role_name) IS NULL OR to_regclass(t.table_name) IS NULL OR has_table_privilege(to_regrole(r.role_name), to_regclass(t.table_name), p.privilege_name)
      UNION ALL SELECT role_name || ':public:CREATE' FROM browser_roles WHERE to_regrole(role_name) IS NULL OR has_schema_privilege(role_name, 'public', 'CREATE')
      UNION ALL SELECT signature || ':unsafe_or_missing' FROM function_facts WHERE oid IS NULL OR NOT prosecdef OR NOT safe_search_path OR anon_execute OR public_execute OR NOT authenticated_execute OR NOT service_role_execute
    ) findings
  UNION ALL
  SELECT 80, 'required_application_privileges', CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END, count(*)::bigint,
    'missing=' || coalesce(string_agg(finding, ', ' ORDER BY finding), 'none'), true FROM (
      SELECT 'authenticated:leads:' || privilege_name AS finding FROM (VALUES ('SELECT'),('INSERT'),('UPDATE')) p(privilege_name)
        WHERE to_regrole('authenticated') IS NULL OR (SELECT leads_oid FROM relations) IS NULL OR NOT has_table_privilege(to_regrole('authenticated'), (SELECT leads_oid FROM relations), privilege_name)
      UNION ALL
      SELECT 'service_role:' || table_name || ':' || privilege_name FROM (VALUES
        ('public.leads','SELECT'),('public.leads','INSERT'),('public.leads','UPDATE'),
        ('public.customer_timeline_events','SELECT'),('public.customer_timeline_events','INSERT'),('public.customer_timeline_events','UPDATE'),('public.customer_timeline_events','DELETE')
      ) p(table_name, privilege_name) WHERE to_regrole('service_role') IS NULL OR to_regclass(table_name) IS NULL OR NOT has_table_privilege(to_regrole('service_role'), to_regclass(table_name), privilege_name)
    ) missing
  UNION ALL
  SELECT 90, 'unknown_lifecycle_values', CASE WHEN lifecycle=0 THEN 'PASS' ELSE 'FAIL' END, lifecycle, 'finding_count=' || lifecycle, true FROM data_findings
  UNION ALL SELECT 100, 'unknown_call_outcome_values', CASE WHEN call_outcomes=0 THEN 'PASS' ELSE 'FAIL' END, call_outcomes, 'finding_count=' || call_outcomes, true FROM data_findings
  UNION ALL SELECT 110, 'unknown_action_type_values', CASE WHEN action_types=0 THEN 'PASS' ELSE 'FAIL' END, action_types, 'finding_count=' || action_types, true FROM data_findings
  UNION ALL SELECT 120, 'unknown_acquisition_channel_values', CASE WHEN channels=0 THEN 'PASS' ELSE 'FAIL' END, channels, 'finding_count=' || channels, true FROM data_findings
  UNION ALL SELECT 125, 'invalid_metadata_values', CASE WHEN metadata_values=0 THEN 'PASS' ELSE 'FAIL' END, metadata_values, 'finding_count=' || metadata_values, true FROM data_findings
  UNION ALL SELECT 130, 'invalid_metadata_timestamps', CASE WHEN metadata_timestamps=0 THEN 'PASS' ELSE 'FAIL' END, metadata_timestamps, 'finding_count=' || metadata_timestamps, true FROM data_findings
  UNION ALL SELECT 140, 'invalid_next_action_timestamps', CASE WHEN next_action_timestamps=0 THEN 'PASS' ELSE 'FAIL' END, next_action_timestamps, 'finding_count=' || next_action_timestamps, true FROM data_findings
  UNION ALL SELECT 150, 'assignment_conflicts', CASE WHEN assignment_conflicts=0 THEN 'PASS' ELSE 'FAIL' END, assignment_conflicts, 'finding_count=' || assignment_conflicts, true FROM data_findings
  UNION ALL SELECT 160, 'invalid_or_orphaned_uuid_references', CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END, finding_count, details, true FROM reference_findings
  UNION ALL
  SELECT 170, 'prerequisite_not_already_applied',
    CASE WHEN h.applied OR (s.correct_columns=23 AND s.validated_checks=4 AND s.present_indexes=8) THEN 'FAIL' ELSE 'PASS' END,
    h.applied::int + (s.correct_columns=23 AND s.validated_checks=4 AND s.present_indexes=8)::int,
    'history_table_visible=' || h.table_visible || '; history_row=' || h.applied || '; correct_columns=' || s.correct_columns || '/23; validated_checks=' || s.validated_checks || '/4; indexes=' || s.present_indexes || '/8', true
  FROM history_status h CROSS JOIN prerequisite_schema_state s
),
overall AS (
  SELECT 999 AS check_order, 'overall_readiness'::text AS check_name,
    CASE WHEN count(*) FILTER (WHERE status='FAIL' AND blocking)=0 THEN 'PASS' ELSE 'FAIL' END::text AS status,
    count(*) FILTER (WHERE status='FAIL' AND blocking)::bigint AS finding_count,
    'blocking_failures=' || count(*) FILTER (WHERE status='FAIL' AND blocking) || '; failed_checks=' ||
      coalesce(string_agg(check_name, ', ' ORDER BY check_order) FILTER (WHERE status='FAIL' AND blocking), 'none') AS details, true AS blocking
  FROM raw_checks
)
SELECT check_name, status, finding_count, details, blocking
FROM (
  SELECT * FROM raw_checks
  UNION ALL SELECT * FROM overall
) exportable_precheck
ORDER BY check_order;

ROLLBACK;
