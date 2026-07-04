-- Max Webstudio - Sales Partner RLS Hotfix
-- URGENT HOTFIX DRAFT
-- Purpose:
-- - sales_partner can log in and see the sales UI, but Supabase SELECT is blocked.
-- - Older RLS policies still refer to the legacy `sales` role.
-- - This patch realigns read/write policies to `sales_manager` and `sales_partner`.
--
-- Run in Supabase SQL editor after review.
-- RLS remains the source of truth. No super_admin rights are granted to sales_partner.

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
    and coalesce(p.status, 'active') in ('active', 'invited')
  limit 1
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select c.id
  from public.profiles p
  left join public.customers c
    on c.profile_id = p.id
    or c.auth_user_id = p.auth_user_id
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') in ('active', 'invited')
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
    and coalesce(p.status, 'active') in ('active', 'invited')
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
  select public.has_app_role(array[
    'super_admin',
    'admin',
    'sales_manager',
    'sales_partner',
    'designer',
    'developer',
    'support'
  ])
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

create or replace function public.set_current_user_as_commercial_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_auth_user_id is null
    and public.has_app_role(array['sales_manager', 'sales_partner'])
  then
    new.owner_auth_user_id := auth.uid();
  end if;
  return new;
end;
$$;

grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.current_customer_id() to authenticated, service_role;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.has_app_role(text[]) to authenticated, service_role;
grant execute on function public.is_admin_role() to authenticated, service_role;
grant execute on function public.is_staff_role() to authenticated, service_role;
grant execute on function public.owns_commercial_record(uuid) to authenticated, service_role;
grant execute on function public.set_current_user_as_commercial_owner() to authenticated, service_role;

grant select on table public.profiles to authenticated;

