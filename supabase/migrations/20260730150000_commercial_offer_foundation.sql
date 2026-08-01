-- Phase B: versioned commercial catalog evidence, immutable offer versions,
-- bounded lifecycle transitions and tenant-scoped reads. Forward-only.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.leads') is null
     or pg_catalog.to_regclass('public.customers') is null
     or pg_catalog.to_regclass('public.demo_journeys') is null
     or pg_catalog.to_regclass('public.factory_projects') is null
     or pg_catalog.to_regprocedure('public.has_app_role(text[])') is null
     or pg_catalog.to_regprocedure('public.owns_customer(uuid)') is null then
    raise exception using errcode='55000', message='Commercial offer foundation prerequisites are missing.';
  end if;
end
$preflight$;

create table public.commercial_catalog_versions (
  id uuid primary key default gen_random_uuid(),
  catalog_key text not null check (catalog_key ~ '^[a-z][a-z0-9-]{2,79}$'),
  version text not null check (char_length(version) between 3 and 80),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  currency text not null default 'EUR' check (currency = 'EUR'),
  vat_rate_basis_points integer not null default 2100 check (vat_rate_basis_points between 0 and 10000),
  catalog_snapshot jsonb not null check (jsonb_typeof(catalog_snapshot) = 'object'),
  status text not null default 'published' check (status in ('published','retired')),
  registered_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  constraint commercial_catalog_versions_identity_unique unique (catalog_key, version),
  constraint commercial_catalog_versions_checksum_unique unique (catalog_key, checksum_sha256)
);

