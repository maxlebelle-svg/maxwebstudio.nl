-- Supabase schema for Max Web Studio Billing & Subscriptions.
-- Safe to run after /docs/supabase-client-portal.sql.

create table if not exists public.customer_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  customer_auth_user_id uuid references auth.users(id) on delete set null,
  package_name text,
  billing_cycle text default 'monthly',
  monthly_amount numeric,
  status text default 'active',
  start_date date,
  next_invoice_date date,
  mollie_customer_id text,
  mollie_subscription_id text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.customer_invoices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  customer_auth_user_id uuid references auth.users(id) on delete set null,
  invoice_number text,
  title text,
  amount numeric,
  status text default 'draft',
  due_date date,
  paid_at timestamptz,
  pdf_file_path text,
  mollie_payment_id text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists customer_subscriptions_profile_id_idx
  on public.customer_subscriptions (profile_id);

create index if not exists customer_subscriptions_auth_user_id_idx
  on public.customer_subscriptions (customer_auth_user_id);

create index if not exists customer_subscriptions_status_idx
  on public.customer_subscriptions (status);

create index if not exists customer_subscriptions_next_invoice_date_idx
  on public.customer_subscriptions (next_invoice_date);

create index if not exists customer_invoices_profile_id_idx
  on public.customer_invoices (profile_id);

create index if not exists customer_invoices_auth_user_id_idx
  on public.customer_invoices (customer_auth_user_id);

create index if not exists customer_invoices_status_idx
  on public.customer_invoices (status);

create index if not exists customer_invoices_due_date_idx
  on public.customer_invoices (due_date);

create unique index if not exists customer_invoices_invoice_number_idx
  on public.customer_invoices (invoice_number)
  where invoice_number is not null;

alter table public.customer_subscriptions enable row level security;
alter table public.customer_invoices enable row level security;

drop policy if exists "Clients can read own subscriptions" on public.customer_subscriptions;
create policy "Clients can read own subscriptions"
  on public.customer_subscriptions
  for select
  to authenticated
  using (auth.uid() = customer_auth_user_id);

drop policy if exists "Clients can read own invoices" on public.customer_invoices;
create policy "Clients can read own invoices"
  on public.customer_invoices
  for select
  to authenticated
  using (auth.uid() = customer_auth_user_id);

-- Admin and Netlify Functions continue to use SUPABASE_SERVICE_ROLE_KEY.
-- No client insert/update/delete policies are created.
