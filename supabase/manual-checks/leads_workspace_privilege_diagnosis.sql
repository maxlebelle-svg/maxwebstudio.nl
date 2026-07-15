-- READ ONLY: diagnose effective privileges around Leads Sales Workspace objects.
-- Export the single result table and review every REVIEW or DANGEROUS row before activation.

BEGIN READ ONLY;

WITH
roles AS (
  SELECT requested.role_name,
         r.oid AS role_oid,
         coalesce(r.rolbypassrls, false) AS bypasses_rls,
         r.oid IS NOT NULL AS role_exists
  FROM (VALUES ('anon'), ('authenticated'), ('service_role')) requested(role_name)
  LEFT JOIN pg_roles r ON r.rolname = requested.role_name
),
target_tables AS (
  SELECT n.nspname AS schema_name,
         c.relname AS object_name,
         c.oid AS relation_oid,
         c.relowner,
         c.relrowsecurity AS rls_enabled,
         c.relacl
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('leads', 'customer_timeline_events')
    AND c.relkind IN ('r', 'p')
),
table_privilege_types(privilege_type) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
),
effective_table_privileges AS (
  SELECT
    'table'::text AS object_type,
    t.schema_name,
    t.object_name,
    r.role_name AS grantee,
    p.privilege_type,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(t.relacl) acl
        WHERE acl.grantee = r.role_oid AND acl.privilege_type = p.privilege_type
      ) THEN 'direct_acl'
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(t.relacl) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = p.privilege_type
      ) THEN 'public_acl'
      ELSE 'role_membership_or_owner'
    END AS source,
    t.rls_enabled,
    NULL::text AS policy_name,
    NULL::text AS policy_command,
    CASE
      WHEN r.role_name = 'service_role' THEN 'EXPECTED'
      WHEN p.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER') THEN 'DANGEROUS'
      WHEN t.object_name = 'leads'
        AND r.role_name = 'authenticated'
        AND p.privilege_type IN ('SELECT', 'INSERT', 'UPDATE') THEN 'EXPECTED'
      ELSE 'REVIEW'
    END AS assessment,
    CASE
      WHEN r.role_name = 'service_role' THEN 'Server-side lead and timeline APIs intentionally use service_role.'
      WHEN p.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')
        THEN 'This privilege is not row-scoped by RLS and is not required by the documented browser contract.'
      WHEN t.object_name = 'leads' AND r.role_name = 'authenticated'
        AND p.privilege_type IN ('SELECT', 'INSERT', 'UPDATE')
        THEN 'Explicitly granted by the leads RLS migrations; actual rows remain policy-scoped.'
      WHEN t.rls_enabled THEN 'The grant exists, but row access must still pass an applicable RLS policy.'
      ELSE 'The grant is effective while RLS is disabled.'
    END AS reason,
    (r.role_name <> 'service_role' AND p.privilege_type IN ('TRUNCATE', 'REFERENCES', 'TRIGGER')) AS blocking
  FROM roles r
  CROSS JOIN target_tables t
  CROSS JOIN table_privilege_types p
  WHERE r.role_exists
    AND coalesce(has_table_privilege(r.role_oid, t.relation_oid, p.privilege_type), false)
),
effective_column_privileges AS (
  SELECT
    'column'::text AS object_type,
    t.schema_name,
    t.object_name || '.' || a.attname AS object_name,
    r.role_name AS grantee,
    p.privilege_type,
    'effective_column_acl'::text AS source,
    t.rls_enabled,
    NULL::text AS policy_name,
    NULL::text AS policy_command,
    CASE
      WHEN r.role_name = 'service_role' THEN 'EXPECTED'
      WHEN p.privilege_type = 'REFERENCES' THEN 'DANGEROUS'
      WHEN t.object_name = 'leads' AND r.role_name = 'authenticated'
        AND p.privilege_type IN ('SELECT', 'INSERT', 'UPDATE') THEN 'EXPECTED'
      ELSE 'REVIEW'
    END AS assessment,
    CASE
      WHEN p.privilege_type = 'REFERENCES' AND r.role_name <> 'service_role'
        THEN 'Column REFERENCES is not row-scoped by RLS and is not required by the documented browser contract.'
      WHEN t.rls_enabled THEN 'Column access is effective only for rows admitted by an applicable RLS policy.'
      ELSE 'Column access is effective while RLS is disabled.'
    END AS reason,
    (r.role_name <> 'service_role' AND p.privilege_type = 'REFERENCES') AS blocking
  FROM roles r
  CROSS JOIN target_tables t
  JOIN pg_attribute a ON a.attrelid = t.relation_oid AND a.attnum > 0 AND NOT a.attisdropped
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p(privilege_type)
  WHERE r.role_exists
    AND coalesce(has_column_privilege(r.role_oid, t.relation_oid, a.attnum, p.privilege_type), false)
    AND NOT coalesce(has_table_privilege(r.role_oid, t.relation_oid, p.privilege_type), false)
),
policy_rows AS (
  SELECT
    'policy'::text AS object_type,
    p.schemaname AS schema_name,
    p.tablename AS object_name,
    array_to_string(p.roles, ',') AS grantee,
    p.cmd AS privilege_type,
    'pg_policies'::text AS source,
    t.rls_enabled,
    p.policyname AS policy_name,
    p.cmd AS policy_command,
    CASE
      WHEN NOT t.rls_enabled THEN 'DANGEROUS'
      WHEN p.roles <@ ARRAY['service_role']::name[] THEN 'EXPECTED'
      WHEN (
        p.cmd = 'INSERT' AND lower(regexp_replace(coalesce(p.with_check, ''), '[()[:space:]]', '', 'g')) IN ('', 'true')
      ) OR (
        p.cmd <> 'INSERT' AND lower(regexp_replace(coalesce(p.qual, ''), '[()[:space:]]', '', 'g')) IN ('', 'true')
      ) THEN 'REVIEW'
      ELSE 'EXPECTED'
    END AS assessment,
    left('roles=' || array_to_string(p.roles, ',') || '; using=' || coalesce(p.qual, '<none>') ||
      '; with_check=' || coalesce(p.with_check, '<none>'), 1000) AS reason,
    NOT t.rls_enabled AS blocking
  FROM pg_policies p
  JOIN target_tables t ON t.schema_name = p.schemaname AND t.object_name = p.tablename
),
action_types(privilege_type, policy_command) AS (
  VALUES ('SELECT', 'SELECT'), ('INSERT', 'INSERT'), ('UPDATE', 'UPDATE'), ('DELETE', 'DELETE')
),
effective_actions AS (
  SELECT
    'effective_action'::text AS object_type,
    t.schema_name,
    t.object_name,
    r.role_name AS grantee,
    a.privilege_type,
    'grant_plus_rls_policy'::text AS source,
    t.rls_enabled,
    policies.policy_names AS policy_name,
    a.policy_command,
    CASE
      WHEN r.role_name = 'service_role' THEN 'EXPECTED'
      WHEN NOT grants.has_grant THEN 'EXPECTED'
      WHEN r.bypasses_rls THEN 'DANGEROUS'
      WHEN NOT t.rls_enabled THEN 'DANGEROUS'
      WHEN NOT policies.has_policy THEN 'EXPECTED'
      WHEN policies.has_unconditional_policy THEN 'DANGEROUS'
      ELSE 'REVIEW'
    END AS assessment,
    CASE
      WHEN r.role_name = 'service_role' AND r.bypasses_rls AND grants.has_grant
        THEN 'service_role intentionally bypasses RLS for authenticated server-side APIs.'
      WHEN r.role_name = 'service_role' AND grants.has_grant
        THEN 'service_role has a server-side grant and remains constrained by its applicable policy in this environment.'
      WHEN r.role_name = 'service_role'
        THEN 'service_role has no effective grant for this action.'
      WHEN NOT grants.has_grant THEN 'No effective table or column grant; the action is denied before RLS.'
      WHEN r.bypasses_rls THEN 'A browser role with BYPASSRLS and a matching grant can access rows without policies.'
      WHEN NOT t.rls_enabled THEN 'The grant is effective without RLS row filtering.'
      WHEN NOT policies.has_policy THEN 'RLS is enabled and no applicable policy exists; default deny applies.'
      WHEN policies.has_unconditional_policy THEN 'An applicable policy is unconditional; the grant can reach all rows for this action.'
      ELSE 'The action is possible only for rows satisfying: ' || coalesce(policies.policy_names, '<unknown policy>')
    END AS reason,
    CASE
      WHEN r.role_name = 'service_role' THEN false
      WHEN NOT grants.has_grant THEN false
      WHEN r.bypasses_rls OR NOT t.rls_enabled OR policies.has_unconditional_policy THEN true
      ELSE false
    END AS blocking
  FROM roles r
  CROSS JOIN target_tables t
  CROSS JOIN action_types a
  CROSS JOIN LATERAL (
    SELECT
      coalesce(has_table_privilege(r.role_oid, t.relation_oid, a.privilege_type), false)
      OR CASE WHEN a.privilege_type IN ('SELECT', 'INSERT', 'UPDATE') THEN EXISTS (
        SELECT 1 FROM pg_attribute col
        WHERE col.attrelid = t.relation_oid AND col.attnum > 0 AND NOT col.attisdropped
          AND coalesce(has_column_privilege(r.role_oid, t.relation_oid, col.attnum, a.privilege_type), false)
      ) ELSE false END AS has_grant
  ) grants
  CROSS JOIN LATERAL (
    SELECT
      count(pol.policyname) > 0 AS has_policy,
      coalesce(bool_or(
        CASE
          WHEN a.policy_command = 'INSERT' THEN
            lower(regexp_replace(coalesce(pol.with_check, ''), '[()[:space:]]', '', 'g')) IN ('', 'true')
          WHEN a.policy_command = 'UPDATE' THEN
            lower(regexp_replace(coalesce(pol.qual, ''), '[()[:space:]]', '', 'g')) IN ('', 'true')
            AND lower(regexp_replace(coalesce(pol.with_check, pol.qual, ''), '[()[:space:]]', '', 'g')) IN ('', 'true')
          ELSE lower(regexp_replace(coalesce(pol.qual, ''), '[()[:space:]]', '', 'g')) IN ('', 'true')
        END
      ), false) AS has_unconditional_policy,
      string_agg(pol.policyname, ', ' ORDER BY pol.policyname) AS policy_names
    FROM pg_policies pol
    WHERE pol.schemaname = t.schema_name
      AND pol.tablename = t.object_name
      AND pol.cmd IN ('ALL', a.policy_command)
      AND ('public' = ANY(pol.roles) OR r.role_name = ANY(pol.roles))
  ) policies
  WHERE r.role_exists
),
target_sequences AS (
  SELECT DISTINCT ns.nspname AS schema_name,
         seq.relname AS object_name,
         seq.oid AS sequence_oid,
         seq.relacl,
         t.rls_enabled
  FROM target_tables t
  JOIN pg_depend d ON d.refobjid = t.relation_oid AND d.refobjsubid > 0 AND d.deptype IN ('a', 'i')
  JOIN pg_class seq ON seq.oid = d.objid AND seq.relkind = 'S'
  JOIN pg_namespace ns ON ns.oid = seq.relnamespace
),
sequence_privilege_rows AS (
  SELECT
    'sequence'::text AS object_type,
    s.schema_name,
    s.object_name,
    r.role_name AS grantee,
    p.privilege_type,
    'effective_sequence_acl'::text AS source,
    NULL::boolean AS rls_enabled,
    NULL::text AS policy_name,
    NULL::text AS policy_command,
    CASE
      WHEN r.role_name = 'service_role' THEN 'EXPECTED'
      WHEN p.privilege_type = 'USAGE' THEN 'REVIEW'
      ELSE 'DANGEROUS'
    END AS assessment,
    CASE
      WHEN r.role_name = 'service_role' THEN 'Server-side APIs may need the sequence for inserts.'
      WHEN p.privilege_type = 'USAGE' THEN 'USAGE may support an explicitly allowed insert; verify the owning column and RLS policy.'
      ELSE 'Direct sequence read/update is not protected by table RLS.'
    END AS reason,
    (r.role_name <> 'service_role' AND p.privilege_type <> 'USAGE') AS blocking
  FROM roles r
  CROSS JOIN target_sequences s
  CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) p(privilege_type)
  WHERE r.role_exists
    AND coalesce(has_sequence_privilege(r.role_oid, s.sequence_oid, p.privilege_type), false)
),
sequence_inventory_rows AS (
  SELECT
    'sequence'::text AS object_type,
    'public'::text AS schema_name,
    '<none owned by target tables>'::text AS object_name,
    r.role_name AS grantee,
    '<none>'::text AS privilege_type,
    'catalog_inventory'::text AS source,
    NULL::boolean AS rls_enabled,
    NULL::text AS policy_name,
    NULL::text AS policy_command,
    'EXPECTED'::text AS assessment,
    'The target tables use no owned PostgreSQL sequences.'::text AS reason,
    false AS blocking
  FROM roles r
  WHERE r.role_exists AND NOT EXISTS (SELECT 1 FROM target_sequences)
),
target_functions AS (
  SELECT DISTINCT n.nspname AS schema_name,
         p.proname,
         p.oid AS function_oid,
         p.oid::regprocedure::text AS object_name,
         p.proowner,
         p.proacl,
         p.prosecdef,
         p.prorettype = 'pg_catalog.trigger'::regtype AS is_trigger_function,
         p.proconfig
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND (
      p.proname IN (
        'set_updated_at', 'set_current_user_as_commercial_owner', 'current_profile_id',
        'current_app_role', 'has_app_role', 'is_admin_role', 'is_staff_role', 'owns_commercial_record'
      )
      OR p.proname ILIKE '%lead%'
      OR p.proname ILIKE '%timeline%'
      OR p.oid IN (
        SELECT trg.tgfoid
        FROM pg_trigger trg
        JOIN target_tables t ON t.relation_oid = trg.tgrelid
        WHERE NOT trg.tgisinternal
      )
    )
),
function_privilege_rows AS (
  SELECT
    'function'::text AS object_type,
    f.schema_name,
    f.object_name,
    r.role_name AS grantee,
    'EXECUTE'::text AS privilege_type,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(f.proacl) acl
        WHERE acl.grantee = r.role_oid AND acl.privilege_type = 'EXECUTE'
      ) THEN 'direct_acl'
      WHEN EXISTS (
        SELECT 1 FROM aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) THEN CASE WHEN f.proacl IS NULL THEN 'default_public_execute' ELSE 'public_acl' END
      ELSE 'role_membership_or_owner'
    END AS source,
    NULL::boolean AS rls_enabled,
    NULL::text AS policy_name,
    NULL::text AS policy_command,
    CASE
      WHEN r.role_name = 'service_role' THEN 'EXPECTED'
      WHEN f.is_trigger_function THEN 'REVIEW'
      WHEN f.prosecdef THEN 'DANGEROUS'
      WHEN r.role_name = 'authenticated' AND f.proname IN (
        'current_profile_id', 'current_app_role', 'has_app_role', 'is_admin_role',
        'is_staff_role', 'owns_commercial_record', 'set_current_user_as_commercial_owner'
      ) THEN 'EXPECTED'
      ELSE 'REVIEW'
    END AS assessment,
    CASE
      WHEN f.is_trigger_function THEN 'Trigger functions cannot be invoked as ordinary SQL functions; review public EXECUTE hygiene separately.'
      WHEN f.prosecdef THEN 'SECURITY DEFINER executes with owner rights; verify explicit grants and a fixed safe search_path.'
      WHEN r.role_name = 'authenticated' AND f.proname IN (
        'current_profile_id', 'current_app_role', 'has_app_role', 'is_admin_role',
        'is_staff_role', 'owns_commercial_record', 'set_current_user_as_commercial_owner'
      ) THEN 'The identity/RLS migrations explicitly grant this helper to authenticated.'
      ELSE 'Effective EXECUTE exists; verify that the function is read-only or enforces caller authorization.'
    END AS reason,
    (r.role_name <> 'service_role' AND f.prosecdef AND NOT f.is_trigger_function) AS blocking
  FROM roles r
  CROSS JOIN target_functions f
  WHERE r.role_exists
    AND coalesce(has_function_privilege(r.role_oid, f.function_oid, 'EXECUTE'), false)
),
schema_privilege_rows AS (
  SELECT
    'schema'::text AS object_type,
    n.nspname AS schema_name,
    n.nspname AS object_name,
    r.role_name AS grantee,
    p.privilege_type,
    'effective_schema_acl'::text AS source,
    NULL::boolean AS rls_enabled,
    NULL::text AS policy_name,
    NULL::text AS policy_command,
    CASE WHEN r.role_name <> 'service_role' AND p.privilege_type = 'CREATE' THEN 'DANGEROUS' ELSE 'EXPECTED' END AS assessment,
    CASE
      WHEN p.privilege_type = 'USAGE' THEN 'Schema USAGE only resolves permitted objects; it does not grant table rows.'
      WHEN r.role_name = 'service_role' THEN 'service_role may create server-managed objects during approved migrations.'
      ELSE 'Browser roles do not need CREATE on the public schema.'
    END AS reason,
    (r.role_name <> 'service_role' AND p.privilege_type = 'CREATE') AS blocking
  FROM roles r
  CROSS JOIN pg_namespace n
  CROSS JOIN (VALUES ('USAGE'), ('CREATE')) p(privilege_type)
  WHERE n.nspname = 'public' AND r.role_exists
    AND coalesce(has_schema_privilege(r.role_oid, n.oid, p.privilege_type), false)
),
missing_object_rows AS (
  SELECT
    'table'::text AS object_type,
    'public'::text AS schema_name,
    expected.object_name,
    r.role_name AS grantee,
    '<not checkable>'::text AS privilege_type,
    'catalog_inventory'::text AS source,
    NULL::boolean AS rls_enabled,
    NULL::text AS policy_name,
    NULL::text AS policy_command,
    'DANGEROUS'::text AS assessment,
    'Required target table is missing; effective access cannot be diagnosed.'::text AS reason,
    true AS blocking
  FROM roles r
  CROSS JOIN (VALUES ('leads'), ('customer_timeline_events')) expected(object_name)
  WHERE r.role_exists
    AND NOT EXISTS (SELECT 1 FROM target_tables t WHERE t.object_name = expected.object_name)
),
results AS (
  SELECT * FROM effective_table_privileges
  UNION ALL SELECT * FROM effective_column_privileges
  UNION ALL SELECT * FROM policy_rows
  UNION ALL SELECT * FROM effective_actions
  UNION ALL SELECT * FROM sequence_privilege_rows
  UNION ALL SELECT * FROM sequence_inventory_rows
  UNION ALL SELECT * FROM function_privilege_rows
  UNION ALL SELECT * FROM schema_privilege_rows
  UNION ALL SELECT * FROM missing_object_rows
)
SELECT
  object_type,
  schema_name,
  object_name,
  grantee,
  privilege_type,
  source,
  rls_enabled,
  policy_name,
  policy_command,
  assessment,
  reason,
  blocking
FROM results
ORDER BY
  CASE assessment WHEN 'DANGEROUS' THEN 1 WHEN 'REVIEW' THEN 2 ELSE 3 END,
  object_type,
  schema_name,
  object_name,
  grantee,
  privilege_type;

ROLLBACK;
