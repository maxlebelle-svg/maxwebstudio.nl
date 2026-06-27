-- Max Web Studio - Mollie subscription admin actions
-- Run this in Supabase SQL Editor after the base billing and Mollie subscription SQL files.
-- Safe/idempotent: no tables are dropped and existing data is preserved.

alter table if exists public.customer_subscriptions
  add column if not exists admin_action_last_type text null,
  add column if not exists admin_action_last_at timestamptz null,
  add column if not exists admin_action_last_error text null,
  add column if not exists cancellation_reason text null,
  add column if not exists cancellation_requested_at timestamptz null,
  add column if not exists resumed_at timestamptz null;

create index if not exists customer_subscriptions_admin_action_last_at_idx
  on public.customer_subscriptions (admin_action_last_at desc);

create index if not exists customer_subscriptions_cancellation_requested_at_idx
  on public.customer_subscriptions (cancellation_requested_at desc)
  where cancellation_requested_at is not null;

create index if not exists customer_subscriptions_resumed_at_idx
  on public.customer_subscriptions (resumed_at desc)
  where resumed_at is not null;
