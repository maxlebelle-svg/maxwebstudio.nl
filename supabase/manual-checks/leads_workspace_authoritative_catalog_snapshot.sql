-- Max Webstudio - authoritative Leads Workspace production catalog snapshot
-- Run manually in the Supabase SQL Editor. Read-only; exactly one resultset.

BEGIN READ ONLY;

WITH
identity_context AS (
  SELECT
    current_database()::text AS database_name,
    current_user::text AS current_user_name,
    session_user::text AS session_user_name,
    current_role::text AS current_role_name,
    inet_server_addr()::text AS server_address,
    inet_server_port()::text AS server_port,
    current_setting('server_version')::text AS postgres_version,
    current_setting('transaction_read_only')::text AS transaction_read_only,
    current_setting('search_path')::text AS search_path,
    clock_timestamp() AT TIME ZONE 'UTC' AS captured_at_utc
),
target_tables(object_name) AS (
  VALUES ('leads'), ('customer_timeline_events')
),
target_functions(object_name, argument_types, signature) AS (
  VALUES
    ('current_profile_id', '', 'public.current_profile_id()'),
    ('current_app_role', '', 'public.current_app_role()'),
    ('has_app_role', 'text[]', 'public.has_app_role(text[])'),
    ('is_admin_role', '', 'public.is_admin_role()'),
    ('is_staff_role', '', 'public.is_staff_role()'),
    ('owns_commercial_record', 'uuid', 'public.owns_commercial_record(uuid)')
),
target_roles(role_name) AS (
  VALUES ('anon'), ('authenticated'), ('service_role')
),
table_privileges(privilege_name) AS (
  VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
),
schema_privileges(privilege_name) AS (
  VALUES ('USAGE'), ('CREATE')
),
public_namespace AS (
  SELECT n.oid, n.nspname, n.nspowner, n.nspacl
  FROM pg_namespace n
  WHERE n.nspname = 'public'
),
role_facts AS (
  SELECT tr.role_name, r.oid AS role_oid
  FROM target_roles tr
  LEFT JOIN pg_roles r ON r.rolname = tr.role_name
),
table_facts AS (
  SELECT
    tt.object_name,
    c.oid,
    c.relkind,
    c.relowner,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.reltuples,
    c.relacl,
    CASE WHEN has_schema_privilege('public', 'USAGE')
      THEN to_regclass(format('public.%I', tt.object_name))
      ELSE NULL::regclass
    END AS resolver_oid,
    has_schema_privilege('public', 'USAGE') AS schema_visible,
    CASE
      WHEN NOT has_schema_privilege('public', 'USAGE') THEN 'OBJECT_NOT_VISIBLE'
      WHEN c.oid IS NULL AND to_regclass(format('public.%I', tt.object_name)) IS NULL THEN 'OBJECT_ABSENT'
      WHEN c.oid IS NULL OR to_regclass(format('public.%I', tt.object_name)) IS DISTINCT FROM c.oid THEN 'CATALOG_INCONSISTENT'
      ELSE 'OBJECT_PRESENT'
    END AS visibility_status
  FROM target_tables tt
  LEFT JOIN public_namespace n ON true
  LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = tt.object_name
),
wrong_schema_tables AS (
  SELECT n.nspname AS schema_name, c.relname AS object_name, c.oid, c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN target_tables tt ON tt.object_name = c.relname
  WHERE n.nspname <> 'public'
    AND n.nspname NOT IN ('pg_catalog', 'information_schema')
),
function_facts AS (
  SELECT
    tf.object_name,
    tf.argument_types,
    tf.signature,
    p.oid,
    p.proowner,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    pg_get_function_identity_arguments(p.oid) AS catalog_identity_arguments,
    CASE WHEN has_schema_privilege('public', 'USAGE')
      THEN to_regprocedure(tf.signature)
      ELSE NULL::regprocedure
    END AS resolver_oid,
    CASE
      WHEN NOT has_schema_privilege('public', 'USAGE') THEN 'OBJECT_NOT_VISIBLE'
      WHEN p.oid IS NULL AND to_regprocedure(tf.signature) IS NULL THEN 'OBJECT_ABSENT'
      WHEN p.oid IS NULL OR to_regprocedure(tf.signature) IS DISTINCT FROM p.oid THEN 'CATALOG_INCONSISTENT'
      ELSE 'OBJECT_PRESENT'
    END AS visibility_status
  FROM target_functions tf
  LEFT JOIN public_namespace n ON true
  LEFT JOIN pg_proc p
    ON p.pronamespace = n.oid
   AND p.proname = tf.object_name
   AND oidvectortypes(p.proargtypes) = tf.argument_types
),
policy_facts AS (
  SELECT
    c.relname AS object_name,
    p.oid AS policy_oid,
    p.polname,
    p.polcmd,
    p.polpermissive,
    p.polroles,
    pg_get_expr(p.polqual, p.polrelid) AS using_expression,
    pg_get_expr(p.polwithcheck, p.polrelid) AS check_expression,
    pp.policyname AS view_policy_name,
    pp.cmd AS view_command,
    pp.roles::text AS view_roles,
    pp.qual AS view_using,
    pp.with_check AS view_check
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN target_tables tt ON tt.object_name = c.relname
  LEFT JOIN pg_policies pp
    ON pp.schemaname = n.nspname
   AND pp.tablename = c.relname
   AND pp.policyname = p.polname
),
table_acl AS (
  SELECT
    tf.object_name,
    acl.grantor,
    acl.grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM table_facts tf
  CROSS JOIN LATERAL aclexplode(coalesce(tf.relacl, acldefault('r', tf.relowner))) acl
  WHERE tf.oid IS NOT NULL
),
function_acl AS (
  SELECT
    ff.signature,
    acl.grantor,
    acl.grantee,
    acl.privilege_type,
    acl.is_grantable
  FROM function_facts ff
  CROSS JOIN LATERAL aclexplode(coalesce(ff.proacl, acldefault('f', ff.proowner))) acl
  WHERE ff.oid IS NOT NULL
),
schema_acl AS (
  SELECT acl.grantor, acl.grantee, acl.privilege_type, acl.is_grantable
  FROM public_namespace n
  CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) acl
),
information_schema_grants AS (
  SELECT table_name, grantee, privilege_type, is_grantable
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN (SELECT object_name FROM target_tables)
    AND grantee IN (SELECT role_name FROM target_roles)
),
migration_tables AS (
  SELECT n.nspname AS schema_name, c.relname AS object_name, c.oid
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm')
    AND (c.relname ILIKE '%migration%' OR n.nspname = 'supabase_migrations')
),
observations(category, schema_name, object_name, object_identity, attribute_name, attribute_value, source_catalog, visibility_status) AS (
  SELECT 'role', NULL, rf.role_name, rf.role_name, 'oid', coalesce(rf.role_oid::text, '<not visible>'),
         'pg_roles', CASE WHEN rf.role_oid IS NULL THEN 'ROLE_NOT_VISIBLE' ELSE 'OBJECT_PRESENT' END
  FROM role_facts rf

  UNION ALL
  SELECT 'table', 'public', tf.object_name, format('public.%I', tf.object_name), 'oid', coalesce(tf.oid::text, '<absent>'),
         'pg_class+pg_namespace+to_regclass', tf.visibility_status
  FROM table_facts tf

  UNION ALL
  SELECT 'table', 'public', tf.object_name, format('public.%I', tf.object_name), 'catalog_properties',
         CASE WHEN tf.oid IS NULL THEN '<unavailable>' ELSE concat_ws(';',
           'relkind=' || tf.relkind::text,
           'owner=' || pg_get_userbyid(tf.relowner),
           'rls=' || tf.relrowsecurity,
           'force_rls=' || tf.relforcerowsecurity,
           'row_estimate=' || tf.reltuples,
           'resolver_oid=' || coalesce(tf.resolver_oid::text, 'null')) END,
         'pg_class+pg_get_userbyid+to_regclass', tf.visibility_status
  FROM table_facts tf

  UNION ALL
  SELECT 'table_count', 'public', tf.object_name, format('public.%I', tf.object_name), 'exact_count',
         CASE
           WHEN tf.oid IS NULL THEN '<not counted: object absent>'
           WHEN tf.visibility_status <> 'OBJECT_PRESENT' THEN '<not counted: object not visible or inconsistent>'
           WHEN NOT has_table_privilege(tf.oid, 'SELECT') THEN '<not counted: current user lacks SELECT>'
           ELSE coalesce((xpath('/row/exact_count/text()', query_to_xml(
             format('SELECT count(*) AS exact_count FROM public.%I', tf.object_name), false, true, ''
           )))[1]::text, '0')
         END,
         'query_to_xml(SELECT count(*))', tf.visibility_status
  FROM table_facts tf

  UNION ALL
  SELECT 'wrong_schema_table', wt.schema_name, wt.object_name, wt.schema_name || '.' || wt.object_name, 'oid_relkind',
         wt.oid::text || ';' || wt.relkind::text, 'pg_class+pg_namespace', 'CATALOG_INCONSISTENT'
  FROM wrong_schema_tables wt

  UNION ALL
  SELECT 'policy', 'public', pf.object_name, pf.polname, 'definition',
         concat_ws(';',
           'oid=' || pf.policy_oid,
           'roles=' || array_to_string(ARRAY(SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END FROM unnest(pf.polroles) role_oid), ','),
           'command=' || CASE pf.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END,
           'mode=' || CASE WHEN pf.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
           'using=' || coalesce(pf.using_expression, '<none>'),
           'with_check=' || coalesce(pf.check_expression, '<none>')),
         'pg_policy+pg_get_expr', 'OBJECT_PRESENT'
  FROM policy_facts pf

  UNION ALL
  SELECT 'policy_comparison', 'public', pf.object_name, pf.polname, 'pg_policies_match',
         CASE WHEN pf.view_policy_name IS NULL THEN 'false' ELSE concat_ws(';', 'true', 'roles=' || pf.view_roles,
           'command=' || pf.view_command, 'using=' || coalesce(pf.view_using, '<none>'),
           'with_check=' || coalesce(pf.view_check, '<none>')) END,
         'pg_policies secondary comparison',
         CASE WHEN pf.view_policy_name IS NULL THEN 'CATALOG_INCONSISTENT' ELSE 'OBJECT_PRESENT' END
  FROM policy_facts pf

  UNION ALL
  SELECT 'function', 'public', ff.object_name, ff.signature, 'catalog_properties',
         CASE WHEN ff.oid IS NULL THEN '<unavailable>' ELSE concat_ws(';',
           'oid=' || ff.oid,
           'identity_arguments=' || ff.catalog_identity_arguments,
           'owner=' || pg_get_userbyid(ff.proowner),
           'security_definer=' || ff.prosecdef,
           'proconfig=' || coalesce(array_to_string(ff.proconfig, ','), '<none>'),
           'resolver_oid=' || coalesce(ff.resolver_oid::text, 'null'),
           'definition_md5=' || md5(pg_get_functiondef(ff.oid))) END,
         'pg_proc+pg_get_function_identity_arguments+pg_get_functiondef+to_regprocedure', ff.visibility_status
  FROM function_facts ff

  UNION ALL
  SELECT 'function_acl', 'public', split_part(fa.signature, '(', 1), fa.signature, fa.privilege_type,
         concat_ws(';',
           'grantee=' || CASE WHEN fa.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(fa.grantee) END,
           'grantor=' || pg_get_userbyid(fa.grantor),
           'grantable=' || fa.is_grantable),
         'pg_proc.proacl+aclexplode+pg_get_userbyid', 'OBJECT_PRESENT'
  FROM function_acl fa

  UNION ALL
  SELECT 'function_effective_execute', 'public', ff.object_name, ff.signature, rf.role_name,
         CASE WHEN rf.role_oid IS NULL OR ff.oid IS NULL THEN '<not checkable>' ELSE concat_ws(';',
           'effective=' || has_function_privilege(rf.role_oid, ff.oid, 'EXECUTE'),
           'source=' || CASE
             WHEN EXISTS (SELECT 1 FROM function_acl fa WHERE fa.signature = ff.signature AND fa.grantee = rf.role_oid AND fa.privilege_type = 'EXECUTE') THEN 'explicit'
             WHEN EXISTS (SELECT 1 FROM function_acl fa WHERE fa.signature = ff.signature AND fa.grantee = 0 AND fa.privilege_type = 'EXECUTE') THEN 'via_PUBLIC'
             WHEN has_function_privilege(rf.role_oid, ff.oid, 'EXECUTE') THEN 'via_role_membership_or_owner'
             ELSE 'none' END) END,
         'has_function_privilege+pg_proc.proacl+aclexplode',
         CASE WHEN rf.role_oid IS NULL THEN 'ROLE_NOT_VISIBLE' ELSE ff.visibility_status END
  FROM function_facts ff CROSS JOIN role_facts rf

  UNION ALL
  SELECT 'table_acl', 'public', ta.object_name, 'public.' || ta.object_name, ta.privilege_type,
         concat_ws(';',
           'grantee=' || CASE WHEN ta.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(ta.grantee) END,
           'grantor=' || pg_get_userbyid(ta.grantor),
           'grantable=' || ta.is_grantable),
         'pg_class.relacl+aclexplode+pg_get_userbyid', 'OBJECT_PRESENT'
  FROM table_acl ta

  UNION ALL
  SELECT 'table_effective_privilege', 'public', tf.object_name, 'public.' || tf.object_name,
         rf.role_name || ':' || tp.privilege_name,
         CASE WHEN rf.role_oid IS NULL OR tf.oid IS NULL THEN '<not checkable>' ELSE concat_ws(';',
           'effective=' || has_table_privilege(rf.role_oid, tf.oid, tp.privilege_name),
           'source=' || CASE
             WHEN EXISTS (SELECT 1 FROM table_acl ta WHERE ta.object_name = tf.object_name AND ta.grantee = rf.role_oid AND ta.privilege_type = tp.privilege_name) THEN 'explicit'
             WHEN EXISTS (SELECT 1 FROM table_acl ta WHERE ta.object_name = tf.object_name AND ta.grantee = 0 AND ta.privilege_type = tp.privilege_name) THEN 'via_PUBLIC'
             WHEN has_table_privilege(rf.role_oid, tf.oid, tp.privilege_name) THEN 'via_role_membership_or_owner'
             ELSE 'none' END) END,
         'has_table_privilege+pg_class.relacl+aclexplode',
         CASE WHEN rf.role_oid IS NULL THEN 'ROLE_NOT_VISIBLE' ELSE tf.visibility_status END
  FROM table_facts tf CROSS JOIN role_facts rf CROSS JOIN table_privileges tp

  UNION ALL
  SELECT 'table_grant_comparison', 'public', tf.object_name, 'public.' || tf.object_name,
         rf.role_name || ':' || tp.privilege_name,
         CASE WHEN EXISTS (
           SELECT 1 FROM information_schema_grants ig
           WHERE ig.table_name = tf.object_name AND ig.grantee = rf.role_name AND ig.privilege_type = tp.privilege_name
         ) THEN 'listed' ELSE 'not_listed' END,
         'information_schema.role_table_grants secondary comparison',
         CASE WHEN rf.role_oid IS NULL THEN 'ROLE_NOT_VISIBLE' ELSE tf.visibility_status END
  FROM table_facts tf CROSS JOIN role_facts rf CROSS JOIN table_privileges tp

  UNION ALL
  SELECT 'schema_acl', 'public', 'public', 'public', sa.privilege_type,
         concat_ws(';',
           'grantee=' || CASE WHEN sa.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(sa.grantee) END,
           'grantor=' || pg_get_userbyid(sa.grantor),
           'grantable=' || sa.is_grantable),
         'pg_namespace.nspacl+aclexplode+pg_get_userbyid', 'OBJECT_PRESENT'
  FROM schema_acl sa

  UNION ALL
  SELECT 'schema_effective_privilege', 'public', 'public', 'public', rf.role_name || ':' || sp.privilege_name,
         CASE WHEN rf.role_oid IS NULL OR pn.oid IS NULL THEN '<not checkable>' ELSE concat_ws(';',
           'effective=' || has_schema_privilege(rf.role_oid, pn.oid, sp.privilege_name),
           'source=' || CASE
             WHEN EXISTS (SELECT 1 FROM schema_acl sa WHERE sa.grantee = rf.role_oid AND sa.privilege_type = sp.privilege_name) THEN 'explicit'
             WHEN EXISTS (SELECT 1 FROM schema_acl sa WHERE sa.grantee = 0 AND sa.privilege_type = sp.privilege_name) THEN 'via_PUBLIC'
             WHEN has_schema_privilege(rf.role_oid, pn.oid, sp.privilege_name) THEN 'via_role_membership_or_owner'
             ELSE 'none' END) END,
         'has_schema_privilege+pg_namespace.nspacl+aclexplode',
         CASE WHEN rf.role_oid IS NULL THEN 'ROLE_NOT_VISIBLE' WHEN pn.oid IS NULL THEN 'OBJECT_ABSENT' ELSE 'OBJECT_PRESENT' END
  FROM role_facts rf CROSS JOIN schema_privileges sp LEFT JOIN public_namespace pn ON true

  UNION ALL
  SELECT 'migration_context', mt.schema_name, mt.object_name, mt.schema_name || '.' || mt.object_name,
         'oid', mt.oid::text, 'pg_class+pg_namespace', 'OBJECT_PRESENT'
  FROM migration_tables mt

  UNION ALL
  SELECT 'migration_context', 'supabase_migrations', 'schema_migrations', 'supabase_migrations.schema_migrations',
         'versions',
         CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN '<no usable migration history table visible>'
           ELSE coalesce((xpath('/row/versions/text()', query_to_xml(
             'SELECT string_agg(version::text, '','' ORDER BY version) AS versions FROM supabase_migrations.schema_migrations',
             false, true, ''
           )))[1]::text, '<empty>') END,
         'to_regclass+query_to_xml(SELECT version)',
         CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'OBJECT_NOT_VISIBLE' ELSE 'OBJECT_PRESENT' END
),
consistency AS (
  SELECT
    CASE
      WHEN EXISTS (SELECT 1 FROM role_facts WHERE role_oid IS NULL) THEN 'FAIL'
      WHEN EXISTS (SELECT 1 FROM table_facts WHERE visibility_status <> 'OBJECT_PRESENT') THEN 'FAIL'
      WHEN EXISTS (SELECT 1 FROM function_facts WHERE visibility_status <> 'OBJECT_PRESENT') THEN 'FAIL'
      WHEN EXISTS (SELECT 1 FROM policy_facts WHERE view_policy_name IS NULL) THEN 'FAIL'
      WHEN (SELECT count(*) FROM policy_facts) <> (
        SELECT count(*) FROM pg_policies
        WHERE schemaname = 'public' AND tablename IN (SELECT object_name FROM target_tables)
      ) THEN 'FAIL'
      WHEN (SELECT server_address FROM identity_context) IS NULL THEN 'WARN'
      ELSE 'PASS'
    END AS status
),
fingerprint AS (
  SELECT md5(concat_ws(E'\n',
    (SELECT concat_ws('|', database_name, current_user_name, session_user_name, current_role_name,
      coalesce(server_address, '<null>'), coalesce(server_port, '<null>'), postgres_version) FROM identity_context),
    (SELECT string_agg(object_name || ':' || coalesce(oid::text, '<null>'), ',' ORDER BY object_name) FROM table_facts),
    (SELECT string_agg(object_name || ':' || policy_oid || ':' || polname || ':' || polcmd::text || ':' || polpermissive || ':' ||
      array_to_string(polroles, ',') || ':' || coalesce(using_expression, '') || ':' || coalesce(check_expression, ''), ',' ORDER BY object_name, polname) FROM policy_facts),
    (SELECT string_agg(signature || ':' || coalesce(oid::text, '<null>'), ',' ORDER BY signature) FROM function_facts),
    (SELECT string_agg('table:' || object_name || ':' || grantor || ':' || grantee || ':' || privilege_type || ':' || is_grantable,
      ',' ORDER BY object_name, grantor, grantee, privilege_type) FROM table_acl),
    (SELECT string_agg('function:' || signature || ':' || grantor || ':' || grantee || ':' || privilege_type || ':' || is_grantable,
      ',' ORDER BY signature, grantor, grantee, privilege_type) FROM function_acl),
    (SELECT string_agg('schema:public:' || grantor || ':' || grantee || ':' || privilege_type || ':' || is_grantable,
      ',' ORDER BY grantor, grantee, privilege_type) FROM schema_acl)
  )) AS snapshot_hash
),
final_observations AS (
  SELECT * FROM observations
  UNION ALL
  SELECT 'identity_summary', NULL, current_database(), current_database(), 'catalog_fingerprint_md5',
         (SELECT snapshot_hash FROM fingerprint),
         'database identity+target OIDs+policy set+function OIDs+ACL set',
         CASE WHEN (SELECT status FROM consistency) = 'FAIL' THEN 'CATALOG_INCONSISTENT' ELSE 'OBJECT_PRESENT' END
  UNION ALL
  SELECT 'overall_catalog_consistency', NULL, current_database(), current_database(), 'status',
         (SELECT status FROM consistency),
         'cross-catalog consistency rules',
         CASE (SELECT status FROM consistency)
           WHEN 'PASS' THEN 'OBJECT_PRESENT'
           WHEN 'WARN' THEN 'OBJECT_NOT_VISIBLE'
           ELSE 'CATALOG_INCONSISTENT' END
)
SELECT
  i.database_name,
  i.current_user_name,
  i.session_user_name,
  i.current_role_name,
  i.server_address,
  i.server_port,
  i.postgres_version,
  i.transaction_read_only,
  i.search_path,
  i.captured_at_utc,
  o.category,
  o.schema_name,
  o.object_name,
  o.object_identity,
  o.attribute_name,
  o.attribute_value,
  o.source_catalog,
  o.visibility_status
FROM final_observations o
CROSS JOIN identity_context i
ORDER BY
  CASE o.category WHEN 'identity_summary' THEN 98 WHEN 'overall_catalog_consistency' THEN 99 ELSE 0 END,
  o.category, o.schema_name NULLS FIRST, o.object_name, o.object_identity, o.attribute_name;

ROLLBACK;
