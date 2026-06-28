-- Max Webstudio - Supabase RLS policy preparation
-- Fase 11.3: concept policies. Controleer claims/rollen voordat dit productie wordt.

create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'app_role', ''),
    (select role from public.profiles where auth_user_id = auth.uid() limit 1),
    'customer'
  )
$$;

create or replace function public.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
as $$
  select public.current_app_role() = any(allowed_roles)
$$;

create or replace function public.is_admin_role()
returns boolean
language sql
stable
as $$
  select public.has_app_role(array['super_admin', 'admin'])
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.websites enable row level security;
alter table public.projects enable row level security;
alter table public.files enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.subscriptions enable row level security;
alter table public.settings enable row level security;
alter table public.demo_emails enable row level security;
alter table public.activity_logs enable row level security;
alter table public.import_logs enable row level security;

drop policy if exists "admins manage profiles" on public.profiles;
drop policy if exists "admins manage customers" on public.customers;
drop policy if exists "admins manage leads" on public.leads;
drop policy if exists "admins manage websites" on public.websites;
drop policy if exists "admins manage projects" on public.projects;
drop policy if exists "admins manage files" on public.files;
drop policy if exists "admins manage quotes" on public.quotes;
drop policy if exists "admins manage quote lines" on public.quote_lines;
drop policy if exists "admins manage invoices" on public.invoices;
drop policy if exists "admins manage invoice lines" on public.invoice_lines;
drop policy if exists "admins manage subscriptions" on public.subscriptions;
drop policy if exists "admins manage settings" on public.settings;
drop policy if exists "admins manage demo emails" on public.demo_emails;
drop policy if exists "admins manage activity logs" on public.activity_logs;
drop policy if exists "admins manage import logs" on public.import_logs;
drop policy if exists "sales read leads customers quotes invoices" on public.leads;
drop policy if exists "sales read customers" on public.customers;
drop policy if exists "sales read quotes" on public.quotes;
drop policy if exists "sales read quote lines" on public.quote_lines;
drop policy if exists "sales read invoices" on public.invoices;
drop policy if exists "sales read invoice lines" on public.invoice_lines;
drop policy if exists "support read customers" on public.customers;
drop policy if exists "support read projects" on public.projects;
drop policy if exists "support read invoices" on public.invoices;
drop policy if exists "support read invoice lines" on public.invoice_lines;
drop policy if exists "developers read operational tables" on public.websites;
drop policy if exists "developers read projects" on public.projects;
drop policy if exists "developers read files" on public.files;
drop policy if exists "developers read activity logs" on public.activity_logs;
drop policy if exists "developers read import logs" on public.import_logs;
drop policy if exists "customers read own profile" on public.profiles;
drop policy if exists "customers read own customer" on public.customers;
drop policy if exists "customers read own websites" on public.websites;
drop policy if exists "customers read own projects" on public.projects;
drop policy if exists "customers read own files" on public.files;
drop policy if exists "customers read own quotes" on public.quotes;
drop policy if exists "customers read own quote lines" on public.quote_lines;
drop policy if exists "customers read own invoices" on public.invoices;
drop policy if exists "customers read own invoice lines" on public.invoice_lines;
drop policy if exists "customers read own subscriptions" on public.subscriptions;
drop policy if exists "demo users read demo customers" on public.customers;
drop policy if exists "demo users read demo websites" on public.websites;
drop policy if exists "demo users read demo projects" on public.projects;
drop policy if exists "demo users read demo quotes" on public.quotes;
drop policy if exists "demo users read demo invoices" on public.invoices;
drop policy if exists "demo users read demo subscriptions" on public.subscriptions;
drop policy if exists "demo users read demo emails" on public.demo_emails;

-- Admins: volledige toegang. Service role bypasses RLS sowieso server-side.
create policy "admins manage profiles" on public.profiles for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage customers" on public.customers for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage leads" on public.leads for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage websites" on public.websites for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage projects" on public.projects for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage files" on public.files for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage quotes" on public.quotes for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage quote lines" on public.quote_lines for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage invoices" on public.invoices for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage invoice lines" on public.invoice_lines for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage subscriptions" on public.subscriptions for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage settings" on public.settings for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage demo emails" on public.demo_emails for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage activity logs" on public.activity_logs for all using (public.is_admin_role()) with check (public.is_admin_role());
create policy "admins manage import logs" on public.import_logs for all using (public.is_admin_role()) with check (public.is_admin_role());

