-- Max Webstudio - Canonical RLS Draft
-- Status: DRAFT ONLY. NIET UITVOEREN zonder handmatige review.
-- Doel: voorbereiding voor Fase 13.3 RLS hardening.
-- Canonical architectuur:
-- profiles -> customers -> websites -> projects -> quotes -> quote_lines -> invoices -> invoice_lines -> subscriptions
-- Ondersteunend: files, change_requests, settings, demo_emails, activity_logs, import_logs.
-- Legacy customer_* tabellen worden hier bewust niet gebruikt.

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
      and (p.role = 'demo_user' or coalesce(p.is_demo, false) = true or p.environment = 'demo')
  )
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
  where c.auth_user_id = auth.uid()
     or c.profile_id = public.current_profile_id()
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
  select exists (
    select 1
    from public.customers c
    where c.id = target_customer_id
      and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id())
  )
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.websites enable row level security;
alter table public.projects enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.subscriptions enable row level security;
alter table public.files enable row level security;
alter table public.change_requests enable row level security;
alter table public.settings enable row level security;
alter table public.demo_emails enable row level security;
alter table public.activity_logs enable row level security;
alter table public.import_logs enable row level security;

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
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_admin_manage') then
    create policy change_requests_admin_manage on public.change_requests for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_staff_read') then
    create policy change_requests_staff_read on public.change_requests for select using (public.has_app_role(array['sales', 'support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_owner_read') then
    create policy change_requests_owner_read on public.change_requests for select using (auth_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_demo_read') then
    create policy change_requests_demo_read on public.change_requests for select using (public.is_demo_context() and source = 'demo');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_admin_manage') then
    create policy customers_admin_manage on public.customers for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_sales_support_developer_read') then
    create policy customers_sales_support_developer_read on public.customers for select using (public.has_app_role(array['sales', 'support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_sales_update') then
    create policy customers_sales_update on public.customers for update using (public.has_app_role(array['sales'])) with check (public.has_app_role(array['sales']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_owner_read') then
    create policy customers_owner_read on public.customers for select using (public.owns_customer(id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_demo_read') then
    create policy customers_demo_read on public.customers for select using (public.is_demo_context() and (coalesce(is_demo, false) = true or environment = 'demo'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_admin_manage') then
    create policy websites_admin_manage on public.websites for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_staff_read') then
    create policy websites_staff_read on public.websites for select using (public.has_app_role(array['sales', 'support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_developer_update') then
    create policy websites_developer_update on public.websites for update using (public.has_app_role(array['developer'])) with check (public.has_app_role(array['developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_owner_read') then
    create policy websites_owner_read on public.websites for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_demo_read') then
    create policy websites_demo_read on public.websites for select using (public.is_demo_context() and (coalesce(is_demo, false) = true or environment = 'demo'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_admin_manage') then
    create policy projects_admin_manage on public.projects for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_staff_read') then
    create policy projects_staff_read on public.projects for select using (public.has_app_role(array['sales', 'support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_support_update') then
    create policy projects_support_update on public.projects for update using (public.has_app_role(array['support'])) with check (public.has_app_role(array['support']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_owner_read') then
    create policy projects_owner_read on public.projects for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_demo_read') then
    create policy projects_demo_read on public.projects for select using (public.is_demo_context() and (coalesce(is_demo, false) = true or environment = 'demo'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quotes' and policyname = 'quotes_admin_manage') then
    create policy quotes_admin_manage on public.quotes for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quotes' and policyname = 'quotes_sales_manage') then
    create policy quotes_sales_manage on public.quotes for all using (public.has_app_role(array['sales'])) with check (public.has_app_role(array['sales']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quotes' and policyname = 'quotes_staff_read') then
    create policy quotes_staff_read on public.quotes for select using (public.has_app_role(array['support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quotes' and policyname = 'quotes_owner_read') then
    create policy quotes_owner_read on public.quotes for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quotes' and policyname = 'quotes_demo_read') then
    create policy quotes_demo_read on public.quotes for select using (public.is_demo_context() and (coalesce(is_demo, false) = true or environment = 'demo'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_lines' and policyname = 'quote_lines_admin_manage') then
    create policy quote_lines_admin_manage on public.quote_lines for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_lines' and policyname = 'quote_lines_sales_manage') then
    create policy quote_lines_sales_manage on public.quote_lines for all using (public.has_app_role(array['sales'])) with check (public.has_app_role(array['sales']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_lines' and policyname = 'quote_lines_parent_read') then
    create policy quote_lines_parent_read on public.quote_lines for select using (
      exists (select 1 from public.quotes q where q.id = quote_lines.quote_id and (public.owns_customer(q.customer_id) or public.has_app_role(array['support', 'developer']) or (public.is_demo_context() and (coalesce(q.is_demo, false) = true or q.environment = 'demo'))))
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices_admin_manage') then
    create policy invoices_admin_manage on public.invoices for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices_staff_read') then
    create policy invoices_staff_read on public.invoices for select using (public.has_app_role(array['sales', 'support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices_owner_read') then
    create policy invoices_owner_read on public.invoices for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'invoices_demo_read') then
    create policy invoices_demo_read on public.invoices for select using (public.is_demo_context() and (coalesce(is_demo, false) = true or environment = 'demo'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_lines' and policyname = 'invoice_lines_admin_manage') then
    create policy invoice_lines_admin_manage on public.invoice_lines for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_lines' and policyname = 'invoice_lines_parent_read') then
    create policy invoice_lines_parent_read on public.invoice_lines for select using (
      exists (select 1 from public.invoices i where i.id = invoice_lines.invoice_id and (public.owns_customer(i.customer_id) or public.has_app_role(array['sales', 'support', 'developer']) or (public.is_demo_context() and (coalesce(i.is_demo, false) = true or i.environment = 'demo'))))
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'subscriptions_admin_manage') then
    create policy subscriptions_admin_manage on public.subscriptions for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'subscriptions_staff_read') then
    create policy subscriptions_staff_read on public.subscriptions for select using (public.has_app_role(array['sales', 'support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'subscriptions_owner_read') then
    create policy subscriptions_owner_read on public.subscriptions for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'subscriptions_demo_read') then
    create policy subscriptions_demo_read on public.subscriptions for select using (public.is_demo_context() and (coalesce(is_demo, false) = true or environment = 'demo'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'files' and policyname = 'files_admin_manage') then
    create policy files_admin_manage on public.files for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'files' and policyname = 'files_staff_read') then
    create policy files_staff_read on public.files for select using (public.has_app_role(array['sales', 'support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'files' and policyname = 'files_owner_read') then
    create policy files_owner_read on public.files for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'files' and policyname = 'files_demo_read') then
    create policy files_demo_read on public.files for select using (public.is_demo_context() and (coalesce(is_demo, false) = true or environment = 'demo'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'settings' and policyname = 'settings_admin_manage') then
    create policy settings_admin_manage on public.settings for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'settings' and policyname = 'settings_developer_read') then
    create policy settings_developer_read on public.settings for select using (public.has_app_role(array['developer']));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_emails' and policyname = 'demo_emails_admin_manage') then
    create policy demo_emails_admin_manage on public.demo_emails for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_emails' and policyname = 'demo_emails_demo_read') then
    create policy demo_emails_demo_read on public.demo_emails for select using (public.is_demo_context());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_logs' and policyname = 'activity_logs_admin_developer_read') then
    create policy activity_logs_admin_developer_read on public.activity_logs for select using (public.has_app_role(array['super_admin', 'admin', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_logs' and policyname = 'activity_logs_admin_insert') then
    create policy activity_logs_admin_insert on public.activity_logs for insert with check (public.has_app_role(array['super_admin', 'admin', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'import_logs' and policyname = 'import_logs_admin_developer_read') then
    create policy import_logs_admin_developer_read on public.import_logs for select using (public.has_app_role(array['super_admin', 'admin', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'import_logs' and policyname = 'import_logs_admin_insert') then
    create policy import_logs_admin_insert on public.import_logs for insert with check (public.has_app_role(array['super_admin', 'admin', 'developer']));
  end if;
end $$;

rollback;

-- Dit bestand eindigt bewust met rollback zodat kopieren/plakken niet per ongeluk policies live zet.
-- Voor productie: review, test in Supabase testproject, vervang rollback door commit en voer pas daarna gecontroleerd uit.
