begin;

create table public.asset_ingest_operations (
  operation_id uuid primary key default gen_random_uuid(),
  owner_scope text not null,
  customer_id uuid references public.customers(id) on delete restrict,
  reserved_asset_id uuid not null unique,
  idempotency_key text not null,
  input_fingerprint text not null,
  status text not null default 'reserved',
  row_version bigint not null default 1,

  ingest_purpose text not null,
  source_type text not null,
  source_file_id uuid references public.files(id) on delete restrict,
  source_bucket text,
  source_object_path text,
  source_object_version text,
  original_filename text not null,
  safe_filename text not null,
  expected_checksum text,

  quarantine_bucket text,
  quarantine_object_path text,
  quarantine_object_version text,
  target_bucket text not null default 'immutable-media-assets',
  target_object_path text,
  target_object_version text,
  path_scheme_version smallint not null default 1,

  byte_checksum text,
  detected_mime_type text,
  size_bytes bigint,
  width_px integer,
  height_px integer,
  duration_ms bigint,
  validation_fingerprint text,

  lease_worker_id text,
  lease_token uuid,
  lease_acquired_at timestamptz,
  lease_expires_at timestamptz,
  lease_heartbeat_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts smallint not null default 8,
  next_attempt_at timestamptz not null default now(),

  last_error_code text,
  last_error_message text,
  last_error_at timestamptz,
  failure_disposition text,

  registered_media_asset_id uuid references public.media_assets(id) on delete restrict,
  cleanup_state text not null default 'not_required',
  cleanup_eligible_at timestamptz,
  cleanup_authorized_at timestamptz,
  cleanup_authorized_by text,
  cleanup_completed_at timestamptz,
  cleanup_attempt_count integer not null default 0,

  created_by_type text not null,
  created_by_id text,
  source_module text not null,
  source_operation text,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  bytes_received_at timestamptz,
  validated_at timestamptz,
  storage_uploaded_at timestamptz,
  registered_at timestamptz,
  deduplicated_at timestamptz,
  failed_at timestamptz,
  completed_at timestamptz,

  constraint asset_ingest_operations_owner_scope_check check (owner_scope in ('customer','internal')),
  constraint asset_ingest_operations_owner_customer_check check (
    (owner_scope = 'customer' and customer_id is not null)
    or (owner_scope = 'internal' and customer_id is null)
  ),
  constraint asset_ingest_operations_idempotency_check check (char_length(btrim(idempotency_key)) between 1 and 240),
  constraint asset_ingest_operations_fingerprint_check check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint asset_ingest_operations_status_check check (
    status in ('reserved','bytes_received','validated','uploaded','registered','deduplicated','cleanup_pending','failed')
  ),
  constraint asset_ingest_operations_row_version_check check (row_version > 0),
  constraint asset_ingest_operations_purpose_check check (
    char_length(ingest_purpose) between 1 and 80 and ingest_purpose ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint asset_ingest_operations_source_type_check check (
    source_type in ('direct_upload','quarantine_object','source_file','server_import')
  ),
  constraint asset_ingest_operations_source_shape_check check (
    (source_type = 'source_file' and source_file_id is not null and source_bucket is null and source_object_path is null)
    or (source_type in ('quarantine_object','server_import') and source_file_id is null and source_bucket is not null and source_object_path is not null)
    or (source_type = 'direct_upload' and source_file_id is null and source_bucket is null and source_object_path is null)
  ),
  constraint asset_ingest_operations_source_bucket_check check (
    source_bucket is null or (char_length(source_bucket) between 1 and 120 and source_bucket ~ '^[a-z0-9][a-z0-9._-]*$')
  ),
  constraint asset_ingest_operations_source_path_check check (
    source_object_path is null or (
      char_length(source_object_path) between 1 and 1024
      and source_object_path = btrim(source_object_path)
      and source_object_path !~ '(^/|//|(^|/)\.\.(/|$)|[[:cntrl:]])'
    )
  ),
  constraint asset_ingest_operations_source_version_check check (
    source_object_version is null or (
      char_length(source_object_version) between 1 and 255 and source_object_version = btrim(source_object_version)
      and source_object_version !~ '[[:cntrl:]]'
    )
  ),
  constraint asset_ingest_operations_original_filename_check check (char_length(btrim(original_filename)) between 1 and 255),
  constraint asset_ingest_operations_safe_filename_check check (
    char_length(safe_filename) between 5 and 96
    and safe_filename ~ '^[a-z0-9][a-z0-9-]{0,79}\.(jpg|png|webp|mp4)$'
  ),
  constraint asset_ingest_operations_expected_checksum_check check (
    expected_checksum is null or expected_checksum ~ '^[0-9a-f]{64}$'
  ),
  constraint asset_ingest_operations_target_bucket_check check (target_bucket = 'immutable-media-assets'),
  constraint asset_ingest_operations_path_scheme_check check (path_scheme_version = 1),
  constraint asset_ingest_operations_quarantine_shape_check check (
    (quarantine_bucket is null and quarantine_object_path is null and quarantine_object_version is null)
    or (quarantine_bucket is not null and quarantine_object_path is not null)
  ),
  constraint asset_ingest_operations_quarantine_bucket_check check (
    quarantine_bucket is null or (char_length(quarantine_bucket) between 1 and 120 and quarantine_bucket ~ '^[a-z0-9][a-z0-9._-]*$')
  ),
  constraint asset_ingest_operations_quarantine_path_check check (
    quarantine_object_path is null or (
      char_length(quarantine_object_path) between 1 and 1024
      and quarantine_object_path = btrim(quarantine_object_path)
      and quarantine_object_path !~ '(^/|//|(^|/)\.\.(/|$)|[[:cntrl:]])'
    )
  ),
  constraint asset_ingest_operations_quarantine_version_check check (
    quarantine_object_version is null or (
      char_length(quarantine_object_version) between 1 and 255 and quarantine_object_version = btrim(quarantine_object_version)
      and quarantine_object_version !~ '[[:cntrl:]]'
    )
  ),
  constraint asset_ingest_operations_target_path_check check (
    target_object_path is null or (
      char_length(target_object_path) between 1 and 512
      and target_object_path = btrim(target_object_path)
      and target_object_path !~ '(^/|//|(^|/)\.\.(/|$)|[[:cntrl:]])'
    )
  ),
  constraint asset_ingest_operations_target_version_check check (
    target_object_version is null or (
      char_length(target_object_version) between 1 and 255 and target_object_version = btrim(target_object_version)
      and target_object_version !~ '[[:cntrl:]]'
    )
  ),
  constraint asset_ingest_operations_checksum_check check (byte_checksum is null or byte_checksum ~ '^[0-9a-f]{64}$'),
  constraint asset_ingest_operations_mime_check check (
    detected_mime_type is null or detected_mime_type in ('image/jpeg','image/png','image/webp','video/mp4')
  ),
  constraint asset_ingest_operations_metadata_shape_check check (
    (byte_checksum is null and detected_mime_type is null and size_bytes is null and width_px is null
      and height_px is null and duration_ms is null and validation_fingerprint is null)
    or (byte_checksum is not null and detected_mime_type is not null and size_bytes between 1 and 536870912
      and width_px > 0 and height_px > 0 and validation_fingerprint ~ '^[0-9a-f]{64}$'
      and ((detected_mime_type like 'image/%' and duration_ms is null)
        or (detected_mime_type = 'video/mp4' and duration_ms > 0)))
  ),
  constraint asset_ingest_operations_lease_shape_check check (
    (lease_worker_id is null and lease_token is null and lease_acquired_at is null
      and lease_expires_at is null and lease_heartbeat_at is null)
    or (lease_worker_id is not null and lease_token is not null and lease_acquired_at is not null
      and lease_expires_at > lease_acquired_at and lease_heartbeat_at is not null)
  ),
  constraint asset_ingest_operations_attempts_check check (
    attempt_count between 0 and max_attempts and max_attempts between 1 and 25
  ),
  constraint asset_ingest_operations_terminal_lease_check check (
    status not in ('registered','deduplicated','failed') or lease_token is null
  ),
  constraint asset_ingest_operations_error_shape_check check (
    (last_error_code is null and last_error_message is null and last_error_at is null and failure_disposition is null)
    or (last_error_code ~ '^[a-z][a-z0-9_.-]{1,79}$' and last_error_at is not null
      and (last_error_message is null or char_length(last_error_message) between 1 and 1000)
      and failure_disposition in ('retryable','permanent','manual_review'))
  ),
  constraint asset_ingest_operations_cleanup_state_check check (
    cleanup_state in ('not_required','candidate','authorized','deleted','blocked','manual_review')
  ),
  constraint asset_ingest_operations_cleanup_shape_check check (
    (cleanup_state = 'not_required' and cleanup_eligible_at is null and cleanup_authorized_at is null
      and cleanup_authorized_by is null and cleanup_completed_at is null)
    or (cleanup_state = 'candidate' and cleanup_eligible_at is not null and cleanup_authorized_at is null
      and cleanup_authorized_by is null and cleanup_completed_at is null)
    or (cleanup_state = 'authorized' and cleanup_eligible_at is not null and cleanup_authorized_at is not null
      and cleanup_authorized_by is not null and cleanup_completed_at is null)
    or (cleanup_state in ('deleted','blocked','manual_review') and cleanup_eligible_at is not null
      and cleanup_completed_at is not null)
  ),
  constraint asset_ingest_operations_result_shape_check check (
    (status = 'registered' and registered_media_asset_id = reserved_asset_id and registered_at is not null
      and deduplicated_at is null and failed_at is null and completed_at is not null and cleanup_state = 'not_required')
    or (status = 'deduplicated' and registered_media_asset_id is not null
      and registered_media_asset_id <> reserved_asset_id and deduplicated_at is not null
      and registered_at is null and failed_at is null and completed_at is not null
      and cleanup_state in ('not_required','deleted'))
    or (status = 'cleanup_pending' and (registered_media_asset_id is null or registered_media_asset_id <> reserved_asset_id)
      and registered_at is null
      and deduplicated_at is null and failed_at is null and completed_at is null
      and cleanup_state in ('candidate','authorized','deleted','blocked','manual_review'))
    or (status = 'failed' and registered_at is null and deduplicated_at is null
      and failed_at is not null and completed_at is not null and failure_disposition in ('permanent','manual_review'))
    or (status in ('reserved','bytes_received','validated','uploaded') and registered_media_asset_id is null
      and registered_at is null and deduplicated_at is null and failed_at is null and completed_at is null
      and cleanup_state = 'not_required')
  ),
  constraint asset_ingest_operations_progress_shape_check check (
    (status = 'reserved')
    or (status = 'bytes_received' and bytes_received_at is not null)
    or (status = 'validated' and bytes_received_at is not null and validated_at is not null and byte_checksum is not null and target_object_path is not null)
    or (status = 'uploaded' and bytes_received_at is not null and validated_at is not null and storage_uploaded_at is not null and target_object_path is not null)
    or (status in ('registered','cleanup_pending') and storage_uploaded_at is not null and target_object_path is not null)
    or (status = 'deduplicated' and validated_at is not null)
    or (status = 'failed')
  ),
  constraint asset_ingest_operations_actor_type_check check (
    char_length(created_by_type) between 1 and 60 and created_by_type ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint asset_ingest_operations_actor_id_check check (
    created_by_id is null or char_length(btrim(created_by_id)) between 1 and 255
  ),
  constraint asset_ingest_operations_source_module_check check (
    char_length(source_module) between 1 and 80 and source_module ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint asset_ingest_operations_source_operation_check check (
    source_operation is null or (char_length(source_operation) between 1 and 120 and source_operation ~ '^[a-zA-Z0-9_.:-]+$')
  )
);

alter table public.asset_ingest_operations owner to postgres;

create table public.asset_ingest_operation_events (
  event_id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references public.asset_ingest_operations(operation_id) on delete restrict,
  event_type text not null,
  previous_status text,
  new_status text,
  worker_id text,
  attempt_count integer not null,
  reason_code text,
  actor_type text not null,
  actor_id text,
  source_module text not null,
  event_context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),

  constraint asset_ingest_operation_events_type_check check (
    event_type in ('reserved','claimed','lease_renewed','lease_released','lease_expired','bytes_received',
      'validated','uploaded','registration_succeeded','deduplicated','cleanup_candidate',
      'cleanup_authorized','cleanup_result','retry_scheduled','failed','manual_review')
  ),
  constraint asset_ingest_operation_events_status_check check (
    (previous_status is null or previous_status in ('reserved','bytes_received','validated','uploaded','registered','deduplicated','cleanup_pending','failed'))
    and (new_status is null or new_status in ('reserved','bytes_received','validated','uploaded','registered','deduplicated','cleanup_pending','failed'))
  ),
  constraint asset_ingest_operation_events_attempt_check check (attempt_count between 0 and 25),
  constraint asset_ingest_operation_events_reason_check check (
    reason_code is null or reason_code ~ '^[a-z][a-z0-9_.-]{1,79}$'
  ),
  constraint asset_ingest_operation_events_actor_check check (
    char_length(actor_type) between 1 and 60 and actor_type ~ '^[a-z][a-z0-9_]*$'
    and (actor_id is null or char_length(btrim(actor_id)) between 1 and 255)
  ),
  constraint asset_ingest_operation_events_source_check check (
    char_length(source_module) between 1 and 80 and source_module ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint asset_ingest_operation_events_context_check check (
    jsonb_typeof(event_context) = 'object'
    and octet_length(convert_to(event_context::text,'UTF8')) <= 4096
  )
);

alter table public.asset_ingest_operation_events owner to postgres;

create unique index asset_ingest_operations_customer_idempotency
  on public.asset_ingest_operations(customer_id,idempotency_key) where owner_scope = 'customer';
create unique index asset_ingest_operations_internal_idempotency
  on public.asset_ingest_operations(idempotency_key) where owner_scope = 'internal';
create unique index asset_ingest_operations_target_identity
  on public.asset_ingest_operations(target_bucket,target_object_path) where target_object_path is not null;
create index asset_ingest_operations_work_queue
  on public.asset_ingest_operations(next_attempt_at,created_at,operation_id)
  where status not in ('registered','deduplicated','failed');
create index asset_ingest_operations_expired_lease
  on public.asset_ingest_operations(lease_expires_at)
  where lease_token is not null and status not in ('registered','deduplicated','failed');
create index asset_ingest_operations_cleanup_queue
  on public.asset_ingest_operations(cleanup_eligible_at,operation_id)
  where status = 'cleanup_pending' and cleanup_state = 'candidate';
create index asset_ingest_operations_registered_asset
  on public.asset_ingest_operations(registered_media_asset_id) where registered_media_asset_id is not null;
create index asset_ingest_operations_source_file
  on public.asset_ingest_operations(source_file_id) where source_file_id is not null;
create index asset_ingest_operation_events_operation_time
  on public.asset_ingest_operation_events(operation_id,occurred_at,event_id);
create index asset_ingest_operation_events_type_time
  on public.asset_ingest_operation_events(event_type,occurred_at);

create or replace function public.assert_asset_ingest_service_role()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare jwt_role text;
begin
  jwt_role := nullif(current_setting('request.jwt.claim.role',true),'');
  if jwt_role is null then
    begin
      jwt_role := nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role';
    exception when invalid_text_representation then jwt_role := null;
    end;
  end if;
  if coalesce(jwt_role,session_user::text) <> 'service_role' then
    raise exception using errcode = '42501', message = 'Asset ingest operations require the service role.';
  end if;
end;
$$;

create or replace function public.asset_ingest_input_fingerprint_v1(
  input_reserved_asset_id uuid,input_owner_scope text,input_customer_id uuid,input_ingest_purpose text,
  input_source_type text,input_source_file_id uuid,input_source_bucket text,input_source_object_path text,
  input_source_object_version text,input_original_filename text,input_safe_filename text,input_expected_checksum text,
  input_target_bucket text,input_path_scheme_version smallint,input_created_by_type text,input_created_by_id text,
  input_source_module text,input_source_operation text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'reservedAssetId',input_reserved_asset_id,'ownerScope',input_owner_scope,'customerId',input_customer_id,
    'ingestPurpose',input_ingest_purpose,'sourceType',input_source_type,'sourceFileId',input_source_file_id,
    'sourceBucket',input_source_bucket,'sourceObjectPath',input_source_object_path,
    'sourceObjectVersion',input_source_object_version,'originalFilename',input_original_filename,
    'safeFilename',input_safe_filename,'expectedChecksum',input_expected_checksum,'targetBucket',input_target_bucket,
    'pathSchemeVersion',input_path_scheme_version,'createdByType',input_created_by_type,
    'createdById',input_created_by_id,'sourceModule',input_source_module,'sourceOperation',input_source_operation
  )::text,'UTF8'),'sha256'),'hex')
