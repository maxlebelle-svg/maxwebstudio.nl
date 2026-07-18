begin;

select set_config('request.jwt.claim.role', 'service_role', true);

do $$
declare
  canonical_a jsonb := jsonb_build_object(
    'platform', 'facebook',
    'media', jsonb_build_array('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'),
    'hashtags', jsonb_build_array('#E' || U&'\0301en'),
    'caption', 'Hallo' || E'\r\n' || 'wereld'
  );
  canonical_b jsonb := jsonb_build_object(
    'caption', 'Hallo' || E'\n' || 'wereld',
    'hashtags', jsonb_build_array(U&'#\00C9en'),
    'media', jsonb_build_array('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    'platform', 'facebook'
  );
  expected_canonical text := '{"caption":"Hallo\nwereld","hashtags":["#Éen"],"media":["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],"platform":"facebook"}';
begin
  if public.canonical_social_content_v1(canonical_a) is distinct from expected_canonical then
    raise exception 'Canonical social content bytes differ from the documented v1 format.';
  end if;
  if public.social_content_hash_v1(canonical_a) is distinct from public.social_content_hash_v1(canonical_b) then
    raise exception 'Equivalent Unicode/newline/media UUID input must hash identically.';
  end if;
  if public.social_content_hash_v1(canonical_b) = public.social_content_hash_v1(
    jsonb_set(canonical_b, '{hashtags}', '["#anders"]'::jsonb)
  ) then
    raise exception 'Different canonical content must not produce the same test hash.';
  end if;
  if public.social_content_hash_v1(
    jsonb_set(canonical_b, '{media}', '["10000000-0000-4000-8000-000000000001","10000000-0000-4000-8000-000000000002"]'::jsonb)
  ) = public.social_content_hash_v1(
    jsonb_set(canonical_b, '{media}', '["10000000-0000-4000-8000-000000000002","10000000-0000-4000-8000-000000000001"]'::jsonb)
  ) then
    raise exception 'Media order must be part of the canonical content hash.';
  end if;
  begin
    perform public.social_content_hash_v1(canonical_b - 'media');
    raise exception 'Missing canonical keys must be rejected.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

do $$
declare
  contract_count integer;
begin
  select count(*) into contract_count
  from public.business_event_contracts
  where event_type in (
    'social.content_created',
    'social.content_revision_created',
    'social.content_approved',
    'social.publication_requested',
    'social.publication_succeeded',
    'social.publication_failed'
  ) and event_version = 1 and lifecycle_status = 'active';

  if contract_count <> 6 then
    raise exception 'Expected six active Social Studio event contracts, found %.', contract_count;
  end if;
  if exists (
    select 1 from public.business_event_contracts
    where event_type like 'social.%.v1'
  ) then
    raise exception 'Event version must not be embedded in event_type.';
  end if;
end;
$$;

do $$
declare
  correlation_uuid uuid := '10000000-0000-4000-8000-000000000001';
  master_uuid uuid := '10000000-0000-4000-8000-000000000002';
  revision_uuid uuid := '10000000-0000-4000-8000-000000000003';
  variant_uuid uuid := '10000000-0000-4000-8000-000000000004';
  approval_uuid uuid := '10000000-0000-4000-8000-000000000005';
  job_uuid uuid := '10000000-0000-4000-8000-000000000006';
  job_two_uuid uuid := '10000000-0000-4000-8000-000000000007';
  attempt_uuid uuid := '10000000-0000-4000-8000-000000000008';
  account_uuid uuid := '10000000-0000-4000-8000-000000000009';
  content_hash text;
  content_event public.business_events%rowtype;
  revision_event public.business_events%rowtype;
  approval_event public.business_events%rowtype;
  request_event public.business_events%rowtype;
  request_two_event public.business_events%rowtype;
  success_event public.business_events%rowtype;
  base_time timestamptz := date_trunc('milliseconds', clock_timestamp());
  scheduled_text text;
  published_text text;
begin
  content_hash := public.social_content_hash_v1(
    '{"caption":"Nieuwe openingstijden","hashtags":["#openingstijden"],"media":[],"platform":"facebook"}'::jsonb
  );
  scheduled_text := to_char((base_time + interval '1 minute') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  published_text := to_char((base_time + interval '2 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  content_event := public.record_business_event(
    'internal',null,'social.content_created',1::smallint,base_time,'system','social-smoke',
    'social_studio','content_created:v1',correlation_uuid,null,
    'social.content_created:v1:' || master_uuid::text,
    'social_master_content',master_uuid,null,
    jsonb_build_object('masterContentId',master_uuid,'origin','ai')
  );

  revision_event := public.record_business_event(
    'internal',null,'social.content_revision_created',1::smallint,base_time + interval '10 milliseconds','system','social-smoke',
    'social_studio','content_revision_created:v1',correlation_uuid,content_event.id,
    'social.content_revision_created:v1:' || revision_uuid::text,
    'social_content_revision',revision_uuid,null,
    jsonb_build_object(
      'revisionId',revision_uuid,'masterContentId',master_uuid,'variantId',variant_uuid,
      'revisionNumber',1,'platform','facebook','contentHash',content_hash,'supersedesRevisionId',null
    )
  );

  approval_event := public.record_business_event(
    'internal',null,'social.content_approved',1::smallint,base_time + interval '20 milliseconds','employee','reviewer-1',
    'social_studio','content_approved:v1',correlation_uuid,revision_event.id,
    'social.content_approved:v1:' || approval_uuid::text,
    'social_approval',approval_uuid,null,
    jsonb_build_object(
      'approvalId',approval_uuid,'revisionId',revision_uuid,'variantId',variant_uuid,
      'revisionNumber',1,'contentHash',content_hash,'platform','facebook','approvalChannel','internal_admin'
    )
  );

  request_event := public.record_business_event(
    'internal',null,'social.publication_requested',1::smallint,base_time + interval '30 milliseconds','system','delivery-intake',
    'social_studio','publication_requested:v1',correlation_uuid,approval_event.id,
    'social.publication_requested:v1:' || job_uuid::text,
    'delivery_job',job_uuid,null,
    jsonb_build_object(
      'deliveryJobId',job_uuid,'approvalId',approval_uuid,'revisionId',revision_uuid,'variantId',variant_uuid,
      'revisionNumber',1,'contentHash',content_hash,'socialAccountId',account_uuid,
      'platform','facebook','scheduledFor',scheduled_text
    )
  );

  success_event := public.record_business_event(
    'internal',null,'social.publication_succeeded',1::smallint,base_time + interval '2 minutes','system','provider-adapter',
    'social_studio','publication_succeeded:v1',correlation_uuid,request_event.id,
    'social.publication_terminal:v1:' || job_uuid::text,
    'delivery_job',job_uuid,null,
    jsonb_build_object(
      'deliveryJobId',job_uuid,'deliveryAttemptId',attempt_uuid,'revisionId',revision_uuid,
      'revisionNumber',1,'contentHash',content_hash,'socialAccountId',account_uuid,
      'platform','facebook','providerPublicationId','provider-post-1','publishedAt',published_text
    )
  );

  if success_event.id is null then
    raise exception 'Happy-path publication result was not recorded.';
  end if;

  begin
    perform public.record_business_event(
      'internal',null,'social.publication_failed',1::smallint,base_time + interval '2 minutes','system','provider-adapter',
      'social_studio','publication_failed:v1',correlation_uuid,request_event.id,
      'social.publication_terminal:v1:' || job_uuid::text,
      'delivery_job',job_uuid,null,
      jsonb_build_object(
        'deliveryJobId',job_uuid,'deliveryAttemptId','10000000-0000-4000-8000-000000000010'::uuid,
        'revisionId',revision_uuid,'revisionNumber',1,'contentHash',content_hash,'socialAccountId',account_uuid,
        'platform','facebook','errorCategory','provider_rejected','attemptCount',1,'failedAt',published_text
      )
    );
    raise exception 'One delivery job must not accept two terminal outcomes.';
  exception when unique_violation then null;
  end;

  begin
    perform public.record_business_event(
      'internal',null,'social.content_created',1::smallint,base_time,'system','social-smoke',
      'social_studio','content_created:v1',correlation_uuid,null,
      'social.content_created:v1:10000000-0000-4000-8000-000000000011',
      'social_master_content','10000000-0000-4000-8000-000000000012',null,
      '{"masterContentId":"10000000-0000-4000-8000-000000000011","origin":"ai"}'::jsonb
    );
    raise exception 'Mismatched subject_uuid must be rejected.';
  exception when check_violation then null;
  end;

  begin
    perform public.record_business_event(
      'internal',null,'social.content_created',1::smallint,base_time,'system','social-smoke',
      'social_studio','content_created:v1',correlation_uuid,null,
      'social.content_created:v1:10000000-0000-4000-8000-000000000013',
      'social_master_content','10000000-0000-4000-8000-000000000013',null,
      '{"masterContentId":"10000000-0000-4000-8000-000000000013","origin":"website_signal"}'::jsonb
    );
    raise exception 'website_signal without causation must be rejected.';
  exception when check_violation then null;
  end;

  begin
    perform public.record_business_event(
      'internal',null,'social.content_approved',1::smallint,base_time + interval '21 milliseconds','employee','reviewer-1',
      'social_studio','content_approved:v1',correlation_uuid,revision_event.id,
      'social.content_approved:v1:10000000-0000-4000-8000-000000000014',
      'social_approval','10000000-0000-4000-8000-000000000014',null,
      jsonb_build_object(
        'approvalId','10000000-0000-4000-8000-000000000014'::uuid,'revisionId',revision_uuid,
        'variantId',variant_uuid,'revisionNumber',1,'contentHash',content_hash,
        'platform','facebook','approvalChannel','client_portal'
      )
    );
    raise exception 'client_portal approval must be customer-only.';
  exception when check_violation then null;
  end;

  begin
    perform public.record_business_event(
      'internal',null,'social.content_approved',1::smallint,base_time + interval '22 milliseconds','employee','reviewer-1',
      'social_studio','content_approved:v1',correlation_uuid,revision_event.id,
      'social.content_approved:v1:10000000-0000-4000-8000-000000000015',
      'social_approval','10000000-0000-4000-8000-000000000015',null,
      jsonb_build_object(
        'approvalId','10000000-0000-4000-8000-000000000015'::uuid,'revisionId',revision_uuid,
        'variantId',variant_uuid,'revisionNumber',1,'contentHash',content_hash,
        'platform','instagram','approvalChannel','internal_admin'
      )
    );
    raise exception 'Approval platform mismatch must be rejected.';
  exception when check_violation then null;
  end;

  begin
    perform public.record_business_event(
      'internal',null,'social.publication_requested',1::smallint,base_time + interval '31 milliseconds','system','delivery-intake',
      'social_studio','publication_requested:v1',correlation_uuid,approval_event.id,
      'social.publication_requested:v1:10000000-0000-4000-8000-000000000016',
      'delivery_job','10000000-0000-4000-8000-000000000016',null,
      jsonb_build_object(
        'deliveryJobId','10000000-0000-4000-8000-000000000016'::uuid,'approvalId',approval_uuid,
        'revisionId',revision_uuid,'variantId',variant_uuid,'revisionNumber',1,'contentHash',content_hash,
        'socialAccountId',account_uuid,'platform','facebook','scheduledFor','2026-07-18T20:00:00Z'
      )
    );
    raise exception 'Non-canonical UTC timestamp must be rejected.';
  exception when invalid_parameter_value then null;
  end;

  request_two_event := public.record_business_event(
    'internal',null,'social.publication_requested',1::smallint,base_time + interval '40 milliseconds','system','delivery-intake',
    'social_studio','publication_requested:v1',correlation_uuid,approval_event.id,
    'social.publication_requested:v1:' || job_two_uuid::text,
    'delivery_job',job_two_uuid,null,
    jsonb_build_object(
      'deliveryJobId',job_two_uuid,'approvalId',approval_uuid,'revisionId',revision_uuid,'variantId',variant_uuid,
      'revisionNumber',1,'contentHash',content_hash,'socialAccountId',account_uuid,
      'platform','facebook','scheduledFor',scheduled_text
    )
  );

  begin
    perform public.record_business_event(
      'internal',null,'social.publication_failed',1::smallint,base_time,'system','provider-adapter',
      'social_studio','publication_failed:v1',correlation_uuid,request_two_event.id,
      'social.publication_terminal:v1:' || job_two_uuid::text,
      'delivery_job',job_two_uuid,null,
      jsonb_build_object(
        'deliveryJobId',job_two_uuid,'deliveryAttemptId','10000000-0000-4000-8000-000000000017'::uuid,
        'revisionId',revision_uuid,'revisionNumber',1,'contentHash',content_hash,'socialAccountId',account_uuid,
        'platform','facebook','errorCategory','provider_rejected','attemptCount',1,
        'failedAt',to_char(base_time at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
    );
    raise exception 'Result before publication request must be rejected.';
  exception when check_violation then null;
  end;

  begin
    perform public.validate_social_content_created_v1(
      '{"masterContentId":"10000000-0000-4000-8000-000000000018","origin":"ai","caption":"forbidden"}'::jsonb
    );
    raise exception 'Extra payload keys must be rejected.';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform public.validate_social_content_revision_created_v1(
      jsonb_build_object(
        'revisionId',revision_uuid,'masterContentId',master_uuid,'variantId',variant_uuid,
        'revisionNumber',1,'platform','facebook','contentHash','not-a-hash','supersedesRevisionId',null
      )
    );
    raise exception 'Invalid contentHash must be rejected.';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

insert into public.customers(id,name) values
  ('20000000-0000-4000-8000-000000000001','Contract smoke customer A'),
  ('20000000-0000-4000-8000-000000000002','Contract smoke customer B');

do $$
declare
  customer_event public.business_events%rowtype;
  customer_revision_event public.business_events%rowtype;
  customer_approval_event public.business_events%rowtype;
  content_hash text := repeat('a',64);
begin
  customer_event := public.record_business_event(
    'customer','20000000-0000-4000-8000-000000000001','social.content_created',1::smallint,
    date_trunc('milliseconds',clock_timestamp()),'system','scope-smoke','social_studio','content_created:v1',
    '20000000-0000-4000-8000-000000000003',null,
    'social.content_created:v1:20000000-0000-4000-8000-000000000004',
    'social_master_content','20000000-0000-4000-8000-000000000004',null,
    '{"masterContentId":"20000000-0000-4000-8000-000000000004","origin":"ai"}'::jsonb
  );
  begin
    perform public.record_business_event(
      'customer','20000000-0000-4000-8000-000000000002','social.content_revision_created',1::smallint,
      date_trunc('milliseconds',clock_timestamp()),'system','scope-smoke','social_studio','content_revision_created:v1',
      '20000000-0000-4000-8000-000000000003',customer_event.id,
      'social.content_revision_created:v1:20000000-0000-4000-8000-000000000005',
      'social_content_revision','20000000-0000-4000-8000-000000000005',null,
      jsonb_build_object(
        'revisionId','20000000-0000-4000-8000-000000000005'::uuid,
        'masterContentId','20000000-0000-4000-8000-000000000004'::uuid,
        'variantId','20000000-0000-4000-8000-000000000006'::uuid,
        'revisionNumber',1,'platform','facebook','contentHash',content_hash,'supersedesRevisionId',null
      )
    );
    raise exception 'Cross-customer causation must be rejected.';
  exception when check_violation then null;
  end;

  customer_revision_event := public.record_business_event(
    'customer','20000000-0000-4000-8000-000000000001','social.content_revision_created',1::smallint,
    date_trunc('milliseconds',clock_timestamp()),'system','scope-smoke','social_studio','content_revision_created:v1',
    '20000000-0000-4000-8000-000000000003',customer_event.id,
    'social.content_revision_created:v1:20000000-0000-4000-8000-000000000007',
    'social_content_revision','20000000-0000-4000-8000-000000000007',null,
    jsonb_build_object(
      'revisionId','20000000-0000-4000-8000-000000000007'::uuid,
      'masterContentId','20000000-0000-4000-8000-000000000004'::uuid,
      'variantId','20000000-0000-4000-8000-000000000008'::uuid,
      'revisionNumber',1,'platform','facebook','contentHash',content_hash,'supersedesRevisionId',null
    )
  );
  customer_approval_event := public.record_business_event(
    'customer','20000000-0000-4000-8000-000000000001','social.content_approved',1::smallint,
    date_trunc('milliseconds',clock_timestamp()),'customer','portal-reviewer','social_studio','content_approved:v1',
    '20000000-0000-4000-8000-000000000003',customer_revision_event.id,
    'social.content_approved:v1:20000000-0000-4000-8000-000000000009',
    'social_approval','20000000-0000-4000-8000-000000000009',null,
    jsonb_build_object(
      'approvalId','20000000-0000-4000-8000-000000000009'::uuid,
      'revisionId','20000000-0000-4000-8000-000000000007'::uuid,
      'variantId','20000000-0000-4000-8000-000000000008'::uuid,
      'revisionNumber',1,'contentHash',content_hash,'platform','facebook','approvalChannel','client_portal'
    )
  );
  if customer_approval_event.id is null then
    raise exception 'client_portal approval must be accepted within one customer scope.';
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('service_role','public.social_content_hash_v1(jsonb)','execute')
    or has_function_privilege('service_role','public.validate_social_content_created_v1(jsonb)','execute')
    or has_function_privilege('anon','public.dispatch_business_event_payload_validation(text,jsonb)','execute')
    or has_function_privilege('authenticated','public.dispatch_business_event_context_validation(text,text,uuid,text,uuid,text,text,text,uuid,text,timestamptz,jsonb)','execute')
  then
    raise exception 'Contract validators and dispatchers must remain non-executable by application roles.';
  end if;
end;
$$;

rollback;
