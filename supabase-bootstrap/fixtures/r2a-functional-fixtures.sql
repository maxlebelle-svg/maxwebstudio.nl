\set ON_ERROR_STOP on

begin;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004'),
  ('00000000-0000-0000-0000-000000000005');

insert into public.profiles(id, auth_user_id, name, role, status, is_demo, environment) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Admin','admin','active',false,'test'),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Customer','customer','active',false,'test'),
  ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','Outsider','customer','active',false,'test'),
  ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','Demo','demo_user','active',true,'demo'),
  ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','Support','support','active',false,'test');

insert into public.customers(id, profile_id, auth_user_id, name, status, is_demo, environment) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Owned','active',false,'test'),
  ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','Other','active',false,'test'),
  ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','Demo','active',true,'demo');

select pg_catalog.set_config('request.jwt.claim.sub', '', true);
do $$
begin
  if public.current_profile_id() is not null then raise exception 'missing auth current_profile_id changed'; end if;
  if public.current_app_role() is not null then raise exception 'missing auth current_app_role changed'; end if;
  if public.has_app_role(array['admin']) then raise exception 'missing auth role check changed'; end if;
  if public.is_admin_role() then raise exception 'missing auth admin check changed'; end if;
  if public.is_staff_role() then raise exception 'missing auth staff check changed'; end if;
  if public.is_demo_context() then raise exception 'missing auth demo context changed'; end if;
  if public.owns_customer(null) then raise exception 'NULL customer ownership changed'; end if;
  if public.has_app_role(null) is not null then raise exception 'NULL role array behavior changed'; end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
begin
  if public.current_profile_id() <> '10000000-0000-0000-0000-000000000001'::uuid then raise exception 'admin profile lookup failed'; end if;
  if public.current_app_role() <> 'admin' then raise exception 'admin role lookup failed'; end if;
  if not public.has_app_role(array['admin','support']) then raise exception 'positive role check failed'; end if;
  if public.has_app_role(array['customer','demo_user']) then raise exception 'negative role check failed'; end if;
  if not public.is_admin_role() then raise exception 'admin check failed'; end if;
  if not public.is_staff_role() then raise exception 'admin staff check failed'; end if;
  if public.is_demo_context() then raise exception 'admin demo context failed'; end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
do $$
begin
  if public.is_admin_role() then raise exception 'support classified as admin'; end if;
  if not public.is_staff_role() then raise exception 'support not classified as staff'; end if;
end $$;

select pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
do $$
begin
  if public.is_admin_role() or public.is_staff_role() then raise exception 'customer role escalation'; end if;
  if not public.owns_customer('20000000-0000-0000-0000-000000000001'::uuid) then raise exception 'owner rejected'; end if;
  if public.owns_customer('20000000-0000-0000-0000-000000000002'::uuid) then raise exception 'non-owner accepted'; end if;
end $$;

set local role authenticated;
do $$
declare visible_count integer;
begin
  select count(*) into visible_count from public.customers;
  if visible_count <> 1 then raise exception 'owner policy evaluation changed: %', visible_count; end if;
end $$;
reset role;

select pg_catalog.set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
do $$
begin
  if not public.is_demo_context() then raise exception 'demo context rejected'; end if;
  if not public.is_demo_record(true, 'production') then raise exception 'demo boolean record rejected'; end if;
  if not public.is_demo_record(false, 'demo') then raise exception 'demo environment record rejected'; end if;
  if public.is_demo_record(false, 'production') then raise exception 'normal record accepted in demo context'; end if;
  if public.is_demo_record(null, null) then raise exception 'NULL demo record behavior changed'; end if;
end $$;

rollback;

select pg_catalog.json_build_object(
  'fixture_auth_users_remaining', (select count(*) from auth.users where id::text like '00000000-0000-0000-0000-00000000000%'),
  'fixture_profiles_remaining', (select count(*) from public.profiles where id::text like '10000000-0000-0000-0000-00000000000%'),
  'fixture_customers_remaining', (select count(*) from public.customers where id::text like '20000000-0000-0000-0000-00000000000%'),
  'transactional_rollback', true,
  'functional_assertions', 'passed'
)::text;