do $$
begin
  if to_regclass('public.customers') is not null then
    grant select, update on table public.customers to authenticated;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'customers'
        and column_name = 'owner_auth_user_id'
    ) then
      drop trigger if exists customers_set_commercial_owner on public.customers;
      create trigger customers_set_commercial_owner
        before insert on public.customers
        for each row
        execute function public.set_current_user_as_commercial_owner();
    end if;

    drop policy if exists "sales read customers" on public.customers;
    drop policy if exists customers_staff_read on public.customers;
    create policy customers_staff_read
      on public.customers
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support', 'developer']));

    drop policy if exists customers_sales_update on public.customers;
    create policy customers_sales_update
      on public.customers
      for update
      using (
        public.has_app_role(array['sales_manager'])
        or (public.has_app_role(array['sales_partner']) and public.owns_commercial_record(owner_auth_user_id))
      )
      with check (
        public.has_app_role(array['sales_manager'])
        or (public.has_app_role(array['sales_partner']) and public.owns_commercial_record(owner_auth_user_id))
      );
  end if;

  if to_regclass('public.leads') is not null then
    grant select, insert, update on table public.leads to authenticated;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'leads'
        and column_name = 'owner_auth_user_id'
    ) then
      drop trigger if exists leads_set_commercial_owner on public.leads;
      create trigger leads_set_commercial_owner
        before insert on public.leads
        for each row
        execute function public.set_current_user_as_commercial_owner();
    end if;

    drop policy if exists "sales read leads customers quotes invoices" on public.leads;
    drop policy if exists leads_admin_sales_manage on public.leads;
    drop policy if exists leads_admin_manager_manage on public.leads;
    create policy leads_admin_manager_manage
      on public.leads
      for all
      using (public.has_app_role(array['super_admin', 'admin', 'sales_manager']))
      with check (public.has_app_role(array['super_admin', 'admin', 'sales_manager']));

    drop policy if exists leads_sales_partner_read on public.leads;
    create policy leads_sales_partner_read
      on public.leads
      for select
      using (public.has_app_role(array['sales_partner']));

    drop policy if exists leads_sales_partner_insert on public.leads;
    create policy leads_sales_partner_insert
      on public.leads
      for insert
      with check (
        public.has_app_role(array['sales_partner'])
        and public.owns_commercial_record(owner_auth_user_id)
      );

    drop policy if exists leads_sales_partner_update on public.leads;
    create policy leads_sales_partner_update
      on public.leads
      for update
      using (
        public.has_app_role(array['sales_partner'])
        and public.owns_commercial_record(owner_auth_user_id)
      )
      with check (
        public.has_app_role(array['sales_partner'])
        and public.owns_commercial_record(owner_auth_user_id)
      );
  end if;

  if to_regclass('public.quotes') is not null then
    grant select, insert, update on table public.quotes to authenticated;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'quotes'
        and column_name = 'owner_auth_user_id'
    ) then
      drop trigger if exists quotes_set_commercial_owner on public.quotes;
      create trigger quotes_set_commercial_owner
        before insert on public.quotes
        for each row
        execute function public.set_current_user_as_commercial_owner();
    end if;

    drop policy if exists "sales read quotes" on public.quotes;
    drop policy if exists quotes_sales_manage on public.quotes;
    drop policy if exists quotes_admin_sales_manage on public.quotes;
    drop policy if exists quotes_admin_manager_manage on public.quotes;
    create policy quotes_admin_manager_manage
      on public.quotes
      for all
      using (public.has_app_role(array['super_admin', 'admin', 'sales_manager']))
      with check (public.has_app_role(array['super_admin', 'admin', 'sales_manager']));

    drop policy if exists quotes_sales_partner_read on public.quotes;
    create policy quotes_sales_partner_read
      on public.quotes
      for select
      using (public.has_app_role(array['sales_partner']));

    drop policy if exists quotes_sales_partner_insert on public.quotes;
    create policy quotes_sales_partner_insert
      on public.quotes
      for insert
      with check (
        public.has_app_role(array['sales_partner'])
        and public.owns_commercial_record(owner_auth_user_id)
      );

    drop policy if exists quotes_sales_partner_update on public.quotes;
    create policy quotes_sales_partner_update
      on public.quotes
      for update
      using (
        public.has_app_role(array['sales_partner'])
        and public.owns_commercial_record(owner_auth_user_id)
      )
      with check (
        public.has_app_role(array['sales_partner'])
        and public.owns_commercial_record(owner_auth_user_id)
      );
  end if;

  if to_regclass('public.quote_lines') is not null then
    grant select, insert, update on table public.quote_lines to authenticated;

    drop policy if exists "sales read quote lines" on public.quote_lines;
    drop policy if exists quote_lines_admin_sales_manage on public.quote_lines;
    create policy quote_lines_admin_sales_manage
      on public.quote_lines
      for all
      using (
        public.is_admin_role()
        or public.has_app_role(array['sales_manager'])
        or (
          public.has_app_role(array['sales_partner'])
          and exists (
            select 1
            from public.quotes q
            where q.id = quote_id
              and (q.owner_auth_user_id is null or public.owns_commercial_record(q.owner_auth_user_id))
          )
        )
      )
      with check (
        public.is_admin_role()
        or public.has_app_role(array['sales_manager'])
        or (
          public.has_app_role(array['sales_partner'])
          and exists (
            select 1
            from public.quotes q
            where q.id = quote_id
              and (q.owner_auth_user_id is null or public.owns_commercial_record(q.owner_auth_user_id))
          )
        )
      );
  end if;

  if to_regclass('public.projects') is not null then
    grant select on table public.projects to authenticated;

    drop policy if exists projects_staff_read on public.projects;
    create policy projects_staff_read
      on public.projects
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'designer', 'support', 'developer']));
  end if;

  if to_regclass('public.websites') is not null then
    grant select on table public.websites to authenticated;

    drop policy if exists websites_staff_read on public.websites;
    create policy websites_staff_read
      on public.websites
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'designer', 'support', 'developer']));
  end if;

  if to_regclass('public.invoices') is not null then
    grant select on table public.invoices to authenticated;

    drop policy if exists "sales read invoices" on public.invoices;
    drop policy if exists invoices_staff_read on public.invoices;
    create policy invoices_staff_read
      on public.invoices
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support', 'developer']));
  end if;

  if to_regclass('public.invoice_lines') is not null then
    grant select on table public.invoice_lines to authenticated;

    drop policy if exists "sales read invoice lines" on public.invoice_lines;
    drop policy if exists invoice_lines_staff_read on public.invoice_lines;
    create policy invoice_lines_staff_read
      on public.invoice_lines
      for select
      using (public.has_app_role(array['sales_manager', 'sales_partner', 'support', 'developer']));
  end if;
end $$;

commit;

-- Verification after running this hotfix:
--
-- 1. Confirm Lisanne profile:
-- select p.name, p.email, p.role, p.status, u.email as auth_email
-- from public.profiles p
-- left join auth.users u on u.id = p.auth_user_id
-- where lower(u.email) = 'lisanne@maxwebstudio.nl'
--    or lower(p.email) = 'lisanne@maxwebstudio.nl';
--
-- 2. Simulate Lisanne as authenticated user in SQL editor:
-- begin;
-- select set_config('request.jwt.claim.sub', u.id::text, true)
-- from auth.users u
-- where lower(u.email) = 'lisanne@maxwebstudio.nl';
-- set local role authenticated;
-- select public.current_app_role() as role, public.is_staff_role() as is_staff;
-- select count(*) as customers_visible from public.customers;
-- select count(*) as leads_visible from public.leads;
-- select count(*) as quotes_visible from public.quotes;
-- select count(*) as projects_visible from public.projects;
-- rollback;