$$;

create or replace function public.asset_ingest_validation_fingerprint_v1(
  input_reserved_asset_id uuid,input_byte_checksum text,input_detected_mime_type text,input_size_bytes bigint,
  input_width_px integer,input_height_px integer,input_duration_ms bigint,input_target_bucket text,
  input_target_object_path text,input_path_scheme_version smallint
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'reservedAssetId',input_reserved_asset_id,'byteChecksum',input_byte_checksum,
    'detectedMimeType',input_detected_mime_type,'sizeBytes',input_size_bytes,'widthPx',input_width_px,
    'heightPx',input_height_px,'durationMs',input_duration_ms,'targetBucket',input_target_bucket,
    'targetObjectPath',input_target_object_path,'pathSchemeVersion',input_path_scheme_version
  )::text,'UTF8'),'sha256'),'hex')
$$;

create or replace function public.append_asset_ingest_operation_event(
  input_operation_id uuid,input_event_type text,input_previous_status text,input_new_status text,
  input_worker_id text,input_attempt_count integer,input_reason_code text,input_actor_type text,
  input_actor_id text,input_source_module text,input_event_context jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if jsonb_typeof(input_event_context) is distinct from 'object'
    or octet_length(convert_to(input_event_context::text,'UTF8')) > 4096 then
    raise exception using errcode = '22023', message = 'Asset ingest audit context is invalid or too large.';
  end if;
  insert into public.asset_ingest_operation_events(
    operation_id,event_type,previous_status,new_status,worker_id,attempt_count,reason_code,
    actor_type,actor_id,source_module,event_context
  ) values (
    input_operation_id,input_event_type,input_previous_status,input_new_status,input_worker_id,input_attempt_count,
    input_reason_code,input_actor_type,input_actor_id,input_source_module,input_event_context
  );
end;
$$;

create or replace function public.asset_ingest_operation_before_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare action_name text := current_setting('app.asset_ingest_action',true);
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'Asset ingest operations cannot be deleted.';
  end if;
  if action_name is null or action_name not in (
    'claim','renew','release','retry','recover','bytes_received','validated','uploaded','registered',
    'deduplicated','cleanup_pending','cleanup_authorized','cleanup_result','failed'
  ) then
    raise exception using errcode = '42501', message = 'Asset ingest operations may only change through bounded transition functions.';
  end if;
  if old.operation_id is distinct from new.operation_id or old.owner_scope is distinct from new.owner_scope
    or old.customer_id is distinct from new.customer_id or old.reserved_asset_id is distinct from new.reserved_asset_id
    or old.idempotency_key is distinct from new.idempotency_key or old.input_fingerprint is distinct from new.input_fingerprint
    or old.ingest_purpose is distinct from new.ingest_purpose or old.source_type is distinct from new.source_type
    or old.source_file_id is distinct from new.source_file_id or old.source_bucket is distinct from new.source_bucket
    or old.source_object_path is distinct from new.source_object_path or old.source_object_version is distinct from new.source_object_version
    or old.original_filename is distinct from new.original_filename or old.safe_filename is distinct from new.safe_filename
    or old.expected_checksum is distinct from new.expected_checksum or old.target_bucket is distinct from new.target_bucket
    or old.path_scheme_version is distinct from new.path_scheme_version or old.created_by_type is distinct from new.created_by_type
    or old.created_by_id is distinct from new.created_by_id or old.source_module is distinct from new.source_module
    or old.source_operation is distinct from new.source_operation or old.correlation_id is distinct from new.correlation_id
    or old.created_at is distinct from new.created_at or old.max_attempts is distinct from new.max_attempts then
    raise exception using errcode = '55000', message = 'Asset ingest operation identity and initial input are immutable.';
  end if;
  if (old.quarantine_bucket is not null and old.quarantine_bucket is distinct from new.quarantine_bucket)
    or (old.quarantine_object_path is not null and old.quarantine_object_path is distinct from new.quarantine_object_path)
    or (old.quarantine_object_version is not null and old.quarantine_object_version is distinct from new.quarantine_object_version)
    or (old.byte_checksum is not null and old.byte_checksum is distinct from new.byte_checksum)
    or (old.detected_mime_type is not null and old.detected_mime_type is distinct from new.detected_mime_type)
    or (old.size_bytes is not null and old.size_bytes is distinct from new.size_bytes)
    or (old.width_px is not null and old.width_px is distinct from new.width_px)
    or (old.height_px is not null and old.height_px is distinct from new.height_px)
    or (old.duration_ms is not null and old.duration_ms is distinct from new.duration_ms)
    or (old.validation_fingerprint is not null and old.validation_fingerprint is distinct from new.validation_fingerprint)
    or (old.target_object_path is not null and old.target_object_path is distinct from new.target_object_path)
    or (old.target_object_version is not null and old.target_object_version is distinct from new.target_object_version)
    or (old.registered_media_asset_id is not null and old.registered_media_asset_id is distinct from new.registered_media_asset_id) then
    raise exception using errcode = '55000', message = 'Asset ingest derived identity and validation fields are write-once.';
  end if;
  if new.row_version <> old.row_version + 1 then
    raise exception using errcode = '40001', message = 'Asset ingest row version must advance exactly once.';
  end if;
  if old.status is distinct from new.status and not (
    (old.status = 'reserved' and new.status in ('bytes_received','failed'))
    or (old.status = 'bytes_received' and new.status in ('validated','failed'))
    or (old.status = 'validated' and new.status in ('uploaded','deduplicated','failed'))
    or (old.status = 'uploaded' and new.status in ('registered','cleanup_pending','failed'))
    or (old.status = 'cleanup_pending' and new.status in ('registered','deduplicated','failed'))
  ) then
    raise exception using errcode = '55000', message = 'Unsupported asset ingest status transition.';
  end if;
  if old.status in ('registered','deduplicated','failed') then
    raise exception using errcode = '55000', message = 'Terminal asset ingest operations are immutable.';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create or replace function public.prevent_asset_ingest_event_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  raise exception using errcode = '55000', message = 'Asset ingest operation events are append-only.';
end;
$$;

create trigger asset_ingest_operations_write_guard
before update or delete on public.asset_ingest_operations
for each row execute function public.asset_ingest_operation_before_write();

create trigger asset_ingest_operation_events_append_only
before update or delete on public.asset_ingest_operation_events
for each row execute function public.prevent_asset_ingest_event_mutation();

create or replace function public.reserve_asset_ingest_operation(
  input_owner_scope text,input_customer_id uuid,input_idempotency_key text,input_ingest_purpose text,
  input_source_type text,input_source_file_id uuid,input_source_bucket text,input_source_object_path text,
  input_source_object_version text,input_original_filename text,input_safe_filename text,input_expected_checksum text,
  input_target_bucket text,input_path_scheme_version smallint,input_created_by_type text,input_created_by_id text,
  input_source_module text,input_source_operation text,input_correlation_id uuid,input_max_attempts smallint
)
returns public.asset_ingest_operations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  scope_value text := lower(btrim(input_owner_scope));
  key_value text := btrim(input_idempotency_key);
  purpose_value text := lower(btrim(input_ingest_purpose));
  source_type_value text := lower(btrim(input_source_type));
  source_bucket_value text := nullif(btrim(input_source_bucket),'');
  source_path_value text := nullif(btrim(input_source_object_path),'');
  source_version_value text := nullif(btrim(input_source_object_version),'');
  original_name_value text := btrim(input_original_filename);
  safe_name_value text := lower(btrim(input_safe_filename));
  expected_checksum_value text := nullif(lower(btrim(input_expected_checksum)),'');
  target_bucket_value text := lower(btrim(input_target_bucket));
  actor_type_value text := lower(btrim(input_created_by_type));
  actor_id_value text := nullif(btrim(input_created_by_id),'');
  source_module_value text := lower(btrim(input_source_module));
  source_operation_value text := nullif(btrim(input_source_operation),'');
  result_record public.asset_ingest_operations%rowtype;
  source_file_record public.files%rowtype;
  new_operation_id uuid;
  new_reserved_asset_id uuid;
  computed_fingerprint text;
begin
  perform public.assert_asset_ingest_service_role();
  if scope_value not in ('customer','internal')
    or (scope_value = 'customer' and input_customer_id is null)
    or (scope_value = 'internal' and input_customer_id is not null) then
    raise exception using errcode = '23514', message = 'Asset ingest ownership is invalid.';
  end if;
  if char_length(key_value) not between 1 and 240 or purpose_value !~ '^[a-z][a-z0-9_]{0,79}$'
    or source_type_value not in ('direct_upload','quarantine_object','source_file','server_import')
    or char_length(original_name_value) not between 1 and 255
    or safe_name_value !~ '^[a-z0-9][a-z0-9-]{0,79}\.(jpg|png|webp|mp4)$'
    or target_bucket_value <> 'immutable-media-assets' or input_path_scheme_version <> 1
    or actor_type_value !~ '^[a-z][a-z0-9_]{0,59}$'
    or source_module_value !~ '^[a-z][a-z0-9_]{0,79}$'
    or input_max_attempts not between 1 and 25
    or (expected_checksum_value is not null and expected_checksum_value !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = '22023', message = 'Asset ingest reservation input is invalid.';
  end if;
  if not (
    (source_type_value = 'source_file' and input_source_file_id is not null and source_bucket_value is null and source_path_value is null)
    or (source_type_value in ('quarantine_object','server_import') and input_source_file_id is null and source_bucket_value is not null and source_path_value is not null)
    or (source_type_value = 'direct_upload' and input_source_file_id is null and source_bucket_value is null and source_path_value is null)
  ) then
    raise exception using errcode = '23514', message = 'Asset ingest source identity is invalid.';
  end if;
  if input_source_file_id is not null then
    select * into source_file_record from public.files where id = input_source_file_id;
    if not found then raise exception using errcode = '23503', message = 'Asset ingest source file does not exist.'; end if;
    if scope_value <> 'customer' or source_file_record.customer_id is distinct from input_customer_id
      or source_file_record.status in ('rejected','replaced','archived') then
      raise exception using errcode = '23514', message = 'Asset ingest source file belongs to another ownership scope.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    scope_value || ':' || coalesce(input_customer_id::text,'internal') || ':' || key_value,0
  ));

  select * into result_record from public.asset_ingest_operations
  where idempotency_key = key_value and (
    (scope_value = 'customer' and owner_scope = 'customer' and customer_id = input_customer_id)
    or (scope_value = 'internal' and owner_scope = 'internal' and customer_id is null)
  ) limit 1;

  if found then
    computed_fingerprint := public.asset_ingest_input_fingerprint_v1(
      result_record.reserved_asset_id,scope_value,input_customer_id,purpose_value,source_type_value,
      input_source_file_id,source_bucket_value,source_path_value,source_version_value,original_name_value,
      safe_name_value,expected_checksum_value,target_bucket_value,input_path_scheme_version,actor_type_value,
      actor_id_value,source_module_value,source_operation_value
    );
    if result_record.input_fingerprint = computed_fingerprint then return result_record; end if;
    raise exception using errcode = '23505', message = 'Asset ingest idempotency conflict: immutable input differs.';
  end if;

  new_operation_id := gen_random_uuid();
  new_reserved_asset_id := gen_random_uuid();
  computed_fingerprint := public.asset_ingest_input_fingerprint_v1(
    new_reserved_asset_id,scope_value,input_customer_id,purpose_value,source_type_value,input_source_file_id,
    source_bucket_value,source_path_value,source_version_value,original_name_value,safe_name_value,
    expected_checksum_value,target_bucket_value,input_path_scheme_version,actor_type_value,actor_id_value,
    source_module_value,source_operation_value
  );
  insert into public.asset_ingest_operations(
    operation_id,owner_scope,customer_id,reserved_asset_id,idempotency_key,input_fingerprint,status,
    ingest_purpose,source_type,source_file_id,source_bucket,source_object_path,source_object_version,
    original_filename,safe_filename,expected_checksum,target_bucket,path_scheme_version,max_attempts,
    created_by_type,created_by_id,source_module,source_operation,correlation_id
  ) values (
    new_operation_id,scope_value,input_customer_id,new_reserved_asset_id,key_value,computed_fingerprint,'reserved',
    purpose_value,source_type_value,input_source_file_id,source_bucket_value,source_path_value,source_version_value,
    original_name_value,safe_name_value,expected_checksum_value,target_bucket_value,input_path_scheme_version,
    input_max_attempts,actor_type_value,actor_id_value,source_module_value,source_operation_value,input_correlation_id
  ) returning * into result_record;
  perform public.append_asset_ingest_operation_event(
    result_record.operation_id,'reserved',null,'reserved',null,0,null,actor_type_value,actor_id_value,
    source_module_value,jsonb_build_object('reservedAssetId',result_record.reserved_asset_id)
  );
  return result_record;
