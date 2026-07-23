\set ON_ERROR_STOP on

do $preconditions$
declare
  actual_columns text[];
  row_count bigint;
  invalid_recipient_count bigint;
  policy_digest text;
  acl_digest text;
begin
  if to_regclass('public.email_logs') is null then
    raise exception 'email_logs is absent';
  end if;
  select array_agg(attname order by attnum) into actual_columns
  from pg_catalog.pg_attribute
  where attrelid='public.email_logs'::regclass and attnum>0 and not attisdropped;
  if actual_columns is distinct from array[
    'id','created_at','updated_at','direction','status','provider','provider_message_id',
    'from_email','from_name','to_email','to_name','reply_to','subject','html_body',
    'text_body','template_key','template_name','customer_id','lead_id','invoice_id',
    'project_id','triggered_by','triggered_by_user_id','error_message','error_code','metadata'
  ]::text[] then raise exception 'unexpected email_logs columns'; end if;
  select count(*), count(*) filter(where nullif(btrim(to_email),'') is null or lower(btrim(to_email)) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
    into row_count, invalid_recipient_count from public.email_logs;
  if row_count <> 56 or invalid_recipient_count <> 0 then raise exception 'unsafe legacy rows'; end if;
  select md5(coalesce(array_to_string(relacl,','),'')) into acl_digest from pg_class where oid='public.email_logs'::regclass;
  select md5(coalesce(string_agg(concat_ws('|',polname,polcmd,polpermissive::text,polroles::text,regexp_replace(coalesce(pg_get_expr(polqual,polrelid),''),'[[:space:]]+',' ','g'),regexp_replace(coalesce(pg_get_expr(polwithcheck,polrelid),''),'[[:space:]]+',' ','g')),'||' order by polname),'')) into policy_digest from pg_policy where polrelid='public.email_logs'::regclass;
  if not (select relrowsecurity and not relforcerowsecurity from pg_class where oid='public.email_logs'::regclass)
     or acl_digest <> 'a5706ca697ace8a5f132a909777e5f0d'
     or policy_digest <> 'f4729e986679877c0a53bd65c8e1b76f' then
    raise exception 'email_logs security prestate drift';
  end if;
end
$preconditions$;

select jsonb_build_object(
  'status','PASS',
  'table','public.email_logs',
  'rows',(select count(*) from public.email_logs),
  'targetColumnsAbsent',(
    select count(*)=0 from information_schema.columns
    where table_schema='public' and table_name='email_logs'
      and column_name in ('created_by','idempotency_key','message_type','normalized_recipient_email')
  ),
  'latestMigration',(select max(version) from supabase_migrations.schema_migrations)
) as p0_email_logs_preconditions;
