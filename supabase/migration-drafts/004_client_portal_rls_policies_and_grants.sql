-- Max Webstudio - Minimal Client Portal RLS Policies & Runtime Grants Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
--
-- Purpose:
-- Add only the helper functions, RLS policies and runtime grants needed for
-- the first production client portal baseline.
--
-- Run after:
-- - 003_client_portal_rls_enablement.sql
--
-- Security model:
-- - RLS is the source of truth for row-level access.
-- - anon receives no customer-data table grants.
-- - authenticated receives minimal table grants so PostgreSQL can evaluate RLS.
-- - service_role is server-side only and must never be exposed to frontend code.
--
-- Explicitly excluded:
-- - finance, CRM, AI, files, logs, demo seed and broad platform tables.

begin;

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') = 'active'
  limit 1
$$;

create or replace function public.current_app_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(p.role, 'anonymous')
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') = 'active'
  limit 1
$$;

create or replace function public.has_app_role(allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_app_role(), 'anonymous') = any(allowed_roles)
$$;

create or replace function public.is_admin_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_app_role(array['super_admin', 'admin'])
$$;

create or replace function public.is_staff_role()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer'])
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select c.id
  from public.customers c
  where coalesce(c.status, 'active') <> 'archived'
    and (
      c.auth_user_id = auth.uid()
      or c.profile_id = public.current_profile_id()
    )
  order by c.created_at asc
  limit 1
$$;

create or replace function public.owns_customer(target_customer_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_customer_id is not null
    and exists (
      select 1
      from public.customers c
      where c.id = target_customer_id
        and coalesce(c.status, 'active') <> 'archived'
        and (
          c.auth_user_id = auth.uid()
          or c.profile_id = public.current_profile_id()
        )
    )
$$;

create or replace function public.is_demo_context()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.status, 'active') = 'active'
      and (
        p.role = 'demo_user'
        or coalesce(p.is_demo, false) = true
        or coalesce(p.environment, '') = 'demo'
      )
  )
$$;

create or replace function public.is_demo_record(record_is_demo boolean, record_environment text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_demo_context()
    and (coalesce(record_is_demo, false) = true or coalesce(record_environment, '') = 'demo')
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_admin_manage') then
    create policy profiles_admin_manage on public.profiles for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_self_read') then
    create policy profiles_self_read on public.profiles for select using (auth_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_developer_read') then
    create policy profiles_developer_read on public.profiles for select using (public.has_app_role(array['developer']));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_admin_manage') then
    create policy customers_admin_manage on public.customers for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_staff_read') then
    create policy customers_staff_read on public.customers for select using (public.is_staff_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_owner_read') then
    create policy customers_owner_read on public.customers for select using (public.owns_customer(id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_demo_read') then
    create policy customers_demo_read on public.customers for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_admin_manage') then
    create policy websites_admin_manage on public.websites for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_staff_read') then
    create policy websites_staff_read on public.websites for select using (public.is_staff_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_owner_read') then
    create policy websites_owner_read on public.websites for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_demo_read') then
    create policy websites_demo_read on public.websites for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_admin_manage') then
    create policy projects_admin_manage on public.projects for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_staff_read') then
    create policy projects_staff_read on public.projects for select using (public.is_staff_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_owner_read') then
    create policy projects_owner_read on public.projects for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_demo_read') then
    create policy projects_demo_read on public.projects for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_admin_manage') then
    create policy change_requests_admin_manage on public.change_requests for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_staff_read') then
    create policy change_requests_staff_read on public.change_requests for select using (public.is_staff_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_owner_read') then
    create policy change_requests_owner_read on public.change_requests for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_owner_insert') then
    create policy change_requests_owner_insert on public.change_requests for insert with check (
      public.owns_customer(customer_id)
      and (auth_user_id is null or auth_user_id = auth.uid())
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_demo_read') then
    create policy change_requests_demo_read on public.change_requests for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_messages' and policyname = 'client_portal_messages_admin_manage') then
    create policy client_portal_messages_admin_manage on public.client_portal_messages for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_messages' and policyname = 'client_portal_messages_staff_read') then
    create policy client_portal_messages_staff_read on public.client_portal_messages for select using (public.is_staff_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_messages' and policyname = 'client_portal_messages_owner_read') then
    create policy client_portal_messages_owner_read on public.client_portal_messages for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_messages' and policyname = 'client_portal_messages_owner_insert') then
    create policy client_portal_messages_owner_insert on public.client_portal_messages for insert with check (
      public.owns_customer(customer_id)
      and sender_type = 'customer'
      and (profile_id is null or profile_id = public.current_profile_id())
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_messages' and policyname = 'client_portal_messages_demo_read') then
    create policy client_portal_messages_demo_read on public.client_portal_messages for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_notifications' and policyname = 'client_portal_notifications_admin_manage') then
    create policy client_portal_notifications_admin_manage on public.client_portal_notifications for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_notifications' and policyname = 'client_portal_notifications_staff_read') then
    create policy client_portal_notifications_staff_read on public.client_portal_notifications for select using (public.is_staff_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_notifications' and policyname = 'client_portal_notifications_owner_read') then
    create policy client_portal_notifications_owner_read on public.client_portal_notifications for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_notifications' and policyname = 'client_portal_notifications_demo_read') then
    create policy client_portal_notifications_demo_read on public.client_portal_notifications for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- Anonymous visitors must not access client portal tables directly.
revoke all on table
  public.profiles,
  public.customers,
  public.websites,
  public.projects,
  public.change_requests,
  public.client_portal_messages,
  public.client_portal_notifications
from anon;

-- PostgreSQL checks table privileges before evaluating RLS policies.
-- These grants are intentionally minimal for logged-in client portal users.
grant select on table
  public.profiles,
  public.customers,
  public.websites,
  public.projects,
  public.client_portal_notifications
to authenticated;

grant select, insert on table
  public.change_requests,
  public.client_portal_messages
to authenticated;

-- Service role is backend-only. It must never be exposed to browser code.
grant select, insert, update on table
  public.profiles,
  public.customers,
  public.websites,
  public.projects,
  public.change_requests,
  public.client_portal_messages,
  public.client_portal_notifications
to service_role;

grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.has_app_role(text[]) to authenticated, service_role;
grant execute on function public.is_admin_role() to authenticated, service_role;
grant execute on function public.is_staff_role() to authenticated, service_role;
grant execute on function public.current_customer_id() to authenticated, service_role;
grant execute on function public.owns_customer(uuid) to authenticated, service_role;
grant execute on function public.is_demo_context() to authenticated, service_role;
grant execute on function public.is_demo_record(boolean, text) to authenticated, service_role;

commit;
