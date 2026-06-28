-- Max Webstudio - Supabase demo seed preparation
-- Fase 11.3: voorbeelddata voor demo-omgeving. Niet automatisch uitvoeren.

insert into public.profiles (id, name, email, phone, role, status, is_demo, environment, metadata)
values (
  '10000000-0000-4000-8000-000000000001',
  'Demo Klant',
  'demo@maxwebstudio.nl',
  '06-12345678',
  'customer',
  'active',
  true,
  'demo',
  '{"source":"seed-demo"}'::jsonb
)
on conflict (id) do update set updated_at = now();

insert into public.customers (id, profile_id, name, company, email, phone, website, package, status, customer_since, is_demo, environment, metadata)
values (
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000001',
  'Demo Klant',
  'Timmerbedrijf De Vries',
  'demo@maxwebstudio.nl',
  '06-12345678',
  'https://timmerbedrijfdevries.nl',
  'Care Plus',
  'active',
  current_date,
  true,
  'demo',
  '{"demoJourneyId":"supabase-demo"}'::jsonb
)
on conflict (id) do update set updated_at = now();

insert into public.websites (id, customer_id, profile_id, name, domain, live_url, github_branch, status, hosting_package, care_package, ssl_status, is_demo, environment)
values (
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000001',
  'Website Timmerbedrijf De Vries',
  'timmerbedrijfdevries.nl',
  'https://timmerbedrijfdevries.nl',
  'main',
  'online',
  'Managed hosting',
  'Care Plus',
  'active',
  true,
  'demo'
)
on conflict (id) do update set updated_at = now();

insert into public.projects (id, customer_id, website_id, name, type, status, phase, progress, start_date, deadline, checklist, tasks, timeline, is_demo, environment)
values (
  '10000000-0000-4000-8000-000000000301',
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000201',
  'Nieuwe website Timmerbedrijf De Vries',
  'Nieuwe website',
  'onboarding',
  'Intake',
  35,
  current_date,
  current_date + interval '14 days',
  '[{"label":"Logo ontvangen","completed":true},{"label":"Teksten ontvangen","completed":false}]'::jsonb,
  '[{"label":"Homepage opzetten","status":"open"},{"label":"Contactformulier testen","status":"open"}]'::jsonb,
  '[{"action":"Project aangemaakt","createdAt":"demo"}]'::jsonb,
  true,
  'demo'
)
on conflict (id) do update set updated_at = now();

insert into public.quotes (id, customer_id, website_id, project_id, quote_number, type, title, status, quote_date, valid_until, subtotal, vat, total, proposal, is_demo, environment)
values (
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000301',
  'OFF-DEMO-001',
  'Website + onderhoud',
  'Business Website + Care Plus',
  'verzonden',
  current_date,
  current_date + interval '14 days',
  995,
  208.95,
  1203.95,
  'Demo-offerte voor een professionele bedrijfswebsite.',
  true,
  'demo'
)
on conflict (id) do update set updated_at = now();

insert into public.quote_lines (id, quote_id, description, quantity, unit_price, vat_rate, line_total, position)
values
  ('10000000-0000-4000-8000-000000000411', '10000000-0000-4000-8000-000000000401', 'Business Website', 1, 995, 21, 1203.95, 1),
  ('10000000-0000-4000-8000-000000000412', '10000000-0000-4000-8000-000000000401', 'Care Plus - eerste maand', 1, 49, 21, 59.29, 2)
on conflict (id) do update set updated_at = now();

insert into public.subscriptions (id, customer_id, website_id, project_id, plan, status, billing_cycle, price_ex_vat, vat_rate, total_incl_vat, start_date, next_invoice_date, auto_invoice_enabled, is_demo, environment)
values (
  '10000000-0000-4000-8000-000000000601',
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000301',
  'Care Plus',
  'active',
  'monthly',
  49,
  21,
  59.29,
  current_date,
  current_date + interval '1 month',
  false,
  true,
  'demo'
)
on conflict (id) do update set updated_at = now();

insert into public.invoices (id, customer_id, website_id, project_id, source_quote_id, subscription_id, invoice_number, type, title, status, invoice_date, due_date, subtotal, vat, total, payment_link, notes, is_demo, environment)
values (
  '10000000-0000-4000-8000-000000000501',
  '10000000-0000-4000-8000-000000000101',
  '10000000-0000-4000-8000-000000000201',
  '10000000-0000-4000-8000-000000000301',
  '10000000-0000-4000-8000-000000000401',
  '10000000-0000-4000-8000-000000000601',
  'INV-DEMO-001',
  'Aanbetaling',
  'Aanbetaling Business Website',
  'verzonden',
  current_date,
  current_date + interval '14 days',
  300,
  63,
  363,
  '/betalen.html?invoiceId=10000000-0000-4000-8000-000000000501',
  'Aangemaakt vanuit demo seed.',
  true,
  'demo'
)
on conflict (id) do update set updated_at = now();

insert into public.invoice_lines (id, invoice_id, description, quantity, unit_price, vat_rate, line_total, position)
values ('10000000-0000-4000-8000-000000000511', '10000000-0000-4000-8000-000000000501', 'Aanbetaling Business Website', 1, 300, 21, 363, 1)
on conflict (id) do update set updated_at = now();

insert into public.demo_emails (id, customer_id, type, subject, recipient, body, status, is_demo, environment)
values (
  '10000000-0000-4000-8000-000000000701',
  '10000000-0000-4000-8000-000000000101',
  'quote_sent',
  'Je demo-offerte staat klaar',
  'demo@maxwebstudio.nl',
  'Bekijk je offerte in het demo klantportaal.',
  'demo/verzonden lokaal',
  true,
  'demo'
)
on conflict (id) do update set updated_at = now();

insert into public.activity_logs (id, profile_id, entity_type, entity_id, action, performed_by, is_demo, environment, metadata)
values (
  '10000000-0000-4000-8000-000000000801',
  '10000000-0000-4000-8000-000000000001',
  'demo',
  '10000000-0000-4000-8000-000000000101',
  'seed_demo_created',
  'seed-demo.sql',
  true,
  'demo',
  '{"note":"Supabase demo seed voorbereid"}'::jsonb
)
on conflict (id) do nothing;
