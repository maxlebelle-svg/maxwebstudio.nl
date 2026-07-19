begin;

select set_config('request.jwt.claim.role','service_role',true);

insert into public.customers(id,name) values
  ('50000000-0000-4000-8000-000000000001','Ingest smoke customer one'),
  ('50000000-0000-4000-8000-000000000002','Ingest smoke customer two');

insert into public.files(
  id,customer_id,name,file_type,location,storage_path,status,uploaded_by_type,source_module,
  original_filename,mime_type,size_bytes,checksum,usage_rights_confirmed,is_primary
) values (
  '51000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
  'source.png','image','relationship-assets','50000000-0000-4000-8000-000000000001/source.png',
  'active','system','asset_ingest_smoke','source.png','image/png',100,repeat('a',64),true,false
);

create function pg_temp.reserve_ingest(
  test_key text,
  test_owner_scope text default 'internal',
  test_customer_id uuid default null,
  test_filename text default 'smoke.png',
  test_source_type text default 'direct_upload',
  test_source_file_id uuid default null,
  test_max_attempts smallint default 8
)
returns public.asset_ingest_operations
language sql
set search_path=pg_catalog
as $$
  select public.reserve_asset_ingest_operation(
    test_owner_scope,test_customer_id,test_key,'social_editorial',test_source_type,test_source_file_id,
    null,null,null,test_filename,'smoke.png',null,'immutable-media-assets',1::smallint,
    'system','asset-ingest-smoke','asset_ingest','smoke_test:v1',
    '52000000-0000-4000-8000-000000000001',test_max_attempts
  )
$$;

create function pg_temp.advance_ingest_validated(test_key text,test_checksum text,test_worker text)
returns public.asset_ingest_operations
language plpgsql
set search_path=pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype;
begin
  r:=pg_temp.reserve_ingest(test_key);
  r:=public.claim_next_asset_ingest_operation(test_worker,120);
  r:=public.record_asset_ingest_bytes_received(
    r.operation_id,test_worker,r.lease_token,r.row_version,'asset-ingest-quarantine',
    'operations/'||r.operation_id::text||'/source',null
  );
  r:=public.record_asset_ingest_validated(
    r.operation_id,test_worker,r.lease_token,r.row_version,test_checksum,'image/png',100,10,10,null,
    'internal/'||test_checksum||'/'||r.reserved_asset_id::text||'/smoke.png'
  );
  return r;
end;
$$;

create function pg_temp.advance_ingest_uploaded(test_key text,test_checksum text,test_worker text)
returns public.asset_ingest_operations
language plpgsql
set search_path=pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype;
begin
  r:=pg_temp.advance_ingest_validated(test_key,test_checksum,test_worker);
  r:=public.record_asset_ingest_uploaded(r.operation_id,test_worker,r.lease_token,r.row_version,'storage-v1');
  return r;
end;
$$;

create function pg_temp.make_cleanup_eligible(test_operation_id uuid)
returns void
language plpgsql
set search_path=pg_catalog
as $$
begin
  perform set_config('app.asset_ingest_action','cleanup_result',true);
  update public.asset_ingest_operations set cleanup_eligible_at=clock_timestamp()-interval '1 second',
    next_attempt_at=clock_timestamp(),row_version=row_version+1 where operation_id=test_operation_id;
end;
$$;

create function pg_temp.expire_ingest_lease(test_operation_id uuid)
returns public.asset_ingest_operations
language plpgsql
set search_path=pg_catalog
as $$
declare r public.asset_ingest_operations%rowtype;
begin
  perform set_config('app.asset_ingest_action','recover',true);
  update public.asset_ingest_operations set lease_acquired_at=clock_timestamp()-interval '2 minutes',
    lease_heartbeat_at=clock_timestamp()-interval '2 minutes',lease_expires_at=clock_timestamp()-interval '1 minute',
    row_version=row_version+1 where operation_id=test_operation_id returning * into r;
  return r;
end;
$$;

create temporary table ingest_reservation_state on commit drop as
select (pg_temp.reserve_ingest('ingest:reservation:v1')).*;

