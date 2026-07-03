-- Max Webstudio - Identity & Permissions Foundation
-- Production-safe draft: review before running on production.
-- Uses the existing public.profiles table. Do not create a second profiles table.

begin;

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists status text;
alter table public.profiles add column if not exists employee_number text;
alter table public.profiles add column if not exists last_login_at timestamptz;
alter table public.profiles add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists updated_at timestamptz default now();
alter table public.profiles add column if not exists company text;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists package text;
alter table public.profiles add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.customers add column if not exists owner_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.leads add column if not exists owner_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.quotes add column if not exists owner_auth_user_id uuid references auth.users(id) on delete set null;

update public.profiles
set
  role = case
    when lower(coalesce(email, '')) = 'max@maxwebstudio.nl' then 'super_admin'
    when lower(coalesce(email, '')) = 'info@maxwebstudio.nl' then 'sales_partner'
    when lower(coalesce(email, '')) like '%@maxwebstudio.local' then coalesce(nullif(role, ''), 'customer')
    when lower(coalesce(email, '')) like '%@maxwebstudio.test' then coalesce(nullif(role, ''), 'customer')
    else coalesce(nullif(role, ''), 'customer')
  end,
  status = coalesce(nullif(status, ''), 'active'),
  updated_at = now();

update public.profiles
set role = 'sales_partner'
where role = 'sales';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in (
        'super_admin',
        'admin',
        'sales_manager',
        'sales_partner',
        'designer',
        'developer',
        'support',
        'customer',
        'demo_user'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('active', 'invited', 'pending', 'disabled', 'archived'));
  end if;
end $$;

create unique index if not exists profiles_auth_user_id_unique_idx
  on public.profiles(auth_user_id)
  where auth_user_id is not null;

create index if not exists profiles_role_status_idx on public.profiles(role, status);
create index if not exists profiles_last_login_at_idx on public.profiles(last_login_at desc);
create index if not exists customers_owner_auth_user_id_idx on public.customers(owner_auth_user_id);
create index if not exists leads_owner_auth_user_id_idx on public.leads(owner_auth_user_id);
create index if not exists quotes_owner_auth_user_id_idx on public.quotes(owner_auth_user_id);

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
  select coalesce(p.role, 'customer')
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
  select public.has_app_role(array['super_admin', 'admin', 'sales_manager', 'sales_partner', 'designer', 'developer', 'support'])
$$;

