\set ON_ERROR_STOP on
begin read only;

with
wanted_relations(name) as (values
  ('leads'),('business_event_contracts'),('business_events'),('business_event_consumptions'),
  ('lead_intake_idempotency'),('lead_intake_abuse_requests')
),
lead_contract_columns(name,contract_group) as (values
  ('company','v2'),('name','v2'),('website_url','v2'),('source','v2'),
  ('normalized_domain','v2'),('branch','v2'),('region','v2'),
  ('converted_customer_id','v2'),('converted_at','v2'),
  ('company_name','legacy_alias'),('contact_name','legacy_alias'),('website','legacy_alias'),
  ('external_source','source_identity'),('external_source_id','source_identity')
),
relations as (
  select jsonb_agg(jsonb_build_object(
    'name',w.name,'present',c.oid is not null,'kind',c.relkind,
    'owner',pg_catalog.pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,
    'forceRls',c.relforcerowsecurity,
    'crudAcl',case when c.oid is null then '[]'::jsonb else (
      select coalesce(jsonb_agg(jsonb_build_object(
        'role',coalesce(r.rolname,'PUBLIC'),'privilege',a.privilege_type,'grantable',a.is_grantable
      ) order by coalesce(r.rolname,'PUBLIC'),a.privilege_type,a.is_grantable),'[]'::jsonb)
      from pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
      left join pg_catalog.pg_roles r on r.oid=a.grantee
      where a.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
    ) end
  ) order by w.name) value
  from wanted_relations w
  left join pg_catalog.pg_class c on c.relnamespace='public'::regnamespace and c.relname=w.name
),
columns as (
  select jsonb_agg(jsonb_build_object(
    'relation',c.relname,'name',a.attname,
    'contractGroup',case when c.relname='leads' then lc.contract_group else 'p0_owned_relation' end,
    'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
    'notNull',case when c.relname='leads' then null else a.attnotnull end,
    'identity',a.attidentity,'generated',a.attgenerated
  ) order by c.relname,a.attname) value
  from wanted_relations w
  join pg_catalog.pg_class c on c.relnamespace='public'::regnamespace and c.relname=w.name
  join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
  left join lead_contract_columns lc on c.relname='leads' and lc.name=a.attname
  where c.relname<>'leads' or lc.name is not null
),
constraints as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'relation',c.relname,'name',x.conname,'type',x.contype,'validated',x.convalidated,
    'semanticDigest',pg_catalog.md5(pg_catalog.regexp_replace(
      pg_catalog.pg_get_constraintdef(x.oid,false),'[[:space:]]+',' ','g'))
  ) order by c.relname,x.conname),'[]'::jsonb) value
  from wanted_relations w
  join pg_catalog.pg_class c on c.relnamespace='public'::regnamespace and c.relname=w.name
  join pg_catalog.pg_constraint x on x.conrelid=c.oid
  where c.relname<>'leads' or x.conname='leads_pkey'
),
indexes as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'relation',c.relname,'name',ic.relname,'unique',i.indisunique,
    'valid',i.indisvalid,'ready',i.indisready,
    'semanticDigest',pg_catalog.md5(pg_catalog.regexp_replace(
      pg_catalog.pg_get_indexdef(i.indexrelid),'[[:space:]]+',' ','g'))
  ) order by c.relname,ic.relname),'[]'::jsonb) value
  from wanted_relations w
  join pg_catalog.pg_class c on c.relnamespace='public'::regnamespace and c.relname=w.name
  join pg_catalog.pg_index i on i.indrelid=c.oid
  join pg_catalog.pg_class ic on ic.oid=i.indexrelid
  where c.relname<>'leads'
     or ic.relname in ('leads_pkey','leads_lower_email_idx','leads_normalized_company_region_idx')
),
lead_index_capabilities as (
  select jsonb_build_object(
    'externalSourceIdentityUnique',exists(
      select 1 from pg_catalog.pg_index i
      where i.indrelid='public.leads'::regclass and i.indisunique and i.indisvalid
        and pg_catalog.pg_get_indexdef(i.indexrelid) like '%(external_source, external_source_id)%'
    ),
    'normalizedCompanyLookup',exists(
      select 1 from pg_catalog.pg_index i
      where i.indrelid='public.leads'::regclass and i.indisvalid
        and pg_catalog.pg_get_indexdef(i.indexrelid) like '%(normalized_company_name)%'
    ),
    'normalizedDomainLookup',exists(
      select 1 from pg_catalog.pg_index i
      where i.indrelid='public.leads'::regclass and i.indisvalid
        and pg_catalog.pg_get_indexdef(i.indexrelid) like '%(normalized_domain)%'
    ),
    'normalizedPhoneLookup',exists(
      select 1 from pg_catalog.pg_index i
      where i.indrelid='public.leads'::regclass and i.indisvalid
        and pg_catalog.pg_get_indexdef(i.indexrelid) like '%(normalized_phone)%'
    )
  ) value
),
triggers as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'relation',c.relname,'name',t.tgname,'enabled',t.tgenabled,
    'typeBits',t.tgtype,'function',t.tgfoid::regprocedure::text
  ) order by c.relname,t.tgname),'[]'::jsonb) value
  from wanted_relations w
  join pg_catalog.pg_class c on c.relnamespace='public'::regnamespace and c.relname=w.name
  join pg_catalog.pg_trigger t on t.tgrelid=c.oid and not t.tgisinternal
  where c.relname<>'leads' or t.tgname='sync_lead_legacy_aliases_v1'
),
policies as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'relation',p.tablename,'name',p.policyname,'command',p.cmd,'permissive',p.permissive,
    'roles',(select jsonb_agg(role order by role) from pg_catalog.unnest(p.roles) role),
    'using',case when p.qual is null then null else pg_catalog.regexp_replace(p.qual,'[[:space:]]+',' ','g') end,
    'withCheck',case when p.with_check is null then null else pg_catalog.regexp_replace(p.with_check,'[[:space:]]+',' ','g') end
  ) order by p.tablename,p.policyname),'[]'::jsonb) value
  from pg_catalog.pg_policies p
  where p.schemaname='public' and p.tablename in (select name from wanted_relations)
),
functions as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'signature',p.oid::regprocedure::text,'owner',pg_catalog.pg_get_userbyid(p.proowner),
    'securityDefiner',p.prosecdef,'volatility',p.provolatile,'strict',p.proisstrict,
    'parallel',p.proparallel,
    'securityDefinerSearchPath',case when p.prosecdef then (
      select coalesce(jsonb_agg(pg_catalog.regexp_replace(setting,'[[:space:]]+','','g') order by setting),'[]'::jsonb)
      from pg_catalog.unnest(coalesce(p.proconfig,'{}'::text[])) setting
      where setting like 'search_path=%'
    ) else null end,
    'executeAcl',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'role',coalesce(r.rolname,'PUBLIC'),'grantable',a.is_grantable
      ) order by coalesce(r.rolname,'PUBLIC'),a.is_grantable),'[]'::jsonb)
      from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
      left join pg_catalog.pg_roles r on r.oid=a.grantee
      where a.privilege_type='EXECUTE'
    ),
    'bodyDigest',pg_catalog.md5(p.prosrc)
  ) order by p.oid::regprocedure::text),'[]'::jsonb) value
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace and n.nspname='public'
  where p.proname in (
    'assert_business_event_service_role','record_business_event','validate_lead_created_v1',
    'dispatch_business_event_payload_validation','dispatch_business_event_context_validation',
    'business_event_before_insert','prevent_business_event_mutation',
    'business_event_consumption_before_write','business_event_contract_before_write',
    'create_business_event_consumption','claim_business_event_consumption',
    'mark_business_event_consumption_running','mark_business_event_consumption_completed',
    'mark_business_event_consumption_failed','mark_business_event_consumption_dead_letter',
    'schedule_business_event_consumption_retry','release_business_event_consumption_retry',
    'recover_expired_business_event_consumption_claim','cancel_business_event_consumption',
    'mws_create_lead_transactional_v1','mws_get_lead_intake_result_v1',
    'mws_normalize_company_name','mws_normalize_domain','mws_normalize_phone',
    'mws_sync_lead_legacy_aliases_v1','mws_check_lead_intake_abuse_v1',
    'mws_cleanup_lead_intake_abuse_v1','current_app_role','current_profile_id',
    'has_app_role','is_admin_role','is_demo_context','is_demo_record','is_staff_role','owns_customer'
  )
),
event_contracts as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'eventType',event_type,'eventVersion',event_version,'lifecycleStatus',lifecycle_status,
    'allowedOwnerScopes',(select jsonb_agg(scope order by scope) from pg_catalog.unnest(allowed_owner_scopes) scope),
    'payloadSchema',payload_schema,'maxPayloadBytes',max_payload_bytes,
    'validatorKey',validator_key,'schemaChecksum',schema_checksum
  ) order by event_type,event_version),'[]'::jsonb) value
  from public.business_event_contracts
  where event_type='lead.created' and event_version=1
),
lead_policy_summary as (
  select jsonb_build_object(
    'count',count(*),
    'setDigest',pg_catalog.md5(pg_catalog.string_agg(
      pg_catalog.concat_ws('|',policyname,cmd,permissive,roles::text,qual,with_check),
      '||' order by policyname)),
    'salesManagerCommands',coalesce(jsonb_agg(cmd order by cmd)
      filter (where policyname like 'leads_sales_manager_%'),'[]'::jsonb)
  ) value
  from pg_catalog.pg_policies
  where schemaname='public' and tablename='leads'
),
data_invariants as (
  select jsonb_build_object(
    'supportedAliasConflicts',(select count(*) from public.leads where
      company is distinct from company_name or name is distinct from contact_name or website_url is distinct from website),
    'independentSourceDifferences',(select count(*) from public.leads where source is distinct from external_source),
    'idempotencyOrphanLeads',(select count(*) from public.lead_intake_idempotency i left join public.leads l on l.id=i.lead_id where i.lead_id is not null and l.id is null),
    'idempotencyOrphanEvents',(select count(*) from public.lead_intake_idempotency i left join public.business_events e on e.id=i.business_event_id where i.business_event_id is not null and e.id is null),
    'stagingNonceTablePresent',pg_catalog.to_regclass('public.p0_staging_smoke_nonces') is not null,
    'stagingNonceRpcPresent',pg_catalog.to_regprocedure('public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)') is not null
  ) value
),
body as (
  select jsonb_build_object(
    'schemaVersion',2,
    'artifact','P0_CONTRACT_SCOPED_CATALOG_FINGERPRINT',
    'relations',r.value,'columns',c.value,'constraints',x.value,'indexes',i.value,
    'leadIndexCapabilities',lic.value,'triggers',t.value,'policies',p.value,
    'leadPolicySummary',lps.value,'functions',f.value,'eventContracts',ec.value,
    'dataInvariants',d.value
  ) value
  from relations r cross join columns c cross join constraints x cross join indexes i
  cross join lead_index_capabilities lic cross join triggers t cross join policies p
  cross join lead_policy_summary lps cross join functions f cross join event_contracts ec
  cross join data_invariants d
)
select value || jsonb_build_object(
  'databaseMetadata',jsonb_build_object(
    'database',pg_catalog.current_database(),
    'transactionReadOnly',pg_catalog.current_setting('transaction_read_only'),
    'latestMigration',(select max(version) from supabase_migrations.schema_migrations)
  ),
  'sha256',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(value::text,'UTF8'),'sha256'),'hex')
) as p0_contract_scoped_catalog_fingerprint
from body;

rollback;
