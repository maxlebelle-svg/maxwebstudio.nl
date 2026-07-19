begin;

select set_config('request.jwt.claim.role', 'service_role', true);

insert into public.customers (id,name) values
  ('40000000-0000-4000-8000-000000000001','Media asset smoke customer one'),
  ('40000000-0000-4000-8000-000000000002','Media asset smoke customer two');

insert into public.files (
  id,customer_id,name,file_type,location,storage_path,status,
  uploaded_by_type,source_module,original_filename,mime_type,size_bytes,
  checksum,usage_rights_confirmed,is_primary
) values (
  '41000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'smoke-image.png','image','relationship-assets',
  '40000000-0000-4000-8000-000000000001/source/smoke-image.png','active',
  'system','media_asset_smoke','smoke-image.png','image/png',100,
  repeat('a',64),true,false
);

create function pg_temp.register_test_asset(
  test_idempotency_key text,
  test_checksum text,
  test_path text,
  test_version text default null,
  test_owner_scope text default 'internal',
  test_customer_id uuid default null,
  test_asset_type text default 'image',
  test_mime_type text default 'image/png',
  test_size_bytes bigint default 100,
  test_width_px integer default 10,
  test_height_px integer default 10,
  test_duration_ms bigint default null,
  test_source_file_id uuid default null,
  test_asset_id uuid default gen_random_uuid()
)
returns public.media_assets
language sql
set search_path = pg_catalog
as $$
  select public.register_media_asset(
    test_asset_id,test_owner_scope,test_customer_id,test_asset_type,'supabase_storage',
    'relationship-assets',test_path,test_version,test_checksum,test_mime_type,
    test_size_bytes,test_width_px,test_height_px,test_duration_ms,
    test_source_file_id,'system','media-asset-smoke',test_idempotency_key
  )
$$;

create temporary table media_asset_smoke_state on commit drop as
select
  (pg_temp.register_test_asset(
    'register:customer-image:v1',repeat('a',64),
    '40000000-0000-4000-8000-000000000001/source/smoke-image.png',null,
    'customer','40000000-0000-4000-8000-000000000001',
    'image','image/png',100,10,10,null,
    '41000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001'
  )).id as customer_image_id,
  (pg_temp.register_test_asset(
    'register:version-one:v1',repeat('b',64),'internal/video.mp4','v1',
    'internal',null,'video','video/mp4',200,20,20,1000,null,
    '42000000-0000-4000-8000-000000000002'
  )).id as version_one_id,
  (pg_temp.register_test_asset(
    'register:version-two:v1',repeat('c',64),'internal/video.mp4','v2',
    'internal',null,'video','video/mp4',201,20,20,1001,null,
    '42000000-0000-4000-8000-000000000003'
  )).id as version_two_id;

do $$
declare
  first_id uuid;
  retry_id uuid;
  deduplicated_id uuid;
begin
  select customer_image_id into first_id from media_asset_smoke_state;

  select (pg_temp.register_test_asset(
    'register:customer-image:v1',repeat('a',64),
    '40000000-0000-4000-8000-000000000001/source/smoke-image.png',null,
    'customer','40000000-0000-4000-8000-000000000001',
    'image','image/png',100,10,10,null,
    '41000000-0000-4000-8000-000000000001',
    '42000000-0000-4000-8000-000000000001'
  )).id into retry_id;
  if retry_id is distinct from first_id then
    raise exception 'identical registration retry must return the same media asset';
  end if;

  select (pg_temp.register_test_asset(
    'register:customer-image:deduplicated',repeat('a',64),
    '40000000-0000-4000-8000-000000000001/another-path.png',null,
    'customer','40000000-0000-4000-8000-000000000001',
    'image','image/png',100,10,10,null,null,
    '42000000-0000-4000-8000-000000000004'
  )).id into deduplicated_id;
  if deduplicated_id is distinct from first_id then
    raise exception 'scoped checksum deduplication must return the existing media asset';
  end if;

  if (select version_one_id = version_two_id from media_asset_smoke_state) then
    raise exception 'different immutable storage versions must remain independently registrable';
  end if;
end;
$$;

