begin;

insert into auth.users(id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
insert into public.profiles(id, auth_user_id, name, role, status) values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Klant A','customer','active'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Klant B','customer','active');
insert into public.customers(id, profile_id, auth_user_id, name) values
  ('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Klant A'),
  ('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Klant B');
insert into public.websites(id, customer_id, name, status) values
  ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Website A','development');
insert into public.projects(id, customer_id, website_id, name, status) values
  ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','Project A','design');
insert into public.demo_journeys(id, customer_id, business_name) values
  ('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Klant A');
insert into public.website_build_jobs(
  id,demo_journey_id,customer_id,status,package_type,generator_version,
  request_fingerprint,idempotency_key,generated_package,package_checksum,created_by,updated_by
) values (
  '70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001','succeeded','factory','cp-a-test',
  repeat('1',64),'cp-a-build-000001','{"files":[{"path":"index.html","content":"<h1>Test</h1>"}]}'::jsonb,
  repeat('a',64),'cp-a-test','cp-a-test'
);
insert into public.website_preview_versions(
  id,demo_journey_id,build_job_id,version,preview_url,preview_token,generated_package,
  package_checksum,is_active,created_by,customer_id,project_id,website_id,published_to_portal,
  published_at,allow_approval,status
) values (
  '80000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',1,'https://preview.invalid/v1','cp-a-preview-token',
  '{"files":[{"path":"index.html","content":"<h1>Test</h1>"}]}'::jsonb,repeat('a',64),true,'cp-a-test',
  '30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',true,clock_timestamp(),true,'ready_for_review'
);

do $test$
declare
  first_result jsonb;
  second_result jsonb;
begin
  first_result := public.record_website_preview_approval(
    '80000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',repeat('a',64),'preview-approval-functional-0001',
    'website_preview_approval_nl_v1','Ik keur deze specifieke ontwerpversie goed.'
  );
  second_result := public.record_website_preview_approval(
    '80000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',repeat('a',64),'preview-approval-functional-0001',
    'website_preview_approval_nl_v1','Ik keur deze specifieke ontwerpversie goed.'
  );
  if first_result->>'duplicate' <> 'false' or second_result->>'duplicate' <> 'true' then
    raise exception 'preview approval idempotency failed';
  end if;
  if (select count(*) from public.website_preview_approvals) <> 1
     or (select count(*) from public.customer_portal_trust_events where event_type='website_preview_approved') <> 1 then
    raise exception 'preview approval or audit event duplicated';
  end if;
  begin
    perform public.record_website_preview_approval(
      '80000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000002',repeat('a',64),'preview-approval-cross-tenant-1',
      'website_preview_approval_nl_v1','Cross tenant'
    );
    raise exception 'cross-customer preview approval was accepted';
  exception when insufficient_privilege or check_violation then null;
  end;
end;
$test$;

insert into public.quotes(
  id,customer_id,project_id,quote_number,title,status,quote_date,valid_until,subtotal,vat,total,proposal
) values (
  '90000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','OFF-CP-A-001','Website','sent',current_date,current_date+30,
  1000,210,1210,'Website volgens afspraak'
);
insert into public.quote_lines(id,quote_id,description,quantity,unit_price,vat_rate,line_total,position)
values ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','Websitebouw',1,1000,21,1000,1);

do $test$
declare
  current_version integer;
  current_checksum text;
  first_result jsonb;
  second_result jsonb;
begin
  select quote_version, public.cp_a_quote_checksum(id)
  into current_version, current_checksum
  from public.quotes where id='90000000-0000-4000-8000-000000000001';
  first_result := public.record_quote_acceptance(
    '90000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',current_version,current_checksum,
    'quote-acceptance-functional-0001','quote_acceptance_nl_v1','Ik accepteer deze specifieke offerteversie.'
  );
  second_result := public.record_quote_acceptance(
    '90000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',current_version,current_checksum,
    'quote-acceptance-functional-0001','quote_acceptance_nl_v1','Ik accepteer deze specifieke offerteversie.'
  );
  if first_result->>'duplicate' <> 'false' or second_result->>'duplicate' <> 'true' then
    raise exception 'quote acceptance idempotency failed';
  end if;
  if (select count(*) from public.quote_acceptances) <> 1
     or (select count(*) from public.customer_portal_trust_events where event_type='quote_accepted') <> 1 then
    raise exception 'quote acceptance or audit event duplicated';
  end if;
  if (select status from public.quotes where id='90000000-0000-4000-8000-000000000001') <> 'accepted' then
    raise exception 'quote status did not become accepted';
  end if;
  begin
    update public.quotes set total=1 where id='90000000-0000-4000-8000-000000000001';
    raise exception 'accepted quote mutation was accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    update public.quotes set status='sent' where id='90000000-0000-4000-8000-000000000001';
    raise exception 'accepted quote status reset was accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    update public.quote_lines set quantity=2 where id='91000000-0000-4000-8000-000000000001';
    raise exception 'accepted quote line mutation was accepted';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$test$;

do $test$
begin
  if has_table_privilege('authenticated','public.website_preview_approvals','insert')
     or has_table_privilege('authenticated','public.quote_acceptances','insert')
     or has_function_privilege('authenticated','public.record_website_preview_approval(uuid,uuid,uuid,text,text,text,text)','execute')
     or has_function_privilege('authenticated','public.record_quote_acceptance(uuid,uuid,uuid,integer,text,text,text,text)','execute') then
    raise exception 'direct customer mutation privilege exists';
  end if;
end;
$test$;

rollback;
