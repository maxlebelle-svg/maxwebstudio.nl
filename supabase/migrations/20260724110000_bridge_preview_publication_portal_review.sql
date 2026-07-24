-- CP-A bridge: materialize the portal-review schema after Website Factory exists.
-- Forward-only. Existing preview rows remain untouched; unprovable ownership stays NULL.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  relation_name text;
  id_type text;
  spec record;
  actual_type text;
  actual_not_null boolean;
  actual_default text;
begin
  foreach relation_name in array array[
    'public.website_preview_versions',
    'public.customers',
    'public.projects',
    'public.websites',
    'public.profiles',
    'auth.users'
  ] loop
    if to_regclass(relation_name) is null then
      raise exception 'CP-A bridge dependency is missing: %', relation_name
        using errcode = '42P01';
    end if;
  end loop;

  for relation_name in
    select unnest(array['public.customers','public.projects','public.websites','public.profiles','auth.users'])
  loop
    select format_type(a.atttypid, a.atttypmod)
    into id_type
    from pg_attribute a
    where a.attrelid = to_regclass(relation_name)
      and a.attname = 'id'
      and a.attnum > 0
      and not a.attisdropped;
    if id_type is distinct from 'uuid' then
      raise exception 'CP-A bridge requires %.id to be uuid; found %', relation_name, coalesce(id_type, '<missing>')
        using errcode = '42804';
    end if;
  end loop;

  for spec in
    select *
    from (values
      ('customer_id','uuid',false,null::text),
      ('project_id','uuid',false,null::text),
      ('website_id','uuid',false,null::text),
      ('title','text',false,'''Website-preview''::text'),
      ('customer_summary','text',false,null::text),
      ('change_summary','text',false,null::text),
      ('safe_preview_path','text',false,null::text),
      ('published_to_portal','boolean',false,'false'),
      ('published_at','timestamp with time zone',false,null::text),
      ('published_by','uuid',false,null::text),
      ('review_deadline','timestamp with time zone',false,null::text),
      ('allow_feedback','boolean',false,'true'),
      ('allow_approval','boolean',false,'true'),
      ('notify_customer','boolean',false,'false'),
      ('status','text',false,'''internal''::text'),
      ('feedback_items','jsonb',false,'''[]''::jsonb'),
      ('approved_at','timestamp with time zone',false,null::text),
      ('approved_by_auth_user_id','uuid',false,null::text),
      ('approval_metadata','jsonb',false,'''{}''::jsonb'),
      ('metadata','jsonb',false,'''{}''::jsonb'),
      ('updated_at','timestamp with time zone',false,'now()')
    ) as expected(column_name, data_type, not_null, default_expression)
  loop
    select
      format_type(a.atttypid, a.atttypmod),
      a.attnotnull,
      pg_get_expr(d.adbin, d.adrelid)
    into actual_type, actual_not_null, actual_default
    from pg_attribute a
    left join pg_attrdef d
      on d.adrelid = a.attrelid
     and d.adnum = a.attnum
    where a.attrelid = 'public.website_preview_versions'::regclass
      and a.attname = spec.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if found and (
      actual_type is distinct from spec.data_type
      or actual_not_null is distinct from spec.not_null
      or actual_default is distinct from spec.default_expression
    ) then
      raise exception
        'CP-A bridge incompatible column %. Expected type %, not_null %, default %; found type %, not_null %, default %',
        spec.column_name, spec.data_type, spec.not_null, spec.default_expression,
        actual_type, actual_not_null, actual_default
        using errcode = '42804';
    end if;
  end loop;
end;
$preflight$;

alter table public.website_preview_versions
  add column if not exists customer_id uuid null,
  add column if not exists project_id uuid null,
  add column if not exists website_id uuid null,
  add column if not exists title text null default 'Website-preview',
  add column if not exists customer_summary text null,
  add column if not exists change_summary text null,
  add column if not exists safe_preview_path text null,
  add column if not exists published_to_portal boolean null default false,
  add column if not exists published_at timestamptz null,
  add column if not exists published_by uuid null,
  add column if not exists review_deadline timestamptz null,
  add column if not exists allow_feedback boolean null default true,
  add column if not exists allow_approval boolean null default true,
  add column if not exists notify_customer boolean null default false,
  add column if not exists status text null default 'internal',
  add column if not exists feedback_items jsonb null default '[]'::jsonb,
  add column if not exists approved_at timestamptz null,
  add column if not exists approved_by_auth_user_id uuid null,
  add column if not exists approval_metadata jsonb null default '{}'::jsonb,
  add column if not exists metadata jsonb null default '{}'::jsonb,
  add column if not exists updated_at timestamptz null default now();

do $column_postcondition$
declare
  spec record;
  actual_type text;
  actual_not_null boolean;
  actual_default text;
begin
  for spec in
    select *
    from (values
      ('customer_id','uuid',false,null::text),
      ('project_id','uuid',false,null::text),
      ('website_id','uuid',false,null::text),
      ('title','text',false,'''Website-preview''::text'),
      ('customer_summary','text',false,null::text),
      ('change_summary','text',false,null::text),
      ('safe_preview_path','text',false,null::text),
      ('published_to_portal','boolean',false,'false'),
      ('published_at','timestamp with time zone',false,null::text),
      ('published_by','uuid',false,null::text),
      ('review_deadline','timestamp with time zone',false,null::text),
      ('allow_feedback','boolean',false,'true'),
      ('allow_approval','boolean',false,'true'),
      ('notify_customer','boolean',false,'false'),
      ('status','text',false,'''internal''::text'),
      ('feedback_items','jsonb',false,'''[]''::jsonb'),
      ('approved_at','timestamp with time zone',false,null::text),
      ('approved_by_auth_user_id','uuid',false,null::text),
      ('approval_metadata','jsonb',false,'''{}''::jsonb'),
      ('metadata','jsonb',false,'''{}''::jsonb'),
      ('updated_at','timestamp with time zone',false,'now()')
    ) as expected(column_name, data_type, not_null, default_expression)
  loop
    select
      format_type(a.atttypid, a.atttypmod),
      a.attnotnull,
      pg_get_expr(d.adbin, d.adrelid)
    into strict actual_type, actual_not_null, actual_default
    from pg_attribute a
    left join pg_attrdef d
      on d.adrelid = a.attrelid
     and d.adnum = a.attnum
    where a.attrelid = 'public.website_preview_versions'::regclass
      and a.attname = spec.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if actual_type is distinct from spec.data_type
       or actual_not_null is distinct from spec.not_null
       or actual_default is distinct from spec.default_expression then
      raise exception 'CP-A bridge column postcondition failed for %', spec.column_name
        using errcode = '42804';
    end if;
  end loop;
end;
$column_postcondition$;

do $foreign_keys$
declare
  spec record;
  existing_constraint pg_constraint%rowtype;
  source_attnum smallint;
  target_attnum smallint;
begin
  for spec in
    select *
    from (values
      ('website_preview_versions_customer_id_fkey','customer_id','public.customers'),
      ('website_preview_versions_project_id_fkey','project_id','public.projects'),
      ('website_preview_versions_website_id_fkey','website_id','public.websites'),
      ('website_preview_versions_published_by_fkey','published_by','public.profiles'),
      ('website_preview_versions_approved_by_auth_user_id_fkey','approved_by_auth_user_id','auth.users')
    ) as expected(constraint_name, column_name, target_relation)
  loop
    select attnum into strict source_attnum
    from pg_attribute
    where attrelid = 'public.website_preview_versions'::regclass
      and attname = spec.column_name
      and attnum > 0
      and not attisdropped;
    select attnum into strict target_attnum
    from pg_attribute
    where attrelid = to_regclass(spec.target_relation)
      and attname = 'id'
      and attnum > 0
      and not attisdropped;

    select * into existing_constraint
    from pg_constraint
    where conrelid = 'public.website_preview_versions'::regclass
      and conname = spec.constraint_name;

    if found then
      if existing_constraint.contype <> 'f'
         or existing_constraint.conkey <> array[source_attnum]::smallint[]
         or existing_constraint.confrelid <> to_regclass(spec.target_relation)
         or existing_constraint.confkey <> array[target_attnum]::smallint[]
         or existing_constraint.confupdtype <> 'a'
         or existing_constraint.confdeltype <> 'n'
         or existing_constraint.condeferrable
         or not existing_constraint.convalidated then
        raise exception 'CP-A bridge incompatible constraint %: %',
          spec.constraint_name, pg_get_constraintdef(existing_constraint.oid, true)
          using errcode = '42804';
      end if;
    else
      if exists (
        select 1
        from pg_constraint c
        where c.conrelid = 'public.website_preview_versions'::regclass
          and c.contype = 'f'
          and c.conkey = array[source_attnum]::smallint[]
      ) then
        raise exception 'CP-A bridge found an unexpected foreign key on column %', spec.column_name
          using errcode = '42710';
      end if;

      if exists (
        select 1
        from public.website_preview_versions preview
        where nullif(to_jsonb(preview)->>spec.column_name, '') is not null
          and not exists (
            select 1
            from pg_catalog.pg_class target_marker
            where target_marker.oid = to_regclass(spec.target_relation)
          )
      ) then
        raise exception 'CP-A bridge target relation disappeared for %', spec.column_name
          using errcode = '42P01';
      end if;

      if spec.column_name = 'customer_id' and exists (
        select 1 from public.website_preview_versions p
        where p.customer_id is not null
          and not exists (select 1 from public.customers c where c.id = p.customer_id)
      ) then
        raise exception 'CP-A bridge found orphan customer_id values' using errcode = '23503';
      elsif spec.column_name = 'project_id' and exists (
        select 1 from public.website_preview_versions p
        where p.project_id is not null
          and not exists (select 1 from public.projects t where t.id = p.project_id)
      ) then
        raise exception 'CP-A bridge found orphan project_id values' using errcode = '23503';
      elsif spec.column_name = 'website_id' and exists (
        select 1 from public.website_preview_versions p
        where p.website_id is not null
          and not exists (select 1 from public.websites t where t.id = p.website_id)
      ) then
        raise exception 'CP-A bridge found orphan website_id values' using errcode = '23503';
      elsif spec.column_name = 'published_by' and exists (
        select 1 from public.website_preview_versions p
        where p.published_by is not null
          and not exists (select 1 from public.profiles t where t.id = p.published_by)
      ) then
        raise exception 'CP-A bridge found orphan published_by values' using errcode = '23503';
      elsif spec.column_name = 'approved_by_auth_user_id' and exists (
        select 1 from public.website_preview_versions p
        where p.approved_by_auth_user_id is not null
          and not exists (select 1 from auth.users t where t.id = p.approved_by_auth_user_id)
      ) then
        raise exception 'CP-A bridge found orphan approved_by_auth_user_id values' using errcode = '23503';
      end if;

      execute format(
        'alter table public.website_preview_versions add constraint %I foreign key (%I) references %s(id) on delete set null not valid',
        spec.constraint_name, spec.column_name, spec.target_relation
      );
      execute format(
        'alter table public.website_preview_versions validate constraint %I',
        spec.constraint_name
      );
    end if;
  end loop;
end;
$foreign_keys$;

do $status_constraint$
declare
  existing_constraint pg_constraint%rowtype;
  expected_definition constant text :=
    'CHECK (status IS NULL OR (status = ANY (ARRAY[''internal''::text, ''ready_for_review''::text, ''feedback_received''::text, ''revision_in_progress''::text, ''approved''::text, ''archived''::text])))';
begin
  select * into existing_constraint
  from pg_constraint
  where conrelid = 'public.website_preview_versions'::regclass
    and conname = 'website_preview_versions_status_portal_check';

  if found then
    if existing_constraint.contype <> 'c'
       or not existing_constraint.convalidated
       or pg_get_constraintdef(existing_constraint.oid, true) <> expected_definition then
      raise exception 'CP-A bridge incompatible constraint website_preview_versions_status_portal_check: %',
        pg_get_constraintdef(existing_constraint.oid, true)
        using errcode = '42804';
    end if;
  else
    alter table public.website_preview_versions
      add constraint website_preview_versions_status_portal_check
      check (
        status is null
        or status in ('internal', 'ready_for_review', 'feedback_received', 'revision_in_progress', 'approved', 'archived')
      ) not valid;
    alter table public.website_preview_versions
      validate constraint website_preview_versions_status_portal_check;
  end if;
end;
$status_constraint$;

do $indexes$
declare
  spec record;
  existing_definition text;
begin
  for spec in
    select *
    from (values
      ('website_preview_versions_customer_id_idx',
       'CREATE INDEX website_preview_versions_customer_id_idx ON public.website_preview_versions USING btree (customer_id)',
       'create index website_preview_versions_customer_id_idx on public.website_preview_versions using btree (customer_id)'),
      ('website_preview_versions_project_id_idx',
       'CREATE INDEX website_preview_versions_project_id_idx ON public.website_preview_versions USING btree (project_id)',
       'create index website_preview_versions_project_id_idx on public.website_preview_versions using btree (project_id)'),
      ('website_preview_versions_website_id_idx',
       'CREATE INDEX website_preview_versions_website_id_idx ON public.website_preview_versions USING btree (website_id)',
       'create index website_preview_versions_website_id_idx on public.website_preview_versions using btree (website_id)'),
      ('website_preview_versions_published_to_portal_idx',
       'CREATE INDEX website_preview_versions_published_to_portal_idx ON public.website_preview_versions USING btree (published_to_portal)',
       'create index website_preview_versions_published_to_portal_idx on public.website_preview_versions using btree (published_to_portal)'),
      ('website_preview_versions_published_at_idx',
       'CREATE INDEX website_preview_versions_published_at_idx ON public.website_preview_versions USING btree (published_at DESC)',
       'create index website_preview_versions_published_at_idx on public.website_preview_versions using btree (published_at desc)'),
      ('website_preview_versions_customer_portal_published_idx',
       'CREATE INDEX website_preview_versions_customer_portal_published_idx ON public.website_preview_versions USING btree (customer_id, published_to_portal, published_at DESC)',
       'create index website_preview_versions_customer_portal_published_idx on public.website_preview_versions using btree (customer_id, published_to_portal, published_at desc)'),
      ('website_preview_versions_website_version_idx',
       'CREATE INDEX website_preview_versions_website_version_idx ON public.website_preview_versions USING btree (website_id, version DESC)',
       'create index website_preview_versions_website_version_idx on public.website_preview_versions using btree (website_id, version desc)'),
      ('website_preview_versions_project_portal_idx',
       'CREATE INDEX website_preview_versions_project_portal_idx ON public.website_preview_versions USING btree (project_id, published_to_portal)',
       'create index website_preview_versions_project_portal_idx on public.website_preview_versions using btree (project_id, published_to_portal)')
    ) as expected(index_name, expected_definition, create_statement)
  loop
    select pg_get_indexdef(c.oid)
    into existing_definition
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = spec.index_name
      and c.relkind = 'i';

    if found then
      if regexp_replace(lower(existing_definition), '\s+', ' ', 'g')
         is distinct from regexp_replace(lower(spec.expected_definition), '\s+', ' ', 'g') then
        raise exception 'CP-A bridge incompatible index %: %', spec.index_name, existing_definition
          using errcode = '42804';
      end if;
    else
      if to_regclass('public.' || spec.index_name) is not null then
        raise exception 'CP-A bridge name collision for index %', spec.index_name
          using errcode = '42710';
      end if;
      execute spec.create_statement;
    end if;
  end loop;
end;
$indexes$;

do $security_postcondition$
begin
  if not exists (
    select 1
    from pg_class
    where oid = 'public.website_preview_versions'::regclass
      and relrowsecurity
  ) then
    raise exception 'CP-A bridge requires RLS to remain enabled on website_preview_versions'
      using errcode = '42501';
  end if;
end;
$security_postcondition$;

commit;