do $$
declare first_record public.asset_ingest_operations%rowtype; retry_record public.asset_ingest_operations%rowtype;
begin
  select * into first_record from ingest_reservation_state;
  retry_record:=pg_temp.reserve_ingest('ingest:reservation:v1');
  if retry_record.operation_id is distinct from first_record.operation_id
    or retry_record.reserved_asset_id is distinct from first_record.reserved_asset_id then
    raise exception 'identical ingest reservation retry must return the same operation and reserved asset ID';
  end if;
  begin
    perform pg_temp.reserve_ingest('ingest:reservation:v1','internal',null,'different.png');
    raise exception 'conflicting ingest reservation retry must be rejected';
  exception when unique_violation then null;
  end;
end;
$$;

do $$
declare claimed public.asset_ingest_operations%rowtype; renewed public.asset_ingest_operations%rowtype; scheduled public.asset_ingest_operations%rowtype;
begin
  claimed:=public.claim_next_asset_ingest_operation('worker-reservation',120);
  if claimed.operation_id is distinct from (select operation_id from ingest_reservation_state)
    or claimed.attempt_count<>1 or claimed.lease_token is null then
    raise exception 'claim must exclusively lease the next ingest operation and increment attempt count once';
  end if;
  if (public.claim_next_asset_ingest_operation('worker-race-loser',120)).operation_id is not null then
    raise exception 'a second worker must not claim an already leased ingest operation';
  end if;
  begin
    perform public.renew_asset_ingest_lease(claimed.operation_id,'worker-reservation',gen_random_uuid(),claimed.row_version,120);
    raise exception 'wrong lease fencing token must be rejected';
  exception when serialization_failure then null;
  end;
  begin
    perform public.renew_asset_ingest_lease(claimed.operation_id,'worker-reservation',claimed.lease_token,claimed.row_version-1,120);
    raise exception 'stale ingest row version must be rejected';
  exception when serialization_failure then null;
  end;
  renewed:=public.renew_asset_ingest_lease(claimed.operation_id,'worker-reservation',claimed.lease_token,claimed.row_version,120);
  if renewed.attempt_count<>1 then raise exception 'lease heartbeat must not increment attempt count'; end if;
  scheduled:=public.schedule_asset_ingest_retry(
    renewed.operation_id,'worker-reservation',renewed.lease_token,renewed.row_version,
    'storage.timeout','temporary storage timeout',clock_timestamp()+interval '10 minutes'
  );
  if scheduled.status<>'reserved' or scheduled.failure_disposition<>'retryable' or scheduled.lease_token is not null then
    raise exception 'retry scheduling must retain status and release the lease';
  end if;
end;
$$;

do $$
declare r public.asset_ingest_operations%rowtype;
begin
  r:=pg_temp.reserve_ingest('ingest:expired-lease:v1');
  r:=public.claim_next_asset_ingest_operation('worker-expired',120);
  r:=pg_temp.expire_ingest_lease(r.operation_id);
  r:=public.recover_expired_asset_ingest_lease(r.operation_id,r.row_version);
  if r.lease_token is not null then raise exception 'expired lease recovery must clear the fencing lease'; end if;
  r:=public.claim_next_asset_ingest_operation('worker-recovered',120);
  if r.attempt_count<>2 or r.lease_worker_id<>'worker-recovered' then
    raise exception 'recovered ingest operation must become safely claimable by a new worker';
  end if;
  r:=public.schedule_asset_ingest_retry(r.operation_id,'worker-recovered',r.lease_token,r.row_version,
    'storage.recovery_wait','wait after recovery',clock_timestamp()+interval '10 minutes');
end;
$$;

create temporary table ingest_happy_state on commit drop as
select (pg_temp.reserve_ingest('ingest:happy:v1')).*;