create or replace function public.owns_commercial_record(record_owner_auth_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select record_owner_auth_user_id is not null
    and record_owner_auth_user_id = auth.uid()
$$;

create or replace function public.touch_profile_last_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set last_login_at = now(), updated_at = now()
  where auth_user_id = new.id;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_last_login_profile_touch') then
    create trigger on_auth_user_last_login_profile_touch
      after update of last_sign_in_at on auth.users
      for each row
      when (new.last_sign_in_at is distinct from old.last_sign_in_at)
      execute function public.touch_profile_last_login();
  end if;
end $$;

create or replace function public.audit_profile_role_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.audit_logs') is not null then
    if tg_op = 'INSERT' then
      insert into public.audit_logs (actor_profile_id, actor_role, action, entity_type, entity_id, result, metadata)
      values (
        public.current_profile_id(),
        public.current_app_role(),
        'user_created',
        'profile',
        new.id,
        'success',
        jsonb_build_object('role', new.role, 'status', new.status)
      );
    elsif coalesce(old.role, '') is distinct from coalesce(new.role, '') then
      insert into public.audit_logs (actor_profile_id, actor_role, action, entity_type, entity_id, result, metadata)
      values (
        public.current_profile_id(),
        public.current_app_role(),
        'role_changed',
        'profile',
        new.id,
        'success',
        jsonb_build_object('old_role', old.role, 'new_role', new.role)
      );
    elsif coalesce(old.status, '') is distinct from coalesce(new.status, '') then
      insert into public.audit_logs (actor_profile_id, actor_role, action, entity_type, entity_id, result, metadata)
      values (
        public.current_profile_id(),
        public.current_app_role(),
        case when new.status = 'disabled' then 'account_deactivated' else 'account_status_changed' end,
        'profile',
        new.id,
        'success',
        jsonb_build_object('old_status', old.status, 'new_status', new.status)
      );
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_audit_role_status_change') then
    create trigger profiles_audit_role_status_change
      after insert or update of role, status on public.profiles
      for each row
      execute function public.audit_profile_role_status_change();
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_super_admin_manage') then
    create policy profiles_super_admin_manage on public.profiles
      for all
      using (public.has_app_role(array['super_admin']))
      with check (public.has_app_role(array['super_admin']));
  end if;
end $$;

-- Keep older migration drafts immutable: realign policies created by earlier
-- drafts from the legacy `sales` role to the new sales role split here.
do $$
begin
  if to_regclass('public.customers') is not null then
    drop policy if exists customers_sales_update on public.customers;
    create policy customers_sales_update
      on public.customers
      for update
      using (public.has_app_role(array['sales_manager', 'sales_partner']))
      with check (public.has_app_role(array['sales_manager', 'sales_partner']));

    drop policy if exists customers_staff_read on public.customers;
    create policy customers_staff_read
      on public.customers
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support', 'developer']));
  end if;

  if to_regclass('public.leads') is not null then
    drop policy if exists leads_admin_sales_manage on public.leads;
    create policy leads_admin_sales_manage
      on public.leads
      for all
      using (public.has_app_role(array['super_admin', 'admin', 'sales_manager', 'sales_partner']))
      with check (public.has_app_role(array['super_admin', 'admin', 'sales_manager', 'sales_partner']));
  end if;

  if to_regclass('public.websites') is not null then
    drop policy if exists websites_staff_read on public.websites;
    create policy websites_staff_read
      on public.websites
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'designer', 'support', 'developer']));
  end if;

  if to_regclass('public.projects') is not null then
    drop policy if exists projects_staff_read on public.projects;
    create policy projects_staff_read
      on public.projects
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'designer', 'support', 'developer']));
  end if;

  if to_regclass('public.quotes') is not null then
    drop policy if exists quotes_sales_manage on public.quotes;
    create policy quotes_sales_manage
      on public.quotes
      for all
      using (public.has_app_role(array['sales_manager', 'sales_partner']))
      with check (public.has_app_role(array['sales_manager', 'sales_partner']));

    drop policy if exists quotes_staff_read on public.quotes;
    create policy quotes_staff_read
      on public.quotes
      for select
      using (public.has_app_role(array['support', 'developer']));

    drop policy if exists quotes_admin_sales_manage on public.quotes;
    create policy quotes_admin_sales_manage
      on public.quotes
      for all
      using (public.has_app_role(array['super_admin', 'admin', 'sales_manager', 'sales_partner']))
      with check (public.has_app_role(array['super_admin', 'admin', 'sales_manager', 'sales_partner']));
  end if;

  if to_regclass('public.quote_lines') is not null then
    drop policy if exists quote_lines_admin_sales_manage on public.quote_lines;
    create policy quote_lines_admin_sales_manage
      on public.quote_lines
      for all
      using (public.is_admin_role() or public.has_app_role(array['sales_manager', 'sales_partner']))
      with check (public.is_admin_role() or public.has_app_role(array['sales_manager', 'sales_partner']));
  end if;

  if to_regclass('public.invoices') is not null then
    drop policy if exists invoices_staff_read on public.invoices;
    create policy invoices_staff_read
      on public.invoices
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support', 'developer']));
  end if;

  if to_regclass('public.invoice_lines') is not null then
    drop policy if exists invoice_lines_staff_read on public.invoice_lines;
    create policy invoice_lines_staff_read
      on public.invoice_lines
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support', 'developer']));
  end if;

  if to_regclass('public.subscriptions') is not null then
    drop policy if exists subscriptions_staff_read on public.subscriptions;
    create policy subscriptions_staff_read
      on public.subscriptions
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support', 'developer']));
  end if;

  if to_regclass('public.files') is not null then
    drop policy if exists files_staff_read on public.files;
    create policy files_staff_read
      on public.files
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'designer', 'support', 'developer']));
  end if;

  if to_regclass('public.change_requests') is not null then
    drop policy if exists change_requests_staff_read on public.change_requests;
    create policy change_requests_staff_read
      on public.change_requests
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support', 'developer']));
  end if;

  if to_regclass('public.crm_tasks') is not null then
    drop policy if exists crm_tasks_sales_support_manage on public.crm_tasks;
    create policy crm_tasks_sales_support_manage
      on public.crm_tasks
      for all
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support']))
      with check (public.has_app_role(array['sales_manager', 'sales_partner', 'support']));
  end if;

  if to_regclass('public.ai_drafts') is not null then
    drop policy if exists ai_drafts_sales_support_read on public.ai_drafts;
    create policy ai_drafts_sales_support_read
      on public.ai_drafts
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support']));
  end if;

  if to_regclass('public.ai_assistant_drafts') is not null then
    drop policy if exists ai_assistant_drafts_internal_manage on public.ai_assistant_drafts;
    create policy ai_assistant_drafts_internal_manage
      on public.ai_assistant_drafts
      for all
      using (public.has_app_role(array['super_admin', 'admin', 'developer', 'sales_manager', 'sales_partner', 'support']))
      with check (public.has_app_role(array['super_admin', 'admin', 'developer', 'sales_manager', 'sales_partner', 'support']));
  end if;

  if to_regclass('public.demo_emails') is not null then
    drop policy if exists demo_emails_internal_manage on public.demo_emails;
    create policy demo_emails_internal_manage
      on public.demo_emails
      for all
      using (public.has_app_role(array['super_admin', 'admin', 'sales_manager', 'sales_partner', 'developer']))
      with check (public.has_app_role(array['super_admin', 'admin', 'sales_manager', 'sales_partner', 'developer']));
  end if;

  if to_regclass('public.activity_logs') is not null then
    drop policy if exists activity_logs_internal_insert on public.activity_logs;
    create policy activity_logs_internal_insert
      on public.activity_logs
      for insert
      with check (public.has_app_role(array['super_admin', 'admin', 'sales_manager', 'sales_partner', 'support', 'developer']));
  end if;
end $$;

commit;
