begin;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_scope text not null,
  customer_id uuid references public.customers(id) on delete restrict,
  asset_type text not null,
  storage_provider text not null,
  storage_bucket text not null,
  storage_object_path text not null,
  storage_object_version text,
  byte_checksum text not null,
  mime_type text not null,
  size_bytes bigint not null,
  width_px integer not null,
  height_px integer not null,
  duration_ms bigint,
  source_file_id uuid references public.files(id) on delete restrict,
  lifecycle_status text not null default 'active',
  created_by_type text not null,
  created_by_id text,
  created_at timestamptz not null default now(),
  idempotency_key text not null,
  input_fingerprint text not null,
  archived_by_type text,
  archived_by_id text,
  archived_at timestamptz,
  archive_idempotency_key text,
  archive_input_fingerprint text,

  constraint media_assets_id_checksum_key unique (id,byte_checksum),
  constraint media_assets_owner_scope_check check (owner_scope in ('customer','internal')),
  constraint media_assets_owner_customer_check check (
    (owner_scope = 'customer' and customer_id is not null)
    or (owner_scope = 'internal' and customer_id is null)
  ),
  constraint media_assets_asset_type_check check (asset_type in ('image','video')),
  constraint media_assets_storage_provider_check check (
    char_length(storage_provider) between 1 and 60
    and storage_provider ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint media_assets_storage_bucket_check check (
    char_length(storage_bucket) between 1 and 120
    and storage_bucket ~ '^[a-z0-9][a-z0-9._-]*$'
  ),
  constraint media_assets_storage_path_check check (
    char_length(storage_object_path) between 1 and 1024
    and storage_object_path = btrim(storage_object_path)
    and storage_object_path !~ '(^/|//|(^|/)\.\.(/|$)|[[:cntrl:]])'
  ),
  constraint media_assets_storage_version_check check (
    storage_object_version is null
    or (
      char_length(storage_object_version) between 1 and 255
      and storage_object_version = btrim(storage_object_version)
      and storage_object_version !~ '[[:cntrl:]]'
    )
  ),
  constraint media_assets_checksum_check check (byte_checksum ~ '^[0-9a-f]{64}$'),
  constraint media_assets_mime_type_check check (
    char_length(mime_type) between 3 and 127
    and mime_type ~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'
    and (
      (asset_type = 'image' and mime_type like 'image/%')
      or (asset_type = 'video' and mime_type like 'video/%')
    )
  ),
  constraint media_assets_size_check check (size_bytes between 1 and 5368709120),
  constraint media_assets_dimensions_check check (width_px > 0 and height_px > 0),
  constraint media_assets_duration_check check (
    (asset_type = 'image' and duration_ms is null)
    or (asset_type = 'video' and duration_ms > 0)
  ),
  constraint media_assets_lifecycle_check check (lifecycle_status in ('active','archived')),
  constraint media_assets_created_actor_type_check check (
    char_length(created_by_type) between 1 and 60
    and created_by_type ~ '^[a-z][a-z0-9_]*$'
  ),
  constraint media_assets_created_actor_id_check check (
    created_by_id is null or char_length(btrim(created_by_id)) between 1 and 255
  ),
  constraint media_assets_idempotency_key_check check (
    char_length(btrim(idempotency_key)) between 1 and 240
  ),
  constraint media_assets_input_fingerprint_check check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint media_assets_archive_actor_type_check check (
    archived_by_type is null
    or (
      char_length(archived_by_type) between 1 and 60
      and archived_by_type ~ '^[a-z][a-z0-9_]*$'
    )
  ),
  constraint media_assets_archive_actor_id_check check (
    archived_by_id is null or char_length(btrim(archived_by_id)) between 1 and 255
  ),
  constraint media_assets_archive_idempotency_check check (
    archive_idempotency_key is null
    or char_length(btrim(archive_idempotency_key)) between 1 and 240
  ),
  constraint media_assets_archive_fingerprint_check check (
    archive_input_fingerprint is null or archive_input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  constraint media_assets_archive_state_check check (
    (
      lifecycle_status = 'active'
      and archived_by_type is null
      and archived_by_id is null
      and archived_at is null
      and archive_idempotency_key is null
      and archive_input_fingerprint is null
    )
    or (
      lifecycle_status = 'archived'
      and archived_by_type is not null
      and archived_at is not null
      and archive_idempotency_key is not null
      and archive_input_fingerprint is not null
    )
  )
);

alter table public.media_assets owner to postgres;

create unique index media_assets_storage_identity_unversioned
  on public.media_assets(storage_provider,storage_bucket,storage_object_path)
  where storage_object_version is null;

create unique index media_assets_storage_identity_versioned
  on public.media_assets(storage_provider,storage_bucket,storage_object_path,storage_object_version)
  where storage_object_version is not null;

create unique index media_assets_customer_checksum
  on public.media_assets(customer_id,byte_checksum)
  where owner_scope = 'customer';

create unique index media_assets_internal_checksum
  on public.media_assets(byte_checksum)
  where owner_scope = 'internal';

create unique index media_assets_customer_idempotency
  on public.media_assets(customer_id,idempotency_key)
  where owner_scope = 'customer';

create unique index media_assets_internal_idempotency
  on public.media_assets(idempotency_key)
  where owner_scope = 'internal';

create unique index media_assets_customer_archive_idempotency
  on public.media_assets(customer_id,archive_idempotency_key)
  where owner_scope = 'customer' and archive_idempotency_key is not null;

create unique index media_assets_internal_archive_idempotency
  on public.media_assets(archive_idempotency_key)
  where owner_scope = 'internal' and archive_idempotency_key is not null;

create index media_assets_customer_active_created
  on public.media_assets(customer_id,created_at desc)
  where owner_scope = 'customer' and lifecycle_status = 'active';

create index media_assets_internal_active_created
  on public.media_assets(created_at desc)
  where owner_scope = 'internal' and lifecycle_status = 'active';

create or replace function public.assert_media_asset_service_role()
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
    exception when invalid_text_representation then
      jwt_role := null;
    end;
  end if;

  if coalesce(jwt_role, session_user::text) <> 'service_role' then
    raise exception using errcode = '42501', message = 'Media asset operations require the service role.';
  end if;
end;
$$;

create or replace function public.media_asset_registration_fingerprint_v1(
  input_asset_id uuid,
  input_owner_scope text,
  input_customer_id uuid,
  input_asset_type text,
  input_storage_provider text,
  input_storage_bucket text,
  input_storage_object_path text,
  input_storage_object_version text,
  input_byte_checksum text,
  input_mime_type text,
  input_size_bytes bigint,
  input_width_px integer,
  input_height_px integer,
  input_duration_ms bigint,
  input_source_file_id uuid,
  input_created_by_type text,
  input_created_by_id text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'assetId',input_asset_id,
          'ownerScope',input_owner_scope,
          'customerId',input_customer_id,
          'assetType',input_asset_type,
          'storageProvider',input_storage_provider,
          'storageBucket',input_storage_bucket,
          'storageObjectPath',input_storage_object_path,
          'storageObjectVersion',input_storage_object_version,
          'byteChecksum',input_byte_checksum,
          'mimeType',input_mime_type,
          'sizeBytes',input_size_bytes,
          'widthPx',input_width_px,
          'heightPx',input_height_px,
          'durationMs',input_duration_ms,
          'sourceFileId',input_source_file_id,
          'createdByType',input_created_by_type,
          'createdById',input_created_by_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function public.media_asset_archive_fingerprint_v1(
  input_asset_id uuid,
  input_archived_by_type text,
  input_archived_by_id text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'assetId',input_asset_id,
          'archivedByType',input_archived_by_type,
          'archivedById',input_archived_by_id
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
$$;

create or replace function public.media_asset_before_update_or_delete()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'Media assets cannot be deleted.';
  end if;

  if old.owner_scope is distinct from new.owner_scope
    or old.customer_id is distinct from new.customer_id
    or old.asset_type is distinct from new.asset_type
    or old.storage_provider is distinct from new.storage_provider
    or old.storage_bucket is distinct from new.storage_bucket
    or old.storage_object_path is distinct from new.storage_object_path
    or old.storage_object_version is distinct from new.storage_object_version
    or old.byte_checksum is distinct from new.byte_checksum
    or old.mime_type is distinct from new.mime_type
    or old.size_bytes is distinct from new.size_bytes
    or old.width_px is distinct from new.width_px
    or old.height_px is distinct from new.height_px
    or old.duration_ms is distinct from new.duration_ms
    or old.source_file_id is distinct from new.source_file_id
    or old.created_by_type is distinct from new.created_by_type
    or old.created_by_id is distinct from new.created_by_id
    or old.created_at is distinct from new.created_at
    or old.idempotency_key is distinct from new.idempotency_key
    or old.input_fingerprint is distinct from new.input_fingerprint
  then
    raise exception using errcode = '55000', message = 'Media asset identity and technical metadata are immutable.';
  end if;

  if old.lifecycle_status <> 'active'
    or new.lifecycle_status <> 'archived'
    or old.archived_by_type is not null
    or old.archived_by_id is not null
    or old.archived_at is not null
    or old.archive_idempotency_key is not null
    or old.archive_input_fingerprint is not null
    or new.archived_by_type is null
    or new.archived_at is null
    or new.archive_idempotency_key is null
    or new.archive_input_fingerprint is null
  then
    raise exception using errcode = '55000', message = 'Only the active to archived media asset transition is allowed.';
  end if;

  if new.archive_input_fingerprint is distinct from public.media_asset_archive_fingerprint_v1(
    new.id,new.archived_by_type,new.archived_by_id
  ) then
    raise exception using errcode = '55000', message = 'Media asset archive fingerprint does not match its immutable archive input.';
  end if;

  return new;
end;
$$;

create trigger media_assets_write_guard
before update or delete on public.media_assets
for each row execute function public.media_asset_before_update_or_delete();

create or replace function public.register_media_asset(
  input_asset_id uuid,
  input_owner_scope text,
  input_customer_id uuid,
  input_asset_type text,
  input_storage_provider text,
  input_storage_bucket text,
  input_storage_object_path text,
  input_storage_object_version text,
  input_byte_checksum text,
  input_mime_type text,
  input_size_bytes bigint,
  input_width_px integer,
  input_height_px integer,
  input_duration_ms bigint,
  input_source_file_id uuid,
  input_created_by_type text,
  input_created_by_id text,
  input_idempotency_key text
)
returns public.media_assets
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  normalized_owner_scope text := lower(btrim(input_owner_scope));
  normalized_asset_type text := lower(btrim(input_asset_type));
  normalized_provider text := lower(btrim(input_storage_provider));
  normalized_bucket text := btrim(input_storage_bucket);
  normalized_path text := btrim(input_storage_object_path);
  normalized_version text := nullif(btrim(input_storage_object_version), '');
  normalized_checksum text := lower(btrim(input_byte_checksum));
  normalized_mime_type text := lower(btrim(input_mime_type));
  normalized_created_by_type text := lower(btrim(input_created_by_type));
  normalized_created_by_id text := nullif(btrim(input_created_by_id), '');
  normalized_idempotency_key text := btrim(input_idempotency_key);
  computed_fingerprint text;
  existing_asset public.media_assets%rowtype;
  inserted_asset public.media_assets%rowtype;
  source_file public.files%rowtype;
  expected_source_bucket text;
  insert_attempt integer;
begin
  perform public.assert_media_asset_service_role();

  if input_asset_id is null then
    raise exception using errcode = '22023', message = 'A reserved media asset ID is required.';
  end if;
  if normalized_owner_scope is null
    or normalized_owner_scope not in ('customer','internal')
    or (normalized_owner_scope = 'customer' and input_customer_id is null)
    or (normalized_owner_scope = 'internal' and input_customer_id is not null)
  then
    raise exception using errcode = '23514', message = 'Media asset ownership is invalid.';
  end if;
  if normalized_asset_type is null or normalized_asset_type not in ('image','video') then
    raise exception using errcode = '22023', message = 'Media asset type must be image or video.';
  end if;
  if normalized_provider is null
    or normalized_bucket is null
    or normalized_path is null
    or normalized_provider !~ '^[a-z][a-z0-9_]{0,59}$'
    or char_length(normalized_bucket) not between 1 and 120
    or normalized_bucket !~ '^[a-z0-9][a-z0-9._-]*$'
    or char_length(normalized_path) not between 1 and 1024
    or normalized_path ~ '(^/|//|(^|/)\.\.(/|$)|[[:cntrl:]])'
    or (normalized_version is not null and (char_length(normalized_version) > 255 or normalized_version ~ '[[:cntrl:]]'))
  then
    raise exception using errcode = '22023', message = 'Media asset storage identity is invalid.';
  end if;
  if normalized_checksum is null or normalized_checksum !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Media asset checksum must be lowercase SHA-256 hex.';
  end if;
  if normalized_mime_type is null
    or normalized_mime_type !~ '^[a-z0-9][a-z0-9!#$&^_.+-]*/[a-z0-9][a-z0-9!#$&^_.+-]*$'
    or (normalized_asset_type = 'image' and normalized_mime_type not like 'image/%')
    or (normalized_asset_type = 'video' and normalized_mime_type not like 'video/%')
  then
    raise exception using errcode = '22023', message = 'Media asset MIME type does not match its asset type.';
  end if;
  if input_size_bytes is null
    or input_size_bytes not between 1 and 5368709120
    or input_width_px is null
    or input_width_px <= 0
    or input_height_px is null
    or input_height_px <= 0
    or (normalized_asset_type = 'image' and input_duration_ms is not null)
    or (normalized_asset_type = 'video' and coalesce(input_duration_ms,0) <= 0)
  then
    raise exception using errcode = '22023', message = 'Media asset technical metadata is invalid.';
  end if;
  if normalized_created_by_type is null
    or normalized_idempotency_key is null
    or normalized_created_by_type !~ '^[a-z][a-z0-9_]{0,59}$'
    or (normalized_created_by_id is not null and char_length(normalized_created_by_id) > 255)
    or char_length(normalized_idempotency_key) not between 1 and 240
  then
    raise exception using errcode = '22023', message = 'Media asset actor or idempotency input is invalid.';
  end if;

  if input_source_file_id is not null then
    select * into source_file from public.files where id = input_source_file_id;
    if not found then
      raise exception using errcode = '23503', message = 'Media asset source file does not exist.';
    end if;
    if normalized_owner_scope <> 'customer'
      or source_file.customer_id is distinct from input_customer_id
    then
      raise exception using errcode = '23514', message = 'Media asset source file belongs to another ownership scope.';
    end if;
    expected_source_bucket := coalesce(nullif(btrim(source_file.location),''),'relationship-assets');
    if normalized_provider <> 'supabase_storage'
      or normalized_bucket is distinct from expected_source_bucket
      or source_file.storage_path is distinct from normalized_path
      or lower(source_file.checksum) is distinct from normalized_checksum
      or lower(source_file.mime_type) is distinct from normalized_mime_type
      or source_file.size_bytes is distinct from input_size_bytes
      or lower(source_file.file_type) is distinct from normalized_asset_type
      or source_file.status in ('rejected','replaced','archived')
    then
      raise exception using errcode = '23514', message = 'Media asset source file metadata does not match the immutable asset input.';
    end if;
  end if;

  computed_fingerprint := public.media_asset_registration_fingerprint_v1(
    input_asset_id,normalized_owner_scope,input_customer_id,normalized_asset_type,normalized_provider,
    normalized_bucket,normalized_path,normalized_version,normalized_checksum,
    normalized_mime_type,input_size_bytes,input_width_px,input_height_px,input_duration_ms,
    input_source_file_id,normalized_created_by_type,normalized_created_by_id
  );

  for insert_attempt in 1..2 loop
    select * into existing_asset
    from public.media_assets
    where idempotency_key = normalized_idempotency_key
      and (
        (normalized_owner_scope = 'customer' and owner_scope = 'customer' and customer_id = input_customer_id)
        or (normalized_owner_scope = 'internal' and owner_scope = 'internal' and customer_id is null)
      )
    limit 1;
    if found then
      if existing_asset.input_fingerprint = computed_fingerprint
        and existing_asset.id = input_asset_id
        and existing_asset.owner_scope = normalized_owner_scope
        and existing_asset.customer_id is not distinct from input_customer_id
        and existing_asset.asset_type = normalized_asset_type
        and existing_asset.storage_provider = normalized_provider
        and existing_asset.storage_bucket = normalized_bucket
        and existing_asset.storage_object_path = normalized_path
        and existing_asset.storage_object_version is not distinct from normalized_version
        and existing_asset.byte_checksum = normalized_checksum
        and existing_asset.mime_type = normalized_mime_type
        and existing_asset.size_bytes = input_size_bytes
        and existing_asset.width_px = input_width_px
        and existing_asset.height_px = input_height_px
        and existing_asset.duration_ms is not distinct from input_duration_ms
        and existing_asset.source_file_id is not distinct from input_source_file_id
        and existing_asset.created_by_type = normalized_created_by_type
        and existing_asset.created_by_id is not distinct from normalized_created_by_id
      then
        return existing_asset;
      end if;
      raise exception using errcode = '23505', message = 'Media asset idempotency conflict: immutable input differs.';
    end if;

    select * into existing_asset
    from public.media_assets
    where id = input_asset_id
    limit 1;
    if found then
      if existing_asset.input_fingerprint = computed_fingerprint
        and existing_asset.owner_scope = normalized_owner_scope
        and existing_asset.customer_id is not distinct from input_customer_id
        and existing_asset.asset_type = normalized_asset_type
        and existing_asset.storage_provider = normalized_provider
        and existing_asset.storage_bucket = normalized_bucket
        and existing_asset.storage_object_path = normalized_path
        and existing_asset.storage_object_version is not distinct from normalized_version
        and existing_asset.byte_checksum = normalized_checksum
        and existing_asset.mime_type = normalized_mime_type
        and existing_asset.size_bytes = input_size_bytes
        and existing_asset.width_px = input_width_px
        and existing_asset.height_px = input_height_px
        and existing_asset.duration_ms is not distinct from input_duration_ms
        and existing_asset.source_file_id is not distinct from input_source_file_id
        and existing_asset.created_by_type = normalized_created_by_type
        and existing_asset.created_by_id is not distinct from normalized_created_by_id
        and existing_asset.idempotency_key = normalized_idempotency_key
      then
        return existing_asset;
      end if;
      raise exception using errcode = '23505', message = 'Reserved media asset ID conflict: immutable input differs.';
    end if;

    select * into existing_asset
    from public.media_assets
    where byte_checksum = normalized_checksum
      and (
        (normalized_owner_scope = 'customer' and owner_scope = 'customer' and customer_id = input_customer_id)
        or (normalized_owner_scope = 'internal' and owner_scope = 'internal' and customer_id is null)
      )
    limit 1;
    if found then
      if existing_asset.asset_type = normalized_asset_type
        and existing_asset.mime_type = normalized_mime_type
        and existing_asset.size_bytes = input_size_bytes
        and existing_asset.width_px = input_width_px
        and existing_asset.height_px = input_height_px
        and existing_asset.duration_ms is not distinct from input_duration_ms
      then
        return existing_asset;
      end if;
      raise exception using errcode = '23505', message = 'Media asset checksum conflict: technical metadata differs.';
    end if;

    select * into existing_asset
    from public.media_assets
    where storage_provider = normalized_provider
      and storage_bucket = normalized_bucket
      and storage_object_path = normalized_path
      and storage_object_version is not distinct from normalized_version
    limit 1;
    if found then
      if existing_asset.owner_scope = normalized_owner_scope
        and existing_asset.customer_id is not distinct from input_customer_id
        and existing_asset.asset_type = normalized_asset_type
        and existing_asset.byte_checksum = normalized_checksum
        and existing_asset.mime_type = normalized_mime_type
        and existing_asset.size_bytes = input_size_bytes
        and existing_asset.width_px = input_width_px
        and existing_asset.height_px = input_height_px
        and existing_asset.duration_ms is not distinct from input_duration_ms
      then
        return existing_asset;
      end if;
      raise exception using errcode = '23505', message = 'Media asset storage identity conflict.';
    end if;

    begin
      insert into public.media_assets (
        id,owner_scope,customer_id,asset_type,storage_provider,storage_bucket,
        storage_object_path,storage_object_version,byte_checksum,mime_type,size_bytes,
        width_px,height_px,duration_ms,source_file_id,lifecycle_status,
        created_by_type,created_by_id,idempotency_key,input_fingerprint
      ) values (
        input_asset_id,normalized_owner_scope,input_customer_id,normalized_asset_type,normalized_provider,normalized_bucket,
        normalized_path,normalized_version,normalized_checksum,normalized_mime_type,input_size_bytes,
        input_width_px,input_height_px,input_duration_ms,input_source_file_id,'active',
        normalized_created_by_type,normalized_created_by_id,normalized_idempotency_key,computed_fingerprint
      ) returning * into inserted_asset;
      return inserted_asset;
    exception when unique_violation then
      if insert_attempt = 2 then raise; end if;
    end;
  end loop;

  raise exception using errcode = '40001', message = 'Media asset insert could not be reconciled after a concurrent insert.';
end;
$$;

create or replace function public.archive_media_asset(
  input_asset_id uuid,
  input_archived_by_type text,
  input_archived_by_id text,
  input_idempotency_key text
)
returns public.media_assets
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  asset_record public.media_assets%rowtype;
  normalized_actor_type text := lower(btrim(input_archived_by_type));
  normalized_actor_id text := nullif(btrim(input_archived_by_id),'');
  normalized_idempotency_key text := btrim(input_idempotency_key);
  computed_fingerprint text;
begin
  perform public.assert_media_asset_service_role();
  if input_asset_id is null
    or normalized_actor_type is null
    or normalized_idempotency_key is null
    or normalized_actor_type !~ '^[a-z][a-z0-9_]{0,59}$'
    or (normalized_actor_id is not null and char_length(normalized_actor_id) > 255)
    or char_length(normalized_idempotency_key) not between 1 and 240
  then
    raise exception using errcode = '22023', message = 'Media asset archive actor or idempotency input is invalid.';
  end if;

  computed_fingerprint := public.media_asset_archive_fingerprint_v1(
    input_asset_id,normalized_actor_type,normalized_actor_id
  );

  select * into asset_record from public.media_assets where id = input_asset_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Media asset does not exist.';
  end if;

  if asset_record.lifecycle_status = 'archived' then
    if asset_record.archive_idempotency_key = normalized_idempotency_key
      and asset_record.archive_input_fingerprint = computed_fingerprint
    then
      return asset_record;
    end if;
    raise exception using errcode = '23505', message = 'Media asset is already archived by another operation.';
  end if;

  update public.media_assets
  set lifecycle_status = 'archived',
      archived_by_type = normalized_actor_type,
      archived_by_id = normalized_actor_id,
      archived_at = clock_timestamp(),
      archive_idempotency_key = normalized_idempotency_key,
      archive_input_fingerprint = computed_fingerprint
  where id = input_asset_id
  returning * into asset_record;

  return asset_record;
end;
$$;

alter function public.assert_media_asset_service_role() owner to postgres;
alter function public.media_asset_registration_fingerprint_v1(uuid,text,uuid,text,text,text,text,text,text,text,bigint,integer,integer,bigint,uuid,text,text) owner to postgres;
alter function public.media_asset_archive_fingerprint_v1(uuid,text,text) owner to postgres;
alter function public.media_asset_before_update_or_delete() owner to postgres;
alter function public.register_media_asset(uuid,text,uuid,text,text,text,text,text,text,text,bigint,integer,integer,bigint,uuid,text,text,text) owner to postgres;
alter function public.archive_media_asset(uuid,text,text,text) owner to postgres;

alter table public.media_assets enable row level security;

create policy media_assets_service_read
on public.media_assets
for select
to service_role
using (true);

revoke all on table public.media_assets from public,anon,authenticated,service_role;
grant select on table public.media_assets to service_role;

revoke all on function public.assert_media_asset_service_role() from public,anon,authenticated,service_role;
revoke all on function public.media_asset_registration_fingerprint_v1(uuid,text,uuid,text,text,text,text,text,text,text,bigint,integer,integer,bigint,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.media_asset_archive_fingerprint_v1(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.media_asset_before_update_or_delete() from public,anon,authenticated,service_role;
revoke all on function public.register_media_asset(uuid,text,uuid,text,text,text,text,text,text,text,bigint,integer,integer,bigint,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.archive_media_asset(uuid,text,text,text) from public,anon,authenticated,service_role;

grant execute on function public.register_media_asset(uuid,text,uuid,text,text,text,text,text,text,text,bigint,integer,integer,bigint,uuid,text,text,text) to service_role;
grant execute on function public.archive_media_asset(uuid,text,text,text) to service_role;

commit;