do $$
declare r public.asset_ingest_operations%rowtype; registered_asset public.media_assets%rowtype;
begin
  r:=public.claim_next_asset_ingest_operation('worker-happy',120);
  r:=public.record_asset_ingest_bytes_received(
    r.operation_id,'worker-happy',r.lease_token,r.row_version,'asset-ingest-quarantine',
    'operations/'||r.operation_id::text||'/source',null
  );
  r:=public.record_asset_ingest_validated(
    r.operation_id,'worker-happy',r.lease_token,r.row_version,repeat('b',64),'image/png',100,10,10,null,
    'internal/'||repeat('b',64)||'/'||r.reserved_asset_id::text||'/smoke.png'
  );
  r:=public.record_asset_ingest_uploaded(r.operation_id,'worker-happy',r.lease_token,r.row_version,'storage-v1');
  registered_asset:=public.register_media_asset(
    r.reserved_asset_id,'internal',null,'image','supabase_storage',r.target_bucket,r.target_object_path,
    r.target_object_version,r.byte_checksum,r.detected_mime_type,r.size_bytes,r.width_px,r.height_px,r.duration_ms,
    null,'system','asset-ingest-smoke','media:ingest-happy:v1'
  );
  r:=public.record_asset_ingest_registered(r.operation_id,'worker-happy',r.lease_token,r.row_version,registered_asset.id);
  if r.status<>'registered' or r.registered_media_asset_id<>r.reserved_asset_id or r.lease_token is not null then
    raise exception 'happy ingest chain must terminate as registered with its reserved asset ID';
  end if;
  begin
    perform public.mark_asset_ingest_cleanup_pending(
      r.operation_id,'worker-happy',gen_random_uuid(),r.row_version,registered_asset.id,
      clock_timestamp()+interval '24 hours','must_not_cleanup_registered'
    );
    raise exception 'registered ingest operation must be absolutely excluded from cleanup';
  exception when serialization_failure then null;
  end;
end;
$$;

create temporary table ingest_dedup_state on commit drop as
select (pg_temp.reserve_ingest('ingest:deduplicated:v1')).*;

do $$
declare r public.asset_ingest_operations%rowtype; canonical_id uuid;
begin
  select id into canonical_id from public.media_assets where byte_checksum=repeat('b',64) and owner_scope='internal';
  r:=public.claim_next_asset_ingest_operation('worker-dedup',120);
  r:=public.record_asset_ingest_bytes_received(
    r.operation_id,'worker-dedup',r.lease_token,r.row_version,'asset-ingest-quarantine',
    'operations/'||r.operation_id::text||'/source',null
  );
  r:=public.record_asset_ingest_validated(
    r.operation_id,'worker-dedup',r.lease_token,r.row_version,repeat('b',64),'image/png',100,10,10,null,
    'internal/'||repeat('b',64)||'/'||r.reserved_asset_id::text||'/smoke.png'
  );
  r:=public.record_asset_ingest_deduplicated(r.operation_id,'worker-dedup',r.lease_token,r.row_version,canonical_id);
  if r.status<>'deduplicated' or r.registered_media_asset_id<>canonical_id
    or r.registered_media_asset_id=r.reserved_asset_id then
    raise exception 'validated duplicate bytes must terminate on the existing canonical media asset';
  end if;
end;
$$;

do $$
declare r public.asset_ingest_operations%rowtype;
begin
  r:=pg_temp.reserve_ingest('ingest:failed:v1','internal',null,'bad.png','direct_upload',null,1::smallint);
  r:=public.claim_next_asset_ingest_operation('worker-failed',120);
  begin
    perform public.schedule_asset_ingest_retry(r.operation_id,'worker-failed',r.lease_token,r.row_version,
      'retry.exhausted','must not retry',clock_timestamp()+interval '1 minute');
    raise exception 'max-attempt ingest operation must not schedule another retry';
  exception when serialization_failure then null;
  end;
  r:=public.mark_asset_ingest_failed(
    r.operation_id,'worker-failed',r.lease_token,r.row_version,'validation.mime_mismatch','spoofed MIME','permanent'
  );
  if r.status<>'failed' or r.completed_at is null then raise exception 'terminal failure transition failed'; end if;
  if (public.claim_next_asset_ingest_operation('worker-terminal',120)).operation_id=r.operation_id then
    raise exception 'terminal ingest operation must never be reclaimed';
  end if;
end;
$$;

do $$
declare r public.asset_ingest_operations%rowtype;
begin
  r:=pg_temp.reserve_ingest('ingest:bytes-failed:v1');
  r:=public.claim_next_asset_ingest_operation('worker-bytes-failed',120);
  r:=public.record_asset_ingest_bytes_received(r.operation_id,'worker-bytes-failed',r.lease_token,r.row_version,
    'asset-ingest-quarantine','operations/'||r.operation_id::text||'/source',null);
  r:=public.mark_asset_ingest_failed(r.operation_id,'worker-bytes-failed',r.lease_token,r.row_version,
    'validation.bytes_invalid','invalid bytes','permanent');
  if r.status<>'failed' then raise exception 'bytes_received to failed transition failed'; end if;

  r:=pg_temp.advance_ingest_validated('ingest:validated-failed:v1',repeat('e',64),'worker-validated-failed');
  r:=public.mark_asset_ingest_failed(r.operation_id,'worker-validated-failed',r.lease_token,r.row_version,
    'validation.policy_rejected','policy rejected','permanent');
  if r.status<>'failed' then raise exception 'validated to failed transition failed'; end if;

  r:=pg_temp.advance_ingest_uploaded('ingest:uploaded-failed:v1',repeat('f',64),'worker-uploaded-failed');
  r:=public.mark_asset_ingest_failed(r.operation_id,'worker-uploaded-failed',r.lease_token,r.row_version,
    'registration.manual_review','uncertain registration','manual_review');
  if r.status<>'failed' or r.cleanup_state<>'manual_review' then raise exception 'uploaded to failed transition failed'; end if;
