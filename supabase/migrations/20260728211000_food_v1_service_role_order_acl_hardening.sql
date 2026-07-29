-- Max Webstudio Food v1: remove Supabase default object grants from Food mutation surfaces.
-- service_role intentionally keeps BYPASSRLS; controlled SECURITY DEFINER RPCs are the mutation boundary.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

do $preflight$
declare
  target_table text;
  target_function regprocedure;
  function_owner oid;
  table_owner oid;
  function_config text[];
  is_security_definer boolean;
begin
  foreach target_table in array array[
    'food_accounts', 'restaurant_locations', 'food_account_members',
    'food_capability_catalog', 'food_entitlements', 'restaurant_capabilities',
    'restaurant_tax_classes', 'menus', 'menu_categories', 'menu_items',
    'food_orders', 'food_order_items', 'food_order_status_history',
    'food_order_idempotency', 'food_public_order_rate_limits',
    'food_demo_accounts', 'food_demo_menu_item_baselines',
    'food_demo_reset_rate_limits', 'food_demo_reset_audit'
  ] loop
    if pg_catalog.to_regclass('public.' || target_table) is null then
      raise exception using errcode = '55000',
        message = 'Food service-role ACL hardening requires table public.' || target_table || '.';
    end if;
  end loop;

  if not (select rolbypassrls from pg_catalog.pg_roles where rolname = 'service_role') then
    raise exception using errcode = '55000',
      message = 'Food service-role ACL hardening expects the platform-managed BYPASSRLS role and does not alter it.';
  end if;

  select relowner into table_owner
  from pg_catalog.pg_class
  where oid = 'public.food_orders'::pg_catalog.regclass;

  foreach target_function in array array[
    'public.food_has_capability(uuid,uuid,text)'::pg_catalog.regprocedure,
    'public.food_consume_order_rate_limit_v1(text,text,integer,integer)'::pg_catalog.regprocedure,
    'public.food_create_order_v1(text,text,jsonb,text,jsonb,jsonb,text)'::pg_catalog.regprocedure,
    'public.food_get_order_confirmation_v1(text,text)'::pg_catalog.regprocedure,
    'public.food_transition_order_status_v1(uuid,text,uuid,text)'::pg_catalog.regprocedure,
    'public.food_reset_demo_account_v1(uuid,text,uuid,text)'::pg_catalog.regprocedure
  ] loop
    select proowner, proconfig, prosecdef
      into function_owner, function_config, is_security_definer
    from pg_catalog.pg_proc
    where oid = target_function;

    if not is_security_definer or function_owner <> table_owner then
      raise exception using errcode = '55000',
        message = 'Food mutation/read RPC must be SECURITY DEFINER and owned by the Food table owner: ' || target_function::text;
    end if;
    if not coalesce(function_config, array[]::text[]) && array[
      'search_path=pg_catalog',
      'search_path=pg_catalog, public',
      'search_path=pg_catalog, public, extensions'
    ]::text[] then
      raise exception using errcode = '55000',
        message = 'Food RPC lacks a fixed approved search_path: ' || target_function::text;
    end if;
  end loop;
end
$preflight$;

-- Supabase grants service_role broad table rights through postgres' public-schema defaults.
-- Remove every direct privilege first, then restore SELECT only for the six read models
-- that functions/_food-api.js demonstrably reads through the service client.
revoke all privileges on table
  public.food_accounts,
  public.restaurant_locations,
  public.food_account_members,
  public.food_capability_catalog,
  public.food_entitlements,
  public.restaurant_capabilities,
  public.restaurant_tax_classes,
  public.menus,
  public.menu_categories,
  public.menu_items,
  public.food_orders,
  public.food_order_items,
  public.food_order_status_history,
  public.food_order_idempotency,
  public.food_public_order_rate_limits,
  public.food_demo_accounts,
  public.food_demo_menu_item_baselines,
  public.food_demo_reset_rate_limits,
  public.food_demo_reset_audit
from service_role;

grant select on table
  public.food_accounts,
  public.restaurant_locations,
  public.restaurant_tax_classes,
  public.menus,
  public.menu_categories,
  public.menu_items
to service_role;

