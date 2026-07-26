-- Foundation F1: register the canonical lead.created v1 business-event contract.
-- Scope: contract, payload validator and validation dispatchers only.
-- No lead writes, record_business_event call, consumption or timeline projection.

do $preflight$
declare
  unexpected_validator_keys text[];
begin
  if current_user <> 'postgres' then
    raise exception using errcode = '55000',
      message = 'Lead Event Foundation must run as postgres so function ownership remains canonical.';
  end if;

  if to_regclass('public.business_event_contracts') is null
    or to_regclass('public.business_events') is null
  then
    raise exception using errcode = '55000',
      message = 'Lead Event Foundation requires the deployed Business Event Foundation.';
  end if;

  if to_regprocedure('public.dispatch_business_event_payload_validation(text,jsonb)') is null
    or to_regprocedure('public.dispatch_business_event_context_validation(text,text,uuid,text,uuid,text,text,text,uuid,text,timestamp with time zone,jsonb)') is null
    or to_regprocedure('public.record_business_event(text,uuid,text,smallint,timestamp with time zone,text,text,text,text,uuid,uuid,text,text,uuid,text,jsonb)') is null
  then
    raise exception using errcode = '55000',
      message = 'Lead Event Foundation requires the proven Business Event Foundation function signatures.';
  end if;

  if exists (
    select 1 from public.business_event_contracts
    where event_type = 'lead.created' or validator_key = 'lead_created_v1'
  ) then
    raise exception using errcode = '55000',
      message = 'lead.created v1 or validator_key lead_created_v1 already exists; stop for a compatibility review.';
  end if;

  select array_agg(validator_key order by validator_key)
    into unexpected_validator_keys
  from public.business_event_contracts
  where validator_key not in (
    'social_content_created_v1',
    'social_content_revision_created_v1',
    'social_content_approved_v1',
    'social_publication_requested_v1',
    'social_publication_succeeded_v1',
    'social_publication_failed_v1'
  );

  if unexpected_validator_keys is not null then
    raise exception using errcode = '55000',
      message = format('Unknown business-event validators detected (%s); stop before replacing dispatchers.', array_to_string(unexpected_validator_keys, ', '));
  end if;

  if exists (
    select 1
    from unnest(array[
      'public.validate_business_event_foundation_test_v1(jsonb)',
      'public.validate_social_content_created_v1(jsonb)',
      'public.validate_social_content_revision_created_v1(jsonb)',
      'public.validate_social_content_approved_v1(jsonb)',
      'public.validate_social_publication_requested_v1(jsonb)',
      'public.validate_social_publication_succeeded_v1(jsonb)',
      'public.validate_social_publication_failed_v1(jsonb)'
    ]) as required_function(signature)
    where to_regprocedure(required_function.signature) is null
  ) then
    raise exception using errcode = '55000',
      message = 'A proven payload validator is missing; stop before replacing dispatchers.';
  end if;
end
$preflight$;

create function public.validate_lead_created_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path to 'pg_catalog'
as $function$
declare
  payload_keys text[];
