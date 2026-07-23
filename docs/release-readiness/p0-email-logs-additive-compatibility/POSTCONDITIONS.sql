\set ON_ERROR_STOP on

do $postconditions$
declare
  row_count bigint;
  distinct_id_count bigint;
  invalid_count bigint;
  duplicate_count bigint;
  distinct_updated_at_count bigint;
  invalid_updated_at_count bigint;
  trigger_count bigint;
begin
  select count(*), count(distinct id),
         count(*) filter(where created_by is null or nullif(btrim(created_by),'') is null or idempotency_key !~ '^[0-9a-f]{64}$' or message_type is null or nullif(btrim(message_type),'') is null or normalized_recipient_email is distinct from lower(btrim(to_email)) or normalized_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
         count(*)-count(distinct idempotency_key), count(distinct updated_at),
         count(*) filter(where updated_at is null or created_at is null or updated_at < created_at)
    into row_count,distinct_id_count,invalid_count,duplicate_count,distinct_updated_at_count,invalid_updated_at_count
  from public.email_logs;
  if row_count <> 56 or invalid_count <> 0 or duplicate_count <> 0 then raise exception 'email_logs data postcondition failed'; end if;
  if distinct_id_count <> row_count then raise exception 'email_logs ID preservation failed'; end if;
  if distinct_updated_at_count <> 1 or invalid_updated_at_count <> 0 then raise exception 'email_logs trigger-driven updated_at effect is partial or invalid'; end if;
  select count(*) into trigger_count
  from pg_trigger t join pg_proc p on p.oid=t.tgfoid join pg_namespace n on n.oid=p.pronamespace
  where t.tgrelid='public.email_logs'::regclass and t.tgname='set_email_logs_updated_at'
    and not t.tgisinternal and n.nspname='public' and p.proname='set_updated_at';
  if trigger_count <> 1 then raise exception 'email_logs updated_at trigger contract failed'; end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='email_logs' and column_name in ('created_by','idempotency_key','message_type','normalized_recipient_email') and is_nullable='NO') <> 4 then raise exception 'email_logs column contract failed'; end if;
  if (select count(*) from pg_policy where polrelid='public.email_logs'::regclass) <> 1 then raise exception 'email_logs policy count changed'; end if;
  if not (select relrowsecurity and not relforcerowsecurity from pg_class where oid='public.email_logs'::regclass) then raise exception 'email_logs RLS changed'; end if;
end
$postconditions$;

select jsonb_build_object(
  'status','PASS',
  'rows',(select count(*) from public.email_logs),
  'distinctIds',(select count(distinct id) from public.email_logs),
  'createdAtNulls',(select count(*) from public.email_logs where created_at is null),
  'updatedAtClassification','ACCEPTABLE_UPDATED_AT_MIGRATION_EFFECT',
  'distinctUpdatedAtValues',(select count(distinct updated_at) from public.email_logs),
  'updatedAtBeforeCreatedAt',(select count(*) from public.email_logs where updated_at < created_at),
  'nullRequiredValues',(select count(*) from public.email_logs where created_by is null or idempotency_key is null or message_type is null or normalized_recipient_email is null),
  'duplicateIdempotencyKeys',(select count(*)-count(distinct idempotency_key) from public.email_logs),
  'policyDigest',(select md5(coalesce(string_agg(concat_ws('|',polname,polcmd,polpermissive::text,polroles::text,regexp_replace(coalesce(pg_get_expr(polqual,polrelid),''),'[[:space:]]+',' ','g'),regexp_replace(coalesce(pg_get_expr(polwithcheck,polrelid),''),'[[:space:]]+',' ','g')),'||' order by polname),'')) from pg_policy where polrelid='public.email_logs'::regclass),
  'aclDigest',(select md5(coalesce(array_to_string(relacl,','),'')) from pg_class where oid='public.email_logs'::regclass)
) as p0_email_logs_postconditions;
