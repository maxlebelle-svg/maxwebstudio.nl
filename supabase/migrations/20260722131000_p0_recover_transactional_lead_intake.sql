-- P0 production database recovery: canonical normalizers and transactional lead intake.
-- New append-only migration; no historical version is marked as applied.
begin;

do $preflight$
declare
  missing_or_drifted text[];
  unexpected_v2 text[];
begin
  if current_user <> 'postgres' then
    raise exception using errcode = '55000', message = 'P0 production database recovery must run as postgres.';
  end if;
  -- A verified staging nonce installation is handled by the dedicated recovery
  -- cleanup step. Its presence must not cause this foundation step to diverge.
  if to_regclass('public.leads') is null
    or to_regclass('public.business_events') is null
    or to_regclass('public.business_event_contracts') is null
  then
    raise exception using errcode = '55000', message = 'Required lead and business-event baseline is missing.';
  end if;
  select array_agg(required.name || ' ' || required.type order by required.name) into missing_or_drifted
  from (values
    ('id','uuid'),('company_name','text'),('contact_name','text'),('email','text'),('phone','text'),
    ('website','text'),('external_source','text'),('external_source_id','text'),
    ('normalized_company_name','text'),('normalized_phone','text'),('status','text'),
    ('lead_status','text'),('assigned_user_id','uuid'),('notes','text'),('metadata','jsonb'),
    ('environment','text'),('is_demo','boolean'),('created_at','timestamp with time zone'),
    ('updated_at','timestamp with time zone'),('last_activity_at','timestamp with time zone')
  ) as required(name,type)
  where not exists (
    select 1 from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='leads' and a.attname=required.name
      and a.attnum>0 and not a.attisdropped
      and pg_catalog.format_type(a.atttypid,a.atttypmod)=required.type
  );
  if missing_or_drifted is not null then
    raise exception using errcode = '55000',
      message = format('Proven V1 lead baseline drift: %s.', array_to_string(missing_or_drifted, ', '));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    where t.tgrelid='public.leads'::regclass and t.tgname='set_leads_updated_at' and not t.tgisinternal
  ) then
    raise exception using errcode='55000', message='Proven leads updated_at trigger is missing.';
  end if;
  select array_agg(name order by name) into unexpected_v2
  from unnest(array[
    'company','name','website_url','source','normalized_domain','branch','region',
    'converted_customer_id','converted_at'
  ]) name
  where exists (
    select 1 from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='leads' and a.attname=name
      and a.attnum>0 and not a.attisdropped
  );
  if unexpected_v2 is not null then
    raise exception using errcode = '55000',
      message = format('Unexpected pre-existing V2 compatibility columns: %s.', array_to_string(unexpected_v2, ', '));
  end if;
  if not exists (
    select 1 from public.business_event_contracts
    where event_type='lead.created' and event_version=1 and lifecycle_status='active'
      and validator_key='lead_created_v1' and allowed_owner_scopes=array['internal']::text[]
  ) then
    raise exception using errcode = '55000', message = 'Required lead.created contract is missing or drifted.';
  end if;
  if to_regclass('public.lead_intake_idempotency') is not null
    or to_regprocedure('public.mws_create_lead_transactional_v1(jsonb,text,uuid,text,text)') is not null
    or to_regprocedure('public.mws_get_lead_intake_result_v1(text)') is not null
    or to_regprocedure('public.mws_normalize_company_name(text)') is not null
    or to_regprocedure('public.mws_normalize_domain(text)') is not null
    or to_regprocedure('public.mws_normalize_phone(text)') is not null
    or to_regprocedure('public.mws_sync_lead_legacy_aliases_v1()') is not null
  then
    raise exception using errcode = '55000', message = 'Unexpected pre-existing transactional lead-intake objects detected.';
  end if;
  if to_regclass('public.leads_lower_email_idx') is not null
    or to_regclass('public.leads_normalized_company_region_idx') is not null
  then
    raise exception using errcode = '55000', message = 'Unexpected pre-existing transactional lead-intake indexes detected.';
  end if;
end
$preflight$;

alter table public.leads
  add column company text,
  add column name text,
  add column website_url text,
  add column source text,
  add column normalized_domain text,
  add column branch text,
  add column region text,
  add column converted_customer_id uuid,
  add column converted_at timestamptz;

