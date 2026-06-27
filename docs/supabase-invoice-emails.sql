-- Max Web Studio - invoice email tracking
-- Run this file in the Supabase SQL Editor.
-- Safe to run multiple times.

alter table public.customer_invoices
  add column if not exists email_sent_at timestamptz null,
  add column if not exists payment_reminder_sent_at timestamptz null,
  add column if not exists paid_email_sent_at timestamptz null,
  add column if not exists expired_email_sent_at timestamptz null,
  add column if not exists email_last_error text null;

create index if not exists customer_invoices_email_sent_at_idx
  on public.customer_invoices (email_sent_at);

create index if not exists customer_invoices_payment_reminder_sent_at_idx
  on public.customer_invoices (payment_reminder_sent_at);

create index if not exists customer_invoices_paid_email_sent_at_idx
  on public.customer_invoices (paid_email_sent_at);

create index if not exists customer_invoices_expired_email_sent_at_idx
  on public.customer_invoices (expired_email_sent_at);
