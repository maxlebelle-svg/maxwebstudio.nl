-- Max Web Studio - Mollie subscription retries and risk tracking
-- Run this in Supabase SQL Editor after the Mollie subscription SQL files.
-- Safe/idempotent: no tables are dropped and existing data is preserved.

alter table if exists public.customer_subscriptions
  add column if not exists last_failed_payment_at timestamptz null,
  add column if not exists last_failed_payment_id text null,
  add column if not exists failed_payment_count integer default 0,
  add column if not exists retry_status text null,
  add column if not exists retry_next_action_at timestamptz null,
  add column if not exists retry_last_email_sent_at timestamptz null,
  add column if not exists retry_last_admin_note text null,
  add column if not exists subscription_risk_level text default 'normal',
  add column if not exists subscription_last_error text null;

create index if not exists customer_subscriptions_retry_status_idx
  on public.customer_subscriptions (retry_status);

create index if not exists customer_subscriptions_retry_next_action_at_idx
  on public.customer_subscriptions (retry_next_action_at)
  where retry_next_action_at is not null;

create index if not exists customer_subscriptions_subscription_risk_level_idx
  on public.customer_subscriptions (subscription_risk_level);

create index if not exists customer_subscriptions_last_failed_payment_at_idx
  on public.customer_subscriptions (last_failed_payment_at desc)
  where last_failed_payment_at is not null;
