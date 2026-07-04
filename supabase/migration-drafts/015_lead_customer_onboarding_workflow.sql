-- Draft migration: Lead to customer onboarding workflow
-- Review before running. This file is intentionally kept in migration-drafts and must not be
-- applied to production automatically.

begin;

alter table public.leads
  add column if not exists customer_id uuid references public.customers(id) on delete set null;

alter table public.customers
  add column if not exists company_name text,
  add column if not exists contact_name text,
  add column if not exists package text check (package in ('Basis', 'Plus', 'Premium')),
  add column if not exists status text not null default 'actief' check (status in ('actief', 'onboarding', 'gearchiveerd')),
  add column if not exists portal_status text not null default 'niet_actief' check (portal_status in ('niet_actief', 'uitnodiging_klaar', 'uitgenodigd', 'actief')),
  add column if not exists created_from_lead_id uuid references public.leads(id) on delete set null;

create index if not exists leads_customer_id_idx on public.leads(customer_id);
create index if not exists customers_created_from_lead_id_idx on public.customers(created_from_lead_id);
create index if not exists customers_email_lookup_idx on public.customers(lower(email));
create index if not exists customers_website_lookup_idx on public.customers(lower(website));
create index if not exists customers_company_name_lookup_idx on public.customers(lower(company_name));

comment on column public.leads.customer_id is 'Draft: links a sold lead to the customer created from it.';
comment on column public.customers.created_from_lead_id is 'Draft: original lead used to create this customer.';
comment on column public.customers.portal_status is 'Draft: niet_actief, uitnodiging_klaar, uitgenodigd, actief.';

commit;
