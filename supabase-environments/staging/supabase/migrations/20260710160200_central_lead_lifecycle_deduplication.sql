-- Central lead lifecycle, qualification fields and deduplication support.
-- Non-destructive and idempotent for older and newer public.leads schemas.

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

create or replace function public.mws_normalize_domain(input text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(trim(coalesce(input, ''))), '^https?://', ''),
        '^www\.',
        ''
      ),
      '/.*$',
      ''
    ),
    ''
  );
$$;

create or replace function public.mws_normalize_phone(input text)
returns text
language sql
immutable
as $$
  select nullif(
    case
      when regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') like '0031%' then '31' || substring(regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') from 5)
      when regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') like '310%' then '31' || substring(regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') from 4)
      when regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') like '0%' then '31' || substring(regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g') from 2)
      else regexp_replace(coalesce(input, ''), '[^0-9]', '', 'g')
    end,
    ''
  );
$$;

create or replace function public.mws_normalize_company_name(input text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          lower(coalesce(input, '')),
          '\m(b\.?v\.?|vof|v\.?o\.?f\.?|eenmanszaak|holding|nederland)\M',
          ' ',
          'gi'
        ),
        '[^a-z0-9]+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

do $$
declare
  has_call_status boolean;
  has_company_name boolean;
  has_company boolean;
  has_website boolean;
  has_website_url boolean;
  has_interest boolean;
  has_source boolean;
  company_expr text;
  website_expr text;
  source_expr text;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'call_status'
  ) into has_call_status;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'company_name'
  ) into has_company_name;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'company'
  ) into has_company;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'website'
  ) into has_website;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'website_url'
  ) into has_website_url;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'interest'
  ) into has_interest;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leads' and column_name = 'source'
  ) into has_source;

  execute format(
    'update public.leads
      set lead_status = case
        when %1$s in (''interesting'', ''not_interesting'', ''reviewing'', ''assigned'', ''call_scheduled'', ''contacted'', ''follow_up'', ''demo_requested'', ''demo_building'', ''demo_ready'', ''demo_sent'', ''proposal_sent'', ''won'', ''lost'', ''customer'') then %1$s
        when %2$s in (''lost'', ''geen_interesse'') then ''not_interesting''
        when %2$s in (''qualified'', ''interesse'') then ''interesting''
        when %2$s in (''contacted'', ''gebeld'') then ''contacted''
        when %2$s in (''follow_up'', ''opvolgen'', ''contact_planned'', ''bellen'', ''te_bellen'') then ''follow_up''
        when %2$s in (''converted'', ''geconverteerd'', ''customer_active'', ''klant_actief'') then ''customer''
        when %2$s in (''won'', ''verkocht'') then ''won''
        else ''new''
      end
    where lead_status is null
      or lead_status = ''''
      or lead_status = ''new''',
    'lower(coalesce(lead_status, ''''))',
    case
      when has_call_status then 'lower(coalesce(call_status, status, ''''))'
      else 'lower(coalesce(status, ''''))'
    end
  );

  company_expr := concat_ws(
    ', ',
    case when has_company_name then 'company_name' end,
    case when has_company then 'company' end,
    'metadata->>''companyName''',
    'metadata->>''company'''
  );
  website_expr := concat_ws(
    ', ',
    case when has_website then 'website' end,
    case when has_website_url then 'website_url' end,
    case when has_interest then 'interest' end,
    'metadata->>''websiteUrl''',
    'metadata->>''website'''
  );
  source_expr := concat_ws(
    ', ',
    case when has_source then 'source' end,
    'metadata->>''source'''
  );

  execute format(
    'update public.leads
      set normalized_company_name = coalesce(normalized_company_name, public.mws_normalize_company_name(coalesce(%s))),
          normalized_domain = coalesce(normalized_domain, public.mws_normalize_domain(coalesce(%s))),
          normalized_phone = coalesce(normalized_phone, public.mws_normalize_phone(phone)),
          external_source = coalesce(nullif(external_source, ''''), %s),
          external_source_id = coalesce(nullif(external_source_id, ''''), metadata->>''externalSourceId'', metadata->>''external_source_id'', metadata->>''googlePlaceId'', metadata->>''google_place_id''),
          last_activity_at = coalesce(last_activity_at, updated_at, created_at)
      where normalized_company_name is null
        or normalized_domain is null
        or normalized_phone is null
        or external_source is null
        or external_source_id is null
        or last_activity_at is null',
    company_expr,
    website_expr,
    source_expr
  );
end $$;

create index if not exists leads_lead_status_idx on public.leads(lead_status);
create index if not exists leads_reviewed_at_idx on public.leads(reviewed_at desc);
create index if not exists leads_rejection_reason_idx on public.leads(rejection_reason);
create index if not exists leads_assigned_user_id_idx on public.leads(assigned_user_id);
create index if not exists leads_last_activity_at_idx on public.leads(last_activity_at desc);
create index if not exists leads_external_source_id_idx on public.leads(external_source, external_source_id)
  where external_source_id is not null and external_source_id <> '';
create index if not exists leads_normalized_domain_idx on public.leads(normalized_domain)
  where normalized_domain is not null and normalized_domain <> '';
create index if not exists leads_normalized_phone_idx on public.leads(normalized_phone)
  where normalized_phone is not null and normalized_phone <> '';
create index if not exists leads_normalized_company_name_idx on public.leads(normalized_company_name)
  where normalized_company_name is not null and normalized_company_name <> '';

do $$
begin
  if not exists (
    select 1
    from public.leads
    where external_source_id is not null and external_source_id <> ''
    group by external_source, external_source_id
    having count(*) > 1
  ) then
    create unique index if not exists leads_unique_external_source_id_idx
      on public.leads(external_source, external_source_id)
      where external_source_id is not null and external_source_id <> '';
  else
    raise notice 'Skipped unique external_source_id index because duplicates exist.';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from public.leads
    where normalized_domain is not null and normalized_domain <> ''
    group by normalized_domain
    having count(*) > 1
  ) then
    create unique index if not exists leads_unique_normalized_domain_idx
      on public.leads(normalized_domain)
      where normalized_domain is not null and normalized_domain <> '';
  else
    raise notice 'Skipped unique normalized_domain index because duplicates exist. Backend deduplication remains authoritative.';
  end if;
end $$;

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
comment on column public.leads.external_source_id is 'Hard deduplication identifier such as Google Place ID or external business/location id.';
