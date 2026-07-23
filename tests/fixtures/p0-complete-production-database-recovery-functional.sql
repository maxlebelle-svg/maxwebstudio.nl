\set ON_ERROR_STOP on
set role service_role;
select set_config('request.jwt.claim.role','service_role',false);

do $$
declare
  key text := 'lead-intake:v1:42000000-0000-4000-8000-000000000001';
  first_result jsonb;
  replay_result jsonb;
  reconciled jsonb;
  abuse_first jsonb;
  abuse_replay jsonb;
  compatibility_id uuid;
begin
  first_result := public.mws_create_lead_transactional_v1(
    jsonb_build_object(
      'company','P0 Recovery Synthetic BV',
      'name','Synthetic Contact',
      'email','p0-recovery@example.invalid',
      'phone','+31 6 00000000',
      'website_url','https://p0-recovery.example.invalid',
      'source','p0_local_recovery_validation',
      'external_source','homepage-contact-form',
      'environment','test',
      'metadata',jsonb_build_object('synthetic',true)
    ), key, null, 'service', 'local-validation'
  );
  replay_result := public.mws_create_lead_transactional_v1(
    jsonb_build_object(
      'company','P0 Recovery Synthetic BV',
      'name','Synthetic Contact',
      'email','p0-recovery@example.invalid',
      'phone','+31 6 00000000',
      'website_url','https://p0-recovery.example.invalid',
      'source','p0_local_recovery_validation',
      'external_source','homepage-contact-form',
      'environment','test',
      'metadata',jsonb_build_object('synthetic',true)
    ), key, null, 'service', 'local-validation'
  );
  reconciled := public.mws_get_lead_intake_result_v1(key);
  if first_result->>'created' <> 'true' or first_result->>'idempotentReplay' <> 'false' then
    raise exception 'first transactional create failed: %', first_result;
  end if;
  if replay_result->>'created' <> 'false' or replay_result->>'idempotentReplay' <> 'true' then
    raise exception 'idempotent replay failed: %', replay_result;
  end if;
  if reconciled->>'status' <> 'resolved' or reconciled->>'idempotentReplay' <> 'true' then
    raise exception 'reconciliation lookup failed: %', reconciled;
  end if;
  abuse_first := public.mws_check_lead_intake_abuse_v1(
    'public_lead_intake_v1',repeat('a',64),repeat('b',64),null,null
  );
  abuse_replay := public.mws_check_lead_intake_abuse_v1(
    'public_lead_intake_v1',repeat('a',64),repeat('b',64),null,null
  );
  if abuse_first->>'decision' <> 'unique_allowed' or abuse_replay->>'decision' <> 'replay_allowed'
  then raise exception 'abuse-control replay semantics failed'; end if;

  select id into compatibility_id from public.leads
  where email='p0-recovery@example.invalid';
  if not exists (
    select 1 from public.leads where id=compatibility_id
      and company=company_name and name=contact_name and website_url=website
      and source='p0_local_recovery_validation' and external_source='homepage-contact-form'
  ) then raise exception 'V2 transactional write did not synchronize V1 aliases'; end if;
end $$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub','42000000-0000-4000-8000-000000000099',false);

do $$
declare
  target_id uuid;
  deleted_id uuid;
  insert_blocked boolean := false;
begin
  select id into target_id from public.leads where email='p0-recovery@example.invalid';
  if target_id is null then raise exception 'sales manager SELECT policy failed'; end if;
  update public.leads set next_action_note='sales-manager-policy-validation' where id=target_id;
  if not exists (select 1 from public.leads where id=target_id and next_action_note='sales-manager-policy-validation')
  then raise exception 'sales manager UPDATE policy failed'; end if;

  begin
    insert into public.leads(company_name,contact_name,email,status,lead_status,environment,metadata)
    values ('Forbidden Manager Insert','Synthetic','manager-insert@example.invalid','nieuw','new','test','{"synthetic":true}');
  exception when insufficient_privilege then
    insert_blocked := true;
  end;
  if not insert_blocked then raise exception 'sales manager INSERT was not blocked'; end if;

  delete from public.leads where id=target_id returning id into deleted_id;
  if deleted_id is not null or not exists (select 1 from public.leads where id=target_id)
  then raise exception 'sales manager DELETE was not blocked'; end if;
end $$;

reset role;

do $$
declare
  legacy_id uuid;
  v2_id uuid;
begin
  insert into public.leads(company_name,contact_name,email,website,external_source,status,lead_status,environment,metadata)
  values ('Legacy Writer BV','Legacy Writer','legacy-writer@example.invalid','https://legacy-writer.example.invalid','legacy-writer','nieuw','new','test','{"synthetic":true}')
  returning id into legacy_id;
  if not exists (select 1 from public.leads where id=legacy_id and company='Legacy Writer BV' and name='Legacy Writer' and website_url='https://legacy-writer.example.invalid' and source is null and external_source='legacy-writer')
  then raise exception 'V1 writer compatibility synchronization failed'; end if;
  update public.leads set company='V2 Updated Legacy Writer BV' where id=legacy_id;
  if not exists (select 1 from public.leads where id=legacy_id and company_name='V2 Updated Legacy Writer BV')
  then raise exception 'V2-to-V1 update synchronization failed'; end if;
  update public.leads set contact_name='V1 Updated Legacy Writer' where id=legacy_id;
  if not exists (select 1 from public.leads where id=legacy_id and name='V1 Updated Legacy Writer')
  then raise exception 'V1-to-V2 update synchronization failed'; end if;

  insert into public.leads(company,name,email,website_url,source,status,lead_status,environment,metadata)
  values ('V2 Writer BV','V2 Writer','v2-writer@example.invalid','https://v2-writer.example.invalid','v2-writer','new','new','test','{"synthetic":true}')
  returning id into v2_id;
  if not exists (select 1 from public.leads where id=v2_id and company_name='V2 Writer BV' and contact_name='V2 Writer' and website='https://v2-writer.example.invalid' and external_source is null and source='v2-writer')
  then raise exception 'V2 writer compatibility synchronization failed'; end if;

  begin
    insert into public.leads(company,company_name,email,status,lead_status,environment,metadata)
    values ('Conflict V2','Conflict V1','conflict@example.invalid','new','new','test','{"synthetic":true}');
    raise exception 'conflicting aliases were accepted';
  exception when check_violation then
    if sqlerrm not like 'lead compatibility conflict:%' then raise; end if;
  end;

  delete from public.leads where id in (legacy_id,v2_id);

  if (select count(*) from public.leads) <> 28
    or (select count(*) from public.business_events where event_type='lead.created') <> 1
    or (select count(*) from public.lead_intake_idempotency) <> 1
    or (select count(*) from public.lead_intake_abuse_requests) <> 1
  then raise exception 'transactional lead/event/ledger/abuse cardinality failed'; end if;
  if exists (
    select 1 from public.leads
    where company is distinct from company_name or name is distinct from contact_name
      or website_url is distinct from website
  ) then raise exception 'compatibility aliases drifted'; end if;
  if (select max(char_length(notes)) from public.leads) <> 6223 then
    raise exception 'legacy notes were truncated';
  end if;
  if exists (select 1 from pg_catalog.pg_policy where polrelid='public.leads'::regclass and polname like 'leads_sales_manager_%' and polcmd in ('*','a','d'))
  then raise exception 'sales manager retains ALL, INSERT or DELETE policy'; end if;
end $$;
