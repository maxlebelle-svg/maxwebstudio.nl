-- Max Webstudio Food v1 / Phase 1A: tenant-bound data foundation.
-- Forward-only and data preserving. Creates no tenant, menu or order rows.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.customers') is null
     or pg_catalog.to_regclass('public.profiles') is null then
    raise exception using errcode = '55000',
      message = 'Food v1 requires public.customers and public.profiles.';
  end if;

  if pg_catalog.to_regprocedure('public.current_profile_id()') is null
     or pg_catalog.to_regprocedure('public.is_admin_role()') is null then
    raise exception using errcode = '55000',
      message = 'Food v1 requires the canonical active-profile role helpers.';
  end if;

  if pg_catalog.to_regclass('public.food_accounts') is not null then
    raise exception using errcode = '42P07',
      message = 'Food v1 foundation already exists; refusing an ambiguous replay.';
  end if;
end
$preflight$;

create table public.food_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references public.customers(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  business_type text not null default 'restaurant' check (
    business_type in ('restaurant','snackbar','pizzeria','sushi','broodjeszaak','lunchroom','cafetaria','ijssalon','cafe')
  ),
  status text not null default 'pilot' check (status in ('pilot','active','disabled','archived')),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Europe/Amsterdam' check (char_length(btrim(timezone)) between 3 and 80),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint food_accounts_archive_check check (status <> 'archived' or archived_at is not null),
  constraint food_accounts_tenant_identity_unique unique (id, customer_id)
);

create index food_accounts_status_updated_idx on public.food_accounts(status, updated_at desc);

create table public.restaurant_locations (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null references public.food_accounts(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 100),
  status text not null default 'draft' check (status in ('draft','active','disabled','archived')),
  is_published boolean not null default false,
  timezone text not null default 'Europe/Amsterdam' check (char_length(btrim(timezone)) between 3 and 80),
  phone text,
  street text,
  house_number text,
  postal_code text,
  city text,
  country_code text not null default 'NL' check (country_code ~ '^[A-Z]{2}$'),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint restaurant_locations_archive_check check (status <> 'archived' or archived_at is not null),
  constraint restaurant_locations_account_id_unique unique (food_account_id, id)
);

create index restaurant_locations_account_status_idx
  on public.restaurant_locations(food_account_id, status, updated_at desc);

