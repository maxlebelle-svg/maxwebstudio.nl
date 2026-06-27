-- Supabase migration for Mollie mandate and subscription synchronisation.
-- Safe to run after /docs/supabase-mollie-subscriptions.sql.
-- Run this file in the Supabase SQL Editor.

alter table public.customer_subscriptions
  add column if not exists mandate_status text null,
  add column if not exists mandate_reference text null,
  add column if not exists mandate_checkout_url text null,
  add column if not exists mandate_payment_id text null,
  add column if not exists mandate_payment_status text null,
  add column if not exists subscription_synced_at timestamptz null,
  add column if not exists webhook_last_event text null,
  add column if not exists webhook_last_received_at timestamptz null;

create index if not exists customer_subscriptions_mandate_status_idx
  on public.customer_subscriptions (mandate_status);

create index if not exists customer_subscriptions_mandate_payment_id_idx
  on public.customer_subscriptions (mandate_payment_id)
  where mandate_payment_id is not null;

create index if not exists customer_subscriptions_mandate_payment_status_idx
  on public.customer_subscriptions (mandate_payment_status);

create index if not exists customer_subscriptions_subscription_synced_at_idx
  on public.customer_subscriptions (subscription_synced_at);

create index if not exists customer_subscriptions_webhook_last_received_at_idx
  on public.customer_subscriptions (webhook_last_received_at);

-- The mandate checkout URL is customer-visible through RLS on customer_subscriptions.
-- It must only be written after a server-side Mollie payment with sequenceType = first.
-- Webhooks are handled by /.netlify/functions/mollie-webhook.
