-- Max Webstudio Food v1 / Phase 1A: tenant helpers, RLS and controlled order mutations.
-- Forward-only. Does not grant anon direct table access and does not enable a public route.
begin;

do $preflight$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'public.food_accounts','public.restaurant_locations','public.food_account_members',
    'public.food_capability_catalog','public.food_entitlements','public.restaurant_capabilities',
    'public.restaurant_tax_classes','public.menus','public.menu_categories','public.menu_items',
    'public.food_orders','public.food_order_items','public.food_order_status_history',
    'public.food_order_idempotency'
  ] loop
    if pg_catalog.to_regclass(relation_name) is null then
      raise exception using errcode = '55000',
        message = pg_catalog.format('Food v1 security requires %s.', relation_name);
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.current_profile_id()') is null
     or pg_catalog.to_regprocedure('public.is_admin_role()') is null then
    raise exception using errcode = '55000',
      message = 'Food v1 security requires canonical profile helpers.';
  end if;
end
$preflight$;

create function public.food_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$function$;

create function public.is_food_member(
  target_food_account_id uuid,
  allowed_roles text[] default null,
  target_location_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.food_account_members membership
    where membership.food_account_id = target_food_account_id
      and membership.profile_id = public.current_profile_id()
      and membership.status = 'active'
      and (allowed_roles is null or membership.role = any(allowed_roles))
      and (
        target_location_id is null
        or membership.location_id is null
        or membership.location_id = target_location_id
      )
  )
$function$;

