-- Supabase Storage setup for Max Web Studio invoice PDFs.
-- Run this after /docs/supabase-billing.sql.
--
-- Goal:
-- - Private bucket: invoice-pdfs
-- - Admin uploads happen manually in Supabase or later server-side via service role.
-- - Customers do not browse this bucket directly.
-- - Customer downloads go through /.netlify/functions/invoice-download,
--   which checks Supabase Auth, verifies customer_invoices.customer_auth_user_id,
--   and creates a short-lived signed URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoice-pdfs',
  'invoice-pdfs',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

-- No authenticated SELECT/INSERT/UPDATE/DELETE policies are created for storage.objects.
-- This prevents customers from browsing invoice PDFs through the browser anon key.
-- The Netlify Function uses SUPABASE_SERVICE_ROLE_KEY server-side to generate signed URLs.
-- Store only the object path in public.customer_invoices.pdf_file_path, for example:
--   2026/max-webstudio/factuur-2026-001.pdf
-- Do not store a public Supabase URL in pdf_file_path.