end;
$$;

create temporary table ingest_cleanup_canonical on commit drop as
select (public.register_media_asset(
  '53000000-0000-4000-8000-000000000001','internal',null,'image','supabase_storage',
  'immutable-media-assets','internal/'||repeat('c',64)||'/53000000-0000-4000-8000-000000000001/smoke.png',
  'storage-v1',repeat('c',64),'image/png',100,10,10,null,null,'system','asset-ingest-smoke','media:cleanup-canonical:v1'
)).id as media_asset_id;

do $$
declare r public.asset_ingest_operations%rowtype; canonical_id uuid;
begin
  select media_asset_id into canonical_id from ingest_cleanup_canonical;
  r:=pg_temp.advance_ingest_uploaded('ingest:cleanup-deduplicated:v1',repeat('c',64),'worker-cleanup-dedup-upload');
  r:=public.mark_asset_ingest_cleanup_pending(r.operation_id,'worker-cleanup-dedup-upload',r.lease_token,r.row_version,
    canonical_id,clock_timestamp()+interval '24 hours 1 minute','duplicate_after_upload');
  perform pg_temp.make_cleanup_eligible(r.operation_id);
  r:=public.claim_next_asset_ingest_operation('worker-cleanup-dedup',120);
  r:=public.authorize_asset_ingest_cleanup(r.operation_id,'worker-cleanup-dedup',r.lease_token,r.row_version,'orphan_proof_complete');
  r:=public.record_asset_ingest_cleanup_result(r.operation_id,'worker-cleanup-dedup',r.lease_token,r.row_version,'deleted','exact_delete_confirmed');
  r:=public.record_asset_ingest_deduplicated(r.operation_id,'worker-cleanup-dedup',r.lease_token,r.row_version,canonical_id);
  if r.status<>'deduplicated' or r.cleanup_state<>'deleted' then raise exception 'cleanup_pending to deduplicated transition failed'; end if;

  r:=pg_temp.advance_ingest_uploaded('ingest:cleanup-failed:v1',repeat('c',64),'worker-cleanup-failed-upload');
  r:=public.mark_asset_ingest_cleanup_pending(r.operation_id,'worker-cleanup-failed-upload',r.lease_token,r.row_version,
    canonical_id,clock_timestamp()+interval '24 hours 1 minute','duplicate_after_upload');
  perform pg_temp.make_cleanup_eligible(r.operation_id);
  r:=public.claim_next_asset_ingest_operation('worker-cleanup-failed',120);
  r:=public.mark_asset_ingest_failed(r.operation_id,'worker-cleanup-failed',r.lease_token,r.row_version,
    'cleanup.manual_review','cleanup uncertain','manual_review');
  if r.status<>'failed' or r.cleanup_state<>'manual_review' then raise exception 'cleanup_pending to failed transition failed'; end if;
end;
$$;

do $$
declare r public.asset_ingest_operations%rowtype; registered_asset public.media_assets%rowtype;
begin
  r:=pg_temp.advance_ingest_uploaded('ingest:cleanup-registered:v1',repeat('d',64),'worker-cleanup-registered-upload');
  r:=public.mark_asset_ingest_cleanup_pending(r.operation_id,'worker-cleanup-registered-upload',r.lease_token,r.row_version,
    null,clock_timestamp()+interval '24 hours 1 minute','lost_registration_response');
  perform pg_temp.make_cleanup_eligible(r.operation_id);
  r:=public.claim_next_asset_ingest_operation('worker-cleanup-registered',120);
  registered_asset:=public.register_media_asset(
    r.reserved_asset_id,'internal',null,'image','supabase_storage',r.target_bucket,r.target_object_path,
    r.target_object_version,r.byte_checksum,r.detected_mime_type,r.size_bytes,r.width_px,r.height_px,r.duration_ms,
    null,'system','asset-ingest-smoke','media:cleanup-registered:v1'
  );
  r:=public.record_asset_ingest_registered(r.operation_id,'worker-cleanup-registered',r.lease_token,r.row_version,registered_asset.id);
  if r.status<>'registered' or r.cleanup_state<>'not_required' then raise exception 'cleanup_pending to registered transition failed'; end if;
