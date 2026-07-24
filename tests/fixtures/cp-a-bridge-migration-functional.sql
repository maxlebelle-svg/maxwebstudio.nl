do $test$
declare
  expected_columns text[] := array[
    'customer_id','project_id','website_id','title','customer_summary','change_summary',
    'safe_preview_path','published_to_portal','published_at','published_by','review_deadline',
    'allow_feedback','allow_approval','notify_customer','status','feedback_items','approved_at',
    'approved_by_auth_user_id','approval_metadata','metadata','updated_at'
  ];
  expected_constraints text[] := array[
    'website_preview_versions_customer_id_fkey',
    'website_preview_versions_project_id_fkey',
    'website_preview_versions_website_id_fkey',
    'website_preview_versions_published_by_fkey',
    'website_preview_versions_approved_by_auth_user_id_fkey',
    'website_preview_versions_status_portal_check'
  ];
  expected_indexes text[] := array[
    'website_preview_versions_customer_id_idx',
    'website_preview_versions_project_id_idx',
    'website_preview_versions_website_id_idx',
    'website_preview_versions_published_to_portal_idx',
    'website_preview_versions_published_at_idx',
    'website_preview_versions_customer_portal_published_idx',
    'website_preview_versions_website_version_idx',
    'website_preview_versions_project_portal_idx'
  ];
begin
  if (
    select count(*)
    from pg_attribute
    where attrelid = 'public.website_preview_versions'::regclass
      and attname = any(expected_columns)
      and attnum > 0
      and not attisdropped
  ) <> cardinality(expected_columns) then
    raise exception 'bridge did not create the complete column contract';
  end if;

  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.website_preview_versions'::regclass
      and attname = any(expected_columns)
      and attnum > 0
      and not attisdropped
      and attnotnull
  ) then
    raise exception 'bridge made a portal-review column NOT NULL';
  end if;

  if (select count(*) from public.website_preview_versions) <> 2
     or (select count(*) from public.website_preview_versions where customer_id is null) <> 2 then
    raise exception 'legacy preview rows were changed or guessed';
  end if;

  if (
    select count(*)
    from pg_constraint
    where conrelid = 'public.website_preview_versions'::regclass
      and conname = any(expected_constraints)
      and convalidated
  ) <> cardinality(expected_constraints) then
    raise exception 'bridge constraint contract is incomplete or unvalidated';
  end if;

  if (
    select count(*)
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'website_preview_versions'
      and indexname = any(expected_indexes)
  ) <> cardinality(expected_indexes) then
    raise exception 'bridge index contract is incomplete';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.website_preview_versions'::regclass) then
    raise exception 'RLS was disabled';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'website_preview_versions'
      and policyname = 'website_preview_versions_no_direct_client_access'
  ) <> 1 then
    raise exception 'existing deny policy was changed';
  end if;

  if has_table_privilege('anon','public.website_preview_versions','insert')
     or has_table_privilege('authenticated','public.website_preview_versions','insert') then
    raise exception 'bridge introduced direct client write grants';
  end if;

  if exists (
    select 1 from public.website_preview_versions p
    where p.customer_id is not null
      and not exists (select 1 from public.customers c where c.id = p.customer_id)
  ) then
    raise exception 'bridge left customer orphans';
  end if;
end;
$test$;

