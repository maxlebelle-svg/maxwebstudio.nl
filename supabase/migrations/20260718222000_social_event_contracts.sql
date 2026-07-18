begin;

create or replace function public.assert_social_event_json_keys_v1(
  input_payload jsonb,
  input_expected_keys text[]
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  if jsonb_typeof(input_payload) <> 'object'
    or not (input_payload ?& input_expected_keys)
    or exists (
      select 1
      from jsonb_object_keys(input_payload) as supplied_key
      where not (supplied_key = any(input_expected_keys))
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Social event payload keys do not match the registered contract.';
  end if;
end;
$$;

create or replace function public.social_event_uuid_v1(
  input_payload jsonb,
  input_key text
)
returns uuid
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  parsed_uuid uuid;
begin
  if jsonb_typeof(input_payload -> input_key) <> 'string' then
    raise exception using errcode = '22023', message = format('%s must be a UUID string.', input_key);
  end if;

  begin
    parsed_uuid := (input_payload ->> input_key)::uuid;
  exception
    when invalid_text_representation then
      raise exception using errcode = '22023', message = format('%s must be a UUID string.', input_key);
  end;
  return parsed_uuid;
end;
$$;

create or replace function public.social_event_positive_integer_v1(
  input_payload jsonb,
  input_key text
)
returns integer
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  parsed_integer integer;
begin
  if jsonb_typeof(input_payload -> input_key) <> 'number'
    or (input_payload ->> input_key) !~ '^[1-9][0-9]*$'
  then
    raise exception using errcode = '22023', message = format('%s must be a positive integer.', input_key);
  end if;

  begin
    parsed_integer := (input_payload ->> input_key)::integer;
  exception
    when numeric_value_out_of_range then
      raise exception using errcode = '22023', message = format('%s is outside the integer range.', input_key);
  end;
  return parsed_integer;
end;
$$;

create or replace function public.social_event_sha256_v1(
  input_payload jsonb,
  input_key text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  hash_value text;
begin
  hash_value := input_payload ->> input_key;
  if jsonb_typeof(input_payload -> input_key) <> 'string'
    or hash_value !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = format('%s must be a lowercase SHA-256 hex value.', input_key);
  end if;
  return hash_value;
end;
$$;

create or replace function public.social_event_platform_v1(input_payload jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  platform_value text;
begin
  platform_value := input_payload ->> 'platform';
  if jsonb_typeof(input_payload -> 'platform') <> 'string'
    or platform_value not in ('facebook', 'instagram')
  then
    raise exception using errcode = '22023', message = 'platform must be facebook or instagram.';
  end if;
  return platform_value;
end;
$$;

create or replace function public.parse_social_event_utc_timestamp_v1(
  input_payload jsonb,
  input_key text
)
returns timestamptz
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  timestamp_text text;
  parsed_timestamp timestamptz;
begin
  timestamp_text := input_payload ->> input_key;
  if jsonb_typeof(input_payload -> input_key) <> 'string'
    or timestamp_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  then
    raise exception using
      errcode = '22023',
      message = format('%s must use canonical UTC format YYYY-MM-DDTHH:MM:SS.mmmZ.', input_key);
  end if;

  begin
    parsed_timestamp := timestamp_text::timestamptz;
  exception
    when datetime_field_overflow then
      raise exception using errcode = '22023', message = format('%s is not a valid UTC timestamp.', input_key);
  end;
  return parsed_timestamp;
end;
$$;

create or replace function public.canonical_social_content_v1(input_content jsonb)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  canonical_caption text;
  canonical_hashtags jsonb;
  canonical_media jsonb;
  canonical_platform text;
begin
  perform public.assert_social_event_json_keys_v1(
    input_content,
    array['caption', 'hashtags', 'media', 'platform']::text[]
  );

  if jsonb_typeof(input_content -> 'caption') <> 'string'
    or char_length(input_content ->> 'caption') not between 1 and 5000
    or jsonb_typeof(input_content -> 'hashtags') <> 'array'
    or jsonb_array_length(input_content -> 'hashtags') > 30
    or jsonb_typeof(input_content -> 'media') <> 'array'
    or jsonb_array_length(input_content -> 'media') > 10
  then
    raise exception using errcode = '22023', message = 'Canonical social content has an invalid shape.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(input_content -> 'hashtags') as hashtag
    where jsonb_typeof(hashtag) <> 'string'
      or char_length(hashtag #>> '{}') not between 1 and 100
  ) or exists (
    select 1
    from jsonb_array_elements(input_content -> 'media') as media_id
    where jsonb_typeof(media_id) <> 'string'
      or (media_id #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) then
    raise exception using errcode = '22023', message = 'Canonical social content arrays are invalid.';
  end if;

  canonical_platform := public.social_event_platform_v1(input_content);
  canonical_caption := normalize(
    replace(replace(input_content ->> 'caption', E'\r\n', E'\n'), E'\r', E'\n'),
    NFC
  );

  select coalesce(
    jsonb_agg(
      to_jsonb(normalize(replace(replace(hashtag, E'\r\n', E'\n'), E'\r', E'\n'), NFC))
      order by ordinal_position
    ),
    '[]'::jsonb
  )
  into canonical_hashtags
  from jsonb_array_elements_text(input_content -> 'hashtags') with ordinality as tags(hashtag, ordinal_position);

  select coalesce(
    jsonb_agg(to_jsonb((media_id::uuid)::text) order by ordinal_position),
    '[]'::jsonb
  )
  into canonical_media
  from jsonb_array_elements_text(input_content -> 'media') with ordinality as media(media_id, ordinal_position);

  return '{"caption":' || to_jsonb(canonical_caption)::text
    || ',"hashtags":' || canonical_hashtags::text
    || ',"media":' || canonical_media::text
    || ',"platform":' || to_jsonb(canonical_platform)::text
    || '}';
end;
$$;

create or replace function public.social_content_hash_v1(input_content jsonb)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(public.canonical_social_content_v1(input_content), 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function public.validate_social_content_created_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(input_payload, array['masterContentId', 'origin']::text[]);
  perform public.social_event_uuid_v1(input_payload, 'masterContentId');
  if jsonb_typeof(input_payload -> 'origin') <> 'string'
    or (input_payload ->> 'origin') not in ('ai', 'employee', 'website_signal')
  then
    raise exception using errcode = '22023', message = 'origin is invalid.';
  end if;
end;
$$;

create or replace function public.validate_social_content_revision_created_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['revisionId','masterContentId','variantId','revisionNumber','platform','contentHash','supersedesRevisionId']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'masterContentId');
  perform public.social_event_uuid_v1(input_payload, 'variantId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_platform_v1(input_payload);
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  if input_payload -> 'supersedesRevisionId' <> 'null'::jsonb then
    perform public.social_event_uuid_v1(input_payload, 'supersedesRevisionId');
  end if;
end;
$$;

create or replace function public.validate_social_content_approved_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['approvalId','revisionId','variantId','revisionNumber','contentHash','platform','approvalChannel']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'approvalId');
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'variantId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  perform public.social_event_platform_v1(input_payload);
  if jsonb_typeof(input_payload -> 'approvalChannel') <> 'string'
    or (input_payload ->> 'approvalChannel') not in ('client_portal', 'internal_admin')
  then
    raise exception using errcode = '22023', message = 'approvalChannel is invalid.';
  end if;
end;
$$;

create or replace function public.validate_social_publication_requested_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['deliveryJobId','approvalId','revisionId','variantId','revisionNumber','contentHash','socialAccountId','platform','scheduledFor']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'deliveryJobId');
  perform public.social_event_uuid_v1(input_payload, 'approvalId');
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'variantId');
  perform public.social_event_uuid_v1(input_payload, 'socialAccountId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  perform public.social_event_platform_v1(input_payload);
  perform public.parse_social_event_utc_timestamp_v1(input_payload, 'scheduledFor');
end;
$$;

create or replace function public.validate_social_publication_succeeded_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['deliveryJobId','deliveryAttemptId','revisionId','revisionNumber','contentHash','socialAccountId','platform','providerPublicationId','publishedAt']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'deliveryJobId');
  perform public.social_event_uuid_v1(input_payload, 'deliveryAttemptId');
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'socialAccountId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  perform public.social_event_platform_v1(input_payload);
  perform public.parse_social_event_utc_timestamp_v1(input_payload, 'publishedAt');
  if jsonb_typeof(input_payload -> 'providerPublicationId') <> 'string'
    or char_length(btrim(input_payload ->> 'providerPublicationId')) not between 1 and 255
  then
    raise exception using errcode = '22023', message = 'providerPublicationId is invalid.';
  end if;
end;
$$;

create or replace function public.validate_social_publication_failed_v1(input_payload jsonb)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  perform public.assert_social_event_json_keys_v1(
    input_payload,
    array['deliveryJobId','deliveryAttemptId','revisionId','revisionNumber','contentHash','socialAccountId','platform','errorCategory','attemptCount','failedAt']::text[]
  );
  perform public.social_event_uuid_v1(input_payload, 'deliveryJobId');
  perform public.social_event_uuid_v1(input_payload, 'deliveryAttemptId');
  perform public.social_event_uuid_v1(input_payload, 'revisionId');
  perform public.social_event_uuid_v1(input_payload, 'socialAccountId');
  perform public.social_event_positive_integer_v1(input_payload, 'revisionNumber');
  perform public.social_event_positive_integer_v1(input_payload, 'attemptCount');
  perform public.social_event_sha256_v1(input_payload, 'contentHash');
  perform public.social_event_platform_v1(input_payload);
  perform public.parse_social_event_utc_timestamp_v1(input_payload, 'failedAt');
  if jsonb_typeof(input_payload -> 'errorCategory') <> 'string'
    or (input_payload ->> 'errorCategory') not in (
      'provider_rejected','authentication_required','account_unavailable','content_invalid',
      'media_invalid','rate_limit_exhausted','delivery_expired','internal_error'
    )
  then
    raise exception using errcode = '22023', message = 'errorCategory is invalid.';
  end if;
end;
$$;

create or replace function public.dispatch_business_event_payload_validation(
  input_validator_key text,
  input_payload jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
begin
  case input_validator_key
    when 'foundation_test_v1' then perform public.validate_business_event_foundation_test_v1(input_payload);
    when 'social_content_created_v1' then perform public.validate_social_content_created_v1(input_payload);
    when 'social_content_revision_created_v1' then perform public.validate_social_content_revision_created_v1(input_payload);
    when 'social_content_approved_v1' then perform public.validate_social_content_approved_v1(input_payload);
    when 'social_publication_requested_v1' then perform public.validate_social_publication_requested_v1(input_payload);
    when 'social_publication_succeeded_v1' then perform public.validate_social_publication_succeeded_v1(input_payload);
    when 'social_publication_failed_v1' then perform public.validate_social_publication_failed_v1(input_payload);
    else
      raise exception using
        errcode = '22023',
        message = format('Unsupported business event payload validator: %s.', coalesce(input_validator_key, '<null>'));
  end case;
end;
$$;

create or replace function public.dispatch_business_event_context_validation(
  input_validator_key text,
  input_owner_scope text,
  input_customer_id uuid,
  input_subject_type text,
  input_subject_uuid uuid,
  input_subject_external_id text,
  input_source_module text,
  input_source_operation text,
  input_causation_id uuid,
  input_deduplication_key text,
  input_occurred_at timestamptz,
  input_payload jsonb
)
returns void
language plpgsql
set search_path = pg_catalog
as $$
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
$$;

create or replace function public.business_event_before_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  contract_record public.business_event_contracts%rowtype;
  cause_record public.business_events%rowtype;
  payload_bytes integer;
begin
  select * into contract_record
  from public.business_event_contracts
  where event_type = new.event_type and event_version = new.event_version;

  if not found then
    raise exception using errcode = '22023', message = format('Unsupported business event contract: %s v%s.', new.event_type, new.event_version);
  end if;
  if contract_record.lifecycle_status = 'retired' then
    raise exception using errcode = '22023', message = format('Business event contract is retired: %s v%s.', new.event_type, new.event_version);
  end if;
  if not (new.owner_scope = any(contract_record.allowed_owner_scopes)) then
    raise exception using errcode = '22023', message = 'Business event owner scope is not allowed by its contract.';
  end if;

  payload_bytes := octet_length(convert_to(new.payload::text, 'UTF8'));
  if payload_bytes > contract_record.max_payload_bytes then
    raise exception using
      errcode = '22001',
      message = format('Business event payload is %s bytes; contract maximum is %s bytes.', payload_bytes, contract_record.max_payload_bytes);
  end if;

  perform public.dispatch_business_event_payload_validation(contract_record.validator_key, new.payload);

  if new.causation_id is not null then
    select * into cause_record from public.business_events where id = new.causation_id;
    if not found then
      raise exception using errcode = '23503', message = 'Causation business event does not exist.';
    end if;
    if cause_record.owner_scope is distinct from new.owner_scope
      or cause_record.customer_id is distinct from new.customer_id
    then
      raise exception using errcode = '23514', message = 'Causation business event belongs to another ownership scope.';
    end if;
  end if;

  perform public.dispatch_business_event_context_validation(
    contract_record.validator_key,
    new.owner_scope,
    new.customer_id,
    new.subject_type,
    new.subject_uuid,
    new.subject_external_id,
    new.source_module,
    new.source_operation,
    new.causation_id,
    new.deduplication_key,
    new.occurred_at,
    new.payload
  );
  return new;
end;
$$;

insert into public.business_event_contracts (
  event_type,event_version,lifecycle_status,description,allowed_owner_scopes,
  payload_schema,max_payload_bytes,validator_key,registered_by_migration
) values
(
  'social.content_created',1,'active','A Social Studio master content identity was created.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["masterContentId","origin"],"properties":{"masterContentId":{"type":"string","format":"uuid"},"origin":{"enum":["ai","employee","website_signal"]}}}'::jsonb,
  512,'social_content_created_v1','20260718222000_social_event_contracts'
),
(
  'social.content_revision_created',1,'active','An immutable publishable social content revision was created.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["revisionId","masterContentId","variantId","revisionNumber","platform","contentHash","supersedesRevisionId"],"properties":{"revisionId":{"type":"string","format":"uuid"},"masterContentId":{"type":"string","format":"uuid"},"variantId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"platform":{"enum":["facebook","instagram"]},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"supersedesRevisionId":{"type":["string","null"],"format":"uuid"}}}'::jsonb,
  1024,'social_content_revision_created_v1','20260718222000_social_event_contracts'
),
(
  'social.content_approved',1,'active','An exact social content revision was approved.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["approvalId","revisionId","variantId","revisionNumber","contentHash","platform","approvalChannel"],"properties":{"approvalId":{"type":"string","format":"uuid"},"revisionId":{"type":"string","format":"uuid"},"variantId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"platform":{"enum":["facebook","instagram"]},"approvalChannel":{"enum":["client_portal","internal_admin"]}}}'::jsonb,
  1024,'social_content_approved_v1','20260718222000_social_event_contracts'
),
(
  'social.publication_requested',1,'active','A validated social publication request was accepted as a delivery job.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["deliveryJobId","approvalId","revisionId","variantId","revisionNumber","contentHash","socialAccountId","platform","scheduledFor"],"properties":{"deliveryJobId":{"type":"string","format":"uuid"},"approvalId":{"type":"string","format":"uuid"},"revisionId":{"type":"string","format":"uuid"},"variantId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"socialAccountId":{"type":"string","format":"uuid"},"platform":{"enum":["facebook","instagram"]},"scheduledFor":{"type":"string","format":"date-time"}}}'::jsonb,
  1536,'social_publication_requested_v1','20260718222000_social_event_contracts'
),
(
  'social.publication_succeeded',1,'active','A social publication was confirmed by its provider.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["deliveryJobId","deliveryAttemptId","revisionId","revisionNumber","contentHash","socialAccountId","platform","providerPublicationId","publishedAt"],"properties":{"deliveryJobId":{"type":"string","format":"uuid"},"deliveryAttemptId":{"type":"string","format":"uuid"},"revisionId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"socialAccountId":{"type":"string","format":"uuid"},"platform":{"enum":["facebook","instagram"]},"providerPublicationId":{"type":"string","minLength":1,"maxLength":255},"publishedAt":{"type":"string","format":"date-time"}}}'::jsonb,
  1536,'social_publication_succeeded_v1','20260718222000_social_event_contracts'
),
(
  'social.publication_failed',1,'active','A social publication reached a definitive non-ambiguous failure.',array['customer','internal']::text[],
  '{"type":"object","additionalProperties":false,"required":["deliveryJobId","deliveryAttemptId","revisionId","revisionNumber","contentHash","socialAccountId","platform","errorCategory","attemptCount","failedAt"],"properties":{"deliveryJobId":{"type":"string","format":"uuid"},"deliveryAttemptId":{"type":"string","format":"uuid"},"revisionId":{"type":"string","format":"uuid"},"revisionNumber":{"type":"integer","minimum":1},"contentHash":{"type":"string","pattern":"^[0-9a-f]{64}$"},"socialAccountId":{"type":"string","format":"uuid"},"platform":{"enum":["facebook","instagram"]},"errorCategory":{"enum":["provider_rejected","authentication_required","account_unavailable","content_invalid","media_invalid","rate_limit_exhausted","delivery_expired","internal_error"]},"attemptCount":{"type":"integer","minimum":1},"failedAt":{"type":"string","format":"date-time"}}}'::jsonb,
  1536,'social_publication_failed_v1','20260718222000_social_event_contracts'
);

revoke all on function public.assert_social_event_json_keys_v1(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function public.social_event_uuid_v1(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.social_event_positive_integer_v1(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.social_event_sha256_v1(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.social_event_platform_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.parse_social_event_utc_timestamp_v1(jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.canonical_social_content_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.social_content_hash_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_content_created_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_content_revision_created_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_content_approved_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_publication_requested_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_publication_succeeded_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.validate_social_publication_failed_v1(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.dispatch_business_event_context_validation(text,text,uuid,text,uuid,text,text,text,uuid,text,timestamptz,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.dispatch_business_event_payload_validation(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.business_event_before_insert() from public,anon,authenticated,service_role;

commit;
