\set ON_ERROR_STOP on
-- The external gate must first prove projectref yxxahurphdbblkuxoeje.
begin read only;
with identity_body as (
  select pg_catalog.jsonb_build_object(
    'database',pg_catalog.current_database(),
    'serverVersionNum',pg_catalog.current_setting('server_version_num'),
    'systemIdentifier',(pg_catalog.pg_control_system()).system_identifier::text
  ) value
), history_body as (
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'version',version,'name',name,
    'statementDigest',pg_catalog.md5(coalesce(pg_catalog.array_to_string(statements,E'\n'),''))
  ) order by version),'[]'::jsonb) value
  from supabase_migrations.schema_migrations
)
select pg_catalog.jsonb_build_object(
  'serverDatabaseIdentitySha256',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(i.value::text,'UTF8'),'sha256'),'hex'),
  'migrationHistorySha256',pg_catalog.encode(extensions.digest(pg_catalog.convert_to(h.value::text,'UTF8'),'sha256'),'hex'),
  'latestMigration',(select max(version) from supabase_migrations.schema_migrations),
  'transactionReadOnly',pg_catalog.current_setting('transaction_read_only')
) as target_and_history_evidence
from identity_body i cross join history_body h;
rollback;
