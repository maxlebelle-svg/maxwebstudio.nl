-- Max Webstudio Food v1 / Phase 2: customer-safe confirmation line read model.
-- Forward-only and data preserving. Replaces only the service-only Phase 1B read RPC.
begin;

do $preflight$
begin
  if pg_catalog.to_regprocedure('public.food_get_order_confirmation_v1(text,text)') is null
     or pg_catalog.to_regclass('public.food_order_items') is null then
    raise exception using errcode = '55000',
      message = 'Food v1 Phase 2 requires the complete Phase 1B application API support.';
  end if;
end
$preflight$;

create or replace function public.food_get_order_confirmation_v1(
  input_location_slug text,
  input_public_reference text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  confirmation jsonb;
begin
  perform public.food_assert_service_role();
  if input_public_reference !~ '^[a-f0-9]{32}$' then
    return null;
  end if;

  select jsonb_build_object(
    'public_reference', food_order.public_reference,
    'status', food_order.status,
    'fulfilment_type', food_order.fulfilment_type,
    'currency', food_order.currency,
    'subtotal_minor', food_order.subtotal_minor,
    'tax_minor', food_order.tax_minor,
    'total_minor', food_order.total_minor,
    'created_at', food_order.created_at,
    'storefront', jsonb_build_object('slug', location.slug, 'name', location.name),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', order_item.item_name_snapshot,
        'quantity', order_item.quantity,
        'unit_price_minor', order_item.unit_price_minor,
        'line_total_minor', order_item.line_total_minor
      ) order by order_item.created_at, order_item.id)
      from public.food_order_items order_item
      where order_item.food_account_id = food_order.food_account_id
        and order_item.order_id = food_order.id
    ), '[]'::jsonb)
  ) into confirmation
  from public.food_orders food_order
  join public.restaurant_locations location
    on location.food_account_id = food_order.food_account_id
   and location.id = food_order.location_id
  join public.food_accounts account on account.id = food_order.food_account_id
  where location.slug = input_location_slug
    and location.status = 'active'
    and location.is_published
    and account.status in ('pilot','active')
    and food_order.public_reference = input_public_reference;
  return confirmation;
end
$function$;

revoke all on function public.food_get_order_confirmation_v1(text,text)
  from public, anon, authenticated;
grant execute on function public.food_get_order_confirmation_v1(text,text)
  to service_role;

commit;
