-- Local-only authoritative baseline for prerequisite SQL dry-runs.
-- Load into an isolated PostgreSQL cluster whose database is named postgres.

create schema auth;
create table auth.users (id uuid primary key);
insert into auth.users values ('11111111-1111-4111-8111-111111111111');
create function auth.uid() returns uuid language sql stable as 'select ''11111111-1111-4111-8111-111111111111''::uuid';
create function auth.role() returns text language sql stable as 'select current_user::text';

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

create table public.leads (
  id uuid primary key,
  owner_id uuid,
  created_by uuid,
  assigned_to uuid,
  lead_status text not null,
  status text,
  external_source text,
  external_source_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_timeline_events (
  id uuid primary key,
  lead_id uuid,
  metadata jsonb not null default '{}'::jsonb
);

create table public.profiles (
  auth_user_id uuid primary key references auth.users(id),
  role text not null,
  status text not null
);
insert into public.profiles values ('11111111-1111-4111-8111-111111111111', 'super_admin', 'active');

insert into public.leads (id, owner_id, created_by, assigned_to, lead_status, status, external_source, external_source_id)
select
  format('00000000-0000-4000-8000-%s', lpad(i::text, 12, '0'))::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  '11111111-1111-4111-8111-111111111111'::uuid,
  'new', 'new', 'fixture', i::text
from generate_series(1, 12) i;

insert into public.customer_timeline_events (id, lead_id)
select
  format('10000000-0000-4000-8000-%s', lpad(i::text, 12, '0'))::uuid,
  format('00000000-0000-4000-8000-%s', lpad((((i - 1) % 12) + 1)::text, 12, '0'))::uuid
from generate_series(1, 37) i;

alter table public.leads enable row level security;
alter table public.customer_timeline_events enable row level security;

create policy leads_admin_manage on public.leads for all
  using (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role in ('super_admin','admin') and p.status in ('active','invited')))
  with check (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role in ('super_admin','admin') and p.status in ('active','invited')));
create policy leads_sales_manager_read_update on public.leads for all
  using (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_manager' and p.status in ('active','invited')))
  with check (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_manager' and p.status in ('active','invited')));
create policy leads_sales_partner_insert_own on public.leads for insert
  with check (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_partner' and p.status in ('active','invited')) and auth.uid() in (owner_id,created_by,assigned_to));
create policy leads_sales_partner_select_own on public.leads for select
  using (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_partner' and p.status in ('active','invited')) and auth.uid() in (owner_id,created_by,assigned_to));
create policy leads_sales_partner_update_own on public.leads for update
  using (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_partner' and p.status in ('active','invited')) and auth.uid() in (owner_id,created_by,assigned_to))
  with check (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_partner' and p.status in ('active','invited')) and auth.uid() in (owner_id,created_by,assigned_to));
create policy customer_timeline_events_service_role_all on public.customer_timeline_events for all
  using (auth.role()='service_role') with check (auth.role()='service_role');

grant select, insert, update on public.leads to authenticated;
grant select, insert, update on public.leads to service_role;
grant select, insert, update, delete on public.customer_timeline_events to service_role;

create function public.current_app_role()
returns text language sql stable security definer set search_path = public, pg_temp
as 'select current_user::text';
create function public.current_profile_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as 'select null::uuid';
create function public.has_app_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp
as 'select current_user::text = any(allowed_roles)';
create function public.is_admin_role()
returns boolean language sql stable security definer set search_path = public, pg_temp
as 'select public.has_app_role(array[''admin''])';
create function public.is_staff_role()
returns boolean language sql stable security definer set search_path = public, pg_temp
as 'select public.has_app_role(array[''admin'', ''sales''])';
create function public.owns_commercial_record(record_owner_auth_user_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as 'select record_owner_auth_user_id is not null';

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.current_profile_id() from public, anon;
revoke execute on function public.has_app_role(text[]) from public, anon;
revoke execute on function public.is_admin_role() from public, anon;
revoke execute on function public.is_staff_role() from public, anon;
revoke execute on function public.owns_commercial_record(uuid) from public, anon;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.has_app_role(text[]) to authenticated, service_role;
grant execute on function public.is_admin_role() to authenticated, service_role;
grant execute on function public.is_staff_role() to authenticated, service_role;
grant execute on function public.owns_commercial_record(uuid) to authenticated, service_role;