do $$
begin
  begin
    perform pg_temp.register_test_asset(
      'register:customer-image:v1',repeat('d',64),
      '40000000-0000-4000-8000-000000000001/idempotency-conflict.png',null,
      'customer','40000000-0000-4000-8000-000000000001',
      'image','image/png',100,10,10,null,null,
      '42000000-0000-4000-8000-000000000001'
    );
    raise exception 'conflicting registration retry must be rejected';
  exception when unique_violation then null;
  end;

  begin
    perform pg_temp.register_test_asset(
      'register:reserved-id-conflict:v1',repeat('d',64),
      '40000000-0000-4000-8000-000000000001/reserved-id-conflict.png',null,
      'customer','40000000-0000-4000-8000-000000000001',
      'image','image/png',100,10,10,null,null,
      '42000000-0000-4000-8000-000000000001'
    );
    raise exception 'same reserved asset ID with different immutable input must be rejected';
  exception when unique_violation then null;
  end;

  begin
    perform pg_temp.register_test_asset(
      'register:checksum-conflict:v1',repeat('a',64),'internal/checksum-conflict.png',null,
      'customer','40000000-0000-4000-8000-000000000001',
      'image','image/png',101,10,10,null,null
    );
    raise exception 'same checksum with conflicting technical metadata must be rejected';
  exception when unique_violation then null;
  end;

  begin
    perform pg_temp.register_test_asset(
      'register:storage-conflict:v1',repeat('e',64),
      '40000000-0000-4000-8000-000000000001/source/smoke-image.png',null,
      'customer','40000000-0000-4000-8000-000000000001'
    );
    raise exception 'unversioned storage identity must be unique when version is null';
  exception when unique_violation then null;
  end;

  begin
    perform pg_temp.register_test_asset(
      'register:bad-owner:v1',repeat('f',64),'internal/bad-owner.png',null,
      'internal','40000000-0000-4000-8000-000000000001'
    );
    raise exception 'internal ownership must reject a customer id';
  exception when check_violation then null;
  end;

  begin
    perform pg_temp.register_test_asset(
      'register:bad-image:v1',repeat('1',64),'internal/bad-image.png',null,
      'internal',null,'image','image/png',100,10,10,1,null
    );
    raise exception 'image duration must be rejected';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform pg_temp.register_test_asset(
      'register:bad-video:v1',repeat('2',64),'internal/bad-video.mp4',null,
      'internal',null,'video','video/mp4',100,10,10,null,null
    );
    raise exception 'video without duration must be rejected';
  exception when invalid_parameter_value then null;
  end;

  begin
    perform pg_temp.register_test_asset(
      'register:cross-customer-file:v1',repeat('a',64),
      '40000000-0000-4000-8000-000000000001/source/smoke-image.png',null,
      'customer','40000000-0000-4000-8000-000000000002',
      'image','image/png',100,10,10,null,
      '41000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-customer source_file must be rejected';
  exception when check_violation then null;
  end;

  begin
    perform pg_temp.register_test_asset(
      'register:source-mismatch:v1',repeat('a',64),
      '40000000-0000-4000-8000-000000000001/source/wrong.png',null,
      'customer','40000000-0000-4000-8000-000000000001',
      'image','image/png',100,10,10,null,
      '41000000-0000-4000-8000-000000000001'
    );
    raise exception 'source_file metadata mismatch must be rejected';
  exception when check_violation then null;
  end;
end;
$$;

do $$
declare
  target_id uuid;
  archived_id uuid;
  archived_retry_id uuid;
  deduplicated_id uuid;
begin
  select customer_image_id into target_id from media_asset_smoke_state;
  select (public.archive_media_asset(
    target_id,'system','media-asset-smoke','archive:customer-image:v1'
  )).id into archived_id;
  select (public.archive_media_asset(
    target_id,'system','media-asset-smoke','archive:customer-image:v1'
  )).id into archived_retry_id;
  if archived_id is distinct from archived_retry_id then
    raise exception 'identical archive retry must return the same media asset';
  end if;

  select (pg_temp.register_test_asset(
    'register:archived-checksum:v1',repeat('a',64),'another/archived-source.png',null,
    'customer','40000000-0000-4000-8000-000000000001',
    'image','image/png',100,10,10,null,null,
    '42000000-0000-4000-8000-000000000005'
  )).id into deduplicated_id;
  if deduplicated_id is distinct from target_id
    or (select lifecycle_status from public.media_assets where id = target_id) <> 'archived'
  then
    raise exception 'checksum deduplication must not reactivate an archived media asset';
  end if;

  begin
    perform public.archive_media_asset(
      target_id,'system','different-actor','archive:customer-image:v2'
    );
    raise exception 'conflicting archive retry must be rejected';
  exception when unique_violation then null;
  end;

  begin
    update public.media_assets set mime_type = 'image/jpeg' where id = target_id;
    raise exception 'immutable media asset metadata update must be rejected';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    update public.media_assets set lifecycle_status = 'active', archived_by_type = null,
      archived_by_id = null, archived_at = null, archive_idempotency_key = null,
      archive_input_fingerprint = null where id = target_id;
    raise exception 'archived media asset reactivation must be rejected';
  exception when object_not_in_prerequisite_state then null;
  end;

  begin
    delete from public.media_assets where id = target_id;
    raise exception 'media asset delete must be rejected';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

do $$
begin
  if has_table_privilege('anon','public.media_assets','select')
    or has_table_privilege('anon','public.media_assets','insert')
    or has_table_privilege('authenticated','public.media_assets','select')
    or has_table_privilege('authenticated','public.media_assets','insert')
  then
    raise exception 'anon/authenticated must have no media_assets table privileges';
  end if;

  if not has_table_privilege('service_role','public.media_assets','select')
    or has_table_privilege('service_role','public.media_assets','insert')
    or has_table_privilege('service_role','public.media_assets','update')
    or has_table_privilege('service_role','public.media_assets','delete')
  then
    raise exception 'service_role media_assets table privileges are unsafe';
  end if;

  if has_function_privilege('anon',
      'public.register_media_asset(uuid,text,uuid,text,text,text,text,text,text,text,bigint,integer,integer,bigint,uuid,text,text,text)',
      'execute')
    or has_function_privilege('authenticated',
      'public.archive_media_asset(uuid,text,text,text)','execute')
    or not has_function_privilege('service_role',
      'public.register_media_asset(uuid,text,uuid,text,text,text,text,text,text,text,bigint,integer,integer,bigint,uuid,text,text,text)',
      'execute')
    or not has_function_privilege('service_role',
      'public.archive_media_asset(uuid,text,text,text)','execute')
    or has_function_privilege('service_role',
      'public.media_asset_registration_fingerprint_v1(uuid,text,uuid,text,text,text,text,text,text,text,bigint,integer,integer,bigint,uuid,text,text)',
      'execute')
  then
    raise exception 'media asset function execute grants are unsafe';
  end if;
end;
$$;

rollback;