create table public.food_account_members (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null references public.food_accounts(id) on delete restrict,
  location_id uuid,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  role text not null check (role in ('owner','manager','staff','kitchen_staff','viewer')),
  status text not null default 'active' check (status in ('invited','active','disabled')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint food_account_members_location_tenant_fk
    foreign key (food_account_id, location_id)
    references public.restaurant_locations(food_account_id, id) on delete restrict,
  constraint food_account_members_identity_unique unique (food_account_id, profile_id, location_id)
);

create unique index food_account_members_accountwide_unique
  on public.food_account_members(food_account_id, profile_id)
  where location_id is null;
create index food_account_members_profile_status_idx
  on public.food_account_members(profile_id, status, food_account_id);
create index food_account_members_account_role_idx
  on public.food_account_members(food_account_id, role, status);

create table public.food_capability_catalog (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  availability_status text not null default 'unavailable' check (
    availability_status in ('unavailable','preview','available')
  ),
  description text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

insert into public.food_capability_catalog(key, availability_status, description)
values
  ('ordering.pickup', 'available', 'Server-validated pickup ordering.'),
  ('menu.management', 'available', 'Tenant-bound menu management.'),
  ('orders.management', 'available', 'Tenant-bound order management.');

create table public.food_entitlements (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null references public.food_accounts(id) on delete restrict,
  capability_key text not null references public.food_capability_catalog(key) on delete restrict,
  status text not null default 'active' check (status in ('active','suspended','expired')),
  starts_at timestamptz not null default clock_timestamp(),
  ends_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint food_entitlements_window_check check (ends_at is null or ends_at > starts_at),
  constraint food_entitlements_account_capability_unique unique (food_account_id, capability_key)
);

create table public.restaurant_capabilities (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null,
  location_id uuid not null,
  capability_key text not null,
  enabled boolean not null default false,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint restaurant_capabilities_location_tenant_fk
    foreign key (food_account_id, location_id)
    references public.restaurant_locations(food_account_id, id) on delete restrict,
  constraint restaurant_capabilities_entitlement_fk
    foreign key (food_account_id, capability_key)
    references public.food_entitlements(food_account_id, capability_key) on delete restrict,
  constraint restaurant_capabilities_location_key_unique unique (location_id, capability_key),
  constraint restaurant_capabilities_account_location_key_unique unique (food_account_id, location_id, capability_key)
);

create table public.restaurant_tax_classes (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null references public.food_accounts(id) on delete restrict,
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  rate_basis_points integer not null check (rate_basis_points between 0 and 10000),
  valid_from timestamptz not null,
  valid_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint restaurant_tax_classes_window_check check (valid_until is null or valid_until > valid_from),
  constraint restaurant_tax_classes_version_unique unique (food_account_id, code, valid_from),
  constraint restaurant_tax_classes_account_id_unique unique (food_account_id, id)
);

create index restaurant_tax_classes_effective_idx
  on public.restaurant_tax_classes(food_account_id, code, active, valid_from desc);

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null,
  location_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint menus_location_tenant_fk
    foreign key (food_account_id, location_id)
    references public.restaurant_locations(food_account_id, id) on delete restrict,
  constraint menus_publish_check check (status <> 'published' or published_at is not null),
  constraint menus_archive_check check (status <> 'archived' or archived_at is not null),
  constraint menus_account_location_id_unique unique (food_account_id, location_id, id),
  constraint menus_location_name_unique unique (location_id, name)
);

create index menus_location_status_idx on public.menus(food_account_id, location_id, status);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null,
  location_id uuid not null,
  menu_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint menu_categories_menu_tenant_fk
    foreign key (food_account_id, location_id, menu_id)
    references public.menus(food_account_id, location_id, id) on delete restrict,
  constraint menu_categories_account_location_id_unique unique (food_account_id, location_id, id),
  constraint menu_categories_menu_name_unique unique (menu_id, name)
);

create index menu_categories_menu_sort_idx
  on public.menu_categories(food_account_id, location_id, menu_id, active, sort_order, id);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null,
  location_id uuid not null,
  category_id uuid not null,
  tax_class_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  price_minor bigint not null check (price_minor between 0 and 100000000),
  active boolean not null default true,
  available boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 100000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint menu_items_category_tenant_fk
    foreign key (food_account_id, location_id, category_id)
    references public.menu_categories(food_account_id, location_id, id) on delete restrict,
  constraint menu_items_tax_tenant_fk
    foreign key (food_account_id, tax_class_id)
    references public.restaurant_tax_classes(food_account_id, id) on delete restrict,
  constraint menu_items_account_location_id_unique unique (food_account_id, location_id, id),
  constraint menu_items_account_id_unique unique (food_account_id, id)
);

create index menu_items_storefront_idx
  on public.menu_items(food_account_id, location_id, category_id, active, available, sort_order, id);

