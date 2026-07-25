-- Staging schema-drift repair: restore the historically proven preview quality report.
-- Forward-only. Does not recreate legacy billing tables or change RLS/grants.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  actual_type text;
  actual_not_null boolean;
  actual_default text;
begin
  if to_regclass('public.website_preview_versions') is null then
    raise exception 'schema-drift repair dependency is missing: public.website_preview_versions'
      using errcode = '42P01';
  end if;

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
    and a.attname = 'quality_report'
    and a.attnum > 0
    and not a.attisdropped;

  if found and (
    actual_type is distinct from 'jsonb'
    or actual_not_null
    or actual_default is not null
  ) then
    raise exception
      'incompatible public.website_preview_versions.quality_report: type %, not_null %, default %',
      actual_type, actual_not_null, actual_default
      using errcode = '42804';
  end if;
end;
$preflight$;

alter table public.website_preview_versions
  add column if not exists quality_report jsonb null;

do $postcondition$
declare
  actual_type text;
  actual_not_null boolean;
  actual_default text;
begin
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
    and a.attname = 'quality_report'
    and a.attnum > 0
    and not a.attisdropped;

  if actual_type is distinct from 'jsonb'
     or actual_not_null
     or actual_default is not null then
    raise exception 'quality_report postcondition failed'
      using errcode = '42804';
  end if;
end;
$postcondition$;

commit;