create table public.commercial_offers (
  id uuid primary key default gen_random_uuid(),
  relationship_type text not null check (relationship_type in ('lead','customer')),
  relationship_id uuid not null,
  lead_id uuid references public.leads(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  demo_journey_id uuid references public.demo_journeys(id) on delete restrict,
  factory_project_id uuid references public.factory_projects(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 180),
  status text not null default 'draft' check (status in (
    'draft','ready_for_review','sent','viewed','revoked','superseded','signed',
    'payment_pending','partially_paid','paid','accepted','expired','declined','failed'
  )),
  current_version_id uuid,
  creation_idempotency_key text not null unique check (char_length(creation_idempotency_key) between 16 and 180),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint commercial_offers_relationship_binding check (
    (relationship_type = 'lead' and lead_id = relationship_id and customer_id is null)
    or (relationship_type = 'customer' and customer_id = relationship_id and lead_id is null)
  )
);

create index commercial_offers_relationship_idx on public.commercial_offers(relationship_type, relationship_id, updated_at desc);
create index commercial_offers_customer_idx on public.commercial_offers(customer_id, updated_at desc) where customer_id is not null;

create table public.commercial_offer_versions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.commercial_offers(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  catalog_version_id uuid not null references public.commercial_catalog_versions(id) on delete restrict,
  catalog_key text not null,
  catalog_version text not null,
  catalog_checksum_sha256 text not null check (catalog_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot_checksum_sha256 text not null check (snapshot_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  status text not null default 'draft' check (status in (
    'draft','ready_for_review','sent','viewed','revoked','superseded','signed',
    'payment_pending','partially_paid','paid','accepted','expired','declined','failed'
  )),
  currency text not null default 'EUR' check (currency = 'EUR'),
  vat_rate_basis_points integer not null default 2100 check (vat_rate_basis_points between 0 and 10000),
  payment_choice text not null check (payment_choice in ('fixed_deposit','full','none')),
  one_time_ex_vat_cents bigint not null check (one_time_ex_vat_cents >= 0),
  one_time_vat_cents bigint not null check (one_time_vat_cents >= 0),
  one_time_incl_vat_cents bigint not null check (one_time_incl_vat_cents = one_time_ex_vat_cents + one_time_vat_cents),
  recurring_ex_vat_cents bigint not null check (recurring_ex_vat_cents >= 0),
  recurring_vat_cents bigint not null check (recurring_vat_cents >= 0),
  recurring_incl_vat_cents bigint not null check (recurring_incl_vat_cents = recurring_ex_vat_cents + recurring_vat_cents),
  fixed_deposit_ex_vat_cents bigint not null default 0 check (fixed_deposit_ex_vat_cents >= 0),
  due_now_ex_vat_cents bigint not null default 0 check (due_now_ex_vat_cents >= 0),
  due_now_vat_cents bigint not null default 0 check (due_now_vat_cents >= 0),
  due_now_incl_vat_cents bigint not null default 0 check (due_now_incl_vat_cents = due_now_ex_vat_cents + due_now_vat_cents),
  remaining_ex_vat_cents bigint not null default 0 check (remaining_ex_vat_cents >= 0),
  has_non_binding_lines boolean not null default false,
  internal_change_reason text,
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  ready_for_review_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  revoked_at timestamptz,
  superseded_at timestamptz,
  signed_at timestamptz,
  paid_at timestamptz,
  accepted_at timestamptz,
  expired_at timestamptz,
  declined_at timestamptz,
  failed_at timestamptz,
  lifecycle_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint commercial_offer_versions_number_unique unique (offer_id, version_number),
  constraint commercial_offer_versions_checksum_unique unique (offer_id, snapshot_checksum_sha256)
);

alter table public.commercial_offers
  add constraint commercial_offers_current_version_fkey
  foreign key (current_version_id) references public.commercial_offer_versions(id) on delete restrict;

create index commercial_offer_versions_offer_idx on public.commercial_offer_versions(offer_id, version_number desc);
create index commercial_offer_versions_status_idx on public.commercial_offer_versions(status, updated_at desc);

create table public.commercial_offer_lines (
  id uuid primary key default gen_random_uuid(),
  offer_version_id uuid not null references public.commercial_offer_versions(id) on delete restrict,
  product_id text not null check (product_id ~ '^[a-z][a-z0-9_]{1,79}$'),
  product_code text not null check (char_length(product_code) between 2 and 80),
  product_name text not null check (char_length(btrim(product_name)) between 1 and 180),
  product_description text not null default '',
  component_code text not null check (component_code ~ '^[a-z][a-z0-9_-]{1,79}$'),
  component_type text not null check (component_type in ('one_time','recurring')),
  billing_interval text check (billing_interval is null or billing_interval in ('monthly','quarterly','yearly')),
  quantity integer not null check (quantity between 1 and 1000),
  price_classification text not null check (price_classification in ('fixed','starting_at','on_request','custom')),
  binding_state text not null check (binding_state in ('binding','non_binding')),
  original_catalog_unit_ex_vat_cents bigint check (original_catalog_unit_ex_vat_cents is null or original_catalog_unit_ex_vat_cents >= 0),
  unit_ex_vat_cents bigint check (unit_ex_vat_cents is null or unit_ex_vat_cents >= 0),
  subtotal_ex_vat_cents bigint check (subtotal_ex_vat_cents is null or subtotal_ex_vat_cents >= 0),
  vat_rate_basis_points integer not null default 2100 check (vat_rate_basis_points between 0 and 10000),
  vat_cents bigint check (vat_cents is null or vat_cents >= 0),
  total_incl_vat_cents bigint check (total_incl_vat_cents is null or total_incl_vat_cents >= 0),
  custom_price_reason text,
  custom_price_authorized_by_profile_id uuid references public.profiles(id) on delete restrict,
  position integer not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  constraint commercial_offer_lines_component_unique unique (offer_version_id, product_id, component_code),
  constraint commercial_offer_lines_billing_check check (
    (component_type = 'recurring' and billing_interval is not null)
    or (component_type = 'one_time' and billing_interval is null)
  ),
  constraint commercial_offer_lines_binding_check check (
    (binding_state = 'binding' and unit_ex_vat_cents is not null and subtotal_ex_vat_cents = unit_ex_vat_cents * quantity
      and vat_cents = round(subtotal_ex_vat_cents::numeric * vat_rate_basis_points / 10000)::bigint
      and total_incl_vat_cents = subtotal_ex_vat_cents + vat_cents)
    or (binding_state = 'non_binding' and unit_ex_vat_cents is null and subtotal_ex_vat_cents is null
      and vat_cents is null and total_incl_vat_cents is null)
  ),
  constraint commercial_offer_lines_custom_price_check check (
    (price_classification <> 'custom' and custom_price_reason is null and custom_price_authorized_by_profile_id is null)
    or (price_classification = 'custom' and char_length(btrim(custom_price_reason)) between 8 and 500
      and custom_price_authorized_by_profile_id is not null)
  )
);

create index commercial_offer_lines_version_idx on public.commercial_offer_lines(offer_version_id, position, id);

create table public.commercial_offer_document_bindings (
  id uuid primary key default gen_random_uuid(),
  offer_version_id uuid not null references public.commercial_offer_versions(id) on delete restrict,
  document_type text not null check (document_type in (
    'quote','agreement','general_terms','hosting_maintenance_terms','privacy_policy',
    'data_processing_agreement','saas_terms','food_terms','other'
  )),
  version_code text not null check (char_length(version_code) between 1 and 120),
  template_code text,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  storage_bucket text,
  storage_path text,
  source_url text,
  required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  constraint commercial_offer_document_binding_unique unique (offer_version_id, document_type, version_code),
  constraint commercial_offer_document_source_check check (
    (storage_bucket is not null and storage_path is not null and source_url is null)
    or (storage_bucket is null and storage_path is null and coalesce(source_url ~ '^https://', false))
  )
);

create index commercial_offer_documents_version_idx on public.commercial_offer_document_bindings(offer_version_id, document_type);

create table public.commercial_offer_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.commercial_offers(id) on delete restrict,
  offer_version_id uuid references public.commercial_offer_versions(id) on delete restrict,
  event_type text not null check (event_type in (
    'offer.created','offer.version_created','offer.changed','offer.ready_for_review',
    'offer.previewed','offer.test_mail_requested','offer.sent','offer.viewed','offer.revoked',
    'offer.superseded','offer.signature_requested','offer.signed','offer.payment_pending',
    'offer.partially_paid','offer.paid','offer.accepted','offer.expired','offer.declined',
    'offer.failed','offer.custom_price_authorized'
  )),
  actor_profile_id uuid references public.profiles(id) on delete restrict,
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  actor_role text not null,
  reason text,
  previous_status text,
  new_status text,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 180),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  constraint commercial_offer_events_idempotency_unique unique (offer_id, idempotency_key)
);

create index commercial_offer_events_offer_idx on public.commercial_offer_events(offer_id, occurred_at desc);

create function public.commercial_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode='55000', message='Commercial evidence is append-only.';
  end if;
  if tg_table_name in ('commercial_catalog_versions','commercial_offer_lines','commercial_offer_document_bindings','commercial_offer_events') then
    raise exception using errcode='55000', message='Commercial evidence is immutable.';
  end if;
  if tg_table_name = 'commercial_offer_versions'
     and (to_jsonb(new) - array['status','ready_for_review_at','sent_at','viewed_at','revoked_at','superseded_at','signed_at','paid_at','accepted_at','expired_at','declined_at','failed_at','lifecycle_reason','updated_at'])
       is distinct from
       (to_jsonb(old) - array['status','ready_for_review_at','sent_at','viewed_at','revoked_at','superseded_at','signed_at','paid_at','accepted_at','expired_at','declined_at','failed_at','lifecycle_reason','updated_at']) then
    raise exception using errcode='55000', message='Offer version content is immutable.';
  end if;
  if tg_table_name = 'commercial_offers'
     and (to_jsonb(new) - array['status','current_version_id','updated_at'])
       is distinct from (to_jsonb(old) - array['status','current_version_id','updated_at']) then
    raise exception using errcode='55000', message='Offer identity is immutable.';
  end if;
  return new;
end
$function$;

create trigger commercial_catalog_versions_immutable before update or delete on public.commercial_catalog_versions for each row execute function public.commercial_immutable_guard();
create trigger commercial_offers_identity_immutable before update or delete on public.commercial_offers for each row execute function public.commercial_immutable_guard();
create trigger commercial_offer_versions_content_immutable before update or delete on public.commercial_offer_versions for each row execute function public.commercial_immutable_guard();
create trigger commercial_offer_lines_immutable before update or delete on public.commercial_offer_lines for each row execute function public.commercial_immutable_guard();
create trigger commercial_offer_documents_immutable before update or delete on public.commercial_offer_document_bindings for each row execute function public.commercial_immutable_guard();
create trigger commercial_offer_events_append_only before update or delete on public.commercial_offer_events for each row execute function public.commercial_immutable_guard();

create function public.commercial_actor_role(input_profile_id uuid, input_auth_user_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text;
begin
  select lower(replace(p.role, '-', '_')) into actor_role
  from public.profiles p
  where p.id = input_profile_id and p.auth_user_id = input_auth_user_id and p.status = 'active';
  if actor_role not in ('super_admin','admin','sales_manager','sales_partner','sales') then
    raise exception using errcode='42501', message='Commercial actor is not authorized.';
  end if;
  return actor_role;
end
$function$;

create function public.commercial_assert_relationship_access(
  input_profile_id uuid,
  input_auth_user_id uuid,
  input_relationship_type text,
  input_relationship_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text;
declare allowed boolean := false;
begin
  actor_role := public.commercial_actor_role(input_profile_id, input_auth_user_id);
  if input_relationship_type not in ('lead','customer') then
    raise exception using errcode='22023', message='Invalid commercial relationship type.';
  end if;
  if actor_role in ('super_admin','admin','sales_manager') then
    if input_relationship_type = 'lead' then select exists(select 1 from public.leads where id = input_relationship_id) into allowed;
    else select exists(select 1 from public.customers where id = input_relationship_id) into allowed; end if;
  elsif input_relationship_type = 'lead' then
    select exists(
      select 1 from public.leads l where l.id = input_relationship_id and (
        l.assigned_user_id = input_auth_user_id
        or l.metadata->>'assignedUserId' = input_auth_user_id::text
        or l.metadata->>'ownerAuthUserId' = input_auth_user_id::text
        or l.metadata->>'ownerProfileId' = input_profile_id::text
      )
    ) into allowed;
  else
    select exists(
      select 1 from public.customers c where c.id = input_relationship_id and (
        c.metadata->>'assignedUserId' = input_auth_user_id::text
        or c.metadata->>'ownerAuthUserId' = input_auth_user_id::text
        or c.metadata->>'ownerProfileId' = input_profile_id::text
      )
    ) into allowed;
  end if;
  if not allowed then raise exception using errcode='42501', message='Commercial relationship access denied.'; end if;
  return actor_role;
end
$function$;

create function public.commercial_register_catalog_version_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_catalog_key text,
  input_version text,
  input_checksum_sha256 text,
  input_catalog_snapshot jsonb
)
returns public.commercial_catalog_versions
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text;
declare catalog_record public.commercial_catalog_versions%rowtype;
begin
  actor_role := public.commercial_actor_role(input_actor_profile_id, input_actor_auth_user_id);
  if actor_role not in ('super_admin','admin') then
    raise exception using errcode='42501', message='Commercial catalog registration requires an administrator.';
  end if;
  if input_catalog_key !~ '^[a-z][a-z0-9-]{2,79}$'
     or input_checksum_sha256 !~ '^[a-f0-9]{64}$'
     or jsonb_typeof(input_catalog_snapshot) <> 'object'
     or input_catalog_snapshot->>'catalogKey' is distinct from input_catalog_key
     or input_catalog_snapshot->>'version' is distinct from input_version then
    raise exception using errcode='22023', message='Invalid commercial catalog registration.';
  end if;
  select * into catalog_record from public.commercial_catalog_versions
    where catalog_key = input_catalog_key and version = input_version;
  if found then
    if catalog_record.checksum_sha256 is distinct from input_checksum_sha256
       or catalog_record.catalog_snapshot is distinct from input_catalog_snapshot then
      raise exception using errcode='40001', message='Commercial catalog version drift detected.';
    end if;
    return catalog_record;
  end if;
  insert into public.commercial_catalog_versions(catalog_key,version,checksum_sha256,catalog_snapshot,registered_by_profile_id)
  values(input_catalog_key,input_version,input_checksum_sha256,input_catalog_snapshot,input_actor_profile_id)
  returning * into catalog_record;
  return catalog_record;
end
$function$;

create function public.commercial_create_offer_version_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_relationship_type text,
  input_relationship_id uuid,
  input_offer_id uuid,
  input_title text,
  input_demo_journey_id uuid,
  input_factory_project_id uuid,
  input_snapshot jsonb,
  input_lines jsonb,
  input_documents jsonb,
  input_change_reason text,
  input_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text;
declare offer_record public.commercial_offers%rowtype;
declare previous_version public.commercial_offer_versions%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare catalog_record public.commercial_catalog_versions%rowtype;
declare next_version integer;
declare line_record jsonb;
declare document_record jsonb;
declare expected_one_time bigint;
declare expected_recurring bigint;
declare expected_one_time_vat bigint;
declare expected_recurring_vat bigint;
declare has_custom boolean;
declare duplicate_event public.commercial_offer_events%rowtype;
begin
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,input_relationship_type,input_relationship_id);
  if char_length(input_idempotency_key) not between 16 and 160
     or char_length(btrim(input_title)) not between 2 and 180
     or jsonb_typeof(input_snapshot) <> 'object'
     or jsonb_typeof(input_lines) <> 'array'
     or jsonb_array_length(input_lines) < 1
     or jsonb_array_length(input_lines) > 120
     or jsonb_typeof(coalesce(input_documents,'[]'::jsonb)) <> 'array' then
    raise exception using errcode='22023', message='Invalid commercial offer version payload.';
  end if;
  if input_snapshot->>'checksum' !~ '^[a-f0-9]{64}$'
     or input_snapshot->>'currency' is distinct from 'EUR'
     or (input_snapshot->>'vatRate')::integer <> 21
     or input_snapshot->'lines' is distinct from input_lines then
    raise exception using errcode='22023', message='Invalid immutable offer snapshot.';
  end if;

  select * into catalog_record from public.commercial_catalog_versions
  where catalog_key = input_snapshot->>'catalogKey'
    and version = input_snapshot->>'catalogVersion'
    and checksum_sha256 = input_snapshot->>'catalogChecksum';
  if not found then raise exception using errcode='23514', message='Catalog version is not registered.'; end if;

  select coalesce(sum(case when line->>'bindingState'='binding' and line->>'componentType'='one_time' then (line->>'subtotalExVatCents')::bigint else 0 end),0),
         coalesce(sum(case when line->>'bindingState'='binding' and line->>'componentType'='recurring' then (line->>'subtotalExVatCents')::bigint else 0 end),0),
         coalesce(sum(case when line->>'bindingState'='binding' and line->>'componentType'='one_time' then (line->>'vatCents')::bigint else 0 end),0),
         coalesce(sum(case when line->>'bindingState'='binding' and line->>'componentType'='recurring' then (line->>'vatCents')::bigint else 0 end),0),
         bool_or(line->>'priceClassification'='custom')
  into expected_one_time, expected_recurring, expected_one_time_vat, expected_recurring_vat, has_custom
  from jsonb_array_elements(input_lines) line;
  if expected_one_time is distinct from (input_snapshot->>'oneTimeExVatCents')::bigint
     or expected_recurring is distinct from (input_snapshot->>'recurringExVatCents')::bigint
     or expected_one_time_vat is distinct from (input_snapshot->>'oneTimeVatCents')::bigint
     or expected_recurring_vat is distinct from (input_snapshot->>'recurringVatCents')::bigint then
    raise exception using errcode='23514', message='Offer totals do not match immutable lines.';
  end if;
  if (input_snapshot->>'oneTimeInclVatCents')::bigint <> expected_one_time + expected_one_time_vat
     or (input_snapshot->>'recurringInclVatCents')::bigint <> expected_recurring + expected_recurring_vat
     or (input_snapshot->>'dueNowVatCents')::bigint <> round((input_snapshot->>'dueNowExVatCents')::numeric * 21 / 100)::bigint
     or (input_snapshot->>'dueNowInclVatCents')::bigint <> (input_snapshot->>'dueNowExVatCents')::bigint + (input_snapshot->>'dueNowVatCents')::bigint
     or (input_snapshot->>'remainingExVatCents')::bigint <> greatest(0, expected_one_time - (input_snapshot->>'dueNowExVatCents')::bigint)
     or (input_snapshot->>'dueNowExVatCents')::bigint > expected_one_time then
    raise exception using errcode='23514', message='Offer payment totals are inconsistent.';
  end if;
  if coalesce(has_custom,false) and actor_role <> 'super_admin' then
    raise exception using errcode='42501', message='Custom prices require super_admin authorization.';
  end if;
  if exists(
    select 1 from jsonb_array_elements(input_lines) line
    where line->>'priceClassification'='custom'
      and line->>'customPriceAuthorizedBy' is distinct from input_actor_profile_id::text
  ) then
    raise exception using errcode='42501', message='Custom price authorization identity mismatch.';
  end if;

  if input_offer_id is null then
    select * into offer_record from public.commercial_offers where creation_idempotency_key=input_idempotency_key;
    if found then
      if offer_record.relationship_type<>input_relationship_type or offer_record.relationship_id<>input_relationship_id then
        raise exception using errcode='42501', message='Offer idempotency scope mismatch.';
      end if;
      select * into version_record from public.commercial_offer_versions where id=offer_record.current_version_id;
      return jsonb_build_object('offerId',offer_record.id,'offerVersionId',version_record.id,'versionNumber',version_record.version_number,'status',version_record.status,'snapshotChecksum',version_record.snapshot_checksum_sha256,'duplicate',true);
    end if;
  else
    select * into duplicate_event from public.commercial_offer_events where offer_id=input_offer_id and idempotency_key=input_idempotency_key || ':version';
    if found then
      select * into version_record from public.commercial_offer_versions where id=duplicate_event.offer_version_id;
      return jsonb_build_object('offerId',input_offer_id,'offerVersionId',version_record.id,'versionNumber',version_record.version_number,'status',version_record.status,'snapshotChecksum',version_record.snapshot_checksum_sha256,'duplicate',true);
    end if;
  end if;

  if input_offer_id is null then
    insert into public.commercial_offers(
      relationship_type,relationship_id,lead_id,customer_id,demo_journey_id,factory_project_id,
      title,creation_idempotency_key,created_by_profile_id,created_by_auth_user_id
    ) values(
      input_relationship_type,input_relationship_id,
      case when input_relationship_type='lead' then input_relationship_id end,
      case when input_relationship_type='customer' then input_relationship_id end,
      input_demo_journey_id,input_factory_project_id,input_title,input_idempotency_key,input_actor_profile_id,input_actor_auth_user_id
    ) returning * into offer_record;
    insert into public.commercial_offer_events(offer_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,new_status,idempotency_key,safe_metadata)
    values(offer_record.id,'offer.created',input_actor_profile_id,input_actor_auth_user_id,actor_role,'draft',input_idempotency_key || ':offer','{}');
  else
    select * into offer_record from public.commercial_offers where id=input_offer_id for update;
    if not found or offer_record.relationship_type<>input_relationship_type or offer_record.relationship_id<>input_relationship_id then
      raise exception using errcode='42501', message='Offer relationship mismatch.';
    end if;
  end if;

  select * into previous_version from public.commercial_offer_versions where id=offer_record.current_version_id for update;
  if found and previous_version.status not in ('revoked','superseded','expired','declined','failed','accepted') then
    update public.commercial_offer_versions set status='superseded',superseded_at=clock_timestamp(),lifecycle_reason='Vervangen door een nieuwe inhoudelijke versie.',updated_at=clock_timestamp() where id=previous_version.id;
    insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
    values(offer_record.id,previous_version.id,'offer.superseded',input_actor_profile_id,input_actor_auth_user_id,actor_role,'Vervangen door een nieuwe inhoudelijke versie.',previous_version.status,'superseded',input_idempotency_key || ':supersede','{}');
  end if;

  select coalesce(max(version_number),0)+1 into next_version from public.commercial_offer_versions where offer_id=offer_record.id;
  insert into public.commercial_offer_versions(
    offer_id,version_number,catalog_version_id,catalog_key,catalog_version,catalog_checksum_sha256,snapshot_checksum_sha256,snapshot,
    payment_choice,one_time_ex_vat_cents,one_time_vat_cents,one_time_incl_vat_cents,
    recurring_ex_vat_cents,recurring_vat_cents,recurring_incl_vat_cents,
    fixed_deposit_ex_vat_cents,due_now_ex_vat_cents,due_now_vat_cents,due_now_incl_vat_cents,
    remaining_ex_vat_cents,has_non_binding_lines,internal_change_reason,created_by_profile_id,created_by_auth_user_id
  ) values(
    offer_record.id,next_version,catalog_record.id,input_snapshot->>'catalogKey',input_snapshot->>'catalogVersion',input_snapshot->>'catalogChecksum',input_snapshot->>'checksum',input_snapshot,
    input_snapshot->>'paymentChoice',(input_snapshot->>'oneTimeExVatCents')::bigint,(input_snapshot->>'oneTimeVatCents')::bigint,(input_snapshot->>'oneTimeInclVatCents')::bigint,
    (input_snapshot->>'recurringExVatCents')::bigint,(input_snapshot->>'recurringVatCents')::bigint,(input_snapshot->>'recurringInclVatCents')::bigint,
    (input_snapshot->>'fixedDepositExVatCents')::bigint,(input_snapshot->>'dueNowExVatCents')::bigint,(input_snapshot->>'dueNowVatCents')::bigint,(input_snapshot->>'dueNowInclVatCents')::bigint,
    (input_snapshot->>'remainingExVatCents')::bigint,coalesce((input_snapshot->>'hasNonBindingLines')::boolean,false),nullif(btrim(input_change_reason),''),input_actor_profile_id,input_actor_auth_user_id
  ) returning * into version_record;

  for line_record in select value from jsonb_array_elements(input_lines) loop
    insert into public.commercial_offer_lines(
      offer_version_id,product_id,product_code,product_name,product_description,component_code,component_type,billing_interval,quantity,
      price_classification,binding_state,original_catalog_unit_ex_vat_cents,unit_ex_vat_cents,subtotal_ex_vat_cents,vat_rate_basis_points,
      vat_cents,total_incl_vat_cents,custom_price_reason,custom_price_authorized_by_profile_id,position
    ) values(
      version_record.id,line_record->>'productId',line_record->>'productCode',line_record->>'productName',coalesce(line_record->>'productDescription',''),
      line_record->>'componentCode',line_record->>'componentType',nullif(line_record->>'billingInterval',''),(line_record->>'quantity')::integer,
      line_record->>'priceClassification',line_record->>'bindingState',(line_record->>'originalCatalogUnitExVatCents')::bigint,
      (line_record->>'unitExVatCents')::bigint,(line_record->>'subtotalExVatCents')::bigint,round((line_record->>'vatRate')::numeric*100)::integer,
      (line_record->>'vatCents')::bigint,(line_record->>'totalInclVatCents')::bigint,nullif(line_record->>'customPriceReason',''),
      nullif(line_record->>'customPriceAuthorizedBy','')::uuid,(line_record->>'position')::integer
    );
  end loop;

  for document_record in select value from jsonb_array_elements(coalesce(input_documents,'[]'::jsonb)) loop
    insert into public.commercial_offer_document_bindings(
      offer_version_id,document_type,version_code,template_code,checksum_sha256,storage_bucket,storage_path,source_url,required,metadata
    ) values(
      version_record.id,document_record->>'documentType',document_record->>'versionCode',nullif(document_record->>'templateCode',''),document_record->>'checksumSha256',
      nullif(document_record->>'storageBucket',''),nullif(document_record->>'storagePath',''),nullif(document_record->>'sourceUrl',''),
      coalesce((document_record->>'required')::boolean,true),coalesce(document_record->'metadata','{}'::jsonb)
    );
  end loop;

  update public.commercial_offers set current_version_id=version_record.id,status='draft',updated_at=clock_timestamp() where id=offer_record.id;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,'offer.version_created',input_actor_profile_id,input_actor_auth_user_id,actor_role,nullif(btrim(input_change_reason),''),'draft',input_idempotency_key || ':version',jsonb_build_object('versionNumber',next_version,'catalogVersion',version_record.catalog_version));
  if previous_version.id is not null then
    insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
    values(offer_record.id,version_record.id,'offer.changed',input_actor_profile_id,input_actor_auth_user_id,actor_role,nullif(btrim(input_change_reason),''),previous_version.status,'draft',input_idempotency_key || ':changed',jsonb_build_object('previousVersionNumber',previous_version.version_number,'newVersionNumber',next_version));
  end if;
  if coalesce(has_custom,false) then
    insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,new_status,idempotency_key,safe_metadata)
    values(offer_record.id,version_record.id,'offer.custom_price_authorized',input_actor_profile_id,input_actor_auth_user_id,actor_role,nullif(btrim(input_change_reason),''),'draft',input_idempotency_key || ':custom-price',jsonb_build_object('customLineCount',(select count(*) from jsonb_array_elements(input_lines) l where l->>'priceClassification'='custom')));
  end if;
  return jsonb_build_object('offerId',offer_record.id,'offerVersionId',version_record.id,'versionNumber',next_version,'status','draft','snapshotChecksum',version_record.snapshot_checksum_sha256);
