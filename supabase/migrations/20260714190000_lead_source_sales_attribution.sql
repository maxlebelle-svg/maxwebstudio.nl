-- Forward-only, nullable source and sales attribution.
-- This migration intentionally performs no historical backfill.

do $$
begin
  if to_regclass('public.leads') is null then
    raise exception 'Preflight failed: public.leads does not exist';
  end if;
  if to_regclass('public.customers') is null then
    raise exception 'Preflight failed: public.customers does not exist';
  end if;
end $$;

alter table public.leads
  add column if not exists acquisition_channel text,
  add column if not exists sourced_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists closed_by_user_id uuid references auth.users(id) on delete set null;

alter table public.leads
  drop constraint if exists leads_acquisition_channel_check;

alter table public.leads
  add constraint leads_acquisition_channel_check check (
    acquisition_channel is null or acquisition_channel in (
      'website', 'email', 'outbound_sales', 'referral', 'phone',
      'social', 'partner', 'manual', 'import', 'other'
    )
  ) not valid;

alter table public.customers
  add column if not exists source_lead_id uuid references public.leads(id) on delete set null,
  add column if not exists acquisition_channel text,
  add column if not exists sourced_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists closed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists sold_at timestamptz;

alter table public.customers
  drop constraint if exists customers_acquisition_channel_check;

alter table public.customers
  add constraint customers_acquisition_channel_check check (
    acquisition_channel is null or acquisition_channel in (
      'website', 'email', 'outbound_sales', 'referral', 'phone',
      'social', 'partner', 'manual', 'import', 'other'
    )
  ) not valid;

create index if not exists leads_acquisition_channel_idx on public.leads(acquisition_channel) where acquisition_channel is not null;
create index if not exists leads_sourced_by_user_id_idx on public.leads(sourced_by_user_id) where sourced_by_user_id is not null;
create index if not exists leads_closed_by_user_id_idx on public.leads(closed_by_user_id) where closed_by_user_id is not null;
create index if not exists customers_source_lead_id_idx on public.customers(source_lead_id) where source_lead_id is not null;
create index if not exists customers_closed_by_user_id_idx on public.customers(closed_by_user_id) where closed_by_user_id is not null;

comment on column public.leads.external_source is 'Technical system or form that created the lead.';
comment on column public.leads.external_source_id is 'Technical external deduplication identifier.';
comment on column public.leads.acquisition_channel is 'Explicit commercial acquisition channel; null means unknown.';
comment on column public.leads.sourced_by_user_id is 'Explicit internal user who sourced the lead; never inferred historically.';
comment on column public.leads.closed_by_user_id is 'Explicit internal user who closed the successful sale.';