-- All Food identities are UUID-based; no Food table owns a sequence. Fail closed if that changes.
do $sequence_preflight$
begin
  if exists (
    select 1
    from pg_catalog.pg_class sequence
    join pg_catalog.pg_depend dependency
      on dependency.objid = sequence.oid and dependency.deptype in ('a', 'i')
    join pg_catalog.pg_class target_table on target_table.oid = dependency.refobjid
    join pg_catalog.pg_namespace target_schema on target_schema.oid = target_table.relnamespace
    where sequence.relkind = 'S'
      and target_schema.nspname = 'public'
      and (
        target_table.relname like 'food\_%' escape '\'
        or target_table.relname like 'restaurant\_%' escape '\'
        or target_table.relname in ('menus', 'menu_categories', 'menu_items')
      )
  ) then
    raise exception using errcode = '55000',
      message = 'Food ACL hardening found an unexpected owned sequence; add an explicit least-privilege decision.';
  end if;
end
$sequence_preflight$;

-- Remove default PUBLIC execution and direct access to implementation helpers.
revoke all on function
  public.food_set_updated_at(),
  public.is_food_member(uuid,text[],uuid),
  public.food_has_capability(uuid,uuid,text),
  public.food_assert_service_role(),
  public.food_tax_class_validity_guard(),
  public.food_order_item_immutable_guard(),
  public.food_order_history_immutable_guard(),
  public.food_order_transition_guard(),
  public.food_order_status_history_capture(),
  public.food_create_order_v1(text,text,jsonb,text,jsonb,jsonb,text),
  public.food_transition_order_status_v1(uuid,text,uuid,text),
  public.food_consume_order_rate_limit_v1(text,text,integer,integer),
  public.food_get_order_confirmation_v1(text,text),
  public.food_assert_demo_service_role(),
  public.food_reset_demo_account_v1(uuid,text,uuid,text)
from public, anon, authenticated, service_role;

-- Authenticated policies and session capability checks need only these two helpers.
grant execute on function public.is_food_member(uuid,text[],uuid) to authenticated;
grant execute on function public.food_has_capability(uuid,uuid,text) to authenticated, service_role;

-- Server-callable contract. Internal assertions and trigger helpers remain owner-only.
grant execute on function public.food_consume_order_rate_limit_v1(text,text,integer,integer) to service_role;
grant execute on function public.food_create_order_v1(text,text,jsonb,text,jsonb,jsonb,text) to service_role;
grant execute on function public.food_get_order_confirmation_v1(text,text) to service_role;
grant execute on function public.food_transition_order_status_v1(uuid,text,uuid,text) to service_role;
grant execute on function public.food_reset_demo_account_v1(uuid,text,uuid,text) to service_role;

-- Do not ALTER DEFAULT PRIVILEGES here. PostgreSQL defaults are owner/schema-wide and cannot
-- target Food table names; changing postgres' public defaults would silently alter unrelated
-- Max Webstudio modules. Repository governance requires every future Food table migration to
-- carry an explicit service_role ACL decision and validates the resulting database poststate.

do $postcheck$
declare
  target_table regclass;
  forbidden_privilege text;
  target_function regprocedure;
begin
  foreach target_table in array array[
    'public.food_orders'::regclass,
    'public.food_order_items'::regclass,
    'public.food_order_status_history'::regclass,
    'public.food_order_idempotency'::regclass
  ] loop
    foreach forbidden_privilege in array array[
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
    ] loop
      if pg_catalog.has_table_privilege('service_role', target_table, forbidden_privilege) then
        raise exception using errcode = '55000',
          message = 'service_role still has forbidden direct ' || forbidden_privilege || ' on ' || target_table::text || '.';
      end if;
    end loop;
  end loop;

  foreach target_function in array array[
    'public.food_consume_order_rate_limit_v1(text,text,integer,integer)'::regprocedure,
    'public.food_create_order_v1(text,text,jsonb,text,jsonb,jsonb,text)'::regprocedure,
    'public.food_get_order_confirmation_v1(text,text)'::regprocedure,
    'public.food_transition_order_status_v1(uuid,text,uuid,text)'::regprocedure,
    'public.food_reset_demo_account_v1(uuid,text,uuid,text)'::regprocedure
  ] loop
    if not pg_catalog.has_function_privilege('service_role', target_function, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', target_function, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', target_function, 'EXECUTE') then
      raise exception using errcode = '55000',
        message = 'Food server RPC execute ACL is not least-privilege: ' || target_function::text;
    end if;
  end loop;
end
$postcheck$;

commit;
