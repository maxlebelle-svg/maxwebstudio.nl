-- Draft only: central lead lifecycle, qualification fields and deduplication indexes.
-- Non-destructive. Review and deploy through the normal Supabase release process.

alter table public.leads
  add column if not exists lead_status text not null default 'new',
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists rejection_reason text,
  add column if not exists rejection_note text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid,
  add column if not exists assigned_user_id uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid,
  add column if not exists normalized_company_name text,
  add column if not exists normalized_domain text,
  add column if not exists normalized_phone text,
  add column if not exists external_source text,
  add column if not exists external_source_id text,
  add column if not exists last_activity_at timestamptz,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists next_action_at timestamptz,
  add column if not exists lead_score_reasoning text,
  add column if not exists lead_score_updated_at timestamptz;

update public.leads
set lead_status = case
  when coalesce(lead_status, '') <> '' then lead_status
  when status in ('lost', 'geen_interesse') then 'not_interesting'
  when status in ('qualified', 'interesse') then 'interesting'
  when status in ('contacted', 'gebeld') then 'contacted'
  when status in ('follow_up', 'opvolgen', 'contact_planned', 'bellen') then 'follow_up'
  when status in ('converted', 'geconverteerd', 'customer_active', 'klant_actief') then 'customer'
  when status in ('won', 'verkocht') then 'won'
  else 'new'
end
where coalesce(lead_status, '') = '' or lead_status = 'new';

update public.leads
set last_activity_at = coalesce(last_activity_at, updated_at, created_at)
where last_activity_at is null;

create index if not exists leads_lead_status_idx on public.leads(lead_status);
create index if not exists leads_reviewed_at_idx on public.leads(reviewed_at desc);
create index if not exists leads_rejection_reason_idx on public.leads(rejection_reason);
create index if not exists leads_assigned_user_id_idx on public.leads(assigned_user_id);
create index if not exists leads_last_activity_at_idx on public.leads(last_activity_at desc);
create index if not exists leads_external_source_id_idx on public.leads(external_source, external_source_id)
  where external_source_id is not null and external_source_id <> '';
create unique index if not exists leads_unique_external_source_id_idx on public.leads(external_source, external_source_id)
  where external_source_id is not null and external_source_id <> '';
create unique index if not exists leads_unique_normalized_domain_idx on public.leads(normalized_domain)
  where normalized_domain is not null and normalized_domain <> '';
create index if not exists leads_normalized_phone_idx on public.leads(normalized_phone)
  where normalized_phone is not null and normalized_phone <> '';
create index if not exists leads_normalized_company_city_idx on public.leads(normalized_company_name, ((metadata->>'city')))
  where normalized_company_name is not null and normalized_company_name <> '';

alter table public.leads
  drop constraint if exists leads_lead_status_check;

alter table public.leads
  add constraint leads_lead_status_check check (
    lead_status in (
      'new',
      'reviewing',
      'interesting',
      'not_interesting',
      'assigned',
      'call_scheduled',
      'contacted',
      'follow_up',
      'demo_requested',
      'demo_building',
      'demo_ready',
      'demo_sent',
      'proposal_sent',
      'won',
      'lost',
      'customer'
    )
  );

comment on column public.leads.lead_status is 'Central lifecycle status for lead generator, sales and CRM follow-up.';
comment on column public.leads.normalized_domain is 'Deduplication identifier. Stores root domain such as voorbeeld.nl.';
comment on column public.leads.external_source_id is 'Hard deduplication identifier such as Google Place ID.';
