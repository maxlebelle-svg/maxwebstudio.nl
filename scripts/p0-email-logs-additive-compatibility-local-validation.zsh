#!/bin/zsh
set -euo pipefail

repo_root=${0:A:h:h}
pg_bin=/Applications/Postgres.app/Contents/Versions/latest/bin
validation_root=$(mktemp -d /private/tmp/p0-email-logs-additive-compatibility.XXXXXXXX)
cluster_dir=$validation_root/postgres
socket_dir=$validation_root/socket
database=p0_email_logs_compatibility
export PGUSER=postgres
mkdir -p $socket_dir

cleanup() {
  if [[ -s $cluster_dir/postmaster.pid ]]; then
    $pg_bin/pg_ctl -D $cluster_dir -m fast stop >/dev/null 2>&1 || true
  fi
  rm -rf $validation_root
}
trap cleanup EXIT INT TERM

for key in SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF SUPABASE_DB_URL DATABASE_URL; do
  if [[ -n ${(P)key:-} ]]; then
    print -u2 "remote environment variable forbidden: $key"
    exit 1
  fi
done

$pg_bin/initdb -D $cluster_dir --username=postgres --no-locale --encoding=UTF8 --auth-host=reject --auth-local=trust >/dev/null
$pg_bin/pg_ctl -D $cluster_dir -o "-c listen_addresses='' -k $socket_dir" -w start >/dev/null
$pg_bin/createdb -h $socket_dir $database
$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/tests/fixtures/p0-email-logs-additive-compatibility-baseline.sql >/dev/null
$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 -c \
  "create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key); insert into supabase_migrations.schema_migrations values ('20260722135000');" >/dev/null

for clone in invalid_recipient unexpected_column row_drift; do
  $pg_bin/createdb -h $socket_dir -T $database ${database}_${clone}
done
$pg_bin/psql -h $socket_dir -d ${database}_invalid_recipient -v ON_ERROR_STOP=1 -c \
  "update public.email_logs set to_email='invalid-address' where id='00000000-0000-4000-8000-000000000001';" >/dev/null
$pg_bin/psql -h $socket_dir -d ${database}_unexpected_column -v ON_ERROR_STOP=1 -c \
  "alter table public.email_logs add column created_by text;" >/dev/null
$pg_bin/psql -h $socket_dir -d ${database}_row_drift -v ON_ERROR_STOP=1 -c \
  "delete from public.email_logs where id='00000000-0000-4000-8000-000000000056';" >/dev/null

negative_invalid_recipient=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d ${database}_invalid_recipient -v ON_ERROR_STOP=1 \
  -f $repo_root/docs/release-readiness/p0-email-logs-additive-compatibility/PRECONDITIONS.sql >/dev/null 2>&1; then
  negative_invalid_recipient=fail_closed
fi
negative_unexpected_column=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d ${database}_unexpected_column -v ON_ERROR_STOP=1 \
  -f $repo_root/supabase/migrations/20260722136000_p0_email_logs_additive_compatibility.sql >/dev/null 2>&1; then
  negative_unexpected_column=fail_closed
fi
negative_row_drift=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d ${database}_row_drift -v ON_ERROR_STOP=1 \
  -f $repo_root/supabase/migrations/20260722136000_p0_email_logs_additive_compatibility.sql >/dev/null 2>&1; then
  negative_row_drift=fail_closed
fi

legacy_content_digest_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg((to_jsonb(e)-'updated_at')::text,'|' order by id)) from public.email_logs e")
identity_created_digest_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(concat_ws('|',id::text,created_at::text),'|' order by id)) from public.email_logs")
updated_at_digest_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(updated_at::text,'|' order by id)) from public.email_logs")
acl_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(coalesce(array_to_string(relacl,','),'')) from pg_class where oid='public.email_logs'::regclass")
policy_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(coalesce(string_agg(concat_ws('|',polname,polcmd,polpermissive::text,polroles::text,regexp_replace(coalesce(pg_get_expr(polqual,polrelid),''),'[[:space:]]+',' ','g'),regexp_replace(coalesce(pg_get_expr(polwithcheck,polrelid),''),'[[:space:]]+',' ','g')),'||' order by polname),'')) from pg_policy where polrelid='public.email_logs'::regclass")
rls_before=$($pg_bin/psql -h $socket_dir -d $database -AtX -F '|' -c \
  "select relrowsecurity,relforcerowsecurity from pg_class where oid='public.email_logs'::regclass")
$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/docs/release-readiness/p0-email-logs-additive-compatibility/PRECONDITIONS.sql >/dev/null
$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/supabase/migrations/20260722136000_p0_email_logs_additive_compatibility.sql >/dev/null
$pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/docs/release-readiness/p0-email-logs-additive-compatibility/POSTCONDITIONS.sql >/dev/null

legacy_rows_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c "select count(*) from public.email_logs")
legacy_content_digest_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg((to_jsonb(e)-array['updated_at','created_by','idempotency_key','message_type','normalized_recipient_email'])::text,'|' order by id)) from public.email_logs e")
identity_created_digest_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(concat_ws('|',id::text,created_at::text),'|' order by id)) from public.email_logs")
updated_at_digest_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(string_agg(updated_at::text,'|' order by id)) from public.email_logs")
updated_at_state=$($pg_bin/psql -h $socket_dir -d $database -AtX -F '|' -c \
  "select count(distinct updated_at),count(*) filter(where updated_at<created_at),count(*) filter(where updated_at is null) from public.email_logs")
