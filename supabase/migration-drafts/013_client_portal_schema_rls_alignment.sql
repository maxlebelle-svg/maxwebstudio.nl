-- Max Webstudio - Client Portal Schema/RLS Alignment Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
--
-- Target:
-- - Supabase staging/test project only.
-- - Run after 001_schema_tables.sql through 012_website_operational_update_grants.sql.
--
-- Purpose:
-- Align the customer portal production data foundation with the canonical
-- Supabase schema and stricter customer-facing RLS.
--
-- This draft intentionally contains no production seed data and no real
-- customer data. Staging/demo records must be inserted through a separate
-- test-only seed script with environment='test' and is_demo=true.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Schema alignment
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists customer_id uuid;

alter table public.customers
  add column if not exists internal_notes text;

alter table public.websites
  add column if not exists maintenance_status text,
  add column if not exists maintenance_plan text,
  add column if not exists publish_status text,
  add column if not exists backup_status text,
  add column if not exists last_backup_at timestamptz,
  add column if not exists seo_notes text,
  add column if not exists internal_notes text;

alter table public.projects
  add column if not exists public_notes text,
  add column if not exists internal_notes text;

alter table public.change_requests
  add column if not exists type text;

alter table public.client_portal_messages
  add column if not exists auth_user_id uuid,
  add column if not exists internal_notes text;

alter table public.client_portal_messages
  alter column auth_user_id set default auth.uid();

alter table public.client_portal_notifications
  add column if not exists related_type text,
  add column if not exists related_id uuid,
  add column if not exists cta_label text,
  add column if not exists cta_target text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_customer_id_fkey') then
    alter table public.profiles
      add constraint profiles_customer_id_fkey
      foreign key (customer_id) references public.customers(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'client_portal_messages_auth_user_id_fkey') then
    alter table public.client_portal_messages
      add constraint client_portal_messages_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete set null;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes for customer portal reads and RLS helpers
-- ---------------------------------------------------------------------------

create unique index if not exists profiles_auth_user_id_uidx
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

create index if not exists profiles_customer_id_idx
  on public.profiles(customer_id);

create index if not exists profiles_role_status_idx
  on public.profiles(role, status);

create index if not exists customers_profile_id_idx
  on public.customers(profile_id);

create index if not exists customers_auth_user_id_idx
  on public.customers(auth_user_id);

create index if not exists customers_environment_idx
  on public.customers(environment);

create index if not exists websites_customer_id_idx
  on public.websites(customer_id);

create index if not exists websites_project_id_idx
  on public.websites(project_id);

create index if not exists websites_status_idx
  on public.websites(status);

create index if not exists projects_customer_id_idx
  on public.projects(customer_id);

create index if not exists projects_website_id_idx
  on public.projects(website_id);

create index if not exists projects_status_idx
  on public.projects(status);

create index if not exists change_requests_customer_id_idx
  on public.change_requests(customer_id);

create index if not exists change_requests_auth_user_id_idx
  on public.change_requests(auth_user_id);

create index if not exists change_requests_status_idx
  on public.change_requests(status);

create index if not exists client_portal_messages_customer_id_idx
  on public.client_portal_messages(customer_id);

create index if not exists client_portal_messages_auth_user_id_idx
  on public.client_portal_messages(auth_user_id);

create index if not exists client_portal_messages_created_at_idx
  on public.client_portal_messages(created_at desc);

create index if not exists quotes_customer_id_idx
  on public.quotes(customer_id);

create index if not exists invoices_customer_id_idx
  on public.invoices(customer_id);

create index if not exists subscriptions_customer_id_idx
  on public.subscriptions(customer_id);

create index if not exists client_portal_notifications_customer_id_idx
  on public.client_portal_notifications(customer_id);

create index if not exists client_portal_notifications_type_idx
  on public.client_portal_notifications(type);

create index if not exists client_portal_notifications_read_at_idx
  on public.client_portal_notifications(read_at);

-- ---------------------------------------------------------------------------
-- RLS helper functions
-- ---------------------------------------------------------------------------

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

create or replace function public.current_customer_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(p.customer_id, c.id)
  from public.profiles p
  left join public.customers c
    on c.profile_id = p.id
    or c.auth_user_id = p.auth_user_id
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