end;
$$;

create or replace function public.claim_next_asset_ingest_operation(
  input_worker_id text,input_lease_seconds integer
)
returns public.asset_ingest_operations
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare result_record public.asset_ingest_operations%rowtype; previous_worker text; lease_value uuid;
begin
  perform public.assert_asset_ingest_service_role();
  if btrim(input_worker_id) = '' or char_length(btrim(input_worker_id)) > 120 or input_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'Asset ingest claim input is invalid.';
  end if;
  select * into result_record from public.asset_ingest_operations
  where status not in ('registered','deduplicated','failed') and next_attempt_at <= clock_timestamp()
    and attempt_count < max_attempts and (lease_token is null or lease_expires_at <= clock_timestamp())
  order by next_attempt_at,created_at,operation_id
  for update skip locked limit 1;
  if not found then return null; end if;
  previous_worker := result_record.lease_worker_id;
  if result_record.lease_token is not null then
    perform public.append_asset_ingest_operation_event(
      result_record.operation_id,'lease_expired',result_record.status,result_record.status,previous_worker,
      result_record.attempt_count,'lease_expired','system',null,'asset_ingest',jsonb_build_object()
    );
  end if;
  lease_value := gen_random_uuid();
  perform set_config('app.asset_ingest_action','claim',true);
  update public.asset_ingest_operations set
    lease_worker_id=btrim(input_worker_id),lease_token=lease_value,lease_acquired_at=clock_timestamp(),
    lease_expires_at=clock_timestamp()+make_interval(secs=>input_lease_seconds),lease_heartbeat_at=clock_timestamp(),
    attempt_count=attempt_count+1,row_version=row_version+1
  where operation_id=result_record.operation_id returning * into result_record;
  perform public.append_asset_ingest_operation_event(
    result_record.operation_id,'claimed',result_record.status,result_record.status,result_record.lease_worker_id,
    result_record.attempt_count,null,'worker',result_record.lease_worker_id,'asset_ingest',jsonb_build_object()
  );
  return result_record;