end;
$$;

do $$
begin
  perform pg_temp.reserve_ingest('ingest:customer-scope:v1','customer','50000000-0000-4000-8000-000000000001');
  perform pg_temp.reserve_ingest('ingest:customer-scope:v1','customer','50000000-0000-4000-8000-000000000002');
  begin
    perform pg_temp.reserve_ingest(
      'ingest:cross-customer-source:v1','customer','50000000-0000-4000-8000-000000000002',
      'source.png','source_file','51000000-0000-4000-8000-000000000001'
    );
    raise exception 'cross-customer source_file ingest must be rejected';
  exception when check_violation then null;
  end;
end;
$$;

do $$
declare operation_target uuid;
begin
  operation_target := (pg_temp.reserve_ingest('ingest:forbidden-transition:v1')).operation_id;
  perform set_config('app.asset_ingest_action','uploaded',true);
  begin
    update public.asset_ingest_operations
       set status='uploaded', row_version=row_version+1
     where operation_id=operation_target;
    raise exception 'reserved to uploaded transition must be rejected';
  exception when object_not_in_prerequisite_state then null;
  end;

  select operation_id into operation_target from ingest_happy_state;
  perform set_config('app.asset_ingest_action','',true);
  begin
    update public.asset_ingest_operations set original_filename='mutated.png' where operation_id=operation_target;
    raise exception 'direct immutable ingest operation update must be rejected';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.asset_ingest_operations where operation_id=operation_target;
    raise exception 'asset ingest operation delete must be rejected';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    update public.asset_ingest_operation_events set reason_code='mutated' where operation_id=operation_target;
    raise exception 'asset ingest audit events must reject updates';
  exception when object_not_in_prerequisite_state then null;
  end;
  begin
    delete from public.asset_ingest_operation_events where operation_id=operation_target;
    raise exception 'asset ingest audit events must reject deletes';
  exception when object_not_in_prerequisite_state then null;
  end;
end;
$$;

do $$
begin
  if has_table_privilege('anon','public.asset_ingest_operations','select')
    or has_table_privilege('authenticated','public.asset_ingest_operations','select')
    or has_table_privilege('service_role','public.asset_ingest_operations','insert')
    or has_table_privilege('service_role','public.asset_ingest_operations','update')
    or has_table_privilege('service_role','public.asset_ingest_operation_events','insert') then
    raise exception 'asset ingest table grants are unsafe';
  end if;
  if not has_table_privilege('service_role','public.asset_ingest_operations','select')
    or not has_function_privilege('service_role',
      'public.reserve_asset_ingest_operation(text,uuid,text,text,text,uuid,text,text,text,text,text,text,text,smallint,text,text,text,text,uuid,smallint)','execute')
    or has_function_privilege('anon',
      'public.claim_next_asset_ingest_operation(text,integer)','execute')
    or has_function_privilege('authenticated',
      'public.claim_next_asset_ingest_operation(text,integer)','execute')
    or has_function_privilege('service_role',
      'public.append_asset_ingest_operation_event(uuid,text,text,text,text,integer,text,text,text,text,jsonb)','execute') then
    raise exception 'asset ingest RPC or helper grants are unsafe';
  end if;
end;
$$;

do $$
begin
  if not exists(select 1 from public.asset_ingest_operation_events where event_type='reserved')
    or not exists(select 1 from public.asset_ingest_operation_events where event_type='claimed')
    or not exists(select 1 from public.asset_ingest_operation_events where event_type='validated')
    or not exists(select 1 from public.asset_ingest_operation_events where event_type='registration_succeeded')
    or not exists(select 1 from public.asset_ingest_operation_events where event_type='deduplicated')
    or not exists(select 1 from public.asset_ingest_operation_events where event_type='retry_scheduled')
    or not exists(select 1 from public.asset_ingest_operation_events where event_type='failed') then
    raise exception 'asset ingest audit trail is incomplete';
  end if;
end;
$$;

rollback;