-- Exact normalization semantics sourced from supabase/migrations/20260710160200_central_lead_lifecycle_deduplication.sql (e3fc8186847eb74ca8d25b6cb5b9604292e85b473184e7bc4f52f43f45a21639).
create function public.mws_normalize_domain(input text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
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

create function public.mws_normalize_phone(input text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
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

create function public.mws_normalize_company_name(input text)
returns text
language sql
immutable
set search_path to 'pg_catalog'
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

alter function public.mws_normalize_company_name(text) owner to postgres;
alter function public.mws_normalize_domain(text) owner to postgres;
alter function public.mws_normalize_phone(text) owner to postgres;
revoke all on function public.mws_normalize_company_name(text) from public, anon, authenticated, service_role;
revoke all on function public.mws_normalize_domain(text) from public, anon, authenticated, service_role;
revoke all on function public.mws_normalize_phone(text) from public, anon, authenticated, service_role;
grant execute on function public.mws_normalize_company_name(text) to service_role;
grant execute on function public.mws_normalize_domain(text) to service_role;
grant execute on function public.mws_normalize_phone(text) to service_role;

-- Preserve historical updated_at values while adding deterministic aliases and derived values.
alter table public.leads disable trigger set_leads_updated_at;
update public.leads set
  company = company_name,
  name = contact_name,
  website_url = website,
  normalized_company_name = coalesce(normalized_company_name, public.mws_normalize_company_name(company_name)),
  normalized_domain = coalesce(normalized_domain, public.mws_normalize_domain(website)),
  normalized_phone = coalesce(normalized_phone, public.mws_normalize_phone(phone)),
  last_activity_at = coalesce(last_activity_at, updated_at, created_at)
where true;
alter table public.leads enable trigger set_leads_updated_at;

-- Only the three proven V1/V2 aliases are synchronized. source is request
-- provenance; external_source is technical identity and deduplication context.
create function public.mws_sync_lead_legacy_aliases_v1()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $compatibility$
begin
  if tg_op = 'INSERT' then
    if new.company is not null and new.company_name is not null and new.company is distinct from new.company_name then
      raise exception using errcode='23514', constraint='leads_company_compatibility_conflict', message='lead compatibility conflict: company';
    end if;
    if new.name is not null and new.contact_name is not null and new.name is distinct from new.contact_name then
      raise exception using errcode='23514', constraint='leads_name_compatibility_conflict', message='lead compatibility conflict: name';
    end if;
    if new.website_url is not null and new.website is not null and new.website_url is distinct from new.website then
      raise exception using errcode='23514', constraint='leads_website_compatibility_conflict', message='lead compatibility conflict: website';
    end if;
    new.company := coalesce(new.company, new.company_name);
    new.company_name := coalesce(new.company_name, new.company);
    new.name := coalesce(new.name, new.contact_name);
    new.contact_name := coalesce(new.contact_name, new.name);
    new.website_url := coalesce(new.website_url, new.website);
    new.website := coalesce(new.website, new.website_url);
  else
    if new.company is distinct from old.company and new.company_name is distinct from old.company_name and new.company is distinct from new.company_name then
      raise exception using errcode='23514', constraint='leads_company_compatibility_conflict', message='lead compatibility conflict: company';
    elsif new.company is distinct from old.company then new.company_name := new.company;
    elsif new.company_name is distinct from old.company_name then new.company := new.company_name;
    end if;
    if new.name is distinct from old.name and new.contact_name is distinct from old.contact_name and new.name is distinct from new.contact_name then
      raise exception using errcode='23514', constraint='leads_name_compatibility_conflict', message='lead compatibility conflict: name';
    elsif new.name is distinct from old.name then new.contact_name := new.name;
    elsif new.contact_name is distinct from old.contact_name then new.name := new.contact_name;
    end if;
    if new.website_url is distinct from old.website_url and new.website is distinct from old.website and new.website_url is distinct from new.website then
      raise exception using errcode='23514', constraint='leads_website_compatibility_conflict', message='lead compatibility conflict: website';
    elsif new.website_url is distinct from old.website_url then new.website := new.website_url;
    elsif new.website is distinct from old.website then new.website_url := new.website;
    end if;
  end if;
  return new;
end
$compatibility$;

alter function public.mws_sync_lead_legacy_aliases_v1() owner to postgres;
revoke all on function public.mws_sync_lead_legacy_aliases_v1() from public, anon, authenticated, service_role;

create trigger sync_lead_legacy_aliases_v1
before insert or update of company, company_name, name, contact_name, website_url, website
on public.leads for each row execute function public.mws_sync_lead_legacy_aliases_v1();

-- The compatibility columns, backfill and trigger are installed before these RPCs.
-- Transaction and reconciliation semantics sourced from original-verified docs/foundation-f0/evidence/recovered-migrations/20260720200000_transactional_lead_intake_rpc.sql (40397c9d45e2c7dfef7c702837999630343f7fb033fa408119509483c29c6370).
create index leads_lower_email_idx
  on public.leads (lower(email))
  where email is not null and btrim(email) <> '';

create index leads_normalized_company_region_idx
  on public.leads (
    normalized_company_name,
    lower(regexp_replace(coalesce(region, ''), '[[:space:]]+', ' ', 'g'))
  )
  where normalized_company_name is not null and normalized_company_name <> '';

create table public.lead_intake_idempotency (
  idempotency_key text primary key,
  payload_hash text not null,
  lead_id uuid references public.leads(id) on delete set null,
  lead_id_snapshot uuid not null,
  duplicate boolean not null,
  match_reason text,
  merged_fields text[] not null default array[]::text[],
  business_event_id uuid references public.business_events(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint lead_intake_idempotency_key_check check (
    idempotency_key ~ '^lead-intake:v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint lead_intake_idempotency_payload_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint lead_intake_idempotency_retention_check check (
    updated_at >= created_at and expires_at = created_at + interval '30 days'
  ),
  constraint lead_intake_idempotency_result_check check (
    (duplicate and match_reason is not null)
    or (not duplicate and match_reason is null and business_event_id is not null)
  )
);

alter table public.lead_intake_idempotency enable row level security;
revoke all on table public.lead_intake_idempotency from public, anon, authenticated, service_role;

create function public.mws_create_lead_transactional_v1(
  p_lead jsonb,
  p_idempotency_key text,
  p_actor_profile_id uuid default null,
  p_actor_type text default 'system',
  p_actor_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_idempotency_key text := nullif(p_idempotency_key, '');
  v_company text;
  v_name text;
  v_email text;
  v_phone text;
  v_website_url text;
  v_website_host text;
  v_source text;
  v_external_source text;
  v_external_source_id text;
  v_normalized_company text;
  v_normalized_domain text;
  v_normalized_phone text;
  v_branch text;
  v_region text;
  v_normalized_region text;
  v_notes text;
  v_environment text;
  v_actor_type text := lower(nullif(btrim(p_actor_type), ''));
  v_actor_id text := nullif(btrim(coalesce(p_actor_id, p_actor_profile_id::text)), '');
  v_assigned_user_id uuid;
  v_kvk_number text;
  v_metadata jsonb;
  v_payload_fingerprint jsonb;
  v_payload_hash text;
  v_match_reason text;
  v_match_lead_ids uuid[] := array[]::uuid[];
  v_match_categories text[] := array[]::text[];
  v_merged_fields text[] := array[]::text[];
  v_intake public.lead_intake_idempotency%rowtype;
  v_lead public.leads%rowtype;
  v_event public.business_events%rowtype;
  v_event_payload jsonb;
begin
  perform public.assert_business_event_service_role();

  if jsonb_typeof(p_lead) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Lead payload must be a JSON object.';
  end if;

  -- Reject oversized requests before canonicalization, advisory locks or writes.
  if pg_catalog.octet_length(pg_catalog.convert_to(p_lead::text, 'UTF8')) > 131072 then
    raise exception using errcode = '22001',
      constraint = 'lead_intake_payload_too_large',
      message = 'Lead intake payload exceeds the 128 KiB limit.';
  end if;

  if v_idempotency_key is null
    or v_idempotency_key !~ '^lead-intake:v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using errcode = '22023',
      constraint = 'lead_intake_idempotency_key_check',
      message = 'Lead intake requires an opaque lead-intake:v1:<uuid> idempotency key.';
  end if;

  v_company := nullif(regexp_replace(btrim(p_lead ->> 'company'), '[[:space:]]+', ' ', 'g'), '');
  if v_company is null or char_length(v_company) > 240 then
    raise exception using errcode = '22023', message = 'Lead company is required and may contain at most 240 characters.';
  end if;

  v_name := nullif(regexp_replace(btrim(p_lead ->> 'name'), '[[:space:]]+', ' ', 'g'), '');
  if char_length(v_name) > 240 then
    raise exception using errcode = '22023', message = 'Lead contact name may contain at most 240 characters.';
  end if;

  v_email := lower(nullif(btrim(p_lead ->> 'email'), ''));
  if v_email is not null and (
    char_length(v_email) > 320
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) then
    raise exception using errcode = '22023', message = 'Lead email is invalid.';
  end if;

  v_phone := nullif(btrim(p_lead ->> 'phone'), '');
  if char_length(v_phone) > 80 then
    raise exception using errcode = '22023', message = 'Lead phone may contain at most 80 characters.';
  end if;
  -- Stored normalized_phone values use exactly one pass of the deployed helper.
  v_normalized_phone := public.mws_normalize_phone(v_phone);

  v_website_url := nullif(btrim(p_lead ->> 'website_url'), '');
  if v_website_url is not null then
    if v_website_url !~* '^https?://' then
      v_website_url := 'https://' || v_website_url;
    end if;
    if v_website_url !~* '^https?://[^[:space:]/?#]+(?:[/?#].*)?$'
      or v_website_url ~ '@'
      or char_length(v_website_url) > 2048
    then
      raise exception using errcode = '22023', message = 'Lead website must be a valid HTTP(S) URL.';
    end if;
    v_website_url := regexp_replace(v_website_url, '[?#].*$', '');
    v_website_host := lower(substring(v_website_url from '^https?://([^/?#]+)'));
    v_website_host := regexp_replace(v_website_host, ':[0-9]+$', '');
    v_website_host := regexp_replace(v_website_host, '\.$', '');
    v_normalized_domain := regexp_replace(public.mws_normalize_domain(v_website_host), '\.$', '');
  end if;

  v_source := nullif(btrim(coalesce(p_lead ->> 'source', '')), '');
  if v_source is null or char_length(v_source) > 120 then
    raise exception using errcode = '22023', message = 'Lead source is required and may contain at most 120 characters.';
  end if;

  v_external_source := coalesce(nullif(btrim(p_lead ->> 'external_source'), ''), v_source);
  v_external_source_id := nullif(btrim(p_lead ->> 'external_source_id'), '');
  if char_length(v_external_source) > 120 or char_length(v_external_source_id) > 255 then
    raise exception using errcode = '22023', message = 'Lead external source identity is too long.';
  end if;

  v_environment := lower(coalesce(nullif(btrim(p_lead ->> 'environment'), ''), 'production'));
  if v_environment not in ('production', 'test', 'demo') then
    raise exception using errcode = '22023', message = 'Lead environment is invalid.';
  end if;
  if p_lead ? 'is_demo' and (p_lead ->> 'is_demo')::boolean is distinct from (v_environment = 'demo') then
    raise exception using errcode = '23514', message = 'Lead is_demo must match its environment.';
  end if;

  v_branch := nullif(regexp_replace(btrim(p_lead ->> 'branch'), '[[:space:]]+', ' ', 'g'), '');
  v_region := nullif(regexp_replace(btrim(p_lead ->> 'region'), '[[:space:]]+', ' ', 'g'), '');
  -- Notes are part of the create intent: first write wins, and a materially
  -- different canonical note with the same key is a businessinput conflict.
  v_notes := nullif(regexp_replace(btrim(p_lead ->> 'notes'), '[[:space:]]+', ' ', 'g'), '');
  if char_length(v_branch) > 180 or char_length(v_region) > 180 then
    raise exception using errcode = '22023', message = 'Lead branch or region is too long.';
  end if;
  if char_length(v_notes) > 4000 then
    raise exception using errcode = '22001',
      constraint = 'lead_intake_notes_too_long',
      message = 'Lead notes may contain at most 4000 characters.';
  end if;

  begin
    v_assigned_user_id := nullif(btrim(p_lead ->> 'assigned_user_id'), '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'Lead assigned_user_id must be a UUID.';
  end;

  v_metadata := case
    when p_lead ? 'metadata' and jsonb_typeof(p_lead -> 'metadata') = 'object' then p_lead -> 'metadata'
    when p_lead ? 'metadata' then null
    else '{}'::jsonb
  end;
  if v_metadata is null then
    raise exception using errcode = '22023', message = 'Lead metadata must be a JSON object.';
  end if;
  if pg_catalog.octet_length(pg_catalog.convert_to(v_metadata::text, 'UTF8')) > 65536 then
    raise exception using errcode = '22001',
      constraint = 'lead_intake_metadata_too_large',
      message = 'Lead metadata is too large.';
  end if;

  v_normalized_company := public.mws_normalize_company_name(v_company);
  v_normalized_region := lower(nullif(regexp_replace(coalesce(v_region, ''), '[[:space:]]+', ' ', 'g'), ''));
  v_kvk_number := nullif(regexp_replace(coalesce(
    p_lead ->> 'kvk_number', v_metadata ->> 'kvkNumber', v_metadata ->> 'kvk_number', ''
  ), '[^0-9]', '', 'g'), '');
  if v_kvk_number is not null and char_length(v_kvk_number) <> 8 then
    raise exception using errcode = '22023', message = 'Lead KvK number must contain exactly 8 digits.';
  end if;

  v_payload_fingerprint := jsonb_build_object(
    'company', coalesce(v_normalized_company, lower(v_company)),
    'name', v_name, 'email', v_email,
    'phone', v_normalized_phone, 'websiteUrl', v_normalized_domain,
    'source', v_source, 'externalSource', lower(v_external_source),
    'externalSourceId', v_external_source_id,
    'branch', v_branch, 'region', v_region, 'notes', v_notes,
    'environment', v_environment, 'assignedUserId', v_assigned_user_id,
    'kvkNumber', v_kvk_number
  );
  -- jsonb::text is key-order stable. This closed whitelist deliberately excludes
  -- complete metadata, generated timestamps, actor context and transport context.
  v_payload_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_payload_fingerprint::text, 'UTF8'), 'sha256'),
    'hex'
  );

  if v_actor_type not in ('system', 'user', 'service') then
    raise exception using errcode = '22023', message = 'Lead intake actor type is invalid.';
  end if;
  if char_length(v_actor_id) > 255 then
    raise exception using errcode = '22023', message = 'Lead intake actor id is too long.';
  end if;

  -- Every caller takes the same lock classes in the same order.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lead-intake:idempotency:' || v_idempotency_key, 0));
  if v_external_source_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lead-intake:external:' || lower(v_external_source) || ':' || v_external_source_id, 0));
  end if;
  if v_kvk_number is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lead-intake:kvk:' || v_kvk_number, 0));
  end if;
  if v_normalized_domain is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lead-intake:domain:' || v_normalized_domain, 0));
  end if;
  if v_normalized_phone is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lead-intake:phone:' || v_normalized_phone, 0));
  end if;
  if v_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lead-intake:email:' || v_email, 0));
  end if;
  if v_normalized_company is not null and v_normalized_region is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lead-intake:company-region:' || v_normalized_company || ':' || v_normalized_region, 0));
  end if;

  select * into v_intake
  from public.lead_intake_idempotency
  where idempotency_key = v_idempotency_key
  limit 1;

  if found then
    if v_intake.payload_hash is distinct from v_payload_hash then
      raise exception using errcode = '23505',
        constraint = 'lead_intake_idempotency_payload_conflict',
        message = 'lead_intake_idempotency_payload_conflict';
    end if;
    if v_intake.expires_at <= v_now then
      return jsonb_build_object(
        'status', 'expired', 'lead', null, 'leadId', v_intake.lead_id_snapshot,
        'created', false, 'duplicate', v_intake.duplicate,
        'matchReason', coalesce(v_intake.match_reason, 'idempotency_key'),
        'merged', false, 'mergedFields', '[]'::jsonb,
        'businessEventId', v_intake.business_event_id, 'idempotentReplay', true
      );
    end if;
    if v_intake.lead_id is null then
      return jsonb_build_object(
        'status', 'lead_deleted', 'lead', null, 'leadId', v_intake.lead_id_snapshot,
        'created', false, 'duplicate', v_intake.duplicate,
        'matchReason', coalesce(v_intake.match_reason, 'idempotency_key'),
        'merged', false, 'mergedFields', '[]'::jsonb,
        'businessEventId', v_intake.business_event_id, 'idempotentReplay', true
      );
    end if;
    select * into v_lead from public.leads where id = v_intake.lead_id;
    if not found then raise exception using errcode = '23514', message = 'Live lead intake reference is incoherent.'; end if;
    if v_intake.business_event_id is not null then
      select * into v_event from public.business_events where id = v_intake.business_event_id;
    end if;
    if (not v_intake.duplicate and (
      v_event.id is null
      or v_event.event_type <> 'lead.created'
      or v_event.event_version <> 1::smallint
      or v_event.subject_uuid is distinct from v_lead.id
      or v_event.occurred_at is distinct from v_lead.created_at
      or v_event.payload is distinct from jsonb_build_object('leadId', v_lead.id::text, 'source', v_lead.source, 'environment', v_lead.environment)
    ))
    then
      raise exception using errcode = '23514', message = 'Lead intake replay is not coherent with its immutable event.';
    end if;
    return jsonb_build_object(
      'status', 'resolved', 'lead', to_jsonb(v_lead),
      'created', false, 'duplicate', v_intake.duplicate,
      'matchReason', coalesce(v_intake.match_reason, 'idempotency_key'),
      'merged', cardinality(v_intake.merged_fields) > 0,
      'mergedFields', to_jsonb(v_intake.merged_fields),
      'businessEventId', v_intake.business_event_id, 'idempotentReplay', true
    );
  end if;

  -- Collect every hard match. Priority may label a coherent single-lead match,
  -- but it must never hide identifiers that resolve to different leads.
  with identifier_matches as (
    select id as lead_id, 'external_source_id'::text as category from public.leads
      where v_external_source_id is not null
        and lower(external_source) = lower(v_external_source)
        and external_source_id = v_external_source_id
    union all
    select id, 'kvk_number' from public.leads
      where v_kvk_number is not null
        and regexp_replace(coalesce(metadata ->> 'kvkNumber', metadata ->> 'kvk_number', ''), '[^0-9]', '', 'g') = v_kvk_number
    union all
    select id, 'normalized_domain' from public.leads
      where v_normalized_domain is not null and normalized_domain = v_normalized_domain
    union all
    select id, 'normalized_phone' from public.leads
      where v_normalized_phone is not null and normalized_phone = v_normalized_phone
    union all
    select id, 'email' from public.leads
      where v_email is not null and lower(email) = v_email
    union all
    select id, 'company_region' from public.leads
      where v_normalized_company is not null and v_normalized_region is not null
        and normalized_company_name = v_normalized_company
        and lower(regexp_replace(coalesce(region, ''), '[[:space:]]+', ' ', 'g')) = v_normalized_region
  )
  select coalesce(array_agg(distinct lead_id), array[]::uuid[]),
         coalesce(array_agg(distinct category order by category), array[]::text[])
    into v_match_lead_ids, v_match_categories
  from identifier_matches;

  if cardinality(v_match_lead_ids) > 1 then
    raise exception using errcode = 'P0001',
      constraint = 'lead_identifier_conflict',
      message = 'lead_identifier_conflict',
      detail = 'Conflicting identifier categories: ' || array_to_string(v_match_categories, ',');
  end if;

  v_match_reason := null;
  if cardinality(v_match_lead_ids) = 1 then
    select * into strict v_lead from public.leads where id = v_match_lead_ids[1];
    v_match_reason := case
      when 'external_source_id' = any(v_match_categories) then 'external_source_id'
      when 'kvk_number' = any(v_match_categories) then 'kvk_number'
      when 'normalized_domain' = any(v_match_categories) then 'normalized_domain'
      when 'normalized_phone' = any(v_match_categories) then 'normalized_phone'
      when 'email' = any(v_match_categories) then 'email'
      else 'company_region'
    end;
  end if;

  if v_match_reason is not null then
    if v_lead.name is null or btrim(v_lead.name) = '' then
      if v_name is not null then v_lead.name := v_name; v_merged_fields := array_append(v_merged_fields, 'contactName'); end if;
    end if;
    if v_lead.email is null or btrim(v_lead.email) = '' then
      if v_email is not null then v_lead.email := v_email; v_merged_fields := array_append(v_merged_fields, 'email'); end if;
    end if;
    if v_lead.phone is null or btrim(v_lead.phone) = '' then
      if v_phone is not null then v_lead.phone := v_phone; v_lead.normalized_phone := v_normalized_phone; v_merged_fields := array_append(v_merged_fields, 'phone'); end if;
    end if;
    if v_lead.website_url is null or btrim(v_lead.website_url) = '' then
      if v_website_url is not null then v_lead.website_url := v_website_url; v_lead.normalized_domain := v_normalized_domain; v_merged_fields := array_append(v_merged_fields, 'websiteUrl'); end if;
    end if;

    if cardinality(v_merged_fields) > 0 then
      update public.leads
      set name = v_lead.name,
          email = v_lead.email,
          phone = v_lead.phone,
          website_url = v_lead.website_url,
          normalized_phone = v_lead.normalized_phone,
          normalized_domain = v_lead.normalized_domain,
          updated_at = v_now
      where id = v_lead.id
      returning * into v_lead;
    end if;

    select * into v_event from public.business_events
    where owner_scope = 'internal' and customer_id is null
      and source_module = 'lead_intake'
      and deduplication_key = 'lead.created:v1:' || v_lead.id::text
    limit 1;

    insert into public.lead_intake_idempotency (
      idempotency_key, payload_hash, lead_id, lead_id_snapshot, duplicate, match_reason,
      merged_fields, business_event_id, created_at, updated_at, expires_at
    ) values (
      v_idempotency_key, v_payload_hash, v_lead.id, v_lead.id, true, v_match_reason,
      v_merged_fields, case when found then v_event.id else null end,
      v_now, v_now, v_now + interval '30 days'
    );

    return jsonb_build_object(
      'status', 'resolved', 'lead', to_jsonb(v_lead),
      'created', false, 'duplicate', true, 'matchReason', v_match_reason,
      'merged', cardinality(v_merged_fields) > 0, 'mergedFields', to_jsonb(v_merged_fields),
      'businessEventId', case when found then v_event.id else null end,
      'idempotentReplay', false
    );
  end if;

  v_metadata := v_metadata || jsonb_build_object(
    'leadIntake', jsonb_build_object(
      'version', 1,
      'idempotencyKeyHash', pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_idempotency_key, 'UTF8'), 'sha256'), 'hex'),
      'payloadHash', v_payload_hash,
      'actorProfileId', p_actor_profile_id,
      'recordedAt', v_now
    )
  );

  insert into public.leads (
    company, name, email, phone, website_url, source,
    external_source, external_source_id,
    normalized_company_name, normalized_domain, normalized_phone,
    status, lead_status, assigned_user_id, branch, region, notes,
    metadata, environment, is_demo,
    created_at, updated_at, last_activity_at
  ) values (
    v_company, v_name, v_email, v_phone, v_website_url, v_source,
    v_external_source, v_external_source_id,
    v_normalized_company, v_normalized_domain, v_normalized_phone,
    'new', 'new', v_assigned_user_id, v_branch, v_region, v_notes,
    v_metadata, v_environment, v_environment = 'demo',
    v_now, v_now, v_now
  ) returning * into v_lead;

  -- Sprint 1A owns the lead/event coherence that Foundation F1 intentionally does not.
  select * into v_lead from public.leads where id = v_lead.id for update;
  v_event_payload := jsonb_build_object(
    'leadId', v_lead.id::text,
    'source', v_lead.source,
    'environment', v_lead.environment
  );
  if not found
    or v_event_payload ->> 'leadId' is distinct from v_lead.id::text
    or v_event_payload ->> 'source' is distinct from v_lead.source
    or v_event_payload ->> 'environment' is distinct from v_lead.environment
    or v_lead.created_at is distinct from v_now
    or v_lead.environment not in ('production', 'test', 'demo')
    or v_lead.converted_customer_id is not null
    or v_lead.converted_at is not null
  then
    raise exception using errcode = '23514', message = 'New lead is not coherent enough for lead.created.';
  end if;

  v_event := public.record_business_event(
    'internal', null::uuid, 'lead.created', 1::smallint, v_lead.created_at,
    v_actor_type, v_actor_id, 'lead_intake', 'lead_created:v1',
    null::uuid, null::uuid, 'lead.created:v1:' || v_lead.id::text,
    'lead', v_lead.id, null::text, v_event_payload
  );

  if v_event.subject_uuid is distinct from v_lead.id
    or v_event.occurred_at is distinct from v_lead.created_at
    or v_event.payload is distinct from v_event_payload
    or v_event.owner_scope <> 'internal'
    or v_event.customer_id is not null
  then
    raise exception using errcode = '23514', message = 'Recorded lead.created event is incoherent.';
  end if;

  insert into public.lead_intake_idempotency (
    idempotency_key, payload_hash, lead_id, lead_id_snapshot, duplicate, match_reason,
    merged_fields, business_event_id, created_at, updated_at, expires_at
  ) values (
    v_idempotency_key, v_payload_hash, v_lead.id, v_lead.id, false, null,
    array[]::text[], v_event.id, v_now, v_now, v_now + interval '30 days'
  );

  return jsonb_build_object(
    'status', 'resolved', 'lead', to_jsonb(v_lead),
    'created', true, 'duplicate', false, 'matchReason', null,
    'merged', false, 'mergedFields', '[]'::jsonb,
    'businessEventId', v_event.id, 'idempotentReplay', false
  );