end;
$$;

create or replace function public.renew_asset_ingest_lease(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,input_lease_seconds integer
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype;
begin
  perform public.assert_asset_ingest_service_role();
  select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  if r.status in ('registered','deduplicated','failed') or r.row_version<>input_expected_row_version
    or r.lease_worker_id is distinct from btrim(input_worker_id) or r.lease_token is distinct from input_lease_token
    or r.lease_expires_at<=clock_timestamp() or input_lease_seconds not between 30 and 900 then
    raise exception using errcode='40001',message='Asset ingest lease renewal fencing check failed.';
  end if;
  perform set_config('app.asset_ingest_action','renew',true);
  update public.asset_ingest_operations set lease_expires_at=clock_timestamp()+make_interval(secs=>input_lease_seconds),
    lease_heartbeat_at=clock_timestamp(),row_version=row_version+1 where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'lease_renewed',r.status,r.status,r.lease_worker_id,
    r.attempt_count,null,'worker',r.lease_worker_id,'asset_ingest',jsonb_build_object());
  return r;
end;
$$;

create or replace function public.release_asset_ingest_lease(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,input_reason_code text
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; worker_value text;
begin
  perform public.assert_asset_ingest_service_role();
  select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  if r.status in ('registered','deduplicated','failed') or r.row_version<>input_expected_row_version
    or r.lease_worker_id is distinct from btrim(input_worker_id) or r.lease_token is distinct from input_lease_token then
    raise exception using errcode='40001',message='Asset ingest lease release fencing check failed.';
  end if;
  worker_value:=r.lease_worker_id;
  perform set_config('app.asset_ingest_action','release',true);
  update public.asset_ingest_operations set lease_worker_id=null,lease_token=null,lease_acquired_at=null,
    lease_expires_at=null,lease_heartbeat_at=null,row_version=row_version+1 where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'lease_released',r.status,r.status,worker_value,
    r.attempt_count,input_reason_code,'worker',worker_value,'asset_ingest',jsonb_build_object());
  return r;
