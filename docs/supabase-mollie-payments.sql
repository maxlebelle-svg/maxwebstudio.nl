-- Supabase migration for Mollie invoice payment requests.
-- Safe to run after /docs/supabase-billing.sql.
--
-- customer_invoices already has:
-- - mollie_payment_id
-- - status
-- - paid_at
-- - notes
--
-- This migration adds checkout/status metadata for one-off Mollie payments.

alter table public.customer_invoices
  add column if not exists mollie_checkout_url text,
  add column if not exists mollie_payment_status text,
  add column if not exists mollie_payment_created_at timestamptz,
  add column if not exists mollie_payment_expires_at timestamptz;

create index if not exists customer_invoices_mollie_payment_id_idx
  on public.customer_invoices (mollie_payment_id)
  where mollie_payment_id is not null;

create index if not exists customer_invoices_mollie_payment_status_idx
  on public.customer_invoices (mollie_payment_status);

-- Admin creates Mollie payments through /.netlify/functions/admin-mollie-payment.
-- Webhook status updates are handled by /.netlify/functions/mollie-webhook.
-- MOLLIE_API_KEY, SUPABASE_SERVICE_ROLE_KEY and ADMIN_TOKEN stay server-side.
