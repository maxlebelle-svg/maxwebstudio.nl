\set ON_ERROR_STOP on

do $test$
declare
  lead_one uuid := '11111111-1111-4111-8111-111111111111';
  lead_two uuid := '22222222-2222-4222-8222-222222222222';
  customer_one uuid := '33333333-3333-4333-8333-333333333333';
  journey_lead uuid;
  journey_customer uuid;
  journey_both uuid;
  journey_manual uuid;
  original_updated_at timestamptz;
  changed_updated_at timestamptz;
begin
  if to_regclass('public.demo_journeys') is null
     or to_regclass('public.demo_journey_events') is null then
    raise exception 'Demo Journey tables are missing';
  end if;

  if not exists (
    select 1 from pg_class
    where oid in ('public.demo_journeys'::regclass, 'public.demo_journey_events'::regclass)
      and relrowsecurity
    group by relrowsecurity
    having count(*) = 2
  ) then
    raise exception 'RLS is not enabled on both Demo Journey tables';
  end if;

  if has_table_privilege('anon', 'public.demo_journeys', 'select')
     or has_table_privilege('authenticated', 'public.demo_journeys', 'select')
     or has_table_privilege('anon', 'public.demo_journey_events', 'select')
     or has_table_privilege('authenticated', 'public.demo_journey_events', 'select') then
    raise exception 'Direct client table privilege is broader than intended';
  end if;

  if not has_table_privilege('service_role', 'public.demo_journeys', 'select')
     or not has_table_privilege('service_role', 'public.demo_journeys', 'insert')
     or not has_table_privilege('service_role', 'public.demo_journeys', 'update')
     or has_table_privilege('service_role', 'public.demo_journeys', 'delete')
     or not has_table_privilege('service_role', 'public.demo_journey_events', 'select')
     or not has_table_privilege('service_role', 'public.demo_journey_events', 'insert')
     or not has_table_privilege('service_role', 'public.demo_journey_events', 'update')
     or not has_table_privilege('service_role', 'public.demo_journey_events', 'delete') then
    raise exception 'service_role grants do not match least-privilege contract';
  end if;

  insert into public.leads (id) values (lead_one), (lead_two);
  insert into public.customers (id) values (customer_one);

  insert into public.demo_journeys (lead_id, business_name, preview_token)
  values (lead_one, 'Lead journey', 'token-lead') returning id, updated_at into journey_lead, original_updated_at;

  insert into public.demo_journeys (customer_id, business_name, preview_token)
  values (customer_one, 'Customer journey', 'token-customer') returning id into journey_customer;

  insert into public.demo_journeys (lead_id, customer_id, business_name, preview_token)
  values (lead_two, customer_one, 'Conversion journey', 'token-both') returning id into journey_both;

  insert into public.demo_journeys (business_name, preview_token)
  values ('Controlled manual journey', 'token-manual') returning id into journey_manual;

  begin
    insert into public.demo_journeys (business_name) values ('   ');
    raise exception 'Identity constraint accepted an empty unlinked journey';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.demo_journeys (lead_id, business_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Invalid lead');
    raise exception 'Lead foreign key accepted a missing lead';
  exception when foreign_key_violation then
    null;
  end;

  begin
    insert into public.demo_journeys (business_name, preview_token)
    values ('Duplicate token', 'token-lead');
    raise exception 'Preview token unique index accepted a duplicate';
  exception when unique_violation then
    null;
  end;

  perform pg_sleep(0.01);
  update public.demo_journeys set business_name = 'Lead journey updated' where id = journey_lead;
  select updated_at into changed_updated_at from public.demo_journeys where id = journey_lead;
  if changed_updated_at <= original_updated_at then
    raise exception 'updated_at trigger did not advance the timestamp';
  end if;

  insert into public.demo_journey_events (demo_journey_id, event_type, title)
  values (journey_customer, 'created', 'Created');
  delete from public.demo_journeys where id = journey_customer;
  if exists (select 1 from public.demo_journey_events where demo_journey_id = journey_customer) then
    raise exception 'Journey event did not cascade on journey deletion';
  end if;

  delete from public.leads where id = lead_one;
  if not exists (
    select 1 from public.demo_journeys
    where id = journey_lead and lead_id is null and business_name = 'Lead journey updated'
  ) then
    raise exception 'Lead deletion did not detach the journey with ON DELETE SET NULL';
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_journeys' and policyname = 'demo_journeys_no_direct_client_access')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'demo_journey_events' and policyname = 'demo_journey_events_no_direct_client_access') then
    raise exception 'Expected deny policies are missing';
  end if;
end;
$test$;
