-- Max Webstudio - migration 026 production postcheck for project yxxahurphdbblkuxoeje.
-- Run manually after only 026_sales_workspace_normalized_fields.sql. Read-only; one resultset.

BEGIN READ ONLY;

WITH
relations AS MATERIALIZED (
  SELECT to_regclass('public.leads') AS leads_oid,
         to_regclass('public.customer_timeline_events') AS timeline_oid,
         to_regclass('auth.users') AS users_oid,
         to_regclass('supabase_migrations.schema_migrations') AS history_oid
),
expected_workspace_columns(column_name, udt_name, is_nullable, default_expression) AS (
  VALUES
    ('pipeline_stage', 'text', 'NO', '''new''::text'),
    ('interest_level', 'text', 'NO', '''unsure''::text'),
    ('priority', 'text', 'NO', '''normal''::text'),
    ('is_favorite', 'bool', 'NO', 'false'),
    ('next_action_completed_at', 'timestamptz', 'YES', NULL),
    ('next_action_completed_by', 'uuid', 'YES', NULL),
    ('archived_at', 'timestamptz', 'YES', NULL)
),
expected_workspace_constraints(constraint_name, constraint_type, normalized_definition) AS (
  VALUES
    ('leads_pipeline_stage_check', 'c', 'check(pipeline_stage=any(array[''new''::text,''contacted''::text,''interested''::text,''demo_planned''::text,''demo_in_progress''::text,''demo_sent''::text,''awaiting_feedback''::text,''approved''::text,''awaiting_payment''::text,''customer''::text,''closed''::text]))'),
    ('leads_interest_level_check', 'c', 'check(interest_level=any(array[''hot''::text,''interested''::text,''unsure''::text,''not_interested''::text]))'),
    ('leads_priority_check', 'c', 'check(priority=any(array[''high''::text,''normal''::text,''low''::text]))'),
    ('leads_next_action_completed_by_fkey', 'f', 'foreignkey(next_action_completed_by)referencesauth.users(id)ondeletesetnull')
),
expected_workspace_indexes(index_name, normalized_definition) AS (
  VALUES
    ('leads_pipeline_stage_updated_idx', 'createindexleads_pipeline_stage_updated_idxonpublic.leadsusingbtree(pipeline_stage,updated_atdesc)'),
    ('leads_interest_priority_idx', 'createindexleads_interest_priority_idxonpublic.leadsusingbtree(interest_level,priority)'),
    ('leads_open_next_action_idx', 'createindexleads_open_next_action_idxonpublic.leadsusingbtree(next_action_at,priority)where((next_action_atisnotnull)and(next_action_completed_atisnull))'),
    ('leads_active_owner_idx', 'createindexleads_active_owner_idxonpublic.leadsusingbtree(assigned_user_id,pipeline_stage,updated_atdesc)where(archived_atisnull)'),
    ('customer_timeline_events_lead_idempotency_uidx', 'createuniqueindexcustomer_timeline_events_lead_idempotency_uidxonpublic.customer_timeline_eventsusingbtree(lead_id,((metadata->>''idempotencykey''::text)))where((lead_idisnotnull)and(nullif((metadata->>''idempotencykey''::text),''''::text)isnotnull))')
),
expected_prerequisite_columns(column_name, udt_name) AS (
  VALUES
    ('assigned_user_id','uuid'),('assigned_at','timestamptz'),('assigned_by','uuid'),
    ('last_contacted_at','timestamptz'),('last_contacted_by','uuid'),('last_call_outcome','text'),
    ('next_action_type','text'),('next_action_at','timestamptz'),('next_action_note','text'),
    ('next_action_assigned_user_id','uuid'),('next_action_created_automatically','bool'),
    ('appointment_at','timestamptz'),('appointment_type','text'),('appointment_location','text'),
    ('won_at','timestamptz'),('won_by','uuid'),('lost_at','timestamptz'),('lost_by','uuid'),
    ('lost_reason','text'),('lost_note','text'),('acquisition_channel','text'),
    ('sourced_by_user_id','uuid'),('closed_by_user_id','uuid')
),
expected_prerequisite_checks(constraint_name) AS (
  VALUES ('leads_lead_status_check'),('leads_last_call_outcome_check'),
         ('leads_next_action_type_check'),('leads_acquisition_channel_check')
),
expected_prerequisite_fk_columns(column_name) AS (
  VALUES ('owner_id'),('created_by'),('assigned_to'),('assigned_user_id'),('assigned_by'),
         ('last_contacted_by'),('next_action_assigned_user_id'),('won_by'),('lost_by'),
         ('sourced_by_user_id'),('closed_by_user_id')
),
expected_prerequisite_indexes(index_name) AS (
  VALUES ('leads_assigned_user_id_idx'),('leads_last_contacted_at_idx'),
         ('leads_last_call_outcome_idx'),('leads_next_action_at_idx'),
         ('leads_next_action_assigned_user_id_idx'),('leads_acquisition_channel_idx'),
         ('leads_sourced_by_user_id_idx'),('leads_closed_by_user_id_idx')
),
expected_policies(table_name, policy_name, command_name) AS (
  VALUES
    ('customer_timeline_events','customer_timeline_events_service_role_all','ALL'),
    ('leads','leads_admin_manage','ALL'),
    ('leads','leads_sales_manager_read_update','ALL'),
    ('leads','leads_sales_partner_insert_own','INSERT'),
    ('leads','leads_sales_partner_select_own','SELECT'),
    ('leads','leads_sales_partner_update_own','UPDATE')
),
expected_policy_fingerprint(fingerprint) AS (
  -- Copied from the authoritative prerequisite-postcheck export; do not update on drift.
  VALUES ('7286fe06b77a30efeacbb3eeb4894648')
),
helper_functions(signature) AS (
  VALUES ('public.current_app_role()'),('public.current_profile_id()'),
         ('public.has_app_role(text[])'),('public.is_admin_role()'),
         ('public.is_staff_role()'),('public.owns_commercial_record(uuid)')
),
browser_roles(role_name) AS (VALUES ('anon'),('authenticated')),
forbidden_privileges(privilege_name) AS (VALUES ('TRUNCATE'),('REFERENCES'),('TRIGGER')),
target_tables(table_name) AS (VALUES ('public.leads'),('public.customer_timeline_events')),
lead_source AS MATERIALIZED (
  SELECT CASE WHEN leads_oid IS NULL THEN xmlparse(document '<root/>') ELSE
    xmlparse(document '<root>' || xmlserialize(content query_to_xml(
      'SELECT to_jsonb(l)::text AS row_data FROM public.leads l', false, true, '') AS text) || '</root>')
  END AS rows_xml FROM relations
),
lead_rows AS MATERIALIZED (
  SELECT xmlserialize(content item AS text)::jsonb AS row_data
  FROM lead_source CROSS JOIN LATERAL unnest(xpath('/root/row/row_data/text()', rows_xml)) item
),
user_source AS MATERIALIZED (
  SELECT CASE WHEN users_oid IS NULL THEN xmlparse(document '<root/>') ELSE
    xmlparse(document '<root>' || xmlserialize(content query_to_xml(
      'SELECT id::text AS user_id FROM auth.users', false, true, '') AS text) || '</root>')
  END AS rows_xml FROM relations
),
user_ids AS MATERIALIZED (
  SELECT xmlserialize(content item AS text) AS user_id
  FROM user_source CROSS JOIN LATERAL unnest(xpath('/root/row/user_id/text()', rows_xml)) item
),
timeline_source AS MATERIALIZED (
  SELECT CASE WHEN timeline_oid IS NULL THEN xmlparse(document '<root/>') ELSE
    xmlparse(document '<root>' || xmlserialize(content query_to_xml(
      'SELECT to_jsonb(e)::text AS row_data FROM public.customer_timeline_events e', false, true, '') AS text) || '</root>')
  END AS rows_xml FROM relations
),
timeline_rows AS MATERIALIZED (
  SELECT xmlserialize(content item AS text)::jsonb AS row_data
  FROM timeline_source CROSS JOIN LATERAL unnest(xpath('/root/row/row_data/text()', rows_xml)) item
),
workspace_column_actual AS MATERIALIZED (
  SELECT e.column_name,e.udt_name,e.is_nullable AS expected_nullable,e.default_expression,
         c.is_nullable AS actual_nullable,
         pg_get_expr(d.adbin,d.adrelid) AS actual_default,
         c.udt_name AS actual_type
  FROM expected_workspace_columns e
  LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='leads' AND c.column_name=e.column_name
  LEFT JOIN pg_class cl ON cl.oid=to_regclass('public.leads')
  LEFT JOIN pg_attribute a ON a.attrelid=cl.oid AND a.attname=e.column_name AND NOT a.attisdropped
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
),
workspace_column_findings AS (
  SELECT count(*)::bigint AS finding_count,
    coalesce(string_agg(column_name || ':type=' || coalesce(actual_type,'missing') || '/' || udt_name ||
      ':nullable=' || coalesce(actual_nullable,'missing') || '/' || expected_nullable ||
      ':default=' || coalesce(actual_default,'NULL') || '/' || coalesce(default_expression,'NULL'), ', ' ORDER BY column_name),'none') AS details
  FROM workspace_column_actual
  WHERE actual_type IS DISTINCT FROM udt_name OR actual_nullable IS DISTINCT FROM expected_nullable
     OR actual_default IS DISTINCT FROM default_expression
),
workspace_data_findings AS MATERIALIZED (
  SELECT
    count(*) FILTER (WHERE row_data->>'pipeline_stage' IS NULL)::bigint AS pipeline_nulls,
    count(*) FILTER (WHERE row_data->>'interest_level' IS NULL)::bigint AS interest_nulls,
    count(*) FILTER (WHERE row_data->>'priority' IS NULL)::bigint AS priority_nulls,
    count(*) FILTER (WHERE row_data->>'is_favorite' IS NULL)::bigint AS favorite_nulls,
    count(*) FILTER (WHERE nullif(row_data->>'pipeline_stage','') IS NOT NULL AND row_data->>'pipeline_stage' NOT IN
      ('new','contacted','interested','demo_planned','demo_in_progress','demo_sent','awaiting_feedback','approved','awaiting_payment','customer','closed'))::bigint AS invalid_pipeline,
    count(*) FILTER (WHERE nullif(row_data->>'interest_level','') IS NOT NULL AND row_data->>'interest_level' NOT IN
      ('hot','interested','unsure','not_interested'))::bigint AS invalid_interest,
    count(*) FILTER (WHERE nullif(row_data->>'priority','') IS NOT NULL AND row_data->>'priority' NOT IN ('high','normal','low'))::bigint AS invalid_priority,
    count(*) FILTER (WHERE nullif(row_data->>'next_action_completed_by','') IS NOT NULL AND
      row_data->>'next_action_completed_by' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')::bigint AS invalid_uuid,
    count(*) FILTER (WHERE
      (nullif(row_data#>>'{metadata,pipelineStage}','') IS NOT NULL AND lower(btrim(row_data#>>'{metadata,pipelineStage}')) NOT IN
        ('new','contacted','interested','demo_planned','demo_in_progress','demo_sent','awaiting_feedback','approved','awaiting_payment','customer','closed')) OR
      (nullif(row_data#>>'{metadata,interestLevel}','') IS NOT NULL AND lower(btrim(row_data#>>'{metadata,interestLevel}')) NOT IN
        ('hot','interested','unsure','not_interested')) OR
      (nullif(row_data#>>'{metadata,priority}','') IS NOT NULL AND lower(btrim(row_data#>>'{metadata,priority}')) NOT IN ('high','normal','low'))
    )::bigint AS invalid_metadata
  FROM lead_rows
),
workspace_orphans AS (
  SELECT count(*)::bigint AS finding_count,
    coalesce(string_agg((row_data->>'id') || '=' || (row_data->>'next_action_completed_by'), ', ' ORDER BY row_data->>'id'),'none') AS details
  FROM lead_rows
  WHERE nullif(row_data->>'next_action_completed_by','') IS NOT NULL
    AND row_data->>'next_action_completed_by' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND NOT EXISTS (SELECT 1 FROM user_ids u WHERE u.user_id=row_data->>'next_action_completed_by')
),
workspace_constraint_actual AS MATERIALIZED (
  SELECT e.*, c.oid, c.convalidated,
    regexp_replace(lower(pg_get_constraintdef(c.oid,true)),'\s+','','g') AS actual_definition
  FROM expected_workspace_constraints e
  LEFT JOIN pg_constraint c ON c.conrelid=(SELECT leads_oid FROM relations)
    AND c.conname=e.constraint_name AND c.contype=e.constraint_type::"char"
),
workspace_constraint_findings AS (
  SELECT count(*)::bigint AS finding_count,
    coalesce(string_agg(constraint_name || ':actual=' || coalesce(actual_definition,'missing') || ':expected=' || normalized_definition,
      ', ' ORDER BY constraint_name),'none') AS details
  FROM workspace_constraint_actual
  WHERE oid IS NULL OR actual_definition IS DISTINCT FROM normalized_definition
),
workspace_unvalidated_constraints AS (
  SELECT count(*)::bigint AS finding_count,
    coalesce(string_agg(constraint_name, ', ' ORDER BY constraint_name),'none') AS details
  FROM workspace_constraint_actual WHERE oid IS NULL OR NOT convalidated
),
semantic_duplicate_constraints AS MATERIALIZED (
  SELECT e.constraint_name AS expected_name, other.conname AS duplicate_name
  FROM workspace_constraint_actual e
  JOIN pg_constraint canonical ON canonical.oid=e.oid
  JOIN pg_constraint other ON other.conrelid=canonical.conrelid AND other.oid<>canonical.oid AND other.contype=canonical.contype
    AND (
      (canonical.contype='c' AND regexp_replace(lower(pg_get_expr(other.conbin,other.conrelid)),'\s+','','g')=
        regexp_replace(lower(pg_get_expr(canonical.conbin,canonical.conrelid)),'\s+','','g'))
      OR
      (canonical.contype='f' AND other.conkey=canonical.conkey AND other.confrelid=canonical.confrelid
        AND other.confkey=canonical.confkey AND other.confdeltype=canonical.confdeltype)
    )
),
workspace_index_actual AS MATERIALIZED (
  SELECT e.*, i.indexrelid, i.indisvalid, i.indisready,
    regexp_replace(lower(pg_get_indexdef(i.indexrelid)),'\s+','','g') AS actual_definition
  FROM expected_workspace_indexes e
  LEFT JOIN pg_class idx ON idx.relnamespace='public'::regnamespace AND idx.relname=e.index_name
  LEFT JOIN pg_index i ON i.indexrelid=idx.oid
),
workspace_index_findings AS (
  SELECT count(*)::bigint AS finding_count,
    coalesce(string_agg(index_name || ':actual=' || coalesce(actual_definition,'missing') || ':expected=' || normalized_definition,
      '; ' ORDER BY index_name),'none') AS details
  FROM workspace_index_actual WHERE indexrelid IS NULL OR actual_definition IS DISTINCT FROM normalized_definition
),
workspace_invalid_indexes AS (
  SELECT count(*)::bigint AS finding_count,
    coalesce(string_agg(index_name, ', ' ORDER BY index_name),'none') AS details
  FROM workspace_index_actual WHERE indexrelid IS NULL OR NOT indisvalid OR NOT indisready
),
semantic_duplicate_indexes AS MATERIALIZED (
  SELECT expected.index_name AS expected_name, duplicate_index.relname AS duplicate_name
  FROM workspace_index_actual expected
  JOIN pg_index canonical ON canonical.indexrelid=expected.indexrelid
  JOIN pg_index duplicate ON duplicate.indrelid=canonical.indrelid AND duplicate.indexrelid<>canonical.indexrelid
    AND duplicate.indisunique=canonical.indisunique AND duplicate.indisprimary=canonical.indisprimary
    AND duplicate.indnkeyatts=canonical.indnkeyatts AND duplicate.indnatts=canonical.indnatts
    AND duplicate.indkey=canonical.indkey AND duplicate.indclass=canonical.indclass
    AND duplicate.indcollation=canonical.indcollation AND duplicate.indoption=canonical.indoption
    AND coalesce(pg_get_expr(duplicate.indexprs,duplicate.indrelid),'')=coalesce(pg_get_expr(canonical.indexprs,canonical.indrelid),'')
    AND coalesce(pg_get_expr(duplicate.indpred,duplicate.indrelid),'')=coalesce(pg_get_expr(canonical.indpred,canonical.indrelid),'')
  JOIN pg_class duplicate_index ON duplicate_index.oid=duplicate.indexrelid
),
timeline_facts AS MATERIALIZED (
  SELECT count(*)::bigint AS row_count,
    count(*) FILTER (WHERE nullif(row_data#>>'{metadata,idempotencyKey}','') IS NULL)::bigint AS null_or_empty_keys
  FROM timeline_rows
),
timeline_duplicates AS (
  SELECT count(*)::bigint AS finding_count,
    coalesce(string_agg(lead_id || ':' || idempotency_key || '=' || duplicate_count, ', ' ORDER BY lead_id,idempotency_key),'none') AS details
  FROM (
    SELECT row_data->>'lead_id' AS lead_id, row_data#>>'{metadata,idempotencyKey}' AS idempotency_key, count(*)::text AS duplicate_count
    FROM timeline_rows
    WHERE nullif(row_data->>'lead_id','') IS NOT NULL AND nullif(row_data#>>'{metadata,idempotencyKey}','') IS NOT NULL
    GROUP BY row_data->>'lead_id',row_data#>>'{metadata,idempotencyKey}' HAVING count(*)>1
  ) duplicates
),
policy_actual AS MATERIALIZED (
  SELECT tablename AS table_name,policyname AS policy_name,cmd AS command_name,roles::text AS roles,
         coalesce(qual,'') AS using_expression,coalesce(with_check,'') AS check_expression
  FROM pg_policies WHERE schemaname='public' AND tablename IN ('leads','customer_timeline_events')
),
policy_contract AS MATERIALIZED (
  SELECT
    (SELECT count(*) FROM expected_policies e WHERE NOT EXISTS (SELECT 1 FROM policy_actual a
      WHERE (a.table_name,a.policy_name,a.command_name)=(e.table_name,e.policy_name,e.command_name)))+
    (SELECT count(*) FROM policy_actual a WHERE NOT EXISTS (SELECT 1 FROM expected_policies e
      WHERE (e.table_name,e.policy_name,e.command_name)=(a.table_name,a.policy_name,a.command_name))) AS shape_findings,
    md5(coalesce(string_agg(concat_ws('|',table_name,policy_name,command_name,roles,using_expression,check_expression),E'\n'
      ORDER BY table_name,policy_name,command_name),'')) AS fingerprint
  FROM policy_actual
),
function_facts AS MATERIALIZED (
  SELECT h.signature,p.oid,p.prosecdef,
    EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,array[]::text[])) setting
      WHERE replace(setting,' ','') IN ('search_path=public','search_path=public,pg_temp')) AS safe_search_path,
    CASE WHEN p.oid IS NULL OR to_regrole('anon') IS NULL THEN false ELSE has_function_privilege(to_regrole('anon'),p.oid,'EXECUTE') END AS anon_execute,
    CASE WHEN p.oid IS NULL OR to_regrole('authenticated') IS NULL THEN false ELSE has_function_privilege(to_regrole('authenticated'),p.oid,'EXECUTE') END AS authenticated_execute,
    CASE WHEN p.oid IS NULL OR to_regrole('service_role') IS NULL THEN false ELSE has_function_privilege(to_regrole('service_role'),p.oid,'EXECUTE') END AS service_role_execute,
    EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute
  FROM helper_functions h LEFT JOIN pg_proc p ON p.oid=to_regprocedure(h.signature)
),
prerequisite_column_findings AS (
  SELECT count(*)::bigint AS finding_count,coalesce(string_agg(e.column_name,', ' ORDER BY e.column_name),'none') AS details
  FROM expected_prerequisite_columns e LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name='leads' AND c.column_name=e.column_name AND c.udt_name=e.udt_name
  WHERE c.column_name IS NULL
),
prerequisite_constraint_findings AS (
  SELECT count(*)::bigint AS finding_count,coalesce(string_agg(finding,', ' ORDER BY finding),'none') AS details FROM (
    SELECT e.constraint_name AS finding FROM expected_prerequisite_checks e
    WHERE NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conrelid=(SELECT leads_oid FROM relations)
      AND c.conname=e.constraint_name AND c.contype='c' AND c.convalidated)
    UNION ALL
    SELECT e.column_name || ':auth_fk' FROM expected_prerequisite_fk_columns e
    LEFT JOIN pg_attribute a ON a.attrelid=(SELECT leads_oid FROM relations) AND a.attname=e.column_name AND NOT a.attisdropped
    WHERE a.attnum IS NULL OR NOT EXISTS (SELECT 1 FROM pg_constraint c
      WHERE c.conrelid=(SELECT leads_oid FROM relations) AND c.confrelid=(SELECT users_oid FROM relations)
        AND c.contype='f' AND c.convalidated AND c.confdeltype='n' AND c.conkey=ARRAY[a.attnum]::smallint[])
  ) findings
),
prerequisite_index_findings AS (
  SELECT count(*)::bigint AS finding_count,coalesce(string_agg(e.index_name,', ' ORDER BY e.index_name),'none') AS details
  FROM expected_prerequisite_indexes e WHERE NOT EXISTS (SELECT 1 FROM pg_class idx JOIN pg_index i ON i.indexrelid=idx.oid
    WHERE idx.relnamespace='public'::regnamespace AND idx.relname=e.index_name AND i.indisvalid AND i.indisready)
),
history_status AS MATERIALIZED (
  SELECT history_oid IS NOT NULL AS table_visible,
    CASE WHEN history_oid IS NULL THEN false ELSE coalesce((xpath('/row/applied/text()',query_to_xml(
      'SELECT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text IN (''026'',''026_sales_workspace_normalized_fields'') OR version::text LIKE ''%026_sales_workspace_normalized_fields%'')::text AS applied',
      false,true,'')))[1]::text::boolean,false) END AS applied
  FROM relations
),
checks(check_order,check_name,status,finding_count,details,blocking) AS MATERIALIZED (
  SELECT 10,'database_identity',CASE WHEN current_database()='postgres' AND current_setting('transaction_read_only')='on' THEN 'PASS' ELSE 'FAIL' END,
    (current_database()<>'postgres')::int+(current_setting('transaction_read_only')<>'on')::int,
    'projectref=yxxahurphdbblkuxoeje(must_be_visible_in_SQL_Editor); database='||current_database()||'; current_user='||current_user||'; session_user='||session_user||'; current_role='||current_role||'; read_only='||current_setting('transaction_read_only'),true
  UNION ALL SELECT 20,'target_tables_exist',CASE WHEN leads_oid IS NOT NULL AND timeline_oid IS NOT NULL AND users_oid IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
    (leads_oid IS NULL)::int+(timeline_oid IS NULL)::int+(users_oid IS NULL)::int,'leads='||(leads_oid IS NOT NULL)||'; timeline='||(timeline_oid IS NOT NULL)||'; auth.users='||(users_oid IS NOT NULL),true FROM relations
  UNION ALL SELECT 30,'authoritative_row_counts',CASE WHEN (SELECT count(*) FROM lead_rows)=12 AND row_count=37 THEN 'PASS' ELSE 'FAIL' END,
    abs((SELECT count(*) FROM lead_rows)-12)::bigint+abs(row_count-37),'leads='||(SELECT count(*) FROM lead_rows)||'/12; timeline='||row_count||'/37',true FROM timeline_facts
  UNION ALL SELECT 40,'workspace_columns_exact',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM workspace_column_findings
  UNION ALL SELECT 50,'workspace_backfill_not_null',CASE WHEN pipeline_nulls+interest_nulls+priority_nulls+favorite_nulls=0 THEN 'PASS' ELSE 'FAIL' END,
    pipeline_nulls+interest_nulls+priority_nulls+favorite_nulls,'pipeline='||pipeline_nulls||'; interest='||interest_nulls||'; priority='||priority_nulls||'; favorite='||favorite_nulls,true FROM workspace_data_findings
  UNION ALL SELECT 60,'workspace_allowed_values',CASE WHEN invalid_pipeline+invalid_interest+invalid_priority=0 THEN 'PASS' ELSE 'FAIL' END,
    invalid_pipeline+invalid_interest+invalid_priority,'pipeline='||invalid_pipeline||'; interest='||invalid_interest||'; priority='||invalid_priority,true FROM workspace_data_findings
  UNION ALL SELECT 70,'next_action_completed_by_uuid',CASE WHEN invalid_uuid=0 THEN 'PASS' ELSE 'FAIL' END,invalid_uuid,'invalid_uuid='||invalid_uuid,true FROM workspace_data_findings
  UNION ALL SELECT 80,'next_action_completed_by_orphans',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM workspace_orphans
  UNION ALL SELECT 90,'workspace_metadata_values',CASE WHEN invalid_metadata=0 THEN 'PASS' ELSE 'FAIL' END,invalid_metadata,'invalid_metadata='||invalid_metadata,true FROM workspace_data_findings
  UNION ALL SELECT 100,'workspace_constraints_exact',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM workspace_constraint_findings
  UNION ALL SELECT 110,'workspace_constraints_validated',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM workspace_unvalidated_constraints
  UNION ALL SELECT 120,'semantic_duplicate_constraints',CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,count(*)::bigint,
    coalesce(string_agg(expected_name||'='||duplicate_name,', ' ORDER BY expected_name,duplicate_name),'none'),true FROM semantic_duplicate_constraints
  UNION ALL SELECT 130,'workspace_indexes_exact',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM workspace_index_findings
  UNION ALL SELECT 140,'workspace_indexes_valid',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM workspace_invalid_indexes
  UNION ALL SELECT 150,'semantic_duplicate_indexes',CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,count(*)::bigint,
    coalesce(string_agg(expected_name||'='||duplicate_name,', ' ORDER BY expected_name,duplicate_name),'none'),true FROM semantic_duplicate_indexes
  UNION ALL SELECT 160,'timeline_idempotency_duplicates',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM timeline_duplicates
  UNION ALL SELECT 170,'timeline_index_scope',CASE WHEN indexrelid IS NOT NULL AND actual_definition=normalized_definition AND indisvalid AND indisready THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN indexrelid IS NOT NULL AND actual_definition=normalized_definition AND indisvalid AND indisready THEN 0 ELSE 1 END,
    'null_or_empty_keys='||(SELECT null_or_empty_keys FROM timeline_facts)||'; actual='||coalesce(actual_definition,'missing')||'; expected='||normalized_definition,true
    FROM workspace_index_actual WHERE index_name='customer_timeline_events_lead_idempotency_uidx'
  UNION ALL SELECT 180,'target_rls_enabled',CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,count(*)::bigint,
    coalesce(string_agg(table_name,', ' ORDER BY table_name),'none'),true FROM target_tables t LEFT JOIN pg_class c ON c.oid=to_regclass(t.table_name) WHERE c.oid IS NULL OR NOT c.relrowsecurity
  UNION ALL SELECT 190,'policy_fingerprint_unchanged',CASE WHEN shape_findings=0 AND fingerprint=(SELECT fingerprint FROM expected_policy_fingerprint) THEN 'PASS' ELSE 'FAIL' END,
    shape_findings+(fingerprint<>(SELECT fingerprint FROM expected_policy_fingerprint))::int,'actual='||fingerprint||'; expected='||(SELECT fingerprint FROM expected_policy_fingerprint),true FROM policy_contract
  UNION ALL SELECT 200,'browser_dangerous_privileges_absent',CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,count(*)::bigint,
    coalesce(string_agg(finding,', ' ORDER BY finding),'none'),true FROM (
      SELECT r.role_name||':'||t.table_name||':'||p.privilege_name AS finding FROM browser_roles r CROSS JOIN target_tables t CROSS JOIN forbidden_privileges p
      WHERE to_regrole(r.role_name) IS NULL OR to_regclass(t.table_name) IS NULL OR has_table_privilege(to_regrole(r.role_name),to_regclass(t.table_name),p.privilege_name)
      UNION ALL SELECT role_name||':public:CREATE' FROM browser_roles WHERE to_regrole(role_name) IS NULL OR has_schema_privilege(role_name,'public','CREATE')
    ) findings
  UNION ALL SELECT 210,'helper_security_and_execute_acl',CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,count(*)::bigint,
    coalesce(string_agg(signature,', ' ORDER BY signature),'none'),true FROM function_facts
    WHERE oid IS NULL OR NOT prosecdef OR NOT safe_search_path OR anon_execute OR public_execute OR NOT authenticated_execute OR NOT service_role_execute
  UNION ALL SELECT 220,'application_table_privileges',CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END,count(*)::bigint,
    coalesce(string_agg(finding,', ' ORDER BY finding),'none'),true FROM (
      SELECT 'authenticated:leads:'||privilege_name AS finding FROM (VALUES ('SELECT'),('INSERT'),('UPDATE')) p(privilege_name)
      WHERE to_regrole('authenticated') IS NULL OR (SELECT leads_oid FROM relations) IS NULL OR NOT has_table_privilege(to_regrole('authenticated'),(SELECT leads_oid FROM relations),privilege_name)
      UNION ALL SELECT 'service_role:'||table_name||':'||privilege_name FROM (VALUES
        ('public.leads','SELECT'),('public.leads','INSERT'),('public.leads','UPDATE'),
        ('public.customer_timeline_events','SELECT'),('public.customer_timeline_events','INSERT'),('public.customer_timeline_events','UPDATE'),('public.customer_timeline_events','DELETE')
      ) p(table_name,privilege_name) WHERE to_regrole('service_role') IS NULL OR to_regclass(table_name) IS NULL OR NOT has_table_privilege(to_regrole('service_role'),to_regclass(table_name),privilege_name)
    ) findings
  UNION ALL SELECT 230,'prerequisite_columns_preserved',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM prerequisite_column_findings
  UNION ALL SELECT 240,'prerequisite_constraints_preserved',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM prerequisite_constraint_findings
  UNION ALL SELECT 250,'prerequisite_indexes_preserved',CASE WHEN finding_count=0 THEN 'PASS' ELSE 'FAIL' END,finding_count,details,true FROM prerequisite_index_findings
  UNION ALL SELECT 260,'backend_workspace_schema_contract',CASE WHEN (SELECT finding_count FROM workspace_column_findings)=0 AND count(*)=0 THEN 'PASS' ELSE 'FAIL' END,
    (SELECT finding_count FROM workspace_column_findings)+count(*)::bigint,'seven columns exact; missing service_role privilege='||coalesce(string_agg(privilege_name,', ' ORDER BY privilege_name),'none'),true
    FROM (VALUES ('SELECT'),('INSERT'),('UPDATE')) p(privilege_name)
    WHERE to_regrole('service_role') IS NULL OR (SELECT leads_oid FROM relations) IS NULL OR NOT has_table_privilege(to_regrole('service_role'),(SELECT leads_oid FROM relations),privilege_name)
  UNION ALL SELECT 270,'migration_history_status',CASE WHEN applied THEN 'PASS' ELSE 'WARN' END,CASE WHEN applied THEN 0 ELSE 1 END,
    'history_table_visible='||table_visible||'; version_026='||applied||'; manual SQL Editor execution is not auto-registered; no history write is performed',false FROM history_status
),
overall AS (
  SELECT 999 AS check_order,'overall_readiness'::text AS check_name,
    CASE WHEN count(*) FILTER (WHERE status='FAIL' AND blocking)=0 THEN 'PASS' ELSE 'FAIL' END::text AS status,
    count(*) FILTER (WHERE status='FAIL' AND blocking)::bigint AS finding_count,
    'blocking_failures='||count(*) FILTER (WHERE status='FAIL' AND blocking)||'; warnings='||count(*) FILTER (WHERE status='WARN')||'; failed_checks='||
      coalesce(string_agg(check_name,', ' ORDER BY check_order) FILTER (WHERE status='FAIL' AND blocking),'none') AS details,true AS blocking
  FROM checks
)
SELECT check_name,status,finding_count,details,blocking
FROM (SELECT * FROM checks UNION ALL SELECT * FROM overall) exportable_postcheck
ORDER BY check_order;

ROLLBACK;
