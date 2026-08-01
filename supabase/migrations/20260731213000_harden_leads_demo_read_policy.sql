begin;

do $preflight$
begin
  if to_regclass('public.leads') is null
    or to_regprocedure('public.has_app_role(text[])') is null then
    raise exception using
      errcode = '55000',
      message = 'Lead demo-read hardening prerequisites are missing';
  end if;

  if not exists (
    select 1
    from pg_policy
    where polrelid = 'public.leads'::regclass
      and polname = 'leads_admin_manage'
  ) or not exists (
    select 1
    from pg_policy
    where polrelid = 'public.leads'::regclass
      and polname = 'leads_sales_manager_select'
  ) or not exists (
    select 1
    from pg_policy
    where polrelid = 'public.leads'::regclass
      and polname = 'leads_sales_partner_select_own'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Role-scoped lead read policies are incomplete';
  end if;
end
$preflight$;

drop policy if exists leads_demo_read on public.leads;

do $postcheck$
begin
  if exists (
    select 1
    from pg_policy
    where polrelid = 'public.leads'::regclass
      and polname = 'leads_demo_read'
  ) then
    raise exception using
      errcode = '55000',
      message = 'Blanket lead demo-read policy still exists';
  end if;
end
$postcheck$;

commit;