trigger_state=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select count(*) from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace where t.tgrelid='public.email_logs'::regclass and t.tgname='set_email_logs_updated_at' and not t.tgisinternal and n.nspname='public' and p.proname='set_updated_at'")
acl_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(coalesce(array_to_string(relacl,','),'')) from pg_class where oid='public.email_logs'::regclass")
policy_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select md5(coalesce(string_agg(concat_ws('|',polname,polcmd,polpermissive::text,polroles::text,regexp_replace(coalesce(pg_get_expr(polqual,polrelid),''),'[[:space:]]+',' ','g'),regexp_replace(coalesce(pg_get_expr(polwithcheck,polrelid),''),'[[:space:]]+',' ','g')),'||' order by polname),'')) from pg_policy where polrelid='public.email_logs'::regclass")
rls_after=$($pg_bin/psql -h $socket_dir -d $database -AtX -F '|' -c \
  "select relrowsecurity,relforcerowsecurity from pg_class where oid='public.email_logs'::regclass")

if [[ $legacy_rows_after != 56 || $legacy_content_digest_before != $legacy_content_digest_after \
  || $identity_created_digest_before != $identity_created_digest_after \
  || $updated_at_digest_before == $updated_at_digest_after || $updated_at_state != '1|0|0' || $trigger_state != 1 \
  || $acl_before != $acl_after || $policy_before != $policy_after || $rls_before != $rls_after ]]; then
  print -u2 "legacy content, trigger-driven timestamp, or security contract failed"
  exit 1
fi

runtime_insert=PASS
if ! $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 -c \
  "begin; insert into public.email_logs(direction,status,provider,to_email,subject,created_by,idempotency_key,message_type,normalized_recipient_email,metadata) values ('outbound','pending','resend','runtime@example.test','Runtime compatibility','mail_service',encode(extensions.digest(convert_to('runtime-insert-v1','UTF8'),'sha256'),'hex'),'generic','runtime@example.test','{}'); select 1/(case when count(*)=1 then 1 else 0 end) from public.email_logs where normalized_recipient_email='runtime@example.test' and created_by='mail_service' and message_type='generic'; rollback;" >/dev/null; then
  runtime_insert=FAIL
fi
runtime_insert_count=$($pg_bin/psql -h $socket_dir -d $database -AtX -c \
  "select count(*) from public.email_logs where normalized_recipient_email='runtime@example.test'")

negative_duplicate_key=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 -c \
  "insert into public.email_logs(to_email,subject,created_by,idempotency_key,message_type,normalized_recipient_email) select 'duplicate@example.test','Duplicate','mail_service',idempotency_key,'generic','duplicate@example.test' from public.email_logs order by id limit 1;" >/dev/null 2>&1; then
  negative_duplicate_key=fail_closed
fi
negative_missing_required=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 -c \
  "insert into public.email_logs(to_email,subject) values ('missing@example.test','Missing required');" >/dev/null 2>&1; then
  negative_missing_required=fail_closed
fi
second_run=unexpected_success
if ! $pg_bin/psql -h $socket_dir -d $database -v ON_ERROR_STOP=1 \
  -f $repo_root/supabase/migrations/20260722136000_p0_email_logs_additive_compatibility.sql >/dev/null 2>&1; then
  second_run=fail_closed
fi

if [[ $negative_invalid_recipient != fail_closed || $negative_unexpected_column != fail_closed \
  || $negative_row_drift != fail_closed || $negative_duplicate_key != fail_closed \
  || $negative_missing_required != fail_closed || $second_run != fail_closed \
  || $runtime_insert != PASS || $runtime_insert_count != 0 ]]; then
  print -u2 "negative or runtime compatibility contract failed"
  exit 1
fi

print -r -- "status=PASS"
print -r -- "database=isolated Unix-socket-only PostgreSQL cluster"
print -r -- "production_contact=false"
print -r -- "baseline_rows=56"
print -r -- "legacy_rows_preserved=$legacy_rows_after"
print -r -- "ids_created_at_preserved=true"
print -r -- "legacy_non_timestamp_content_preserved=true"
print -r -- "updated_at_effect=ACCEPTABLE_UPDATED_AT_MIGRATION_EFFECT"
print -r -- "updated_at_uniform=true"
print -r -- "updated_at_not_before_created_at=true"
print -r -- "updated_at_trigger_verified=true"
print -r -- "legacy_content_digest=$legacy_content_digest_after"
print -r -- "identity_created_digest=$identity_created_digest_after"
print -r -- "runtime_insert=$runtime_insert"
print -r -- "runtime_insert_rolled_back=true"
print -r -- "second_run=$second_run"
print -r -- "negative_invalid_recipient=$negative_invalid_recipient"
print -r -- "negative_duplicate_key=$negative_duplicate_key"
print -r -- "negative_missing_required=$negative_missing_required"
print -r -- "negative_unexpected_column=$negative_unexpected_column"
print -r -- "negative_row_drift=$negative_row_drift"
print -r -- "rls_preserved=true"
print -r -- "policy_digest_preserved=$policy_after"
print -r -- "acl_digest_preserved=$acl_after"
print -r -- "temporary_cluster_cleanup=EXIT trap"
