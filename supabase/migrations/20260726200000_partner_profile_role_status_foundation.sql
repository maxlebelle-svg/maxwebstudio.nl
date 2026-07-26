-- Partner Onboarding V1 / B1: canonical profile roles, statuses and operational access.
-- Staging-integrated migration version: 20260726200000.
-- Forward-only and data preserving. This migration sends nothing and activates nobody.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.leads') is null then
    raise exception using errcode = '55000',
      message = 'Partner B1 requires public.profiles and public.leads.';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(btrim(coalesce(role, ''))) not in (
      'super_admin','admin','sales','sales_manager','sales_partner',
      'designer','developer','support','customer','demo_user'
    )
  ) then
    raise exception using errcode = '22023',
      message = 'Partner B1 found an unknown profile role.';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(btrim(coalesce(status, ''))) not in (
      'invited','pending','active','disabled','archived'
    )
  ) then
    raise exception using errcode = '22023',
      message = 'Partner B1 found an unknown profile status.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.leads'::regclass
      and attname = 'assigned_user_id' and attnum > 0 and not attisdropped
  ) then
    raise exception using errcode = '55000',
      message = 'Partner B1 requires leads.assigned_user_id ownership.';
  end if;
end
$preflight$;

alter table public.profiles
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.profiles drop constraint if exists profiles_role_check;

update public.profiles
set role = 'sales_partner', updated_at = pg_catalog.clock_timestamp()
where lower(btrim(role)) = 'sales';

alter table public.profiles add constraint profiles_role_check check (
  role in (
    'super_admin','admin','sales_manager','sales_partner','designer',
    'developer','support','customer','demo_user'
  )
);

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check check (
  status in ('invited','pending','active','disabled','archived')
);

comment on column public.profiles.status is
  'Account access only: invited, pending, active, disabled or archived. Partner onboarding uses a separate state machine.';

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.status = 'active'
  limit 1
$function$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select p.role
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.status = 'active'
  limit 1
$function$;

create or replace function public.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select coalesce(public.current_app_role(), 'anonymous') = any(allowed_roles)
$function$;

create or replace function public.is_admin_role()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select public.has_app_role(array['super_admin','admin'])
$function$;

create or replace function public.is_staff_role()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select public.has_app_role(array[
    'super_admin','admin','sales_manager','sales_partner',
    'designer','developer','support'
  ])
$function$;

create or replace function public.partner_profile_status_transition_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if (old.status = 'invited' and new.status in ('pending','active','disabled','archived'))
     or (old.status = 'pending' and new.status in ('invited','active','disabled','archived'))
     or (old.status = 'active' and new.status in ('disabled','archived'))
     or (old.status = 'disabled' and new.status in ('invited','pending','active','archived')) then
    return new;
  end if;

  raise exception using errcode = '23514',
    message = pg_catalog.format('Unsupported profile status transition: %s -> %s.', old.status, new.status);
end
$function$;

drop trigger if exists partner_profile_status_transition_guard on public.profiles;
create trigger partner_profile_status_transition_guard
before update of status on public.profiles
for each row execute function public.partner_profile_status_transition_guard();

revoke all on function public.current_profile_id() from public, anon;
revoke all on function public.current_app_role() from public, anon;
revoke all on function public.has_app_role(text[]) from public, anon;
revoke all on function public.is_admin_role() from public, anon;
revoke all on function public.is_staff_role() from public, anon;
grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.has_app_role(text[]) to authenticated, service_role;
grant execute on function public.is_admin_role() to authenticated, service_role;
grant execute on function public.is_staff_role() to authenticated, service_role;
revoke all on function public.partner_profile_status_transition_guard() from public, anon, authenticated;
grant execute on function public.partner_profile_status_transition_guard() to service_role;

alter table public.profiles enable row level security;
alter table public.leads enable row level security;

drop policy if exists leads_admin_sales_manage on public.leads;
drop policy if exists leads_admin_manage on public.leads;
drop policy if exists leads_admin_manager_manage on public.leads;
drop policy if exists leads_sales_manager_read_update on public.leads;
drop policy if exists leads_sales_manager_select on public.leads;
drop policy if exists leads_sales_manager_update on public.leads;
drop policy if exists leads_sales_partner_read on public.leads;
drop policy if exists leads_sales_partner_insert on public.leads;
drop policy if exists leads_sales_partner_update on public.leads;
drop policy if exists leads_sales_partner_select_own on public.leads;
drop policy if exists leads_sales_partner_insert_own on public.leads;
drop policy if exists leads_sales_partner_update_own on public.leads;

create policy leads_admin_manage
on public.leads for all to authenticated
using (public.has_app_role(array['super_admin','admin']))
with check (public.has_app_role(array['super_admin','admin']));

create policy leads_sales_manager_select
on public.leads for select to authenticated
using (public.has_app_role(array['sales_manager']));

create policy leads_sales_manager_update
on public.leads for update to authenticated
using (public.has_app_role(array['sales_manager']))
with check (public.has_app_role(array['sales_manager']));

create policy leads_sales_partner_select_own
on public.leads for select to authenticated
using (
  public.has_app_role(array['sales_partner'])
  and assigned_user_id = auth.uid()
);

create policy leads_sales_partner_insert_own
on public.leads for insert to authenticated
with check (
  public.has_app_role(array['sales_partner'])
  and assigned_user_id = auth.uid()
);

create policy leads_sales_partner_update_own
on public.leads for update to authenticated
using (
  public.has_app_role(array['sales_partner'])
  and assigned_user_id = auth.uid()
)
with check (
  public.has_app_role(array['sales_partner'])
  and assigned_user_id = auth.uid()
);

grant select, insert, update on table public.leads to authenticated;

commit;