create or replace function public.owns_customer(target_customer_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_customer_id is not null
    and target_customer_id = public.current_customer_id()
$$;

-- ---------------------------------------------------------------------------
-- RLS enablement
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.websites enable row level security;
alter table public.projects enable row level security;
alter table public.change_requests enable row level security;
alter table public.client_portal_messages enable row level security;
alter table public.quotes enable row level security;
alter table public.invoices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.client_portal_notifications enable row level security;

-- ---------------------------------------------------------------------------
-- Replace customer portal policies with stricter canonical policies
-- ---------------------------------------------------------------------------

drop policy if exists profiles_self_read on public.profiles;
drop policy if exists profiles_customer_read_own on public.profiles;
drop policy if exists profiles_admin_manage on public.profiles;

create policy profiles_customer_read_own
  on public.profiles
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy profiles_admin_manage
  on public.profiles
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin']))
  with check (public.has_app_role(array['super_admin', 'admin']));

drop policy if exists customers_owner_read on public.customers;
drop policy if exists customers_customer_read_own on public.customers;
drop policy if exists customers_staff_read on public.customers;
drop policy if exists customers_sales_update on public.customers;
drop policy if exists customers_admin_manage on public.customers;

create policy customers_customer_read_own
  on public.customers
  for select
  to authenticated
  using (id = public.current_customer_id());

create policy customers_staff_read
  on public.customers
  for select
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer']));

create policy customers_admin_manage
  on public.customers
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin']))
  with check (public.has_app_role(array['super_admin', 'admin']));

drop policy if exists websites_owner_read on public.websites;
drop policy if exists websites_customer_read_own on public.websites;
drop policy if exists websites_staff_read on public.websites;
drop policy if exists websites_developer_update on public.websites;
drop policy if exists websites_admin_manage on public.websites;

create policy websites_customer_read_own
  on public.websites
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy websites_staff_read
  on public.websites
  for select
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer']));

create policy websites_admin_manage
  on public.websites
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin']))
  with check (public.has_app_role(array['super_admin', 'admin']));

drop policy if exists projects_owner_read on public.projects;
drop policy if exists projects_customer_read_own on public.projects;
drop policy if exists projects_staff_read on public.projects;
drop policy if exists projects_support_update on public.projects;
drop policy if exists projects_admin_manage on public.projects;

create policy projects_customer_read_own
  on public.projects
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy projects_staff_read
  on public.projects
  for select
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer']));

create policy projects_admin_manage
  on public.projects
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin']))
  with check (public.has_app_role(array['super_admin', 'admin']));

drop policy if exists change_requests_owner_read on public.change_requests;
drop policy if exists change_requests_customer_read_own on public.change_requests;
drop policy if exists change_requests_customer_insert on public.change_requests;
drop policy if exists change_requests_customer_insert_own on public.change_requests;
drop policy if exists change_requests_staff_read on public.change_requests;
drop policy if exists change_requests_support_update on public.change_requests;
drop policy if exists change_requests_admin_manage on public.change_requests;
drop policy if exists change_requests_admin_support_manage on public.change_requests;

create policy change_requests_customer_read_own
  on public.change_requests
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy change_requests_customer_insert_own
  on public.change_requests
  for insert
  to authenticated
  with check (
    customer_id = public.current_customer_id()
    and auth_user_id = auth.uid()
    and coalesce(status, 'nieuw') = 'nieuw'
    and (
      website_id is null
      or exists (
        select 1
        from public.websites w
        where w.id = website_id
          and w.customer_id = public.current_customer_id()
      )
    )
    and (
      project_id is null
      or exists (
        select 1
        from public.projects p
        where p.id = project_id
          and p.customer_id = public.current_customer_id()
      )
    )
  );

create policy change_requests_staff_read
  on public.change_requests
  for select
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer']));

create policy change_requests_admin_support_manage
  on public.change_requests
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'support']))
  with check (public.has_app_role(array['super_admin', 'admin', 'support']));

drop policy if exists client_portal_messages_owner_read on public.client_portal_messages;
drop policy if exists client_portal_messages_owner_insert on public.client_portal_messages;
drop policy if exists client_portal_messages_customer_read_own on public.client_portal_messages;
drop policy if exists client_portal_messages_customer_insert_own on public.client_portal_messages;
drop policy if exists client_portal_messages_admin_support_manage on public.client_portal_messages;