end;
$$;

create or replace function public.schedule_asset_ingest_retry(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,
  input_error_code text,input_error_message text,input_next_attempt_at timestamptz
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; worker_value text; error_value text:=lower(btrim(input_error_code));
begin
  perform public.assert_asset_ingest_service_role();
  select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  if r.status in ('registered','deduplicated','failed') or r.row_version<>input_expected_row_version
    or r.lease_worker_id is distinct from btrim(input_worker_id) or r.lease_token is distinct from input_lease_token
    or r.lease_expires_at<=clock_timestamp() or r.attempt_count>=r.max_attempts
    or error_value !~ '^[a-z][a-z0-9_.-]{1,79}$'
    or input_next_attempt_at<=clock_timestamp() then
    raise exception using errcode='40001',message='Asset ingest retry fencing or input check failed.';
  end if;
  worker_value:=r.lease_worker_id;
  perform set_config('app.asset_ingest_action','retry',true);
  update public.asset_ingest_operations set last_error_code=error_value,
    last_error_message=nullif(left(btrim(input_error_message),1000),''),last_error_at=clock_timestamp(),
    failure_disposition='retryable',next_attempt_at=input_next_attempt_at,lease_worker_id=null,lease_token=null,
    lease_acquired_at=null,lease_expires_at=null,lease_heartbeat_at=null,row_version=row_version+1
  where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'retry_scheduled',r.status,r.status,worker_value,
    r.attempt_count,error_value,'worker',worker_value,'asset_ingest',jsonb_build_object('nextAttemptAt',r.next_attempt_at));
  return r;
end;
$$;

create or replace function public.assert_asset_ingest_fence(
  input_record public.asset_ingest_operations,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint
)
returns void
language plpgsql security definer set search_path = pg_catalog
as $$
begin
  if input_record.status in ('registered','deduplicated','failed')
    or input_record.row_version <> input_expected_row_version
    or input_record.lease_worker_id is distinct from btrim(input_worker_id)
    or input_record.lease_token is distinct from input_lease_token
    or input_record.lease_expires_at <= clock_timestamp() then
    raise exception using errcode='40001',message='Asset ingest mutation fencing check failed.';
  end if;
end;
$$;

create or replace function public.record_asset_ingest_bytes_received(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,
  input_quarantine_bucket text,input_quarantine_object_path text,input_quarantine_object_version text
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; previous_status text; bucket_value text:=lower(btrim(input_quarantine_bucket)); path_value text:=btrim(input_quarantine_object_path);
begin
  perform public.assert_asset_ingest_service_role();
  select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  perform public.assert_asset_ingest_fence(r,input_worker_id,input_lease_token,input_expected_row_version);
  if r.status<>'reserved' or bucket_value !~ '^[a-z0-9][a-z0-9._-]{0,119}$'
    or char_length(path_value) not between 1 and 1024 or path_value ~ '(^/|//|(^|/)\.\.(/|$)|[[:cntrl:]])' then
    raise exception using errcode='22023',message='Asset ingest bytes-received transition input is invalid.';
  end if;
  previous_status:=r.status; perform set_config('app.asset_ingest_action','bytes_received',true);
  update public.asset_ingest_operations set status='bytes_received',quarantine_bucket=bucket_value,
    quarantine_object_path=path_value,quarantine_object_version=nullif(btrim(input_quarantine_object_version),''),
    bytes_received_at=clock_timestamp(),row_version=row_version+1 where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'bytes_received',previous_status,r.status,r.lease_worker_id,
    r.attempt_count,null,'worker',r.lease_worker_id,'asset_ingest',jsonb_build_object('quarantineBucket',r.quarantine_bucket));
  return r;
end;
$$;

