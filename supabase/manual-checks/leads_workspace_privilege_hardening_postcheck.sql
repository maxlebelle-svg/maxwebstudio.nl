-- Max Webstudio - Lead workspace privilege hardening postcheck
-- Read-only, one exportable resultset. Run after the security migration only.

BEGIN READ ONLY;

WITH
helper_functions(signature) AS (
  VALUES
    ('public.current_app_role()'),
    ('public.current_profile_id()'),
    ('public.has_app_role(text[])'),
    ('public.is_admin_role()'),
    ('public.is_staff_role()'),
    ('public.owns_commercial_record(uuid)')
),
target_tables(table_name) AS (
  VALUES ('public.leads'), ('public.customer_timeline_events')
),
browser_roles(role_name) AS (
  VALUES ('anon'), ('authenticated')
),
forbidden_privileges(privilege_name) AS (
  VALUES ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
),
forbidden_table_findings AS (
  SELECT role_name, table_name, privilege_name
  FROM browser_roles
  CROSS JOIN target_tables
  CROSS JOIN forbidden_privileges
  WHERE has_table_privilege(role_name, table_name, privilege_name)
),
function_facts AS (
  SELECT
    h.signature,
    p.prosecdef,
    EXISTS (
      SELECT 1
      FROM unnest(coalesce(p.proconfig, array[]::text[])) setting
      WHERE replace(setting, ' ', '') IN ('search_path=public', 'search_path=public,pg_temp')
    ) AS safe_search_path,
    has_function_privilege('anon', h.signature, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', h.signature, 'EXECUTE') AS authenticated_execute,
    has_function_privilege('service_role', h.signature, 'EXECUTE') AS service_role_execute
  FROM helper_functions h
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(h.signature)
),
checks(check_name, status, finding_count, details, blocking) AS (
  SELECT
    'browser_table_privileges_removed',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::bigint,
    CASE WHEN count(*) = 0
      THEN 'anon/authenticated have no effective TRUNCATE, REFERENCES or TRIGGER on either target table'
      ELSE string_agg(role_name || ':' || table_name || ':' || privilege_name, ', ' ORDER BY role_name, table_name, privilege_name)
    END,
    true
  FROM forbidden_table_findings

  UNION ALL
  SELECT
    'browser_schema_create_absent',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::bigint,
    CASE WHEN count(*) = 0 THEN 'anon/authenticated have no CREATE on schema public'
      ELSE string_agg(role_name || ':CREATE', ', ' ORDER BY role_name)
    END,
    true
  FROM browser_roles
  WHERE has_schema_privilege(role_name, 'public', 'CREATE')

  UNION ALL
  SELECT
    'required_schema_usage_present',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::bigint,
    CASE WHEN count(*) = 0 THEN 'anon, authenticated and service_role retain USAGE on schema public'
      ELSE string_agg(role_name || ':USAGE missing', ', ' ORDER BY role_name)
    END,
    true
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) roles(role_name)
  WHERE NOT has_schema_privilege(role_name, 'public', 'USAGE')

  UNION ALL
  SELECT
    'security_definer_helpers_safe',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::bigint,
    CASE WHEN count(*) = 0 THEN 'all six helpers are SECURITY DEFINER with fixed public or public,pg_temp search_path'
      ELSE string_agg(signature || ':security_definer=' || coalesce(prosecdef::text, 'missing') || ':safe_search_path=' || safe_search_path, ', ' ORDER BY signature)
    END,
    true
  FROM function_facts
  WHERE prosecdef IS DISTINCT FROM true OR NOT safe_search_path

  UNION ALL
  SELECT
    'helper_execute_acl',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::bigint,
    CASE WHEN count(*) = 0 THEN 'anon denied; authenticated and service_role allowed on all six RLS helpers'
      ELSE string_agg(signature || ':anon=' || anon_execute || ':authenticated=' || authenticated_execute || ':service_role=' || service_role_execute, ', ' ORDER BY signature)
    END,
    true
  FROM function_facts
  WHERE anon_execute OR NOT authenticated_execute OR NOT service_role_execute

  UNION ALL
  SELECT
    'authenticated_leads_flow_privileges',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::bigint,
    CASE WHEN count(*) = 0 THEN 'authenticated retains SELECT, INSERT and UPDATE on public.leads'
      ELSE string_agg(privilege_name || ' missing', ', ' ORDER BY privilege_name)
    END,
    true
  FROM (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) required(privilege_name)
  WHERE NOT has_table_privilege('authenticated', 'public.leads', privilege_name)

  UNION ALL
  SELECT
    'service_role_privileges_preserved',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::bigint,
    CASE WHEN count(*) = 0 THEN 'service_role retains required Leads and timeline DML privileges'
      ELSE string_agg(table_name || ':' || privilege_name || ' missing', ', ' ORDER BY table_name, privilege_name)
    END,
    true
  FROM (
    VALUES
      ('public.leads', 'SELECT'), ('public.leads', 'INSERT'), ('public.leads', 'UPDATE'),
      ('public.customer_timeline_events', 'SELECT'), ('public.customer_timeline_events', 'INSERT'),
      ('public.customer_timeline_events', 'UPDATE'), ('public.customer_timeline_events', 'DELETE')
  ) required(table_name, privilege_name)
  WHERE NOT has_table_privilege('service_role', table_name, privilege_name)

  UNION ALL
  SELECT
    'target_rls_enabled',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::bigint,
    CASE WHEN count(*) = 0 THEN 'RLS remains enabled on both target tables'
      ELSE string_agg(table_name || ':RLS disabled or table missing', ', ' ORDER BY table_name)
    END,
    true
  FROM target_tables t
  LEFT JOIN pg_class c ON c.oid = to_regclass(t.table_name)
  WHERE c.oid IS NULL OR NOT c.relrowsecurity

  UNION ALL
  SELECT
    'target_policies_preserved',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*)::bigint,
    CASE WHEN count(*) = 0 THEN 'both target tables retain one or more policies; this migration contains no policy DDL'
      ELSE string_agg(table_name || ':no policies', ', ' ORDER BY table_name)
    END,
    true
  FROM target_tables t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policy p WHERE p.polrelid = to_regclass(t.table_name)
  )
),
all_checks AS (
  SELECT * FROM checks
  UNION ALL
  SELECT
    'overall_readiness',
    CASE WHEN count(*) FILTER (WHERE status = 'FAIL' AND blocking) = 0 THEN 'PASS' ELSE 'FAIL' END,
    count(*) FILTER (WHERE status = 'FAIL' AND blocking)::bigint,
    'blocking_failures=' || count(*) FILTER (WHERE status = 'FAIL' AND blocking),
    true
  FROM checks
)
SELECT check_name, status, finding_count, details, blocking
FROM all_checks
ORDER BY CASE WHEN check_name = 'overall_readiness' THEN 1 ELSE 0 END, check_name;

ROLLBACK;