create policy client_portal_messages_customer_read_own
  on public.client_portal_messages
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy client_portal_messages_customer_insert_own
  on public.client_portal_messages
  for insert
  to authenticated
  with check (
    customer_id = public.current_customer_id()
    and coalesce(auth_user_id, auth.uid()) = auth.uid()
    and sender_type = 'customer'
    and coalesce(status, 'open') in ('open', 'sent')
  );

create policy client_portal_messages_admin_support_manage
  on public.client_portal_messages
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'support']))
  with check (public.has_app_role(array['super_admin', 'admin', 'support']));

drop policy if exists quotes_owner_read on public.quotes;
drop policy if exists quotes_customer_read_own on public.quotes;
drop policy if exists quotes_staff_read on public.quotes;
drop policy if exists quotes_sales_manage on public.quotes;
drop policy if exists quotes_admin_manage on public.quotes;
drop policy if exists quotes_admin_sales_manage on public.quotes;

create policy quotes_customer_read_own
  on public.quotes
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy quotes_staff_read
  on public.quotes
  for select
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer']));

create policy quotes_admin_sales_manage
  on public.quotes
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'sales']))
  with check (public.has_app_role(array['super_admin', 'admin', 'sales']));

drop policy if exists invoices_owner_read on public.invoices;
drop policy if exists invoices_customer_read_own on public.invoices;
drop policy if exists invoices_staff_read on public.invoices;
drop policy if exists invoices_admin_manage on public.invoices;

create policy invoices_customer_read_own
  on public.invoices
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy invoices_staff_read
  on public.invoices
  for select
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer']));

create policy invoices_admin_manage
  on public.invoices
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin']))
  with check (public.has_app_role(array['super_admin', 'admin']));

drop policy if exists subscriptions_owner_read on public.subscriptions;
drop policy if exists subscriptions_customer_read_own on public.subscriptions;
drop policy if exists subscriptions_staff_read on public.subscriptions;
drop policy if exists subscriptions_admin_manage on public.subscriptions;

create policy subscriptions_customer_read_own
  on public.subscriptions
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy subscriptions_staff_read
  on public.subscriptions
  for select
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer']));

create policy subscriptions_admin_manage
  on public.subscriptions
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin']))
  with check (public.has_app_role(array['super_admin', 'admin']));

drop policy if exists client_portal_notifications_owner_read on public.client_portal_notifications;
drop policy if exists client_portal_notifications_owner_mark_read on public.client_portal_notifications;
drop policy if exists client_portal_notifications_customer_read_own on public.client_portal_notifications;
drop policy if exists client_portal_notifications_admin_support_manage on public.client_portal_notifications;

create policy client_portal_notifications_customer_read_own
  on public.client_portal_notifications
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy client_portal_notifications_admin_support_manage
  on public.client_portal_notifications
  for all
  to authenticated
  using (public.has_app_role(array['super_admin', 'admin', 'support']))
  with check (public.has_app_role(array['super_admin', 'admin', 'support']));

-- ---------------------------------------------------------------------------
-- Runtime grants
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select on
  public.profiles,
  public.customers,
  public.websites,
  public.projects,
  public.change_requests,
  public.client_portal_messages,
  public.quotes,
  public.invoices,
  public.subscriptions,
  public.client_portal_notifications
to authenticated;

grant insert (customer_id, auth_user_id, website_id, project_id, type, category, title, description, priority, source, metadata)
  on public.change_requests
to authenticated;

grant insert (customer_id, auth_user_id, sender_type, subject, body, status, metadata)
  on public.client_portal_messages
to authenticated;

grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.current_customer_id() to authenticated, service_role;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.has_app_role(text[]) to authenticated, service_role;
grant execute on function public.is_admin_role() to authenticated, service_role;
grant execute on function public.is_staff_role() to authenticated, service_role;
grant execute on function public.owns_customer(uuid) to authenticated, service_role;

-- Service role remains server-side only. This grant supports backend/admin
-- functions and must never be exposed to browser code.
grant select, insert, update, delete on
  public.profiles,
  public.customers,
  public.websites,
  public.projects,
  public.change_requests,
  public.client_portal_messages,
  public.quotes,
  public.invoices,
  public.subscriptions,
  public.client_portal_notifications
to service_role;

commit;