create or replace function public.record_asset_ingest_validated(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,
  input_byte_checksum text,input_detected_mime_type text,input_size_bytes bigint,input_width_px integer,
  input_height_px integer,input_duration_ms bigint,input_target_object_path text
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; previous_status text; checksum_value text:=lower(btrim(input_byte_checksum)); mime_value text:=lower(btrim(input_detected_mime_type)); path_value text:=btrim(input_target_object_path); fingerprint_value text;
begin
  perform public.assert_asset_ingest_service_role();
  select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  perform public.assert_asset_ingest_fence(r,input_worker_id,input_lease_token,input_expected_row_version);
  if r.status<>'bytes_received' or checksum_value !~ '^[0-9a-f]{64}$'
    or mime_value not in ('image/jpeg','image/png','image/webp','video/mp4') or input_size_bytes not between 1 and 536870912
    or input_width_px<=0 or input_height_px<=0 or (mime_value like 'image/%' and input_duration_ms is not null)
    or (mime_value='video/mp4' and coalesce(input_duration_ms,0)<=0) or char_length(path_value) not between 1 and 512
    or path_value ~ '(^/|//|(^|/)\.\.(/|$)|[[:cntrl:]])'
    or (r.expected_checksum is not null and r.expected_checksum<>checksum_value) then
    raise exception using errcode='22023',message='Asset ingest validated metadata is invalid.';
  end if;
  if (mime_value='image/jpeg' and r.safe_filename not like '%.jpg')
    or (mime_value='image/png' and r.safe_filename not like '%.png')
    or (mime_value='image/webp' and r.safe_filename not like '%.webp')
    or (mime_value='video/mp4' and r.safe_filename not like '%.mp4') then
    raise exception using errcode='23514',message='Asset ingest safe filename extension does not match detected MIME type.';
  end if;
  fingerprint_value:=public.asset_ingest_validation_fingerprint_v1(r.reserved_asset_id,checksum_value,mime_value,
    input_size_bytes,input_width_px,input_height_px,input_duration_ms,r.target_bucket,path_value,r.path_scheme_version);
  previous_status:=r.status; perform set_config('app.asset_ingest_action','validated',true);
  update public.asset_ingest_operations set status='validated',byte_checksum=checksum_value,detected_mime_type=mime_value,
    size_bytes=input_size_bytes,width_px=input_width_px,height_px=input_height_px,duration_ms=input_duration_ms,
    target_object_path=path_value,validation_fingerprint=fingerprint_value,validated_at=clock_timestamp(),row_version=row_version+1
  where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'validated',previous_status,r.status,r.lease_worker_id,
    r.attempt_count,null,'worker',r.lease_worker_id,'asset_ingest',jsonb_build_object('checksum',r.byte_checksum,'mimeType',r.detected_mime_type));
  return r;
end;
$$;

create or replace function public.record_asset_ingest_uploaded(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,input_target_object_version text
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; previous_status text;
begin
  perform public.assert_asset_ingest_service_role(); select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  perform public.assert_asset_ingest_fence(r,input_worker_id,input_lease_token,input_expected_row_version);
  if r.status<>'validated' then raise exception using errcode='55000',message='Only validated ingest operations may be marked uploaded.'; end if;
  previous_status:=r.status; perform set_config('app.asset_ingest_action','uploaded',true);
  update public.asset_ingest_operations set status='uploaded',target_object_version=nullif(btrim(input_target_object_version),''),
    storage_uploaded_at=clock_timestamp(),row_version=row_version+1 where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'uploaded',previous_status,r.status,r.lease_worker_id,
    r.attempt_count,null,'worker',r.lease_worker_id,'asset_ingest',jsonb_build_object()); return r;
end;
$$;

create or replace function public.record_asset_ingest_registered(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,input_media_asset_id uuid
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; a public.media_assets%rowtype; previous_status text;
begin
  perform public.assert_asset_ingest_service_role(); select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  perform public.assert_asset_ingest_fence(r,input_worker_id,input_lease_token,input_expected_row_version);
  if r.status not in ('uploaded','cleanup_pending') or input_media_asset_id is distinct from r.reserved_asset_id
    or (r.registered_media_asset_id is not null and r.registered_media_asset_id is distinct from input_media_asset_id) then
    raise exception using errcode='23514',message='Asset ingest registration result does not match the reserved asset.';
  end if;
  select * into a from public.media_assets where id=input_media_asset_id;
  if not found or a.owner_scope is distinct from r.owner_scope or a.customer_id is distinct from r.customer_id
    or a.byte_checksum is distinct from r.byte_checksum or a.storage_bucket is distinct from r.target_bucket
    or a.storage_object_path is distinct from r.target_object_path then
    raise exception using errcode='23514',message='Registered media asset does not match its ingest operation.';
  end if;
  previous_status:=r.status; perform set_config('app.asset_ingest_action','registered',true);
  update public.asset_ingest_operations set status='registered',registered_media_asset_id=input_media_asset_id,
    cleanup_state='not_required',cleanup_eligible_at=null,cleanup_authorized_at=null,cleanup_authorized_by=null,
    cleanup_completed_at=null,registered_at=clock_timestamp(),completed_at=clock_timestamp(),
    lease_worker_id=null,lease_token=null,lease_acquired_at=null,lease_expires_at=null,lease_heartbeat_at=null,
    row_version=row_version+1 where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'registration_succeeded',previous_status,r.status,input_worker_id,
    r.attempt_count,null,'worker',input_worker_id,'asset_ingest',jsonb_build_object('mediaAssetId',input_media_asset_id)); return r;
end;
$$;

create or replace function public.record_asset_ingest_deduplicated(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,input_media_asset_id uuid
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; a public.media_assets%rowtype; previous_status text;
begin
  perform public.assert_asset_ingest_service_role(); select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  perform public.assert_asset_ingest_fence(r,input_worker_id,input_lease_token,input_expected_row_version);
  if r.status not in ('validated','cleanup_pending') or input_media_asset_id is null or input_media_asset_id=r.reserved_asset_id
    or (r.status='cleanup_pending' and r.cleanup_state<>'deleted')
    or (r.registered_media_asset_id is not null and r.registered_media_asset_id<>input_media_asset_id) then
    raise exception using errcode='23514',message='Asset ingest deduplication result is invalid or cleanup is incomplete.';
  end if;
  select * into a from public.media_assets where id=input_media_asset_id;
  if not found or a.owner_scope is distinct from r.owner_scope or a.customer_id is distinct from r.customer_id
    or a.byte_checksum is distinct from r.byte_checksum or a.mime_type is distinct from r.detected_mime_type
    or a.size_bytes is distinct from r.size_bytes or a.width_px is distinct from r.width_px
    or a.height_px is distinct from r.height_px or a.duration_ms is distinct from r.duration_ms then
    raise exception using errcode='23514',message='Deduplicated media asset does not match validated ingest bytes.';
  end if;
  previous_status:=r.status; perform set_config('app.asset_ingest_action','deduplicated',true);
  update public.asset_ingest_operations set status='deduplicated',registered_media_asset_id=input_media_asset_id,
    deduplicated_at=clock_timestamp(),completed_at=clock_timestamp(),lease_worker_id=null,lease_token=null,
    lease_acquired_at=null,lease_expires_at=null,lease_heartbeat_at=null,row_version=row_version+1
  where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'deduplicated',previous_status,r.status,input_worker_id,
    r.attempt_count,null,'worker',input_worker_id,'asset_ingest',jsonb_build_object('mediaAssetId',input_media_asset_id)); return r;
end;
$$;

