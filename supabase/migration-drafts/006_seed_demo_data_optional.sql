-- Max Webstudio - Optional Demo Seed Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
-- TEST/DEMO ONLY. DO NOT RUN IN PRODUCTION UNLESS EXPLICITLY APPROVED.

insert into public.settings (
  workspace_key,
  company_name,
  email,
  invoice_prefix,
  quote_prefix,
  default_vat_rate,
  payment_term_days,
  metadata
)
values (
  'demo',
  'Max Webstudio Demo',
  'demo@example.test',
  'DEMO-F',
  'DEMO-O',
  21,
  14,
  '{"seed": "phase_24_optional_demo"}'::jsonb
)
on conflict (workspace_key) do nothing;

insert into public.customers (
  id,
  name,
  company,
  email,
  phone,
  website,
  package,
  status,
  portal_status,
  is_demo,
  environment,
  metadata
)
values (
  '00000000-0000-4000-8000-000000000101',
  'Demo Klant',
  'Demo Bouwbedrijf BV',
  'demo-klant@example.test',
  '+31000000000',
  'https://demo.example.test',
  'Business Website',
  'active',
  'prepared',
  true,
  'demo',
  '{"seed": "phase_24_optional_demo"}'::jsonb
)
on conflict (id) do nothing;

insert into public.websites (
  id,
  customer_id,
  name,
  domain,
  live_url,
  status,
  hosting_package,
  care_package,
  ssl_status,
  is_demo,
  environment,
  metadata
)
values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'Demo Website',
  'demo.example.test',
  'https://demo.example.test',
  'online',
  'Managed Hosting',
  'Care Basic',
  'active',
  true,
  'demo',
  '{"seed": "phase_24_optional_demo"}'::jsonb
)
on conflict (id) do nothing;