create table public.food_orders (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null,
  location_id uuid not null,
  channel text not null check (channel in ('website','qr','tablet','kiosk','whatsapp','mobile_app','api','dashboard')),
  fulfilment_type text not null check (fulfilment_type in ('pickup','delivery')),
  status text not null default 'pending' check (
    status in ('pending','accepted','preparing','ready','out_for_delivery','completed','cancelled')
  ),
  public_reference text not null unique check (public_reference ~ '^[a-f0-9]{32}$'),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  customer_snapshot jsonb not null check (jsonb_typeof(customer_snapshot) = 'object'),
  fulfilment_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(fulfilment_snapshot) = 'object'),
  customer_note text check (customer_note is null or char_length(customer_note) <= 1000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  tax_minor bigint not null check (tax_minor >= 0 and tax_minor <= subtotal_minor),
  delivery_minor bigint not null default 0 check (delivery_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  out_for_delivery_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint food_orders_location_tenant_fk
    foreign key (food_account_id, location_id)
    references public.restaurant_locations(food_account_id, id) on delete restrict,
  constraint food_orders_total_check check (total_minor = subtotal_minor + delivery_minor - discount_minor),
  constraint food_orders_discount_check check (discount_minor <= subtotal_minor + delivery_minor),
  constraint food_orders_location_idempotency_unique unique (location_id, idempotency_key),
  constraint food_orders_account_id_unique unique (food_account_id, id)
);

create index food_orders_dashboard_idx
  on public.food_orders(food_account_id, location_id, status, updated_at desc, id desc);
create index food_orders_created_idx
  on public.food_orders(food_account_id, location_id, created_at desc);

create table public.food_order_items (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null,
  order_id uuid not null,
  menu_item_id uuid,
  item_name_snapshot text not null check (char_length(btrim(item_name_snapshot)) between 1 and 160),
  item_description_snapshot text not null default '' check (char_length(item_description_snapshot) <= 2000),
  quantity integer not null check (quantity between 1 and 99),
  unit_price_minor bigint not null check (unit_price_minor >= 0),
  line_subtotal_minor bigint not null check (line_subtotal_minor >= 0),
  tax_rate_basis_points integer not null check (tax_rate_basis_points between 0 and 10000),
  tax_minor bigint not null check (tax_minor >= 0 and tax_minor <= line_subtotal_minor),
  line_total_minor bigint not null check (line_total_minor >= 0),
  created_at timestamptz not null default clock_timestamp(),
  constraint food_order_items_order_tenant_fk
    foreign key (food_account_id, order_id)
    references public.food_orders(food_account_id, id) on delete restrict,
  constraint food_order_items_menu_tenant_fk
    foreign key (food_account_id, menu_item_id)
    references public.menu_items(food_account_id, id) on delete restrict,
  constraint food_order_items_subtotal_check check (line_subtotal_minor = unit_price_minor * quantity),
  constraint food_order_items_total_check check (line_total_minor = line_subtotal_minor)
);

create index food_order_items_order_idx on public.food_order_items(food_account_id, order_id, created_at, id);

create table public.food_order_status_history (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null,
  order_id uuid not null,
  old_status text check (old_status is null or old_status in ('pending','accepted','preparing','ready','out_for_delivery','completed','cancelled')),
  new_status text not null check (new_status in ('pending','accepted','preparing','ready','out_for_delivery','completed','cancelled')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('public','food_member','platform_admin','service')),
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default clock_timestamp(),
  constraint food_order_status_history_order_tenant_fk
    foreign key (food_account_id, order_id)
    references public.food_orders(food_account_id, id) on delete restrict
);

create index food_order_status_history_timeline_idx
  on public.food_order_status_history(food_account_id, order_id, created_at, id);

create table public.food_order_idempotency (
  id uuid primary key default gen_random_uuid(),
  food_account_id uuid not null,
  location_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  order_id uuid,
  response_code integer check (response_code is null or response_code between 200 and 599),
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint food_order_idempotency_location_tenant_fk
    foreign key (food_account_id, location_id)
    references public.restaurant_locations(food_account_id, id) on delete restrict,
  constraint food_order_idempotency_order_tenant_fk
    foreign key (food_account_id, order_id)
    references public.food_orders(food_account_id, id) on delete restrict,
  constraint food_order_idempotency_expiry_check check (expires_at > created_at),
  constraint food_order_idempotency_location_key_unique unique (location_id, idempotency_key)
);

create index food_order_idempotency_expiry_idx on public.food_order_idempotency(expires_at);

comment on table public.food_accounts is 'Food tenant boundary; customers remains the platform/commercial anchor.';
comment on column public.food_orders.subtotal_minor is 'Tax-inclusive sum of immutable order-line gross amounts in minor units.';
comment on column public.food_order_items.tax_minor is 'Immutable included-tax component calculated at order creation.';
comment on table public.food_order_idempotency is 'Server-only replay protection; never directly exposed to browser clients.';

commit;