create or replace function public.mark_asset_ingest_cleanup_pending(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,
  input_deduplicated_media_asset_id uuid,input_cleanup_eligible_at timestamptz,input_reason_code text
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; a public.media_assets%rowtype; previous_status text; reason_value text:=lower(btrim(input_reason_code));
begin
  perform public.assert_asset_ingest_service_role(); select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  perform public.assert_asset_ingest_fence(r,input_worker_id,input_lease_token,input_expected_row_version);
  if r.status<>'uploaded'
    or (input_deduplicated_media_asset_id is not null and input_deduplicated_media_asset_id=r.reserved_asset_id)
    or input_cleanup_eligible_at<clock_timestamp()+interval '24 hours'
    or reason_value !~ '^[a-z][a-z0-9_.-]{1,79}$' then
    raise exception using errcode='23514',message='Asset ingest cleanup candidate input is invalid.';
  end if;
  if input_deduplicated_media_asset_id is not null then
    select * into a from public.media_assets where id=input_deduplicated_media_asset_id;
    if not found or a.owner_scope is distinct from r.owner_scope or a.customer_id is distinct from r.customer_id
      or a.byte_checksum is distinct from r.byte_checksum or a.mime_type is distinct from r.detected_mime_type
      or a.size_bytes is distinct from r.size_bytes or a.width_px is distinct from r.width_px
      or a.height_px is distinct from r.height_px or a.duration_ms is distinct from r.duration_ms then
      raise exception using errcode='23514',message='Cleanup candidate canonical media asset does not match the ingest bytes.';
    end if;
  end if;
  previous_status:=r.status; perform set_config('app.asset_ingest_action','cleanup_pending',true);
  update public.asset_ingest_operations set status='cleanup_pending',registered_media_asset_id=input_deduplicated_media_asset_id,
    cleanup_state='candidate',cleanup_eligible_at=input_cleanup_eligible_at,next_attempt_at=input_cleanup_eligible_at,
    lease_worker_id=null,lease_token=null,lease_acquired_at=null,lease_expires_at=null,lease_heartbeat_at=null,
    row_version=row_version+1 where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'cleanup_candidate',previous_status,r.status,input_worker_id,
    r.attempt_count,reason_value,'worker',input_worker_id,'asset_ingest',jsonb_build_object('eligibleAt',r.cleanup_eligible_at)); return r;
end;
$$;

create or replace function public.authorize_asset_ingest_cleanup(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,input_reason_code text
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; reason_value text:=lower(btrim(input_reason_code));
begin
  perform public.assert_asset_ingest_service_role(); select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  perform public.assert_asset_ingest_fence(r,input_worker_id,input_lease_token,input_expected_row_version);
  if r.status<>'cleanup_pending' or r.cleanup_state<>'candidate' or r.cleanup_eligible_at>clock_timestamp()
    or reason_value !~ '^[a-z][a-z0-9_.-]{1,79}$'
    or exists(select 1 from public.media_assets where id=r.reserved_asset_id)
    or exists(select 1 from public.media_assets where storage_provider='supabase_storage'
      and storage_bucket=r.target_bucket and storage_object_path=r.target_object_path
      and storage_object_version is not distinct from r.target_object_version)
    or exists(select 1 from public.asset_ingest_operations other where other.operation_id<>r.operation_id
      and other.target_bucket=r.target_bucket and other.target_object_path=r.target_object_path) then
    raise exception using errcode='55000',message='Asset ingest cleanup cannot be authorized because orphan proof is incomplete.';
  end if;
  perform set_config('app.asset_ingest_action','cleanup_authorized',true);
  update public.asset_ingest_operations set cleanup_state='authorized',cleanup_authorized_at=clock_timestamp(),
    cleanup_authorized_by=btrim(input_worker_id),row_version=row_version+1
  where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'cleanup_authorized',r.status,r.status,r.lease_worker_id,
    r.attempt_count,reason_value,'worker',r.lease_worker_id,'asset_ingest',jsonb_build_object('objectPath',r.target_object_path)); return r;
end;
$$;

create or replace function public.record_asset_ingest_cleanup_result(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,
  input_cleanup_result text,input_reason_code text
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; result_value text:=lower(btrim(input_cleanup_result)); reason_value text:=lower(btrim(input_reason_code));
begin
  perform public.assert_asset_ingest_service_role(); select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  perform public.assert_asset_ingest_fence(r,input_worker_id,input_lease_token,input_expected_row_version);
  if r.status<>'cleanup_pending' or r.cleanup_state<>'authorized'
    or result_value not in ('deleted','blocked','manual_review') or reason_value !~ '^[a-z][a-z0-9_.-]{1,79}$' then
    raise exception using errcode='22023',message='Asset ingest cleanup result input is invalid.';
  end if;
  perform set_config('app.asset_ingest_action','cleanup_result',true);
  update public.asset_ingest_operations set cleanup_state=result_value,cleanup_completed_at=clock_timestamp(),
    cleanup_attempt_count=cleanup_attempt_count+1,row_version=row_version+1
  where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'cleanup_result',r.status,r.status,r.lease_worker_id,
    r.attempt_count,reason_value,'worker',r.lease_worker_id,'asset_ingest',jsonb_build_object('result',result_value)); return r;
end;
$$;

create or replace function public.mark_asset_ingest_failed(
  input_operation_id uuid,input_worker_id text,input_lease_token uuid,input_expected_row_version bigint,
  input_error_code text,input_error_message text,input_failure_disposition text
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; previous_status text; error_value text:=lower(btrim(input_error_code)); disposition_value text:=lower(btrim(input_failure_disposition)); event_value text;
begin
  perform public.assert_asset_ingest_service_role(); select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  perform public.assert_asset_ingest_fence(r,input_worker_id,input_lease_token,input_expected_row_version);
  if error_value !~ '^[a-z][a-z0-9_.-]{1,79}$' or disposition_value not in ('permanent','manual_review') then
    raise exception using errcode='22023',message='Asset ingest terminal failure input is invalid.';
  end if;
  previous_status:=r.status; event_value:=case when disposition_value='manual_review' then 'manual_review' else 'failed' end;
  perform set_config('app.asset_ingest_action','failed',true);
  update public.asset_ingest_operations set status='failed',last_error_code=error_value,
    last_error_message=nullif(left(btrim(input_error_message),1000),''),last_error_at=clock_timestamp(),
    failure_disposition=disposition_value,failed_at=clock_timestamp(),completed_at=clock_timestamp(),
    cleanup_state=case when status in ('uploaded','cleanup_pending') then 'manual_review' else 'not_required' end,
    cleanup_eligible_at=case when status in ('uploaded','cleanup_pending') then coalesce(cleanup_eligible_at,clock_timestamp()) else null end,
    cleanup_completed_at=case when status in ('uploaded','cleanup_pending') then clock_timestamp() else null end,
    lease_worker_id=null,lease_token=null,lease_acquired_at=null,lease_expires_at=null,lease_heartbeat_at=null,
    row_version=row_version+1 where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,event_value,previous_status,r.status,input_worker_id,
    r.attempt_count,error_value,'worker',input_worker_id,'asset_ingest',jsonb_build_object('disposition',disposition_value)); return r;
end;
$$;

create or replace function public.recover_expired_asset_ingest_lease(
  input_operation_id uuid,input_expected_row_version bigint
)
returns public.asset_ingest_operations
language plpgsql security definer set search_path = pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype; previous_worker text;
begin
  perform public.assert_asset_ingest_service_role();
  select * into r from public.asset_ingest_operations where operation_id=input_operation_id for update;
  if not found then raise exception using errcode='P0002',message='Asset ingest operation does not exist.'; end if;
  if r.status in ('registered','deduplicated','failed') or r.row_version<>input_expected_row_version
    or r.lease_token is null or r.lease_expires_at>clock_timestamp() then
    raise exception using errcode='40001',message='Asset ingest expired lease recovery check failed.';
  end if;
  previous_worker:=r.lease_worker_id;
  perform set_config('app.asset_ingest_action','recover',true);
  update public.asset_ingest_operations set lease_worker_id=null,lease_token=null,lease_acquired_at=null,
    lease_expires_at=null,lease_heartbeat_at=null,next_attempt_at=clock_timestamp(),row_version=row_version+1
  where operation_id=input_operation_id returning * into r;
  perform public.append_asset_ingest_operation_event(r.operation_id,'lease_expired',r.status,r.status,previous_worker,
    r.attempt_count,'lease_expired','system',null,'asset_ingest',jsonb_build_object());
  return r;
