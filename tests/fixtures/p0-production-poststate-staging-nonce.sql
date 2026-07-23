\set ON_ERROR_STOP on

create table public.p0_staging_smoke_nonces (
  scope text not null,
  nonce_fingerprint text not null,
  request_binding text not null,
  target_binding text not null,
  first_consumed_at timestamptz not null,
  expires_at timestamptz not null,
  constraint p0_staging_smoke_nonces_pkey primary key (scope,nonce_fingerprint),
  constraint p0_staging_smoke_nonces_scope_check check (scope='p0_staging_smoke_v1'),
  constraint p0_staging_smoke_nonces_nonce_check check (nonce_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint p0_staging_smoke_nonces_request_check check (request_binding ~ '^[0-9a-f]{64}$'),
  constraint p0_staging_smoke_nonces_target_check check (target_binding='9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e'),
  constraint p0_staging_smoke_nonces_time_check check (expires_at=first_consumed_at+interval '1 hour')
);
create index p0_staging_smoke_nonces_expires_idx on public.p0_staging_smoke_nonces(expires_at);
alter table public.p0_staging_smoke_nonces enable row level security;
alter table public.p0_staging_smoke_nonces owner to postgres;
revoke all on table public.p0_staging_smoke_nonces from public,anon,authenticated,service_role;

create function public.mws_consume_p0_staging_smoke_nonce_v1(
  p_scope text,p_nonce_fingerprint text,p_request_binding text,p_target_binding text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_scope text := nullif(btrim(p_scope), '');
  v_nonce text := lower(nullif(btrim(p_nonce_fingerprint), ''));
  v_request text := lower(nullif(btrim(p_request_binding), ''));
  v_target text := lower(nullif(btrim(p_target_binding), ''));
  v_existing public.p0_staging_smoke_nonces%rowtype;
begin
  if v_scope is distinct from 'p0_staging_smoke_v1' then
    raise exception using errcode = '22023', message = 'Unsupported P0 staging-smoke scope.';
  end if;
  if v_nonce is null or v_nonce !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid staging-smoke nonce reference.';
  end if;
  if v_request is null or v_request !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid staging-smoke request binding.';
  end if;
  if v_target is distinct from '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e' then
    raise exception using errcode = '22023', message = 'Unsupported staging-smoke target binding.';
  end if;

  -- Every contender for one nonce serializes on the same transaction-scoped lock. Hash collisions
  -- can only serialize unrelated requests; they cannot permit a duplicate consumption.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('p0-staging-smoke-nonce:' || v_scope || ':' || v_nonce, 0)
  );

  -- An expired exact nonce is removed even if the general cleanup batch is full.
  delete from public.p0_staging_smoke_nonces
  where scope = v_scope
    and nonce_fingerprint = v_nonce
    and expires_at <= v_now;

  delete from public.p0_staging_smoke_nonces target
  where target.ctid in (
    select candidate.ctid
    from public.p0_staging_smoke_nonces candidate
    where candidate.expires_at <= v_now
    order by candidate.expires_at
    limit 100
  );

  select * into v_existing
  from public.p0_staging_smoke_nonces
  where scope = v_scope and nonce_fingerprint = v_nonce;

  if found then
    if v_existing.request_binding = v_request and v_existing.target_binding = v_target then
      return jsonb_build_object(
        'version', 1, 'consumed', false, 'decision', 'replay',
        'expiresAt', v_existing.expires_at
      );
    end if;
    return jsonb_build_object(
      'version', 1, 'consumed', false, 'decision', 'binding_conflict',
      'expiresAt', v_existing.expires_at
    );
  end if;

  insert into public.p0_staging_smoke_nonces (
    scope, nonce_fingerprint, request_binding, target_binding, first_consumed_at, expires_at
  ) values (
    v_scope, v_nonce, v_request, v_target, v_now, v_now + interval '1 hour'
  );

  return jsonb_build_object(
    'version', 1, 'consumed', true, 'decision', 'consumed',
    'expiresAt', v_now + interval '1 hour'
  );
end;
$function$;
alter function public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text) owner to postgres;
revoke all on function public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text) to service_role;