create function public.food_has_capability(
  target_food_account_id uuid,
  target_location_id uuid,
  target_capability_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select exists (
    select 1
    from public.food_capability_catalog catalog
    join public.food_entitlements entitlement
      on entitlement.capability_key = catalog.key
     and entitlement.food_account_id = target_food_account_id
    join public.restaurant_capabilities configuration
      on configuration.food_account_id = entitlement.food_account_id
     and configuration.capability_key = entitlement.capability_key
     and configuration.location_id = target_location_id
    where catalog.key = target_capability_key
      and catalog.availability_status = 'available'
      and entitlement.status = 'active'
      and entitlement.starts_at <= pg_catalog.clock_timestamp()
      and (entitlement.ends_at is null or entitlement.ends_at > pg_catalog.clock_timestamp())
      and configuration.enabled
  )
$function$;

create function public.food_assert_service_role()
returns void
language plpgsql
stable
set search_path = pg_catalog
as $function$
declare
  jwt_role text;
begin
  jwt_role := nullif(pg_catalog.current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    exception when others then
      jwt_role := null;
    end;
  end if;

  if jwt_role <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'Food mutation requires service_role plus explicit actor validation.';
  end if;
end
$function$;

create function public.food_tax_class_validity_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform 1 from public.food_accounts
  where id = new.food_account_id
  for update;

  if new.active and exists (
    select 1
    from public.restaurant_tax_classes existing
    where existing.food_account_id = new.food_account_id
      and existing.code = new.code
      and existing.active
      and existing.id <> new.id
      and pg_catalog.tstzrange(existing.valid_from, existing.valid_until, '[)')
          && pg_catalog.tstzrange(new.valid_from, new.valid_until, '[)')
  ) then
    raise exception using errcode = '23P01',
      message = 'Food tax class validity windows may not overlap within one tenant.';
  end if;
  return new;
end
$function$;

create function public.food_order_item_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception using errcode = '55000', message = 'Food order item snapshots are immutable.';
end
$function$;

create function public.food_order_history_immutable_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  raise exception using errcode = '55000', message = 'Food order status history is append-only.';
end
$function$;

create function public.food_order_transition_guard()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if row(
    new.food_account_id, new.location_id, new.channel, new.fulfilment_type,
    new.public_reference, new.idempotency_key, new.customer_snapshot,
    new.fulfilment_snapshot, new.customer_note, new.currency,
    new.subtotal_minor, new.tax_minor, new.delivery_minor,
    new.discount_minor, new.total_minor, new.accepted_at,
    new.preparing_at, new.ready_at, new.out_for_delivery_at,
    new.completed_at, new.cancelled_at, new.created_at
  ) is distinct from row(
    old.food_account_id, old.location_id, old.channel, old.fulfilment_type,
    old.public_reference, old.idempotency_key, old.customer_snapshot,
    old.fulfilment_snapshot, old.customer_note, old.currency,
    old.subtotal_minor, old.tax_minor, old.delivery_minor,
    old.discount_minor, old.total_minor, old.accepted_at,
    old.preparing_at, old.ready_at, old.out_for_delivery_at,
    old.completed_at, old.cancelled_at, old.created_at
  ) then
    raise exception using errcode = '55000', message = 'Food order financial and customer snapshots are immutable.';
  end if;

  if new.status is not distinct from old.status then
    new.updated_at := pg_catalog.clock_timestamp();
    return new;
  end if;

  if not (
    (old.status = 'pending' and new.status in ('accepted','cancelled'))
    or (old.status = 'accepted' and new.status in ('preparing','cancelled'))
    or (old.status = 'preparing' and new.status in ('ready','cancelled'))
    or (old.status = 'ready' and new.status in ('completed','out_for_delivery','cancelled'))
    or (old.status = 'out_for_delivery' and new.status = 'completed')
  ) then
    raise exception using errcode = '23514',
      message = pg_catalog.format('Unsupported food order transition: %s -> %s.', old.status, new.status);
  end if;

  if new.fulfilment_type = 'pickup' and new.status = 'out_for_delivery' then
    raise exception using errcode = '23514', message = 'Pickup orders cannot be out for delivery.';
  end if;
  if new.fulfilment_type = 'delivery' and old.status = 'ready' and new.status = 'completed' then
    raise exception using errcode = '23514', message = 'Delivery orders must pass through out_for_delivery.';
  end if;

  new.accepted_at := case when new.status = 'accepted' then coalesce(new.accepted_at, pg_catalog.clock_timestamp()) else new.accepted_at end;
  new.preparing_at := case when new.status = 'preparing' then coalesce(new.preparing_at, pg_catalog.clock_timestamp()) else new.preparing_at end;
  new.ready_at := case when new.status = 'ready' then coalesce(new.ready_at, pg_catalog.clock_timestamp()) else new.ready_at end;
  new.out_for_delivery_at := case when new.status = 'out_for_delivery' then coalesce(new.out_for_delivery_at, pg_catalog.clock_timestamp()) else new.out_for_delivery_at end;
  new.completed_at := case when new.status = 'completed' then coalesce(new.completed_at, pg_catalog.clock_timestamp()) else new.completed_at end;
  new.cancelled_at := case when new.status = 'cancelled' then coalesce(new.cancelled_at, pg_catalog.clock_timestamp()) else new.cancelled_at end;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$function$;

create function public.food_order_status_history_capture()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
declare
  configured_actor text;
  configured_type text;
  configured_reason text;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  configured_actor := nullif(pg_catalog.current_setting('app.food_actor_profile_id', true), '');
  configured_type := coalesce(nullif(pg_catalog.current_setting('app.food_actor_type', true), ''),
    case when tg_op = 'INSERT' then 'public' else 'service' end);
  configured_reason := nullif(pg_catalog.current_setting('app.food_transition_reason', true), '');

  insert into public.food_order_status_history(
    food_account_id, order_id, old_status, new_status,
    actor_profile_id, actor_type, reason
  ) values (
    new.food_account_id, new.id,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    case when configured_actor is null then null else configured_actor::uuid end,
    configured_type,
    configured_reason
  );
  return new;
end
$function$;

create trigger food_accounts_updated_at before update on public.food_accounts
for each row execute function public.food_set_updated_at();
create trigger restaurant_locations_updated_at before update on public.restaurant_locations
for each row execute function public.food_set_updated_at();
create trigger food_account_members_updated_at before update on public.food_account_members
for each row execute function public.food_set_updated_at();
create trigger food_capability_catalog_updated_at before update on public.food_capability_catalog
for each row execute function public.food_set_updated_at();
create trigger food_entitlements_updated_at before update on public.food_entitlements
for each row execute function public.food_set_updated_at();
create trigger restaurant_capabilities_updated_at before update on public.restaurant_capabilities
for each row execute function public.food_set_updated_at();
create trigger restaurant_tax_classes_updated_at before update on public.restaurant_tax_classes
for each row execute function public.food_set_updated_at();
create trigger menus_updated_at before update on public.menus
for each row execute function public.food_set_updated_at();
create trigger menu_categories_updated_at before update on public.menu_categories
for each row execute function public.food_set_updated_at();
create trigger menu_items_updated_at before update on public.menu_items
for each row execute function public.food_set_updated_at();

create trigger restaurant_tax_classes_validity
before insert or update on public.restaurant_tax_classes
for each row execute function public.food_tax_class_validity_guard();
create trigger food_orders_transition_guard
before update on public.food_orders
for each row execute function public.food_order_transition_guard();
create trigger food_orders_status_history
after insert or update of status on public.food_orders
for each row execute function public.food_order_status_history_capture();
create trigger food_order_items_immutable
before update or delete on public.food_order_items
for each row execute function public.food_order_item_immutable_guard();
create trigger food_order_status_history_immutable
before update or delete on public.food_order_status_history
for each row execute function public.food_order_history_immutable_guard();

create function public.food_create_order_v1(
  input_location_slug text,
  input_idempotency_key text,
  input_items jsonb,
  input_fulfilment_type text,
  input_customer_snapshot jsonb,
  input_fulfilment_snapshot jsonb default '{}'::jsonb,
  input_customer_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
  target_location public.restaurant_locations%rowtype;
  target_account public.food_accounts%rowtype;
  idempotency_record public.food_order_idempotency%rowtype;
  created_order public.food_orders%rowtype;
  item_input jsonb;
  item_id uuid;
  item_quantity integer;
  item_name text;
  item_description text;
  item_price bigint;
  item_tax_rate integer;
  line_subtotal bigint;
  line_tax bigint;
  subtotal_amount bigint := 0;
  tax_amount bigint := 0;
  request_hash_value text;
  line_snapshots jsonb := '[]'::jsonb;
begin
  perform public.food_assert_service_role();

  if input_location_slug is null or input_location_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'Invalid food storefront slug.';
  end if;
  if input_idempotency_key is null or char_length(input_idempotency_key) not between 16 and 128 then
    raise exception using errcode = '22023', message = 'Invalid food order idempotency key.';
  end if;
  if jsonb_typeof(input_items) <> 'array' or jsonb_array_length(input_items) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'Food order items must be an array with 1 to 50 rows.';
  end if;
  if jsonb_typeof(input_customer_snapshot) <> 'object'
     or jsonb_typeof(coalesce(input_fulfilment_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'Food order snapshots must be JSON objects.';
  end if;
  if char_length(input_items::text) > 12000
     or char_length(input_customer_snapshot::text) > 4000
     or char_length(coalesce(input_fulfilment_snapshot, '{}'::jsonb)::text) > 4000 then
    raise exception using errcode = '22023', message = 'Food order payload is too large.';
  end if;
  if exists (
    select 1 from jsonb_object_keys(input_customer_snapshot) as snapshot_key(key)
    where key not in ('name','phone','email')
  ) or exists (
    select 1 from jsonb_object_keys(coalesce(input_fulfilment_snapshot, '{}'::jsonb)) as snapshot_key(key)
    where key not in ('pickup_at')
  ) then
    raise exception using errcode = '22023', message = 'Food order snapshot contains an unsupported field.';
  end if;
  if input_customer_note is not null and char_length(input_customer_note) > 1000 then
    raise exception using errcode = '22023', message = 'Food order note is too long.';
  end if;
  if input_fulfilment_type <> 'pickup' then
    raise exception using errcode = '22023', message = 'Only pickup is enabled in the Food v1 pilot foundation.';
  end if;
  if (select count(*) from jsonb_array_elements(input_items)) <>
     (select count(distinct value->>'menu_item_id') from jsonb_array_elements(input_items)) then
    raise exception using errcode = '22023', message = 'Duplicate menu item rows are not allowed.';
  end if;

  select * into target_location
  from public.restaurant_locations
  where slug = input_location_slug
    and status = 'active'
    and is_published
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'Food storefront not found.';
  end if;

  select * into target_account
  from public.food_accounts
  where id = target_location.food_account_id
    and status in ('pilot','active')
  for share;
  if not found then
    raise exception using errcode = 'P0002', message = 'Food account is unavailable.';
  end if;
  if not public.food_has_capability(target_account.id, target_location.id, 'ordering.pickup') then
    raise exception using errcode = '42501', message = 'Pickup ordering is not available for this location.';
  end if;

  request_hash_value := encode(digest(convert_to(
    jsonb_build_object(
      'slug', input_location_slug,
      'items', input_items,
      'fulfilment_type', input_fulfilment_type,
      'customer', input_customer_snapshot,
      'fulfilment', coalesce(input_fulfilment_snapshot, '{}'::jsonb),
      'note', input_customer_note
    )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  select * into idempotency_record
  from public.food_order_idempotency
  where location_id = target_location.id
    and idempotency_key = input_idempotency_key
  for update;
  if found then
    if idempotency_record.request_hash <> request_hash_value then
      raise exception using errcode = '23505', message = 'Food idempotency key was reused with a different request.';
    end if;
    if idempotency_record.order_id is null then
      raise exception using errcode = '55000', message = 'Food idempotency reservation has no completed order.';
    end if;
    select * into created_order from public.food_orders where id = idempotency_record.order_id;
    return jsonb_build_object(
      'id', created_order.id,
      'public_reference', created_order.public_reference,
      'status', created_order.status,
      'currency', created_order.currency,
      'subtotal_minor', created_order.subtotal_minor,
      'tax_minor', created_order.tax_minor,
      'total_minor', created_order.total_minor,
      'idempotent_replay', true
    );
  end if;

  begin
    insert into public.food_order_idempotency(
      food_account_id, location_id, idempotency_key, request_hash, expires_at
    ) values (
      target_account.id, target_location.id, input_idempotency_key,
      request_hash_value, pg_catalog.clock_timestamp() + interval '24 hours'
    ) returning * into idempotency_record;
  exception when unique_violation then
    select * into idempotency_record
    from public.food_order_idempotency
    where location_id = target_location.id and idempotency_key = input_idempotency_key
    for update;
    if idempotency_record.request_hash <> request_hash_value or idempotency_record.order_id is null then
      raise exception using errcode = '23505', message = 'Food idempotency conflict.';
    end if;
    select * into created_order from public.food_orders where id = idempotency_record.order_id;
    return jsonb_build_object(
      'id', created_order.id, 'public_reference', created_order.public_reference,
      'status', created_order.status, 'currency', created_order.currency,
      'subtotal_minor', created_order.subtotal_minor, 'tax_minor', created_order.tax_minor,
      'total_minor', created_order.total_minor, 'idempotent_replay', true
    );
  end;

  for item_input in select value from jsonb_array_elements(input_items)
  loop
    if jsonb_typeof(item_input) <> 'object'
       or item_input - 'menu_item_id' - 'quantity' <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'Food order item contains an unsupported field.';
    end if;
    begin
      item_id := (item_input->>'menu_item_id')::uuid;
      item_quantity := (item_input->>'quantity')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'Food order item id or quantity is invalid.';
    end;
    if item_quantity not between 1 and 99 then
      raise exception using errcode = '22023', message = 'Food order item quantity must be between 1 and 99.';
    end if;

    select menu_item.name, menu_item.description, menu_item.price_minor, tax.rate_basis_points
      into item_name, item_description, item_price, item_tax_rate
    from public.menu_items menu_item
    join public.menu_categories category
      on category.food_account_id = menu_item.food_account_id
     and category.location_id = menu_item.location_id
     and category.id = menu_item.category_id
     and category.active
    join public.menus menu
      on menu.food_account_id = category.food_account_id
     and menu.location_id = category.location_id
     and menu.id = category.menu_id
     and menu.status = 'published'
    join public.restaurant_tax_classes tax
      on tax.food_account_id = menu_item.food_account_id
     and tax.id = menu_item.tax_class_id
     and tax.active
     and tax.valid_from <= pg_catalog.clock_timestamp()
     and (tax.valid_until is null or tax.valid_until > pg_catalog.clock_timestamp())
    where menu_item.id = item_id
      and menu_item.food_account_id = target_account.id
      and menu_item.location_id = target_location.id
      and menu_item.active
      and menu_item.available
    for share of menu_item, category, menu, tax;
    if not found then
      raise exception using errcode = 'P0002', message = 'Food order contains an unavailable menu item.';
    end if;

    line_subtotal := item_price * item_quantity;
    line_tax := round((line_subtotal::numeric * item_tax_rate::numeric) / (10000 + item_tax_rate))::bigint;
    subtotal_amount := subtotal_amount + line_subtotal;
    tax_amount := tax_amount + line_tax;
    line_snapshots := line_snapshots || jsonb_build_array(jsonb_build_object(
      'menu_item_id', item_id,
      'name', item_name,
      'description', item_description,
      'quantity', item_quantity,
      'unit_price_minor', item_price,
      'line_subtotal_minor', line_subtotal,
      'tax_rate_basis_points', item_tax_rate,
      'tax_minor', line_tax,
      'line_total_minor', line_subtotal
    ));
  end loop;

  insert into public.food_orders(
    food_account_id, location_id, channel, fulfilment_type, status,
    public_reference, idempotency_key, customer_snapshot, fulfilment_snapshot,
    customer_note, currency, subtotal_minor, tax_minor,
    delivery_minor, discount_minor, total_minor
  ) values (
    target_account.id, target_location.id, 'website', 'pickup', 'pending',
    encode(gen_random_bytes(16), 'hex'), input_idempotency_key,
    input_customer_snapshot, coalesce(input_fulfilment_snapshot, '{}'::jsonb),
    input_customer_note, target_account.currency, subtotal_amount, tax_amount,
    0, 0, subtotal_amount
  ) returning * into created_order;

  insert into public.food_order_items(
    food_account_id, order_id, menu_item_id, item_name_snapshot,
    item_description_snapshot, quantity, unit_price_minor, line_subtotal_minor,
    tax_rate_basis_points, tax_minor, line_total_minor
  )
  select
    target_account.id, created_order.id, (line->>'menu_item_id')::uuid,
    line->>'name', line->>'description', (line->>'quantity')::integer,
    (line->>'unit_price_minor')::bigint, (line->>'line_subtotal_minor')::bigint,
    (line->>'tax_rate_basis_points')::integer, (line->>'tax_minor')::bigint,
    (line->>'line_total_minor')::bigint
  from jsonb_array_elements(line_snapshots) line;

  update public.food_order_idempotency
  set order_id = created_order.id, response_code = 201
  where id = idempotency_record.id;

  return jsonb_build_object(
    'id', created_order.id,
    'public_reference', created_order.public_reference,
    'status', created_order.status,
    'currency', created_order.currency,
    'subtotal_minor', created_order.subtotal_minor,
    'tax_minor', created_order.tax_minor,
    'total_minor', created_order.total_minor,
    'idempotent_replay', false
  );
end
$function$;

create function public.food_transition_order_status_v1(
  input_order_id uuid,
  input_new_status text,
  input_actor_profile_id uuid,
  input_reason text default null
)
returns public.food_orders
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  target_order public.food_orders%rowtype;
  actor_profile public.profiles%rowtype;
  actor_role text;
  actor_is_platform_admin boolean := false;
begin
  perform public.food_assert_service_role();
  if input_reason is not null and char_length(input_reason) > 500 then
    raise exception using errcode = '22023', message = 'Food order transition reason is too long.';
  end if;

  select * into target_order from public.food_orders where id = input_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Food order not found.';
  end if;
  if not public.food_has_capability(target_order.food_account_id, target_order.location_id, 'orders.management') then
    raise exception using errcode = '42501', message = 'Order management is unavailable for this location.';
  end if;

  select * into actor_profile
  from public.profiles
  where id = input_actor_profile_id and status = 'active';
  if not found then
    raise exception using errcode = '42501', message = 'Food order actor is not an active profile.';
  end if;
  actor_is_platform_admin := actor_profile.role in ('super_admin','admin');

  if not actor_is_platform_admin then
    select membership.role into actor_role
    from public.food_account_members membership
    where membership.food_account_id = target_order.food_account_id
      and membership.profile_id = actor_profile.id
      and membership.status = 'active'
      and (membership.location_id is null or membership.location_id = target_order.location_id)
    order by case membership.role
      when 'owner' then 1 when 'manager' then 2 when 'staff' then 3
      when 'kitchen_staff' then 4 else 5 end
    limit 1;
    if actor_role is null or actor_role = 'viewer' then
      raise exception using errcode = '42501', message = 'Food member cannot change order status.';
    end if;
    if actor_role = 'kitchen_staff' and not (
      (target_order.status = 'accepted' and input_new_status = 'preparing')
      or (target_order.status = 'preparing' and input_new_status = 'ready')
    ) then
      raise exception using errcode = '42501', message = 'Kitchen role cannot perform this order transition.';
    end if;
    if actor_role = 'staff' and input_new_status = 'cancelled' and target_order.status <> 'pending' then
      raise exception using errcode = '42501', message = 'Staff cannot cancel an order after acceptance.';
    end if;
  end if;

  perform pg_catalog.set_config('app.food_actor_profile_id', actor_profile.id::text, true);
  perform pg_catalog.set_config('app.food_actor_type',
    case when actor_is_platform_admin then 'platform_admin' else 'food_member' end, true);
  perform pg_catalog.set_config('app.food_transition_reason', coalesce(input_reason, ''), true);

  update public.food_orders set status = input_new_status where id = target_order.id
  returning * into target_order;
  return target_order;
end
$function$;

alter table public.food_accounts enable row level security;
alter table public.restaurant_locations enable row level security;
alter table public.food_account_members enable row level security;
alter table public.food_capability_catalog enable row level security;
alter table public.food_entitlements enable row level security;
alter table public.restaurant_capabilities enable row level security;
alter table public.restaurant_tax_classes enable row level security;
alter table public.menus enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.food_orders enable row level security;
alter table public.food_order_items enable row level security;
alter table public.food_order_status_history enable row level security;
alter table public.food_order_idempotency enable row level security;

create policy food_accounts_member_select on public.food_accounts for select to authenticated
using (public.is_admin_role() or public.is_food_member(id));
create policy restaurant_locations_member_select on public.restaurant_locations for select to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, null, id));
create policy food_account_members_member_select on public.food_account_members for select to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id));
create policy food_account_members_owner_insert on public.food_account_members for insert to authenticated
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner']));
create policy food_account_members_owner_update on public.food_account_members for update to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, array['owner']))
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner']));
create policy food_capability_catalog_authenticated_select on public.food_capability_catalog for select to authenticated
using (public.current_profile_id() is not null);
create policy food_entitlements_member_select on public.food_entitlements for select to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id));
create policy restaurant_capabilities_member_select on public.restaurant_capabilities for select to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, null, location_id));
create policy restaurant_capabilities_manager_insert on public.restaurant_capabilities for insert to authenticated
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id));
create policy restaurant_capabilities_manager_update on public.restaurant_capabilities for update to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id))
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id));
create policy restaurant_tax_classes_member_select on public.restaurant_tax_classes for select to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id));
create policy restaurant_tax_classes_manager_insert on public.restaurant_tax_classes for insert to authenticated
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager']));
create policy restaurant_tax_classes_manager_update on public.restaurant_tax_classes for update to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager']))
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager']));
create policy menus_member_select on public.menus for select to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, null, location_id));
create policy menus_manager_insert on public.menus for insert to authenticated
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id));
create policy menus_manager_update on public.menus for update to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id))
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id));
create policy menu_categories_member_select on public.menu_categories for select to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, null, location_id));
create policy menu_categories_manager_insert on public.menu_categories for insert to authenticated
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id));
create policy menu_categories_manager_update on public.menu_categories for update to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id))
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id));
create policy menu_items_member_select on public.menu_items for select to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, null, location_id));
create policy menu_items_manager_insert on public.menu_items for insert to authenticated
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id));
create policy menu_items_manager_update on public.menu_items for update to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id))
with check (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager'], location_id));
create policy food_orders_member_select on public.food_orders for select to authenticated
using (public.is_admin_role() or public.is_food_member(food_account_id, array['owner','manager','staff','kitchen_staff','viewer'], location_id));
create policy food_order_items_member_select on public.food_order_items for select to authenticated
using (
  public.is_admin_role()
  or exists (
    select 1 from public.food_orders parent_order
    where parent_order.food_account_id = food_order_items.food_account_id
      and parent_order.id = food_order_items.order_id
      and public.is_food_member(parent_order.food_account_id, null, parent_order.location_id)
  )
);
create policy food_order_status_history_member_select on public.food_order_status_history for select to authenticated
using (
  public.is_admin_role()
  or exists (
    select 1 from public.food_orders parent_order
    where parent_order.food_account_id = food_order_status_history.food_account_id
      and parent_order.id = food_order_status_history.order_id
      and public.is_food_member(parent_order.food_account_id, null, parent_order.location_id)
  )
);

revoke all on table public.food_accounts, public.restaurant_locations, public.food_account_members,
  public.food_capability_catalog, public.food_entitlements, public.restaurant_capabilities,
  public.restaurant_tax_classes, public.menus, public.menu_categories, public.menu_items,
  public.food_orders, public.food_order_items, public.food_order_status_history,
  public.food_order_idempotency from public, anon, authenticated;

grant select on table public.food_accounts, public.restaurant_locations, public.food_account_members,
  public.food_capability_catalog, public.food_entitlements, public.restaurant_capabilities,
  public.restaurant_tax_classes, public.menus, public.menu_categories, public.menu_items,
  public.food_orders, public.food_order_items, public.food_order_status_history to authenticated;
grant insert, update on table public.food_account_members, public.restaurant_capabilities,
  public.restaurant_tax_classes, public.menus, public.menu_categories, public.menu_items to authenticated;
grant select on table public.food_accounts, public.restaurant_locations,
  public.food_capability_catalog, public.food_entitlements, public.restaurant_capabilities,
  public.restaurant_tax_classes, public.menus, public.menu_categories, public.menu_items
  to service_role;

revoke all on function public.food_set_updated_at() from public, anon, authenticated;
revoke all on function public.food_tax_class_validity_guard() from public, anon, authenticated;
revoke all on function public.food_order_item_immutable_guard() from public, anon, authenticated;
revoke all on function public.food_order_history_immutable_guard() from public, anon, authenticated;
revoke all on function public.food_order_transition_guard() from public, anon, authenticated;
revoke all on function public.food_order_status_history_capture() from public, anon, authenticated;
revoke all on function public.food_assert_service_role() from public, anon, authenticated;
revoke all on function public.food_create_order_v1(text,text,jsonb,text,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.food_transition_order_status_v1(uuid,text,uuid,text) from public, anon, authenticated;
revoke all on function public.is_food_member(uuid,text[],uuid) from public, anon;
revoke all on function public.food_has_capability(uuid,uuid,text) from public, anon;
grant execute on function public.is_food_member(uuid,text[],uuid) to authenticated, service_role;
grant execute on function public.food_has_capability(uuid,uuid,text) to authenticated, service_role;
grant execute on function public.food_assert_service_role() to service_role;
grant execute on function public.food_create_order_v1(text,text,jsonb,text,jsonb,jsonb,text) to service_role;
grant execute on function public.food_transition_order_status_v1(uuid,text,uuid,text) to service_role;
grant execute on function public.food_set_updated_at(), public.food_tax_class_validity_guard(),
  public.food_order_item_immutable_guard(), public.food_order_history_immutable_guard(),
  public.food_order_transition_guard(), public.food_order_status_history_capture() to service_role;

commit;