end;
$$;

alter function public.assert_asset_ingest_service_role() owner to postgres;
alter function public.asset_ingest_input_fingerprint_v1(uuid,text,uuid,text,text,uuid,text,text,text,text,text,text,text,smallint,text,text,text,text) owner to postgres;
alter function public.asset_ingest_validation_fingerprint_v1(uuid,text,text,bigint,integer,integer,bigint,text,text,smallint) owner to postgres;
alter function public.append_asset_ingest_operation_event(uuid,text,text,text,text,integer,text,text,text,text,jsonb) owner to postgres;
alter function public.asset_ingest_operation_before_write() owner to postgres;
alter function public.prevent_asset_ingest_event_mutation() owner to postgres;
alter function public.assert_asset_ingest_fence(public.asset_ingest_operations,text,uuid,bigint) owner to postgres;
alter function public.reserve_asset_ingest_operation(text,uuid,text,text,text,uuid,text,text,text,text,text,text,text,smallint,text,text,text,text,uuid,smallint) owner to postgres;
alter function public.claim_next_asset_ingest_operation(text,integer) owner to postgres;
alter function public.renew_asset_ingest_lease(uuid,text,uuid,bigint,integer) owner to postgres;
alter function public.release_asset_ingest_lease(uuid,text,uuid,bigint,text) owner to postgres;
alter function public.schedule_asset_ingest_retry(uuid,text,uuid,bigint,text,text,timestamptz) owner to postgres;
alter function public.recover_expired_asset_ingest_lease(uuid,bigint) owner to postgres;
alter function public.record_asset_ingest_bytes_received(uuid,text,uuid,bigint,text,text,text) owner to postgres;
alter function public.record_asset_ingest_validated(uuid,text,uuid,bigint,text,text,bigint,integer,integer,bigint,text) owner to postgres;
alter function public.record_asset_ingest_uploaded(uuid,text,uuid,bigint,text) owner to postgres;
alter function public.record_asset_ingest_registered(uuid,text,uuid,bigint,uuid) owner to postgres;
alter function public.record_asset_ingest_deduplicated(uuid,text,uuid,bigint,uuid) owner to postgres;
alter function public.mark_asset_ingest_cleanup_pending(uuid,text,uuid,bigint,uuid,timestamptz,text) owner to postgres;
alter function public.authorize_asset_ingest_cleanup(uuid,text,uuid,bigint,text) owner to postgres;
alter function public.record_asset_ingest_cleanup_result(uuid,text,uuid,bigint,text,text) owner to postgres;
alter function public.mark_asset_ingest_failed(uuid,text,uuid,bigint,text,text,text) owner to postgres;

alter table public.asset_ingest_operations enable row level security;
alter table public.asset_ingest_operation_events enable row level security;
create policy asset_ingest_operations_service_read on public.asset_ingest_operations for select to service_role using (true);
create policy asset_ingest_operation_events_service_read on public.asset_ingest_operation_events for select to service_role using (true);

revoke all on table public.asset_ingest_operations from public,anon,authenticated,service_role;
revoke all on table public.asset_ingest_operation_events from public,anon,authenticated,service_role;
grant select on table public.asset_ingest_operations to service_role;
grant select on table public.asset_ingest_operation_events to service_role;

revoke all on function public.assert_asset_ingest_service_role() from public,anon,authenticated,service_role;
revoke all on function public.asset_ingest_input_fingerprint_v1(uuid,text,uuid,text,text,uuid,text,text,text,text,text,text,text,smallint,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.asset_ingest_validation_fingerprint_v1(uuid,text,text,bigint,integer,integer,bigint,text,text,smallint) from public,anon,authenticated,service_role;
revoke all on function public.append_asset_ingest_operation_event(uuid,text,text,text,text,integer,text,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.asset_ingest_operation_before_write() from public,anon,authenticated,service_role;
revoke all on function public.prevent_asset_ingest_event_mutation() from public,anon,authenticated,service_role;
revoke all on function public.assert_asset_ingest_fence(public.asset_ingest_operations,text,uuid,bigint) from public,anon,authenticated,service_role;

revoke all on function public.reserve_asset_ingest_operation(text,uuid,text,text,text,uuid,text,text,text,text,text,text,text,smallint,text,text,text,text,uuid,smallint) from public,anon,authenticated,service_role;
revoke all on function public.claim_next_asset_ingest_operation(text,integer) from public,anon,authenticated,service_role;
revoke all on function public.renew_asset_ingest_lease(uuid,text,uuid,bigint,integer) from public,anon,authenticated,service_role;
revoke all on function public.release_asset_ingest_lease(uuid,text,uuid,bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.schedule_asset_ingest_retry(uuid,text,uuid,bigint,text,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.recover_expired_asset_ingest_lease(uuid,bigint) from public,anon,authenticated,service_role;
revoke all on function public.record_asset_ingest_bytes_received(uuid,text,uuid,bigint,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.record_asset_ingest_validated(uuid,text,uuid,bigint,text,text,bigint,integer,integer,bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.record_asset_ingest_uploaded(uuid,text,uuid,bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.record_asset_ingest_registered(uuid,text,uuid,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_asset_ingest_deduplicated(uuid,text,uuid,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function public.mark_asset_ingest_cleanup_pending(uuid,text,uuid,bigint,uuid,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.authorize_asset_ingest_cleanup(uuid,text,uuid,bigint,text) from public,anon,authenticated,service_role;
revoke all on function public.record_asset_ingest_cleanup_result(uuid,text,uuid,bigint,text,text) from public,anon,authenticated,service_role;
revoke all on function public.mark_asset_ingest_failed(uuid,text,uuid,bigint,text,text,text) from public,anon,authenticated,service_role;

grant execute on function public.reserve_asset_ingest_operation(text,uuid,text,text,text,uuid,text,text,text,text,text,text,text,smallint,text,text,text,text,uuid,smallint) to service_role;
grant execute on function public.claim_next_asset_ingest_operation(text,integer) to service_role;
grant execute on function public.renew_asset_ingest_lease(uuid,text,uuid,bigint,integer) to service_role;
grant execute on function public.release_asset_ingest_lease(uuid,text,uuid,bigint,text) to service_role;
grant execute on function public.schedule_asset_ingest_retry(uuid,text,uuid,bigint,text,text,timestamptz) to service_role;
grant execute on function public.recover_expired_asset_ingest_lease(uuid,bigint) to service_role;
grant execute on function public.record_asset_ingest_bytes_received(uuid,text,uuid,bigint,text,text,text) to service_role;
grant execute on function public.record_asset_ingest_validated(uuid,text,uuid,bigint,text,text,bigint,integer,integer,bigint,text) to service_role;
grant execute on function public.record_asset_ingest_uploaded(uuid,text,uuid,bigint,text) to service_role;
grant execute on function public.record_asset_ingest_registered(uuid,text,uuid,bigint,uuid) to service_role;
grant execute on function public.record_asset_ingest_deduplicated(uuid,text,uuid,bigint,uuid) to service_role;
grant execute on function public.mark_asset_ingest_cleanup_pending(uuid,text,uuid,bigint,uuid,timestamptz,text) to service_role;
grant execute on function public.authorize_asset_ingest_cleanup(uuid,text,uuid,bigint,text) to service_role;
grant execute on function public.record_asset_ingest_cleanup_result(uuid,text,uuid,bigint,text,text) to service_role;
grant execute on function public.mark_asset_ingest_failed(uuid,text,uuid,bigint,text,text,text) to service_role;

commit;
