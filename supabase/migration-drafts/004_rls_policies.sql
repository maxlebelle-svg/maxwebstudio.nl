-- Max Webstudio - Supabase RLS Policies Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
-- This draft intentionally avoids DROP POLICY statements.

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
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_sales_update') then
    create policy customers_sales_update on public.customers for update using (public.has_app_role(array['sales'])) with check (public.has_app_role(array['sales']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customers' and policyname = 'customers_staff_read') then
    create policy customers_staff_read on public.customers for select using (public.has_app_role(array['sales', 'support', 'developer']));
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
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leads' and policyname = 'leads_admin_sales_manage') then
    create policy leads_admin_sales_manage on public.leads for all using (public.has_app_role(array['super_admin', 'admin', 'sales'])) with check (public.has_app_role(array['super_admin', 'admin', 'sales']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leads' and policyname = 'leads_support_developer_read') then
    create policy leads_support_developer_read on public.leads for select using (public.has_app_role(array['support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'leads' and policyname = 'leads_demo_read') then
    create policy leads_demo_read on public.leads for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_admin_manage') then
    create policy websites_admin_manage on public.websites for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_developer_update') then
    create policy websites_developer_update on public.websites for update using (public.has_app_role(array['developer'])) with check (public.has_app_role(array['developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'websites' and policyname = 'websites_staff_read') then
    create policy websites_staff_read on public.websites for select using (public.has_app_role(array['sales', 'support', 'developer']));
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
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_support_update') then
    create policy projects_support_update on public.projects for update using (public.has_app_role(array['support'])) with check (public.has_app_role(array['support']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_staff_read') then
    create policy projects_staff_read on public.projects for select using (public.has_app_role(array['sales', 'support', 'developer']));
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
    create policy quotes_demo_read on public.quotes for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_lines' and policyname = 'quote_lines_admin_sales_manage') then
    create policy quote_lines_admin_sales_manage on public.quote_lines for all using (
      public.is_admin_role() or public.has_app_role(array['sales'])
    ) with check (
      public.is_admin_role() or public.has_app_role(array['sales'])
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_lines' and policyname = 'quote_lines_owner_read') then
    create policy quote_lines_owner_read on public.quote_lines for select using (
      exists (select 1 from public.quotes q where q.id = quote_id and public.owns_customer(q.customer_id))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_lines' and policyname = 'quote_lines_staff_read') then
    create policy quote_lines_staff_read on public.quote_lines for select using (public.has_app_role(array['support', 'developer']));
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
    create policy invoices_demo_read on public.invoices for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_lines' and policyname = 'invoice_lines_admin_manage') then
    create policy invoice_lines_admin_manage on public.invoice_lines for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_lines' and policyname = 'invoice_lines_owner_read') then
    create policy invoice_lines_owner_read on public.invoice_lines for select using (
      exists (select 1 from public.invoices i where i.id = invoice_id and public.owns_customer(i.customer_id))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_lines' and policyname = 'invoice_lines_staff_read') then
    create policy invoice_lines_staff_read on public.invoice_lines for select using (public.has_app_role(array['sales', 'support', 'developer']));
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
    create policy subscriptions_demo_read on public.subscriptions for select using (public.is_demo_record(is_demo, environment));
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
    create policy files_owner_read on public.files for select using (is_client_visible = true and public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'files' and policyname = 'files_demo_read') then
    create policy files_demo_read on public.files for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_admin_manage') then
    create policy change_requests_admin_manage on public.change_requests for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_support_update') then
    create policy change_requests_support_update on public.change_requests for update using (public.has_app_role(array['support'])) with check (public.has_app_role(array['support']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_staff_read') then
    create policy change_requests_staff_read on public.change_requests for select using (public.has_app_role(array['sales', 'support', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_owner_read') then
    create policy change_requests_owner_read on public.change_requests for select using (auth_user_id = auth.uid() or public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_requests' and policyname = 'change_requests_customer_insert') then
    create policy change_requests_customer_insert on public.change_requests for insert with check (auth_user_id = auth.uid() or public.owns_customer(customer_id));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_tasks' and policyname = 'crm_tasks_admin_manage') then
    create policy crm_tasks_admin_manage on public.crm_tasks for all using (public.is_admin_role()) with check (public.is_admin_role());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_tasks' and policyname = 'crm_tasks_sales_support_manage') then
    create policy crm_tasks_sales_support_manage on public.crm_tasks for all using (public.has_app_role(array['sales', 'support'])) with check (public.has_app_role(array['sales', 'support']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'crm_tasks' and policyname = 'crm_tasks_developer_read') then
    create policy crm_tasks_developer_read on public.crm_tasks for select using (public.has_app_role(array['developer']));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_messages' and policyname = 'client_portal_messages_admin_support_manage') then
    create policy client_portal_messages_admin_support_manage on public.client_portal_messages for all using (public.has_app_role(array['super_admin', 'admin', 'support'])) with check (public.has_app_role(array['super_admin', 'admin', 'support']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_messages' and policyname = 'client_portal_messages_owner_read') then
    create policy client_portal_messages_owner_read on public.client_portal_messages for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_messages' and policyname = 'client_portal_messages_owner_insert') then
    create policy client_portal_messages_owner_insert on public.client_portal_messages for insert with check (public.owns_customer(customer_id));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_notifications' and policyname = 'client_portal_notifications_admin_support_manage') then
    create policy client_portal_notifications_admin_support_manage on public.client_portal_notifications for all using (public.has_app_role(array['super_admin', 'admin', 'support'])) with check (public.has_app_role(array['super_admin', 'admin', 'support']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_notifications' and policyname = 'client_portal_notifications_owner_read') then
    create policy client_portal_notifications_owner_read on public.client_portal_notifications for select using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'client_portal_notifications' and policyname = 'client_portal_notifications_owner_mark_read') then
    create policy client_portal_notifications_owner_mark_read on public.client_portal_notifications for update using (public.owns_customer(customer_id)) with check (public.owns_customer(customer_id));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_drafts' and policyname = 'ai_drafts_internal_manage') then
    create policy ai_drafts_internal_manage on public.ai_drafts for all using (public.has_app_role(array['super_admin', 'admin', 'developer'])) with check (public.has_app_role(array['super_admin', 'admin', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_drafts' and policyname = 'ai_drafts_sales_support_read') then
    create policy ai_drafts_sales_support_read on public.ai_drafts for select using (public.has_app_role(array['sales', 'support']));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_assistant_drafts' and policyname = 'ai_assistant_drafts_internal_manage') then
    create policy ai_assistant_drafts_internal_manage on public.ai_assistant_drafts for all using (public.has_app_role(array['super_admin', 'admin', 'developer', 'sales', 'support'])) with check (public.has_app_role(array['super_admin', 'admin', 'developer', 'sales', 'support']));
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
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_emails' and policyname = 'demo_emails_internal_manage') then
    create policy demo_emails_internal_manage on public.demo_emails for all using (public.has_app_role(array['super_admin', 'admin', 'sales', 'developer'])) with check (public.has_app_role(array['super_admin', 'admin', 'sales', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_emails' and policyname = 'demo_emails_demo_read') then
    create policy demo_emails_demo_read on public.demo_emails for select using (public.is_demo_record(is_demo, environment));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_logs' and policyname = 'activity_logs_internal_read') then
    create policy activity_logs_internal_read on public.activity_logs for select using (public.has_app_role(array['super_admin', 'admin', 'developer']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activity_logs' and policyname = 'activity_logs_internal_insert') then
    create policy activity_logs_internal_insert on public.activity_logs for insert with check (public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer']));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'import_logs' and policyname = 'import_logs_admin_developer_read') then
    create policy import_logs_admin_developer_read on public.import_logs for select using (public.has_app_role(array['super_admin', 'admin', 'developer']));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_admin_read') then
    create policy audit_logs_admin_read on public.audit_logs for select using (public.has_app_role(array['super_admin', 'admin']));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'audit_logs_server_insert_placeholder') then
    create policy audit_logs_server_insert_placeholder on public.audit_logs for insert with check (public.has_app_role(array['super_admin', 'admin', 'developer']));
  end if;
end $$;

commit;
