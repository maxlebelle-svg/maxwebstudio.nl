-- Supabase migration for Mollie Customers & Subscriptions.
-- Safe to run after /docs/supabase-billing.sql.
-- Run this file in the Supabase SQL Editor.

alter table public.customer_subscriptions
  add column if not exists mollie_customer_id text,
  add column if not exists mollie_subscription_id text,
  add column if not exists mollie_subscription_status text,
  add column if not exists mollie_mandate_id text,
  add column if not exists last_payment_at timestamptz,
  add column if not exists next_payment_at timestamptz,
  add column if not exists canceled_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create index if not exists customer_subscriptions_mollie_customer_id_idx
  on public.customer_subscriptions (mollie_customer_id)
  where mollie_customer_id is not null;

create unique index if not exists customer_subscriptions_mollie_subscription_id_idx
  on public.customer_subscriptions (mollie_subscription_id)
  where mollie_subscription_id is not null;

create index if not exists customer_subscriptions_mollie_subscription_status_idx
  on public.customer_subscriptions (mollie_subscription_status);

create index if not exists customer_subscriptions_next_payment_at_idx
  on public.customer_subscriptions (next_payment_at);

-- Admin creates Mollie customers/subscriptions through:
-- /.netlify/functions/admin-mollie-subscription
--
-- MOLLIE_API_KEY, SUPABASE_SERVICE_ROLE_KEY and ADMIN_TOKEN stay server-side.
-- Webhook synchronisation, pausing, resuming and cancellation are intentionally
-- outside this first foundation phase.
