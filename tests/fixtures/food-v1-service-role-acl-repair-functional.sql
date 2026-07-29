\set ON_ERROR_STOP on

do $acl_metadata$
declare
  target_table regclass;
  forbidden_privilege text;
  allowed_rpc regprocedure;
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
        raise exception 'service_role retained forbidden % on %', forbidden_privilege, target_table;
      end if;
    end loop;
  end loop;

  foreach allowed_rpc in array array[
    'public.food_consume_order_rate_limit_v1(text,text,integer,integer)'::regprocedure,
    'public.food_create_order_v1(text,text,jsonb,text,jsonb,jsonb,text)'::regprocedure,
    'public.food_get_order_confirmation_v1(text,text)'::regprocedure,
    'public.food_transition_order_status_v1(uuid,text,uuid,text)'::regprocedure,
    'public.food_reset_demo_account_v1(uuid,text,uuid,text)'::regprocedure
  ] loop
    if not pg_catalog.has_function_privilege('service_role', allowed_rpc, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', allowed_rpc, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', allowed_rpc, 'EXECUTE') then
      raise exception 'unexpected execute ACL on %', allowed_rpc;
    end if;
  end loop;

  if not pg_catalog.has_table_privilege('service_role', 'public.food_accounts', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.restaurant_locations', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.restaurant_tax_classes', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.menus', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.menu_categories', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.menu_items', 'SELECT') then
    raise exception 'required service read-model SELECT privilege is missing';
  end if;

  if pg_catalog.has_function_privilege('service_role', 'public.food_assert_service_role()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.food_assert_demo_service_role()', 'EXECUTE')
     or pg_catalog.has_function_privilege('service_role', 'public.food_order_history_immutable_guard()', 'EXECUTE') then
    raise exception 'service_role retained direct execution of an internal Food helper';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class sequence
    join pg_catalog.pg_depend dependency
      on dependency.objid = sequence.oid and dependency.deptype in ('a', 'i')
    join pg_catalog.pg_class target_table on target_table.oid = dependency.refobjid
    join pg_catalog.pg_namespace target_schema on target_schema.oid = target_table.relnamespace
    where sequence.relkind = 'S'
      and target_schema.nspname = 'public'
      and target_table.relname like 'food\_%' escape '\'
  ) then
    raise exception 'unexpected Food-owned sequence requires an ACL decision';
  end if;
end
$acl_metadata$;

set role service_role;
select pg_catalog.set_config('request.jwt.claim.role', 'service_role', false);

do $direct_mutation_denials$
begin
  begin
    insert into public.food_orders default values;
    raise exception 'service_role unexpectedly inserted food_orders';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.food_orders set status = status;
    raise exception 'service_role unexpectedly updated food_orders';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.food_orders;
    raise exception 'service_role unexpectedly deleted food_orders';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate table public.food_orders;
    raise exception 'service_role unexpectedly truncated food_orders';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.food_order_items default values;
    raise exception 'service_role unexpectedly inserted food_order_items';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.food_order_items set quantity = quantity;
    raise exception 'service_role unexpectedly updated food_order_items';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.food_order_status_history;
    raise exception 'service_role unexpectedly deleted food_order_status_history';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.food_order_status_history set reason = reason;
    raise exception 'service_role unexpectedly updated food_order_status_history';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.food_order_idempotency default values;
    raise exception 'service_role unexpectedly inserted food_order_idempotency';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.food_order_idempotency set response_code = response_code;
    raise exception 'service_role unexpectedly updated food_order_idempotency';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.food_order_idempotency;
    raise exception 'service_role unexpectedly deleted food_order_idempotency';
  exception when insufficient_privilege then null;
  end;
end
$direct_mutation_denials$;

reset role;

select 'PASS_FOOD_V1_SERVICE_ROLE_ACL_REPAIR_FUNCTIONAL' as status;