end;
$function$;

create function public.mws_get_lead_intake_result_v1(p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_intake public.lead_intake_idempotency%rowtype;
  v_lead public.leads%rowtype;
  v_event public.business_events%rowtype;
begin
  perform public.assert_business_event_service_role();
  if p_idempotency_key is null
    or p_idempotency_key !~ '^lead-intake:v1:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    raise exception using errcode = '22023', message = 'Lead intake reconciliation requires an opaque lead-intake:v1:<uuid> key.';
  end if;
  select * into v_intake from public.lead_intake_idempotency
  where idempotency_key = p_idempotency_key
  limit 1;
  if not found then return null; end if;

  if v_intake.expires_at <= clock_timestamp() then
    return jsonb_build_object(
      'status', 'expired', 'lead', null, 'leadId', v_intake.lead_id_snapshot,
      'created', false, 'duplicate', v_intake.duplicate,
      'matchReason', coalesce(v_intake.match_reason, 'idempotency_key'),
      'merged', false, 'mergedFields', '[]'::jsonb,
      'businessEventId', v_intake.business_event_id, 'idempotentReplay', true
    );
  end if;

  if v_intake.lead_id is null then
    return jsonb_build_object(
      'status', 'lead_deleted', 'lead', null, 'leadId', v_intake.lead_id_snapshot,
      'created', false, 'duplicate', v_intake.duplicate,
      'matchReason', coalesce(v_intake.match_reason, 'idempotency_key'),
      'merged', false, 'mergedFields', '[]'::jsonb,
      'businessEventId', v_intake.business_event_id, 'idempotentReplay', true
    );
  end if;

  select * into v_lead from public.leads where id = v_intake.lead_id;
  if not found then
    raise exception using errcode = '23514', message = 'Live lead intake reference is incoherent.';
  end if;
  if v_intake.business_event_id is not null then
    select * into v_event from public.business_events where id = v_intake.business_event_id;
    if not found then
      raise exception using errcode = '23514', message = 'Lead intake result references a missing business event.';
    end if;
  end if;

  return jsonb_build_object(
    'status', 'resolved', 'lead', to_jsonb(v_lead),
    'created', false, 'duplicate', v_intake.duplicate,
    'matchReason', coalesce(v_intake.match_reason, 'idempotency_key'),
    'merged', cardinality(v_intake.merged_fields) > 0,
    'mergedFields', to_jsonb(v_intake.merged_fields),
    'businessEventId', v_intake.business_event_id,
    'idempotentReplay', true
  );
end;
$function$;

alter function public.mws_create_lead_transactional_v1(jsonb,text,uuid,text,text) owner to postgres;
alter function public.mws_get_lead_intake_result_v1(text) owner to postgres;

revoke all on function public.mws_create_lead_transactional_v1(jsonb,text,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.mws_create_lead_transactional_v1(jsonb,text,uuid,text,text)
  to service_role;
revoke all on function public.mws_get_lead_intake_result_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.mws_get_lead_intake_result_v1(text)
  to service_role;

comment on function public.mws_create_lead_transactional_v1(jsonb,text,uuid,text,text) is
  'Sprint 1A service-role-only transactional lead create/deduplicate and lead.created append.';
comment on table public.lead_intake_idempotency is
  'PII-free 30-day operational replay and timeout-reconciliation ledger; not business history. Automatic cleanup is outside Sprint 1A.';
comment on column public.lead_intake_idempotency.lead_id_snapshot is
  'Immutable PII-free lead UUID retained when the supported super-admin hard delete sets lead_id to null.';
comment on column public.lead_intake_idempotency.payload_hash is
  'SHA-256 of the closed canonical businessinput whitelist; metadata, generated timestamps and actor context are excluded.';
comment on column public.lead_intake_idempotency.expires_at is
  'After 30 days reconciliation returns expired. A later maintenance job may remove expired rows without touching Business Events.';

commit;