-- Sales: beperkt tot salesdata. Schrijven kan later via server-side functions strakker worden gemaakt.
create policy "sales read leads customers quotes invoices" on public.leads for select using (public.has_app_role(array['sales']));
create policy "sales read customers" on public.customers for select using (public.has_app_role(array['sales']));
create policy "sales read quotes" on public.quotes for select using (public.has_app_role(array['sales']));
create policy "sales read quote lines" on public.quote_lines for select using (
  public.has_app_role(array['sales']) and exists (select 1 from public.quotes q where q.id = quote_id)
);
create policy "sales read invoices" on public.invoices for select using (public.has_app_role(array['sales']));
create policy "sales read invoice lines" on public.invoice_lines for select using (
  public.has_app_role(array['sales']) and exists (select 1 from public.invoices i where i.id = invoice_id)
);

-- Support: klant/project/factuurdata lezen.
create policy "support read customers" on public.customers for select using (public.has_app_role(array['support']));
create policy "support read projects" on public.projects for select using (public.has_app_role(array['support']));
create policy "support read invoices" on public.invoices for select using (public.has_app_role(array['support']));
create policy "support read invoice lines" on public.invoice_lines for select using (
  public.has_app_role(array['support']) and exists (select 1 from public.invoices i where i.id = invoice_id)
);

-- Developer: technische read-only voorbereiding, migratie en validatie.
create policy "developers read operational tables" on public.websites for select using (public.has_app_role(array['developer']));
create policy "developers read projects" on public.projects for select using (public.has_app_role(array['developer']));
create policy "developers read files" on public.files for select using (public.has_app_role(array['developer']));
create policy "developers read activity logs" on public.activity_logs for select using (public.has_app_role(array['developer']));
create policy "developers read import logs" on public.import_logs for select using (public.has_app_role(array['developer']));

-- Customers: alleen eigen records. De FK loopt via customers.auth_user_id of profiles.auth_user_id.
create policy "customers read own profile" on public.profiles for select using (auth_user_id = auth.uid());
create policy "customers read own customer" on public.customers for select using (auth_user_id = auth.uid() or profile_id = public.current_profile_id());
create policy "customers read own websites" on public.websites for select using (
  exists (select 1 from public.customers c where c.id = customer_id and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id()))
);
create policy "customers read own projects" on public.projects for select using (
  exists (select 1 from public.customers c where c.id = customer_id and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id()))
);
create policy "customers read own files" on public.files for select using (
  exists (select 1 from public.customers c where c.id = customer_id and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id()))
);
create policy "customers read own quotes" on public.quotes for select using (
  exists (select 1 from public.customers c where c.id = customer_id and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id()))
);
create policy "customers read own quote lines" on public.quote_lines for select using (
  exists (
    select 1 from public.quotes q
    join public.customers c on c.id = q.customer_id
    where q.id = quote_id and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id())
  )
);
create policy "customers read own invoices" on public.invoices for select using (
  exists (select 1 from public.customers c where c.id = customer_id and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id()))
);
create policy "customers read own invoice lines" on public.invoice_lines for select using (
  exists (
    select 1 from public.invoices i
    join public.customers c on c.id = i.customer_id
    where i.id = invoice_id and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id())
  )
);
create policy "customers read own subscriptions" on public.subscriptions for select using (
  exists (select 1 from public.customers c where c.id = customer_id and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id()))
);

-- Demo user: alleen demo/environment demo records.
create policy "demo users read demo customers" on public.customers for select using (public.current_app_role() = 'demo_user' and is_demo = true and environment = 'demo');
create policy "demo users read demo websites" on public.websites for select using (public.current_app_role() = 'demo_user' and is_demo = true and environment = 'demo');
create policy "demo users read demo projects" on public.projects for select using (public.current_app_role() = 'demo_user' and is_demo = true and environment = 'demo');
create policy "demo users read demo quotes" on public.quotes for select using (public.current_app_role() = 'demo_user' and is_demo = true and environment = 'demo');
create policy "demo users read demo invoices" on public.invoices for select using (public.current_app_role() = 'demo_user' and is_demo = true and environment = 'demo');
create policy "demo users read demo subscriptions" on public.subscriptions for select using (public.current_app_role() = 'demo_user' and is_demo = true and environment = 'demo');
create policy "demo users read demo emails" on public.demo_emails for select using (public.current_app_role() = 'demo_user' and is_demo = true and environment = 'demo');

-- Let op:
-- 1. Supabase JWT custom claim app_role moet later server-side worden gezet.
-- 2. Adminmutaties blijven voorlopig via Netlify Functions/service role.
-- 3. Voer deze policies pas uit na schema review en test in een aparte Supabase omgeving.
