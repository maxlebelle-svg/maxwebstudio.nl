-- Forward-only reconciliation for the production leads table.
-- This migration is intentionally safe to deploy after schema-compatible application code.

begin;

do $$
declare
  missing_columns text;
  unexpected_statuses text;
begin
  if to_regclass('public.leads') is null then
    raise exception 'Preflight failed: public.leads does not exist';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
    into missing_columns
  from (values ('id'), ('status'), ('metadata'), ('created_at'), ('updated_at')) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'leads'
      and c.column_name = required.column_name
  );

  if missing_columns is not null then
    raise exception 'Preflight failed: public.leads misses baseline columns: %', missing_columns;
  end if;

  select string_agg(distinct status, ', ' order by status)
    into unexpected_statuses
  from public.leads
  where nullif(btrim(status), '') is not null
    and lower(btrim(status)) not in (
      'new', 'nieuw', 'lead', 'reviewing', 'in_beoordeling', 'in beoordeling',
      'interesting', 'interesse', 'qualified', 'gekwalificeerd',
      'not_interesting', 'niet_interessant', 'niet interessant',
      'assigned', 'toegewezen', 'call_scheduled', 'belafspraak',
      'contact_attempted', 'contactpoging', 'contacted', 'contact',
      'follow_up', 'opvolgen', 'appointment_scheduled', 'afspraak',
      'demo_requested', 'demo_aangevraagd', 'demo_building', 'demo_in_bouw',
      'demo_ready', 'demo_klaar', 'demo_sent', 'demo_verstuurd',
      'proposal_sent', 'voorstel_verstuurd', 'negotiation', 'onderhandeling',
      'won', 'gewonnen', 'lost', 'verloren', 'customer', 'klant'
    );

  if unexpected_statuses is not null then
    raise exception 'Preflight failed: unmapped lead status values: %', unexpected_statuses;
  end if;
end
$$;

alter table public.leads
  add column if not exists lead_status text,
  add column if not exists normalized_company_name text,
  add column if not exists normalized_phone text,
  add column if not exists external_source text,
  add column if not exists external_source_id text,
  add column if not exists last_activity_at timestamptz;

update public.leads
set
  lead_status = case lower(btrim(coalesce(
    nullif(metadata ->> 'leadStatus', ''),
    nullif(metadata ->> 'lead_status', ''),
    status,
    'new'
  )))
    when 'nieuw' then 'new'
    when 'lead' then 'new'
    when 'in_beoordeling' then 'reviewing'
    when 'in beoordeling' then 'reviewing'
    when 'interesse' then 'interesting'
    when 'qualified' then 'interesting'
    when 'gekwalificeerd' then 'interesting'
    when 'niet_interessant' then 'not_interesting'
    when 'niet interessant' then 'not_interesting'
    when 'toegewezen' then 'assigned'
    when 'belafspraak' then 'call_scheduled'
    when 'contactpoging' then 'contact_attempted'
    when 'contact' then 'contacted'
    when 'opvolgen' then 'follow_up'
    when 'afspraak' then 'appointment_scheduled'
    when 'demo_aangevraagd' then 'demo_requested'
    when 'demo_in_bouw' then 'demo_building'
    when 'demo_klaar' then 'demo_ready'
    when 'demo_verstuurd' then 'demo_sent'
    when 'voorstel_verstuurd' then 'proposal_sent'
    when 'onderhandeling' then 'negotiation'
    when 'gewonnen' then 'won'
    when 'verloren' then 'lost'
    when 'klant' then 'customer'
    else lower(btrim(coalesce(nullif(metadata ->> 'leadStatus', ''), nullif(metadata ->> 'lead_status', ''), status, 'new')))
  end,
  normalized_company_name = coalesce(
    nullif(normalized_company_name, ''),
    nullif(regexp_replace(lower(coalesce(company_name, '')), '[^[:alnum:]]+', '', 'g'), '')
  ),
  normalized_phone = coalesce(
    nullif(normalized_phone, ''),
    nullif(regexp_replace(coalesce(phone, ''), '[^0-9+]+', '', 'g'), '')
  ),
  external_source = coalesce(nullif(external_source, ''), nullif(metadata ->> 'externalSource', ''), nullif(metadata ->> 'source', '')),
  external_source_id = coalesce(nullif(external_source_id, ''), nullif(metadata ->> 'externalSourceId', ''), nullif(metadata ->> 'publicRequestId', '')),
  last_activity_at = coalesce(last_activity_at, updated_at, created_at, now());

do $$
declare
  invalid_count bigint;
  duplicate_keys text;
begin
  select count(*) into invalid_count
  from public.leads
  where lead_status is null
     or lead_status not in (
       'new', 'reviewing', 'interesting', 'not_interesting', 'assigned',
       'call_scheduled', 'contact_attempted', 'contacted', 'follow_up',
       'appointment_scheduled', 'demo_requested', 'demo_building',
       'demo_ready', 'demo_sent', 'proposal_sent', 'negotiation',
       'won', 'lost', 'customer'
     );
  if invalid_count > 0 then
    raise exception 'Validation failed: % leads have an invalid canonical lifecycle', invalid_count;
  end if;

  select string_agg(external_source || ':' || external_source_id, ', ')
    into duplicate_keys
  from (
    select external_source, external_source_id
    from public.leads
    where external_source is not null and external_source_id is not null
    group by external_source, external_source_id
    having count(*) > 1
  ) duplicates;
  if duplicate_keys is not null then
    raise exception 'Validation failed: duplicate external lead keys: %', duplicate_keys;
  end if;
end
$$;

alter table public.leads alter column lead_status set default 'new';
alter table public.leads alter column lead_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_lead_status_check'
  ) then
    alter table public.leads
      add constraint leads_lead_status_check check (
        lead_status in (
          'new', 'reviewing', 'interesting', 'not_interesting', 'assigned',
          'call_scheduled', 'contact_attempted', 'contacted', 'follow_up',
          'appointment_scheduled', 'demo_requested', 'demo_building',
          'demo_ready', 'demo_sent', 'proposal_sent', 'negotiation',
          'won', 'lost', 'customer'
        )
      ) not valid;
  end if;
end
$$;

alter table public.leads validate constraint leads_lead_status_check;

create index if not exists leads_lead_status_idx on public.leads (lead_status);
create index if not exists leads_normalized_company_name_idx on public.leads (normalized_company_name);
create index if not exists leads_normalized_phone_idx on public.leads (normalized_phone);
create unique index if not exists leads_external_source_id_uidx
  on public.leads (external_source, external_source_id)
  where external_source is not null and external_source_id is not null;

comment on column public.leads.lead_status is
  'Canonical English lifecycle status; legacy status remains a temporary compatibility field.';

commit;