end
$function$;

create function public.commercial_transition_offer_version_v1(
  input_actor_profile_id uuid,
  input_actor_auth_user_id uuid,
  input_offer_version_id uuid,
  input_target_status text,
  input_reason text,
  input_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare actor_role text;
declare offer_record public.commercial_offers%rowtype;
declare version_record public.commercial_offer_versions%rowtype;
declare event_type text;
declare duplicate_event public.commercial_offer_events%rowtype;
begin
  select * into version_record from public.commercial_offer_versions where id=input_offer_version_id for update;
  if not found then raise exception using errcode='P0002', message='Offer version not found.'; end if;
  select * into offer_record from public.commercial_offers where id=version_record.offer_id for update;
  actor_role := public.commercial_assert_relationship_access(input_actor_profile_id,input_actor_auth_user_id,offer_record.relationship_type,offer_record.relationship_id);
  if char_length(input_idempotency_key) not between 16 and 180 then raise exception using errcode='22023', message='Invalid idempotency key.'; end if;
  select * into duplicate_event from public.commercial_offer_events where offer_id=offer_record.id and idempotency_key=input_idempotency_key;
  if found then
    return jsonb_build_object('offerId',offer_record.id,'offerVersionId',version_record.id,'previousStatus',duplicate_event.previous_status,'status',duplicate_event.new_status,'duplicate',true);
  end if;
  if input_target_status in ('revoked','superseded','declined','failed') and char_length(btrim(coalesce(input_reason,''))) < 8 then
    raise exception using errcode='22023', message='Lifecycle reason is required.';
  end if;
  if not (
    (version_record.status='draft' and input_target_status in ('ready_for_review','revoked','superseded'))
    or (version_record.status='ready_for_review' and input_target_status in ('sent','revoked','superseded'))
    or (version_record.status='sent' and input_target_status in ('viewed','revoked','superseded','expired','declined','failed'))
    or (version_record.status='viewed' and input_target_status in ('signed','revoked','superseded','expired','declined','failed'))
    or (version_record.status='signed' and input_target_status in ('payment_pending','paid','accepted','failed'))
    or (version_record.status='payment_pending' and input_target_status in ('partially_paid','paid','failed'))
    or (version_record.status='partially_paid' and input_target_status in ('paid','accepted','failed'))
    or (version_record.status='paid' and input_target_status in ('accepted','failed'))
  ) then raise exception using errcode='23514', message='Invalid commercial offer transition.'; end if;
  if input_target_status='sent' and version_record.has_non_binding_lines then
    raise exception using errcode='23514', message='Non-binding lines cannot be sent as a definitive offer.';
  end if;
  if input_target_status in ('signed','payment_pending','partially_paid','paid','accepted') then
    raise exception using errcode='55000', message='Provider-backed transition is reserved for a later certified phase.';
  end if;
  event_type := 'offer.' || input_target_status;
  update public.commercial_offer_versions set
    status=input_target_status,lifecycle_reason=nullif(btrim(input_reason),''),updated_at=clock_timestamp(),
    ready_for_review_at=case when input_target_status='ready_for_review' then clock_timestamp() else ready_for_review_at end,
    sent_at=case when input_target_status='sent' then clock_timestamp() else sent_at end,
    viewed_at=case when input_target_status='viewed' then clock_timestamp() else viewed_at end,
    revoked_at=case when input_target_status='revoked' then clock_timestamp() else revoked_at end,
    superseded_at=case when input_target_status='superseded' then clock_timestamp() else superseded_at end,
    expired_at=case when input_target_status='expired' then clock_timestamp() else expired_at end,
    declined_at=case when input_target_status='declined' then clock_timestamp() else declined_at end,
    failed_at=case when input_target_status='failed' then clock_timestamp() else failed_at end
  where id=version_record.id;
  if offer_record.current_version_id=version_record.id then
    update public.commercial_offers set status=input_target_status,updated_at=clock_timestamp() where id=offer_record.id;
  end if;
  insert into public.commercial_offer_events(offer_id,offer_version_id,event_type,actor_profile_id,actor_auth_user_id,actor_role,reason,previous_status,new_status,idempotency_key,safe_metadata)
  values(offer_record.id,version_record.id,event_type,input_actor_profile_id,input_actor_auth_user_id,actor_role,nullif(btrim(input_reason),''),version_record.status,input_target_status,input_idempotency_key,'{}');
  return jsonb_build_object('offerId',offer_record.id,'offerVersionId',version_record.id,'previousStatus',version_record.status,'status',input_target_status);
end
$function$;

alter table public.commercial_catalog_versions enable row level security;
alter table public.commercial_catalog_versions force row level security;
alter table public.commercial_offers enable row level security;
alter table public.commercial_offers force row level security;
alter table public.commercial_offer_versions enable row level security;
alter table public.commercial_offer_versions force row level security;
alter table public.commercial_offer_lines enable row level security;
alter table public.commercial_offer_lines force row level security;
alter table public.commercial_offer_document_bindings enable row level security;
alter table public.commercial_offer_document_bindings force row level security;
alter table public.commercial_offer_events enable row level security;
alter table public.commercial_offer_events force row level security;

create policy commercial_catalog_staff_read on public.commercial_catalog_versions for select to authenticated
using (public.has_app_role(array['super_admin','admin','sales_manager','sales_partner','sales']));
create policy commercial_offers_scoped_read on public.commercial_offers for select to authenticated
using (
  public.has_app_role(array['super_admin','admin','sales_manager'])
  or (customer_id is not null and public.owns_customer(customer_id))
  or (
    public.has_app_role(array['sales_partner','sales']) and (
      (relationship_type='lead' and exists(select 1 from public.leads l where l.id=relationship_id and (
        l.assigned_user_id=auth.uid()
        or l.metadata->>'assignedUserId'=auth.uid()::text
        or l.metadata->>'ownerAuthUserId'=auth.uid()::text
        or l.metadata->>'ownerProfileId'=public.current_profile_id()::text
      )))
      or (relationship_type='customer' and exists(select 1 from public.customers c where c.id=relationship_id and (
        c.metadata->>'assignedUserId'=auth.uid()::text
        or c.metadata->>'ownerAuthUserId'=auth.uid()::text
        or c.metadata->>'ownerProfileId'=public.current_profile_id()::text
      )))
    )
  )
);
create policy commercial_offer_versions_scoped_read on public.commercial_offer_versions for select to authenticated
using (exists(select 1 from public.commercial_offers o where o.id=offer_id and (
  public.has_app_role(array['super_admin','admin','sales_manager','sales_partner','sales'])
  or (o.customer_id is not null and public.owns_customer(o.customer_id) and commercial_offer_versions.status not in ('draft','ready_for_review'))
)));
create policy commercial_offer_lines_scoped_read on public.commercial_offer_lines for select to authenticated
using (exists(select 1 from public.commercial_offer_versions v join public.commercial_offers o on o.id=v.offer_id where v.id=offer_version_id and (
  public.has_app_role(array['super_admin','admin','sales_manager','sales_partner','sales'])
  or (o.customer_id is not null and public.owns_customer(o.customer_id) and v.status not in ('draft','ready_for_review'))
)));
create policy commercial_offer_documents_scoped_read on public.commercial_offer_document_bindings for select to authenticated
using (exists(select 1 from public.commercial_offer_versions v join public.commercial_offers o on o.id=v.offer_id where v.id=offer_version_id and (
  public.has_app_role(array['super_admin','admin','sales_manager','sales_partner','sales'])
  or (o.customer_id is not null and public.owns_customer(o.customer_id) and v.status not in ('draft','ready_for_review'))
)));
create policy commercial_offer_events_staff_read on public.commercial_offer_events for select to authenticated
using (public.has_app_role(array['super_admin','admin','sales_manager']));

revoke all on public.commercial_catalog_versions,public.commercial_offers,public.commercial_offer_versions,
  public.commercial_offer_lines,public.commercial_offer_document_bindings,public.commercial_offer_events from public,anon,authenticated,service_role;
grant select on public.commercial_catalog_versions,public.commercial_offers,public.commercial_offer_versions,
  public.commercial_offer_lines,public.commercial_offer_document_bindings to authenticated;
grant select on public.commercial_offer_events to authenticated;

revoke all on function public.commercial_immutable_guard() from public,anon,authenticated,service_role;
revoke all on function public.commercial_actor_role(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.commercial_assert_relationship_access(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.commercial_register_catalog_version_v1(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.commercial_create_offer_version_v1(uuid,uuid,text,uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.commercial_transition_offer_version_v1(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.commercial_register_catalog_version_v1(uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.commercial_create_offer_version_v1(uuid,uuid,text,uuid,uuid,text,uuid,uuid,jsonb,jsonb,jsonb,text,text) to service_role;
grant execute on function public.commercial_transition_offer_version_v1(uuid,uuid,uuid,text,text,text) to service_role;

comment on table public.commercial_offer_versions is 'Immutable commercial offer content. Lifecycle columns may transition only through a bounded server RPC.';
comment on table public.commercial_offer_events is 'Append-only commercial audit evidence without raw tokens, provider credentials or unnecessary PII.';

commit;
