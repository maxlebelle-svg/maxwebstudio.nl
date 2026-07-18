begin;

create extension if not exists pgcrypto;

create table public.business_event_contracts (
  event_type text not null,
  event_version smallint not null,
  lifecycle_status text not null default 'active',
  description text not null,
  allowed_owner_scopes text[] not null,
  payload_schema jsonb not null,
  max_payload_bytes integer not null,
  validator_key text not null,
  schema_checksum text not null default '',
  registered_by_migration text not null,
  registered_at timestamptz not null default now(),
  deprecated_at timestamptz,

  constraint business_event_contracts_pkey primary key (event_type, event_version),
  constraint business_event_contracts_validator_key_key unique (validator_key),
  constraint business_event_contracts_event_type_check check (
    char_length(event_type) between 3 and 120
    and event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  constraint business_event_contracts_event_version_check check (event_version > 0),
  constraint business_event_contracts_lifecycle_status_check check (
    lifecycle_status in ('active', 'deprecated', 'retired')
  ),
  constraint business_event_contracts_description_check check (
    char_length(btrim(description)) between 1 and 1000
  ),
  constraint business_event_contracts_owner_scopes_check check (
    allowed_owner_scopes = array['customer']::text[]
    or allowed_owner_scopes = array['internal']::text[]
    or allowed_owner_scopes = array['customer', 'internal']::text[]
  ),
  constraint business_event_contracts_payload_schema_check check (
    jsonb_typeof(payload_schema) = 'object'
  ),
  constraint business_event_contracts_payload_limit_check check (
    max_payload_bytes between 1 and 1048576
  ),
  constraint business_event_contracts_validator_key_check check (
    char_length(validator_key) between 3 and 120
    and validator_key ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint business_event_contracts_checksum_check check (
    schema_checksum ~ '^[0-9a-f]{32}$'
  ),
  constraint business_event_contracts_migration_check check (
    char_length(btrim(registered_by_migration)) between 1 and 180
  ),
  constraint business_event_contracts_lifecycle_timestamp_check check (
    (lifecycle_status = 'active' and deprecated_at is null)
    or (lifecycle_status in ('deprecated', 'retired') and deprecated_at is not null)
  )
);

create table public.business_events (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null,
  customer_id uuid references public.customers(id) on delete restrict,
  event_type text not null,
  event_version smallint not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  actor_type text not null,
  actor_id text,
  source_module text not null,
  source_operation text,
  correlation_id uuid,
  causation_id uuid references public.business_events(id) on delete restrict,
  deduplication_key text not null,
  subject_type text not null,
  subject_uuid uuid,
  subject_external_id text,
  payload jsonb not null,
  retention_until timestamptz not null default (now() + interval '24 months'),

  constraint business_events_contract_fkey foreign key (event_type, event_version)
    references public.business_event_contracts(event_type, event_version)
    on update restrict on delete restrict,
  constraint business_events_owner_scope_check check (
    owner_scope in ('customer', 'internal')
  ),
  constraint business_events_owner_customer_check check (
    (owner_scope = 'customer' and customer_id is not null)
    or (owner_scope = 'internal' and customer_id is null)
  ),
  constraint business_events_event_type_check check (
    char_length(event_type) between 3 and 120
    and event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'
  ),
  constraint business_events_event_version_check check (event_version > 0),
  constraint business_events_actor_type_check check (
    char_length(actor_type) between 1 and 60
    and actor_type ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint business_events_actor_id_check check (
    actor_id is null or char_length(btrim(actor_id)) between 1 and 255
  ),
  constraint business_events_source_module_check check (
    char_length(source_module) between 1 and 80
    and source_module ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint business_events_source_operation_check check (
    source_operation is null
    or (
      char_length(source_operation) between 1 and 120
      and source_operation ~ '^[a-zA-Z0-9_.:-]+$'
    )
  ),
  constraint business_events_deduplication_key_check check (
    char_length(btrim(deduplication_key)) between 1 and 240
  ),
  constraint business_events_subject_type_check check (
    char_length(subject_type) between 1 and 80
    and subject_type ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint business_events_subject_identity_check check (
    num_nonnulls(subject_uuid, subject_external_id) = 1
  ),
  constraint business_events_subject_external_id_check check (
    subject_external_id is null
    or char_length(btrim(subject_external_id)) between 1 and 255
  ),
  constraint business_events_payload_object_check check (
    jsonb_typeof(payload) = 'object'
  ),
  constraint business_events_platform_payload_ceiling_check check (
    octet_length(convert_to(payload::text, 'UTF8')) <= 1048576
  ),
  constraint business_events_occurrence_check check (
    occurred_at <= recorded_at + interval '5 minutes'
  ),
  constraint business_events_retention_check check (
    retention_until > recorded_at
  ),
  constraint business_events_no_self_causation_check check (
    causation_id is null or causation_id <> id
  )
);

create table public.business_event_consumptions (
  id uuid primary key default gen_random_uuid(),
  business_event_id uuid not null references public.business_events(id) on delete restrict,
  consumer_name text not null,
  consumer_version smallint not null,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  locked_by text,
  lease_expires_at timestamptz,
  last_error_code text,
  last_error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint business_event_consumptions_event_consumer_key unique (
    business_event_id,
    consumer_name,
    consumer_version
  ),
  constraint business_event_consumptions_consumer_name_check check (
    char_length(consumer_name) between 1 and 120
    and consumer_name ~ '^[a-z][a-z0-9_.:-]*$'
  ),
  constraint business_event_consumptions_consumer_version_check check (
    consumer_version > 0
  ),
  constraint business_event_consumptions_status_check check (
    status in (
      'pending',
      'claimed',
      'running',
      'completed',
      'failed',
      'retry_waiting',
      'dead_letter',
      'cancelled'
    )
  ),
  constraint business_event_consumptions_attempt_count_check check (
    attempt_count >= 0
  ),
  constraint business_event_consumptions_locked_by_check check (
    locked_by is null or char_length(btrim(locked_by)) between 1 and 160
  ),
  constraint business_event_consumptions_error_code_check check (
    last_error_code is null
    or (
      char_length(last_error_code) between 1 and 120
      and last_error_code ~ '^[a-zA-Z0-9_.:-]+$'
    )
  ),
  constraint business_event_consumptions_error_message_check check (
    last_error_message is null or char_length(last_error_message) <= 2000
  ),
  constraint business_event_consumptions_lock_tuple_check check (
    num_nonnulls(locked_at, locked_by, lease_expires_at) in (0, 3)
  ),
  constraint business_event_consumptions_lease_order_check check (
    lease_expires_at is null or lease_expires_at > locked_at
  ),
  constraint business_event_consumptions_time_order_check check (
    (started_at is null or started_at >= created_at)
    and (completed_at is null or completed_at >= created_at)
  )
);

create unique index business_events_customer_deduplication_key
  on public.business_events(customer_id, source_module, deduplication_key)
  where owner_scope = 'customer';

create unique index business_events_internal_deduplication_key
  on public.business_events(source_module, deduplication_key)
  where owner_scope = 'internal';

create index business_events_customer_recorded_at_idx
  on public.business_events(customer_id, recorded_at desc)
  where customer_id is not null;

create index business_events_type_recorded_at_idx
  on public.business_events(event_type, event_version, recorded_at desc);

create index business_events_correlation_id_idx
  on public.business_events(correlation_id)
  where correlation_id is not null;

create index business_events_causation_id_idx
  on public.business_events(causation_id)
  where causation_id is not null;

create index business_events_retention_until_idx
  on public.business_events(retention_until);

create index business_event_consumptions_ready_idx
  on public.business_event_consumptions(status, next_attempt_at)
  where status in ('pending', 'retry_waiting');

create index business_event_consumptions_active_lease_idx
  on public.business_event_consumptions(lease_expires_at)
  where status in ('claimed', 'running');

create or replace function public.business_event_contract_before_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  definition_text text;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'Business event contract definitions cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' then
    if new.event_type is distinct from old.event_type
      or new.event_version is distinct from old.event_version
      or new.description is distinct from old.description
      or new.allowed_owner_scopes is distinct from old.allowed_owner_scopes
      or new.payload_schema is distinct from old.payload_schema
      or new.max_payload_bytes is distinct from old.max_payload_bytes
      or new.validator_key is distinct from old.validator_key
      or new.schema_checksum is distinct from old.schema_checksum
      or new.registered_by_migration is distinct from old.registered_by_migration
      or new.registered_at is distinct from old.registered_at
    then
      raise exception using
        errcode = '55000',
        message = 'Business event contract definitions are immutable.';
    end if;

    if old.lifecycle_status = 'active' and new.lifecycle_status = 'deprecated' then
      new.deprecated_at := coalesce(new.deprecated_at, clock_timestamp());
    elsif old.lifecycle_status = 'deprecated' and new.lifecycle_status = 'retired' then
      new.deprecated_at := old.deprecated_at;
    else
      raise exception using
        errcode = '55000',
        message = format(
          'Unsupported business event contract lifecycle transition: %s -> %s.',
          old.lifecycle_status,
          new.lifecycle_status
        );
    end if;

    return new;
  end if;

  definition_text := concat_ws(
    E'\x1f',
    new.event_type,
    new.event_version::text,
    array_to_string(new.allowed_owner_scopes, ','),
    new.payload_schema::text,
    new.max_payload_bytes::text,
    new.validator_key
  );
  new.schema_checksum := md5(definition_text);
  return new;
end;
$$;

create trigger business_event_contract_write_guard
before insert or update or delete on public.business_event_contracts
for each row
execute function public.business_event_contract_before_write();

create or replace function public.validate_business_event_foundation_test_v1(
  input_payload jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  test_id uuid;
begin
  if jsonb_typeof(input_payload) <> 'object'
    or not (input_payload ? 'testId')
    or (input_payload - 'testId') <> '{}'::jsonb
    or jsonb_typeof(input_payload -> 'testId') <> 'string'
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid foundation test event payload.';
  end if;

  begin
    test_id := (input_payload ->> 'testId')::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'Foundation test event testId must be a UUID.';
  end;

  if test_id is null then
    raise exception using
      errcode = '22023',
      message = 'Foundation test event testId is required.';
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
    when 'foundation_test_v1' then
      perform public.validate_business_event_foundation_test_v1(input_payload);
    else
      raise exception using
        errcode = '22023',
        message = format(
          'Unsupported business event payload validator: %s.',
          coalesce(input_validator_key, '<null>')
        );
  end case;
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
  select *
  into contract_record
  from public.business_event_contracts
  where event_type = new.event_type
    and event_version = new.event_version;

  if not found then
    raise exception using
      errcode = '22023',
      message = format(
        'Unsupported business event contract: %s v%s.',
        new.event_type,
        new.event_version
      );
  end if;

  if contract_record.lifecycle_status = 'retired' then
    raise exception using
      errcode = '22023',
      message = format(
        'Business event contract is retired: %s v%s.',
        new.event_type,
        new.event_version
      );
  end if;

  if not (new.owner_scope = any(contract_record.allowed_owner_scopes)) then
    raise exception using
      errcode = '22023',
      message = 'Business event owner scope is not allowed by its contract.';
  end if;

  payload_bytes := octet_length(convert_to(new.payload::text, 'UTF8'));
  if payload_bytes > contract_record.max_payload_bytes then
    raise exception using
      errcode = '22001',
      message = format(
        'Business event payload is %s bytes; contract maximum is %s bytes.',
        payload_bytes,
        contract_record.max_payload_bytes
      );
  end if;

  perform public.dispatch_business_event_payload_validation(
    contract_record.validator_key,
    new.payload
  );

  if new.causation_id is not null then
    select *
    into cause_record
    from public.business_events
    where id = new.causation_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'Causation business event does not exist.';
    end if;

    if cause_record.owner_scope is distinct from new.owner_scope
      or cause_record.customer_id is distinct from new.customer_id
    then
      raise exception using
        errcode = '23514',
        message = 'Causation business event belongs to another ownership scope.';
    end if;
  end if;

  return new;
end;
$$;

create trigger business_event_insert_validator
before insert on public.business_events
for each row
execute function public.business_event_before_insert();

create or replace function public.prevent_business_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Business events are append-only and cannot be updated or deleted.';
end;
$$;

create trigger business_event_append_only_guard
before update or delete on public.business_events
for each row
execute function public.prevent_business_event_mutation();

create or replace function public.business_event_consumption_before_write()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  transition_allowed boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'Business event consumptions cannot be deleted.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending'
      or new.attempt_count <> 0
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at,
        new.last_error_code,
        new.last_error_message,
        new.started_at,
        new.completed_at
      ) <> 0
    then
      raise exception using
        errcode = '23514',
        message = 'New business event consumptions must start in a clean pending state.';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
    or new.business_event_id is distinct from old.business_event_id
    or new.consumer_name is distinct from old.consumer_name
    or new.consumer_version is distinct from old.consumer_version
    or new.created_at is distinct from old.created_at
  then
    raise exception using
      errcode = '55000',
      message = 'Business event consumption identity is immutable.';
  end if;

  transition_allowed := case old.status
    when 'pending' then new.status in ('claimed', 'cancelled')
    when 'claimed' then new.status in ('running', 'pending', 'cancelled')
    when 'running' then new.status in ('completed', 'failed')
    when 'failed' then new.status in ('retry_waiting', 'dead_letter')
    when 'retry_waiting' then new.status in ('pending', 'cancelled')
    else false
  end;

  if not transition_allowed then
    raise exception using
      errcode = '55000',
      message = format(
        'Unsupported business event consumption transition: %s -> %s.',
        old.status,
        new.status
      );
  end if;

  if old.status = 'pending' and new.status = 'claimed' then
    if new.attempt_count <> old.attempt_count + 1 then
      raise exception using
        errcode = '23514',
        message = 'Claiming a consumption must increment attempt_count exactly once.';
    end if;
  elsif new.attempt_count <> old.attempt_count then
    raise exception using
      errcode = '23514',
      message = 'Only a pending-to-claimed transition may change attempt_count.';
  end if;

  if new.status = 'pending' then
    if num_nonnulls(
      new.next_attempt_at,
      new.locked_at,
      new.locked_by,
      new.lease_expires_at,
      new.last_error_code,
      new.last_error_message,
      new.started_at,
      new.completed_at
    ) <> 0 then
      raise exception using errcode = '23514', message = 'Pending consumption state is invalid.';
    end if;
  elsif new.status = 'claimed' then
    if num_nonnulls(new.locked_at, new.locked_by, new.lease_expires_at) <> 3
      or num_nonnulls(
        new.next_attempt_at,
        new.last_error_code,
        new.last_error_message,
        new.started_at,
        new.completed_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Claimed consumption state is invalid.';
    end if;
  elsif new.status = 'running' then
    if num_nonnulls(new.locked_at, new.locked_by, new.lease_expires_at, new.started_at) <> 4
      or num_nonnulls(
        new.next_attempt_at,
        new.last_error_code,
        new.last_error_message,
        new.completed_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Running consumption state is invalid.';
    end if;
  elsif new.status = 'completed' then
    if new.started_at is null
      or new.completed_at is null
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at,
        new.last_error_code,
        new.last_error_message
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Completed consumption state is invalid.';
    end if;
  elsif new.status = 'failed' then
    if new.started_at is null
      or new.last_error_code is null
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at,
        new.completed_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Failed consumption state is invalid.';
    end if;
  elsif new.status = 'retry_waiting' then
    if new.started_at is null
      or new.last_error_code is null
      or new.next_attempt_at is null
      or num_nonnulls(
        new.locked_at,
        new.locked_by,
        new.lease_expires_at,
        new.completed_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Retry-waiting consumption state is invalid.';
    end if;
  elsif new.status = 'dead_letter' then
    if new.started_at is null
      or new.last_error_code is null
      or new.completed_at is null
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Dead-letter consumption state is invalid.';
    end if;
  elsif new.status = 'cancelled' then
    if new.completed_at is null
      or num_nonnulls(
        new.next_attempt_at,
        new.locked_at,
        new.locked_by,
        new.lease_expires_at
      ) <> 0
    then
      raise exception using errcode = '23514', message = 'Cancelled consumption state is invalid.';
    end if;
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger business_event_consumption_write_guard
before insert or update or delete on public.business_event_consumptions
for each row
execute function public.business_event_consumption_before_write();

create or replace function public.assert_business_event_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  jwt_role text;
begin
  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    exception
      when invalid_text_representation then
        jwt_role := null;
    end;
  end if;

  if coalesce(jwt_role, session_user::text) <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Business event operations require the service role.';
  end if;
end;
$$;

create or replace function public.record_business_event(
  input_owner_scope text,
  input_customer_id uuid,
  input_event_type text,
  input_event_version smallint,
  input_occurred_at timestamptz,
  input_actor_type text,
  input_actor_id text,
  input_source_module text,
  input_source_operation text,
  input_correlation_id uuid,
  input_causation_id uuid,
  input_deduplication_key text,
  input_subject_type text,
  input_subject_uuid uuid,
  input_subject_external_id text,
  input_payload jsonb
)
returns public.business_events
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  existing_event public.business_events%rowtype;
  inserted_event public.business_events%rowtype;
  insert_attempt integer;
begin
  perform public.assert_business_event_service_role();

  for insert_attempt in 1..2 loop
    select *
    into existing_event
    from public.business_events
    where source_module = input_source_module
      and deduplication_key = input_deduplication_key
      and (
        (
          input_owner_scope = 'customer'
          and owner_scope = 'customer'
          and customer_id = input_customer_id
        )
        or (
          input_owner_scope = 'internal'
          and owner_scope = 'internal'
          and customer_id is null
        )
      )
    limit 1;

    if found then
      if existing_event.owner_scope is not distinct from input_owner_scope
        and existing_event.customer_id is not distinct from input_customer_id
        and existing_event.event_type is not distinct from input_event_type
        and existing_event.event_version is not distinct from input_event_version
        and existing_event.occurred_at is not distinct from input_occurred_at
        and existing_event.actor_type is not distinct from input_actor_type
        and existing_event.actor_id is not distinct from input_actor_id
        and existing_event.source_module is not distinct from input_source_module
        and existing_event.source_operation is not distinct from input_source_operation
        and existing_event.correlation_id is not distinct from input_correlation_id
        and existing_event.causation_id is not distinct from input_causation_id
        and existing_event.deduplication_key is not distinct from input_deduplication_key
        and existing_event.subject_type is not distinct from input_subject_type
        and existing_event.subject_uuid is not distinct from input_subject_uuid
        and existing_event.subject_external_id is not distinct from input_subject_external_id
        and existing_event.payload is not distinct from input_payload
      then
        return existing_event;
      end if;

      raise exception using
        errcode = '23505',
        constraint = case
          when input_owner_scope = 'customer'
            then 'business_events_customer_deduplication_key'
          else 'business_events_internal_deduplication_key'
        end,
        message = 'Business event deduplication conflict: immutable input differs.';
    end if;

    begin
      insert into public.business_events (
        owner_scope,
        customer_id,
        event_type,
        event_version,
        occurred_at,
        actor_type,
        actor_id,
        source_module,
        source_operation,
        correlation_id,
        causation_id,
        deduplication_key,
        subject_type,
        subject_uuid,
        subject_external_id,
        payload
      ) values (
        input_owner_scope,
        input_customer_id,
        input_event_type,
        input_event_version,
        input_occurred_at,
        input_actor_type,
        input_actor_id,
        input_source_module,
        input_source_operation,
        input_correlation_id,
        input_causation_id,
        input_deduplication_key,
        input_subject_type,
        input_subject_uuid,
        input_subject_external_id,
        input_payload
      )
      returning * into inserted_event;
      return inserted_event;
    exception
      when unique_violation then
        if insert_attempt = 2 then
          raise;
        end if;
    end;
  end loop;

  raise exception using
    errcode = '40001',
    message = 'Business event insert could not be reconciled after a concurrent insert.';
end;
$$;

create or replace function public.create_business_event_consumption(
  input_business_event_id uuid,
  input_consumer_name text,
  input_consumer_version smallint
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();

  insert into public.business_event_consumptions (
    business_event_id,
    consumer_name,
    consumer_version
  ) values (
    input_business_event_id,
    input_consumer_name,
    input_consumer_version
  )
  on conflict (business_event_id, consumer_name, consumer_version)
  do nothing
  returning * into consumption_record;

  if consumption_record.id is null then
    select * into consumption_record
    from public.business_event_consumptions
    where business_event_id = input_business_event_id
      and consumer_name = input_consumer_name
      and consumer_version = input_consumer_version;
  end if;

  return consumption_record;
end;
$$;

create or replace function public.claim_business_event_consumption(
  input_consumption_id uuid,
  input_worker_id text,
  input_lease_seconds integer default 60
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  if char_length(btrim(input_worker_id)) not between 1 and 160
    or input_lease_seconds not between 5 and 3600
  then
    raise exception using errcode = '22023', message = 'Invalid consumption claim parameters.';
  end if;

  update public.business_event_consumptions
  set status = 'claimed',
      attempt_count = attempt_count + 1,
      locked_at = clock_timestamp(),
      locked_by = input_worker_id,
      lease_expires_at = clock_timestamp() + make_interval(secs => input_lease_seconds),
      next_attempt_at = null,
      last_error_code = null,
      last_error_message = null,
      started_at = null,
      completed_at = null
  where id = input_consumption_id
    and status = 'pending'
  returning * into consumption_record;

  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption is not available for claim.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.mark_business_event_consumption_running(
  input_consumption_id uuid,
  input_worker_id text
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'running', started_at = clock_timestamp()
  where id = input_consumption_id
    and status = 'claimed'
    and locked_by = input_worker_id
    and lease_expires_at > clock_timestamp()
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption claim is invalid or expired.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.mark_business_event_consumption_completed(
  input_consumption_id uuid,
  input_worker_id text
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'completed',
      completed_at = clock_timestamp(),
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = input_consumption_id
    and status = 'running'
    and locked_by = input_worker_id
    and lease_expires_at > clock_timestamp()
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Running consumption is not completable by this worker.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.mark_business_event_consumption_failed(
  input_consumption_id uuid,
  input_worker_id text,
  input_error_code text,
  input_error_message text default null
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'failed',
      last_error_code = input_error_code,
      last_error_message = left(input_error_message, 2000),
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = input_consumption_id
    and status = 'running'
    and locked_by = input_worker_id
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Running consumption is not fail-able by this worker.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.schedule_business_event_consumption_retry(
  input_consumption_id uuid,
  input_next_attempt_at timestamptz
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  if input_next_attempt_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'Retry time must be in the future.';
  end if;
  update public.business_event_consumptions
  set status = 'retry_waiting', next_attempt_at = input_next_attempt_at
  where id = input_consumption_id and status = 'failed'
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Only failed consumptions may be scheduled for retry.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.release_business_event_consumption_retry(
  input_consumption_id uuid
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'pending',
      next_attempt_at = null,
      last_error_code = null,
      last_error_message = null,
      started_at = null
  where id = input_consumption_id
    and status = 'retry_waiting'
    and next_attempt_at <= clock_timestamp()
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption retry is not due.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.mark_business_event_consumption_dead_letter(
  input_consumption_id uuid
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'dead_letter', completed_at = clock_timestamp()
  where id = input_consumption_id and status = 'failed'
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Only failed consumptions may enter dead letter.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.cancel_business_event_consumption(
  input_consumption_id uuid,
  input_worker_id text default null
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'cancelled',
      completed_at = clock_timestamp(),
      next_attempt_at = null,
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = input_consumption_id
    and status in ('pending', 'retry_waiting', 'claimed')
    and (status <> 'claimed' or locked_by = input_worker_id)
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption cannot be cancelled in its current state.';
  end if;
  return consumption_record;
end;
$$;

create or replace function public.recover_expired_business_event_consumption_claim(
  input_consumption_id uuid
)
returns public.business_event_consumptions
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  consumption_record public.business_event_consumptions%rowtype;
begin
  perform public.assert_business_event_service_role();
  update public.business_event_consumptions
  set status = 'pending',
      locked_at = null,
      locked_by = null,
      lease_expires_at = null
  where id = input_consumption_id
    and status = 'claimed'
    and lease_expires_at <= clock_timestamp()
  returning * into consumption_record;
  if consumption_record.id is null then
    raise exception using errcode = '55000', message = 'Consumption claim is not expired or recoverable.';
  end if;
  return consumption_record;
end;
$$;

alter table public.business_event_contracts enable row level security;
alter table public.business_events enable row level security;
alter table public.business_event_consumptions enable row level security;

create policy business_event_contracts_service_read
on public.business_event_contracts
for select
to service_role
using (true);

create policy business_events_service_read
on public.business_events
for select
to service_role
using (true);

create policy business_event_consumptions_service_read
on public.business_event_consumptions
for select
to service_role
using (true);

revoke all on table public.business_event_contracts from public, anon, authenticated, service_role;
revoke all on table public.business_events from public, anon, authenticated, service_role;
revoke all on table public.business_event_consumptions from public, anon, authenticated, service_role;

grant select on table public.business_event_contracts to service_role;
grant select on table public.business_events to service_role;
grant select on table public.business_event_consumptions to service_role;

revoke all on function public.business_event_contract_before_write() from public, anon, authenticated, service_role;
revoke all on function public.validate_business_event_foundation_test_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.dispatch_business_event_payload_validation(text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.business_event_before_insert() from public, anon, authenticated, service_role;
revoke all on function public.prevent_business_event_mutation() from public, anon, authenticated, service_role;
revoke all on function public.business_event_consumption_before_write() from public, anon, authenticated, service_role;
revoke all on function public.assert_business_event_service_role() from public, anon, authenticated, service_role;

revoke all on function public.record_business_event(
  text, uuid, text, smallint, timestamptz, text, text, text, text,
  uuid, uuid, text, text, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_business_event(
  text, uuid, text, smallint, timestamptz, text, text, text, text,
  uuid, uuid, text, text, uuid, text, jsonb
) to service_role;

revoke all on function public.create_business_event_consumption(uuid, text, smallint) from public, anon, authenticated, service_role;
grant execute on function public.create_business_event_consumption(uuid, text, smallint) to service_role;

revoke all on function public.claim_business_event_consumption(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_business_event_consumption(uuid, text, integer) to service_role;

revoke all on function public.mark_business_event_consumption_running(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.mark_business_event_consumption_running(uuid, text) to service_role;

revoke all on function public.mark_business_event_consumption_completed(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.mark_business_event_consumption_completed(uuid, text) to service_role;

revoke all on function public.mark_business_event_consumption_failed(uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.mark_business_event_consumption_failed(uuid, text, text, text) to service_role;

revoke all on function public.schedule_business_event_consumption_retry(uuid, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.schedule_business_event_consumption_retry(uuid, timestamptz) to service_role;

revoke all on function public.release_business_event_consumption_retry(uuid) from public, anon, authenticated, service_role;
grant execute on function public.release_business_event_consumption_retry(uuid) to service_role;

revoke all on function public.mark_business_event_consumption_dead_letter(uuid) from public, anon, authenticated, service_role;
grant execute on function public.mark_business_event_consumption_dead_letter(uuid) to service_role;

revoke all on function public.cancel_business_event_consumption(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.cancel_business_event_consumption(uuid, text) to service_role;

revoke all on function public.recover_expired_business_event_consumption_claim(uuid) from public, anon, authenticated, service_role;
grant execute on function public.recover_expired_business_event_consumption_claim(uuid) to service_role;

commit;