begin
  if jsonb_typeof(input_payload) is distinct from 'object' then
    raise exception using errcode = '23514', message = 'lead.created payload must be a JSON object.';
  end if;

  select array_agg(key order by key) into payload_keys
  from jsonb_object_keys(input_payload) as payload_key(key);

  if payload_keys is distinct from array['environment', 'leadId', 'source']::text[] then
    raise exception using errcode = '23514',
      message = 'lead.created payload requires exactly environment, leadId and source.';
  end if;

  if jsonb_typeof(input_payload -> 'leadId') is distinct from 'string'
    or (input_payload ->> 'leadId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    raise exception using errcode = '23514',
      message = 'lead.created leadId must be a canonical lowercase UUID.';
  end if;

  if jsonb_typeof(input_payload -> 'source') is distinct from 'string'
    or input_payload ->> 'source' is distinct from btrim(input_payload ->> 'source')
    or char_length(input_payload ->> 'source') not between 1 and 120
  then
    raise exception using errcode = '23514',
      message = 'lead.created source must be a trimmed string of 1 to 120 characters.';
  end if;

  if jsonb_typeof(input_payload -> 'environment') is distinct from 'string'
    or input_payload ->> 'environment' not in ('production', 'test', 'demo')
  then
    raise exception using errcode = '23514', message = 'lead.created environment is invalid.';
  end if;
end;
$function$;

alter function public.validate_lead_created_v1(jsonb) owner to postgres;

create or replace function public.dispatch_business_event_context_validation(
  input_validator_key text, input_owner_scope text, input_customer_id uuid,
  input_subject_type text, input_subject_uuid uuid, input_subject_external_id text,
  input_source_module text, input_source_operation text, input_causation_id uuid,
  input_deduplication_key text, input_occurred_at timestamptz, input_payload jsonb
)
returns void
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  cause_record public.business_events%rowtype;
  relevant_subject_uuid uuid;
  expected_subject_type text;
  expected_operation text;
  expected_deduplication_key text;
  result_timestamp timestamptz;
begin
  if input_validator_key = 'foundation_test_v1' then
    return;
  end if;

  if input_validator_key = 'lead_created_v1' then
    relevant_subject_uuid := (input_payload ->> 'leadId')::uuid;
    if input_owner_scope <> 'internal'
      or input_customer_id is not null
      or input_subject_type <> 'lead'
      or input_subject_uuid is distinct from relevant_subject_uuid
      or input_subject_external_id is not null
      or input_source_module <> 'lead_intake'
      or input_source_operation is distinct from 'lead_created:v1'
      or input_causation_id is not null
      or input_deduplication_key is distinct from 'lead.created:v1:' || relevant_subject_uuid::text
    then
      raise exception using errcode = '23514', message = 'lead.created event context is invalid.';
    end if;
    return;
  end if;

  if input_source_module <> 'social_studio' then
    raise exception using errcode = '23514', message = 'Social events require source_module social_studio.';
  end if;

  case input_validator_key
    when 'social_content_created_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'masterContentId');
      expected_subject_type := 'social_master_content';
      expected_operation := 'content_created:v1';
      expected_deduplication_key := 'social.content_created:v1:' || relevant_subject_uuid::text;
      if input_payload ->> 'origin' = 'website_signal' and input_causation_id is null then
        raise exception using errcode = '23514', message = 'website_signal content requires causation_id.';
      end if;

    when 'social_content_revision_created_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'revisionId');
      expected_subject_type := 'social_content_revision';
      expected_operation := 'content_revision_created:v1';
      expected_deduplication_key := 'social.content_revision_created:v1:' || relevant_subject_uuid::text;
      if input_causation_id is null then
        raise exception using errcode = '23514', message = 'Content revision requires causation_id.';
      end if;
      select * into cause_record from public.business_events where id = input_causation_id;
      if input_payload -> 'supersedesRevisionId' = 'null'::jsonb then
        if cause_record.event_type <> 'social.content_created'
          or cause_record.subject_uuid is distinct from public.social_event_uuid_v1(input_payload, 'masterContentId')
        then
          raise exception using errcode = '23514', message = 'Initial revision must be caused by its master content event.';
        end if;
      elsif cause_record.event_type <> 'social.content_revision_created'
        or cause_record.subject_uuid is distinct from public.social_event_uuid_v1(input_payload, 'supersedesRevisionId')
        or cause_record.payload ->> 'masterContentId' is distinct from input_payload ->> 'masterContentId'
        or cause_record.payload ->> 'variantId' is distinct from input_payload ->> 'variantId'
        or cause_record.payload ->> 'platform' is distinct from input_payload ->> 'platform'
      then
        raise exception using errcode = '23514', message = 'Revision lineage does not match the superseded revision.';
      end if;

    when 'social_content_approved_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'approvalId');
      expected_subject_type := 'social_approval';
      expected_operation := 'content_approved:v1';
      expected_deduplication_key := 'social.content_approved:v1:' || relevant_subject_uuid::text;
      if input_owner_scope = 'internal' and input_payload ->> 'approvalChannel' = 'client_portal' then
        raise exception using errcode = '23514', message = 'client_portal approval is customer-only.';
      end if;
      if input_causation_id is null then
        raise exception using errcode = '23514', message = 'Approval requires causation_id.';
      end if;
      select * into cause_record from public.business_events where id = input_causation_id;
      if cause_record.event_type <> 'social.content_revision_created'
        or cause_record.subject_uuid is distinct from public.social_event_uuid_v1(input_payload, 'revisionId')
        or cause_record.payload ->> 'variantId' is distinct from input_payload ->> 'variantId'
        or cause_record.payload ->> 'revisionNumber' is distinct from input_payload ->> 'revisionNumber'
        or cause_record.payload ->> 'contentHash' is distinct from input_payload ->> 'contentHash'
        or cause_record.payload ->> 'platform' is distinct from input_payload ->> 'platform'
      then
        raise exception using errcode = '23514', message = 'Approval does not match its caused revision.';
      end if;

    when 'social_publication_requested_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'deliveryJobId');
      expected_subject_type := 'delivery_job';
      expected_operation := 'publication_requested:v1';
      expected_deduplication_key := 'social.publication_requested:v1:' || relevant_subject_uuid::text;
      if public.parse_social_event_utc_timestamp_v1(input_payload, 'scheduledFor') < input_occurred_at then
        raise exception using errcode = '23514', message = 'scheduledFor cannot precede the publication request.';
      end if;
      if input_causation_id is null then
        raise exception using errcode = '23514', message = 'Publication request requires causation_id.';
      end if;
      select * into cause_record from public.business_events where id = input_causation_id;
      if cause_record.event_type <> 'social.content_approved'
        or cause_record.subject_uuid is distinct from public.social_event_uuid_v1(input_payload, 'approvalId')
        or cause_record.payload ->> 'revisionId' is distinct from input_payload ->> 'revisionId'
        or cause_record.payload ->> 'variantId' is distinct from input_payload ->> 'variantId'
        or cause_record.payload ->> 'revisionNumber' is distinct from input_payload ->> 'revisionNumber'
        or cause_record.payload ->> 'contentHash' is distinct from input_payload ->> 'contentHash'
        or cause_record.payload ->> 'platform' is distinct from input_payload ->> 'platform'
      then
        raise exception using errcode = '23514', message = 'Publication request does not match its approval.';
      end if;

    when 'social_publication_succeeded_v1', 'social_publication_failed_v1' then
      relevant_subject_uuid := public.social_event_uuid_v1(input_payload, 'deliveryJobId');
      expected_subject_type := 'delivery_job';
      expected_operation := case input_validator_key
        when 'social_publication_succeeded_v1' then 'publication_succeeded:v1'
        else 'publication_failed:v1'
      end;
      expected_deduplication_key := 'social.publication_terminal:v1:' || relevant_subject_uuid::text;
      if input_causation_id is null then
        raise exception using errcode = '23514', message = 'Publication result requires causation_id.';
      end if;
      select * into cause_record from public.business_events where id = input_causation_id;
      result_timestamp := case input_validator_key
        when 'social_publication_succeeded_v1' then public.parse_social_event_utc_timestamp_v1(input_payload, 'publishedAt')
        else public.parse_social_event_utc_timestamp_v1(input_payload, 'failedAt')
      end;
      if cause_record.event_type <> 'social.publication_requested'
        or cause_record.subject_uuid is distinct from relevant_subject_uuid
        or cause_record.payload ->> 'revisionId' is distinct from input_payload ->> 'revisionId'
        or cause_record.payload ->> 'revisionNumber' is distinct from input_payload ->> 'revisionNumber'
        or cause_record.payload ->> 'contentHash' is distinct from input_payload ->> 'contentHash'
        or cause_record.payload ->> 'socialAccountId' is distinct from input_payload ->> 'socialAccountId'
        or cause_record.payload ->> 'platform' is distinct from input_payload ->> 'platform'
      then
        raise exception using errcode = '23514', message = 'Publication result does not match its request.';
      end if;
      if input_occurred_at < cause_record.occurred_at
        or result_timestamp < cause_record.occurred_at
        or result_timestamp is distinct from input_occurred_at
      then
        raise exception using errcode = '23514', message = 'Publication result timestamp precedes or differs from its event time.';
      end if;

    else
      raise exception using errcode = '22023', message = 'Unsupported social event context validator.';
  end case;

  if input_subject_type <> expected_subject_type
    or input_subject_uuid is distinct from relevant_subject_uuid
    or input_subject_external_id is not null
  then
    raise exception using errcode = '23514', message = 'Social event subject does not match its payload.';
  end if;
  if input_source_operation is distinct from expected_operation then
    raise exception using errcode = '23514', message = 'Social event source_operation is invalid.';
  end if;
  if input_deduplication_key is distinct from expected_deduplication_key then
    raise exception using errcode = '23514', message = 'Social event deduplication key is invalid.';
  end if;
end;
$function$;

revoke all on function public.validate_lead_created_v1(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.dispatch_business_event_payload_validation(input_validator_key text, input_payload jsonb)
returns void
language plpgsql
immutable
set search_path to 'pg_catalog'
as $function$
begin
  case input_validator_key
    when 'foundation_test_v1' then perform public.validate_business_event_foundation_test_v1(input_payload);
    when 'social_content_created_v1' then perform public.validate_social_content_created_v1(input_payload);
    when 'social_content_revision_created_v1' then perform public.validate_social_content_revision_created_v1(input_payload);
    when 'social_content_approved_v1' then perform public.validate_social_content_approved_v1(input_payload);
    when 'social_publication_requested_v1' then perform public.validate_social_publication_requested_v1(input_payload);
    when 'social_publication_succeeded_v1' then perform public.validate_social_publication_succeeded_v1(input_payload);
    when 'social_publication_failed_v1' then perform public.validate_social_publication_failed_v1(input_payload);
    when 'lead_created_v1' then perform public.validate_lead_created_v1(input_payload);
    else
      raise exception using errcode = '22023',
        message = format('Unsupported business event payload validator: %s.', coalesce(input_validator_key, '<null>'));
  end case;
end;
$function$;

insert into public.business_event_contracts (
  event_type,
  event_version,
  lifecycle_status,
  description,
  allowed_owner_scopes,
  payload_schema,
  max_payload_bytes,
  validator_key,
  registered_by_migration
)
values (
  'lead.created',
  1,
  'active',
  'A canonical lead record was created.',
  array['internal']::text[],
  jsonb_build_object(
    'type', 'object',
    'required', jsonb_build_array('leadId', 'source', 'environment'),
    'properties', jsonb_build_object(
      'leadId', jsonb_build_object('type', 'string', 'format', 'uuid'),
      'source', jsonb_build_object('type', 'string', 'minLength', 1, 'maxLength', 120),
      'environment', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('production', 'test', 'demo'))
    ),
    'additionalProperties', false
  ),
  512,
  'lead_created_v1',
  '20260720160000_lead_event_foundation'
);
