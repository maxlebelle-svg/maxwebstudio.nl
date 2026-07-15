-- Local-only PostgreSQL fixture for the lead workspace privilege hardening draft.
-- The test runner creates the anon, authenticated and service_role roles first.

revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

create table public.leads (
  id text primary key,
  payload text not null
);

create table public.customer_timeline_events (
  id text primary key,
  payload text not null
);

alter table public.leads enable row level security;
alter table public.customer_timeline_events enable row level security;

create policy leads_authenticated_flow
  on public.leads for all to authenticated
  using (true) with check (true);

create policy customer_timeline_events_service_role_all
  on public.customer_timeline_events for all to service_role
  using (true) with check (true);

grant select, insert, update on public.leads to authenticated;
grant select, insert, update on public.leads to service_role;
grant select, insert, update, delete on public.customer_timeline_events to service_role;

grant truncate, references, trigger on public.leads to anon, authenticated;
grant truncate, references, trigger on public.customer_timeline_events to anon, authenticated;

create function public.current_app_role()
returns text language sql stable security definer set search_path = public
as 'select current_user::text';

create function public.current_profile_id()
returns uuid language sql stable security definer set search_path = public
as 'select null::uuid';

create function public.has_app_role(allowed_roles text[])
returns boolean language sql stable security definer set search_path = public
as 'select current_user::text = any(allowed_roles)';

create function public.is_admin_role()
returns boolean language sql stable security definer set search_path = public
as 'select public.has_app_role(array[''admin''])';

create function public.is_staff_role()
returns boolean language sql stable security definer set search_path = public
as 'select public.has_app_role(array[''admin'', ''sales''])';

create function public.owns_commercial_record(record_owner_auth_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as 'select record_owner_auth_user_id is not null';

grant execute on function public.current_app_role() to anon, authenticated, service_role;
grant execute on function public.current_profile_id() to anon, authenticated, service_role;
grant execute on function public.has_app_role(text[]) to anon, authenticated, service_role;
grant execute on function public.is_admin_role() to anon, authenticated, service_role;
grant execute on function public.is_staff_role() to anon, authenticated, service_role;
grant execute on function public.owns_commercial_record(uuid) to anon, authenticated, service_role;
