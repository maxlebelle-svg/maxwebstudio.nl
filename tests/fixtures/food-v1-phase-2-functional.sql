\set ON_ERROR_STOP on

-- Phase 1A fixture data and the Phase 2 confirmation migration must already be present.
select set_config('request.jwt.claim.role','service_role',false);

do $assert_storefront_confirmation_lines$
declare
  target_reference text;
  confirmation jsonb;
  line jsonb;
begin
  select public_reference into target_reference
  from public.food_orders
  where food_account_id = 'f4000000-0000-4000-8000-000000000001'
  order by created_at limit 1;

  confirmation := public.food_get_order_confirmation_v1(
    'fixture-silverado-emmeloord', target_reference
  );
  if jsonb_typeof(confirmation->'items') <> 'array'
     or jsonb_array_length(confirmation->'items') <> 1 then
    raise exception 'customer-safe confirmation did not return its one immutable line';
  end if;
  line := confirmation->'items'->0;
  if line->>'name' <> 'Test roti kip'
     or (line->>'quantity')::integer <> 2
     or (line->>'line_total_minor')::bigint <> 2000 then
    raise exception 'confirmation line does not match the immutable order snapshot';
  end if;
  if line ? 'id'
     or line ? 'menu_item_id'
     or confirmation ? 'food_account_id'
     or confirmation ? 'location_id'
     or confirmation ? 'customer_snapshot'
     or confirmation ? 'customer_note' then
    raise exception 'confirmation line read model leaked internal or customer fields';
  end if;
end
$assert_storefront_confirmation_lines$;

select 'PASS_FOOD_V1_PHASE_2_FUNCTIONAL' as status;
