-- P0 email log additive compatibility correction.
-- This migration changes audit storage only; it never calls an email provider.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preconditions$
declare
  expected_columns constant text[] := array[
    'id','created_at','updated_at','direction','status','provider',
    'provider_message_id','from_email','from_name','to_email','to_name',
    'reply_to','subject','html_body','text_body','template_key','template_name',
    'customer_id','lead_id','invoice_id','project_id','triggered_by',
    'triggered_by_user_id','error_message','error_code','metadata'
  ];
  target_columns constant text[] := array[
    'created_by','idempotency_key','message_type','normalized_recipient_email'
  ];
  actual_columns text[];
  row_count bigint;
  distinct_id_count bigint;
  invalid_recipient_count bigint;
  legacy_key_count bigint;
  policy_digest text;
  acl_digest text;
  rls_enabled boolean;
  force_rls boolean;
begin
  if to_regclass('public.email_logs') is null then
    raise exception using errcode = 'P0001', message = 'P0 email_logs precondition failed: table is absent.';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception using errcode = 'P0001', message = 'P0 email_logs precondition failed: pgcrypto digest is absent.';
  end if;

  select array_agg(a.attname order by a.attnum)
    into actual_columns
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.email_logs'::regclass
    and a.attnum > 0 and not a.attisdropped;

  if actual_columns is distinct from expected_columns then
    raise exception using errcode = 'P0001', message = 'P0 email_logs precondition failed: unexpected column prestate.';
  end if;
  if actual_columns && target_columns then
    raise exception using errcode = 'P0001', message = 'P0 email_logs precondition failed: compatibility column already exists.';
  end if;

  select count(*), count(distinct id),
         count(*) filter (
           where nullif(pg_catalog.btrim(to_email), '') is null
              or lower(pg_catalog.btrim(to_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
         ),
         count(distinct pg_catalog.encode(extensions.digest(
           pg_catalog.convert_to('legacy-email-log:' || id::text, 'UTF8'), 'sha256'
         ), 'hex'))
    into row_count, distinct_id_count, invalid_recipient_count, legacy_key_count
  from public.email_logs;

  if row_count <> 56 or distinct_id_count <> row_count then
    raise exception using errcode = 'P0001', message = 'P0 email_logs precondition failed: row count or ID uniqueness drift.';
  end if;
  if invalid_recipient_count <> 0 or legacy_key_count <> row_count then
    raise exception using errcode = 'P0001', message = 'P0 email_logs precondition failed: recipient normalization or legacy-key backfill is unsafe.';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity,
         pg_catalog.md5(coalesce(pg_catalog.array_to_string(c.relacl, ','), ''))
    into rls_enabled, force_rls, acl_digest
  from pg_catalog.pg_class c
  where c.oid = 'public.email_logs'::regclass;

  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           concat_ws('|', p.polname, p.polcmd, p.polpermissive::text, p.polroles::text,
             pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g'),
             pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g')),
           '||' order by p.polname), ''))
    into policy_digest
  from pg_catalog.pg_policy p
  where p.polrelid = 'public.email_logs'::regclass;

  if not rls_enabled or force_rls or acl_digest <> 'a5706ca697ace8a5f132a909777e5f0d'
     or policy_digest <> 'f4729e986679877c0a53bd65c8e1b76f' then
    raise exception using errcode = 'P0001', message = 'P0 email_logs precondition failed: RLS, ACL or policy prestate drift.';
  end if;
end
$preconditions$;

lock table public.email_logs in share row exclusive mode;

alter table public.email_logs
  add column created_by text,
  add column idempotency_key text,
  add column message_type text,
  add column normalized_recipient_email text;

update public.email_logs
set created_by = coalesce(nullif(pg_catalog.btrim(triggered_by), ''), 'legacy_mail_service'),
    idempotency_key = pg_catalog.encode(extensions.digest(
      pg_catalog.convert_to('legacy-email-log:' || id::text, 'UTF8'), 'sha256'
    ), 'hex'),
    message_type = 'generic',
    normalized_recipient_email = lower(pg_catalog.btrim(to_email));

alter table public.email_logs
  alter column created_by set default 'mail_service',
  alter column created_by set not null,
  alter column idempotency_key set not null,
  alter column message_type set default 'generic',
  alter column message_type set not null,
  alter column normalized_recipient_email set not null,
  add constraint email_logs_created_by_nonempty_check
    check (nullif(pg_catalog.btrim(created_by), '') is not null),
  add constraint email_logs_idempotency_key_check
    check (idempotency_key ~ '^[0-9a-f]{64}$'),
  add constraint email_logs_idempotency_key_unique unique (idempotency_key),
  add constraint email_logs_message_type_nonempty_check
    check (nullif(pg_catalog.btrim(message_type), '') is not null),
  add constraint email_logs_normalized_recipient_email_check
    check (
      normalized_recipient_email = lower(pg_catalog.btrim(to_email))
      and normalized_recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    );

create index email_logs_normalized_recipient_email_idx
  on public.email_logs (normalized_recipient_email);

do $postconditions$
declare
  row_count bigint;
  invalid_count bigint;
  duplicate_key_count bigint;
  policy_digest text;
  acl_digest text;
begin
  select count(*),
         count(*) filter (
           where created_by is null or idempotency_key is null or message_type is null
              or normalized_recipient_email is null
              or normalized_recipient_email is distinct from lower(pg_catalog.btrim(to_email))
         ),
         count(*) - count(distinct idempotency_key)
    into row_count, invalid_count, duplicate_key_count
  from public.email_logs;

  if row_count <> 56 or invalid_count <> 0 or duplicate_key_count <> 0 then
    raise exception using errcode = 'P0001', message = 'P0 email_logs postcondition failed: backfill is incomplete.';
  end if;

  select pg_catalog.md5(coalesce(pg_catalog.array_to_string(c.relacl, ','), ''))
    into acl_digest
  from pg_catalog.pg_class c where c.oid = 'public.email_logs'::regclass;
  select pg_catalog.md5(coalesce(pg_catalog.string_agg(
           concat_ws('|', p.polname, p.polcmd, p.polpermissive::text, p.polroles::text,
             pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polqual,p.polrelid),''),'[[:space:]]+',' ','g'),
             pg_catalog.regexp_replace(coalesce(pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid),''),'[[:space:]]+',' ','g')),
           '||' order by p.polname), ''))
    into policy_digest
  from pg_catalog.pg_policy p where p.polrelid = 'public.email_logs'::regclass;

  if acl_digest <> 'a5706ca697ace8a5f132a909777e5f0d'
     or policy_digest <> 'f4729e986679877c0a53bd65c8e1b76f' then
    raise exception using errcode = 'P0001', message = 'P0 email_logs postcondition failed: ACL or policy changed.';
  end if;
end
$postconditions$;

commit;
