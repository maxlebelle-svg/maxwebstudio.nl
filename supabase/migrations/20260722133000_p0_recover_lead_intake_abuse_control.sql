-- P0 production database recovery: durable privacy-preserving abuse-control ledger and RPCs.
-- Exact behavior is sourced from supabase/migrations/20260721040000_lead_intake_abuse_control.sql (9e6747d25c8e98b637c8bb6500e381dfeeacc605dd830b422a1a68ecea35415a).
begin;

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception using errcode='55000', message='P0 production database recovery must run as postgres.';
  end if;
  -- Staging nonce cleanup is isolated in the next fail-closed recovery step.
  if to_regclass('public.lead_intake_abuse_requests') is not null
    or to_regprocedure('public.mws_check_lead_intake_abuse_v1(text,text,text,text,text)') is not null
    or to_regprocedure('public.mws_cleanup_lead_intake_abuse_v1(integer)') is not null
  then
    raise exception using errcode='55000', message='Unexpected pre-existing P0 abuse-control objects detected.';
  end if;
end
$preflight$;

-- Customer Journey Release 1 / P0: durable lead-intake abuse-control foundation.
-- Stores only keyed HMAC outputs and bounded operational timestamps; never raw request data or PII.
-- The decision RPC has fixed, caller-independent limits: 5 unique requests / 15 minutes and
-- 20 unique requests / 24 hours per fingerprint. Allowed idempotent replays do not increment.
-- Retention is 48 hours. The decision path performs bounded opportunistic cleanup; the owner-only
-- cleanup function is intended for a separately approved future scheduler.
-- Rollback category: separately approved append-only compensation that revokes EXECUTE, removes
-- the functions and drops the table only after the lead endpoint no longer depends on this contract.

create table public.lead_intake_abuse_requests (
  scope text not null,
  fingerprint_hmac text not null,
  idempotency_hmac text not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  expires_at timestamptz not null,
  constraint lead_intake_abuse_requests_pkey primary key (scope, idempotency_hmac),
  constraint lead_intake_abuse_requests_scope_check
    check (scope = 'public_lead_intake_v1'),
  constraint lead_intake_abuse_requests_fingerprint_check
    check (fingerprint_hmac ~ '^[0-9a-f]{64}$'),
  constraint lead_intake_abuse_requests_idempotency_check
    check (idempotency_hmac ~ '^[0-9a-f]{64}$'),
  constraint lead_intake_abuse_requests_time_check
    check (
      last_seen_at >= first_seen_at
      and expires_at = first_seen_at + interval '48 hours'
    )
);

comment on table public.lead_intake_abuse_requests is
  'Private 48-hour P0 limiter ledger. Contains only rotating keyed HMAC values and operational timestamps; no raw PII or request payloads.';
comment on column public.lead_intake_abuse_requests.scope is
  'Fixed versioned limiter rule identifier; callers cannot select custom limits.';
comment on column public.lead_intake_abuse_requests.fingerprint_hmac is
  'Server-generated rotating HMAC-SHA-256 over coarsened request signals; never a raw IP address or user-agent.';
comment on column public.lead_intake_abuse_requests.idempotency_hmac is
  'Server-generated domain-separated HMAC-SHA-256 of the opaque intake idempotency key.';
comment on column public.lead_intake_abuse_requests.first_seen_at is
  'Database-clock timestamp used for fixed rolling-window decisions.';
comment on column public.lead_intake_abuse_requests.last_seen_at is
  'Database-clock timestamp of the latest accepted replay; it does not extend retention.';
comment on column public.lead_intake_abuse_requests.expires_at is
  'Exactly 48 hours after first_seen_at; eligible for bounded cleanup.';

create index lead_intake_abuse_requests_fingerprint_seen_idx
  on public.lead_intake_abuse_requests (scope, fingerprint_hmac, first_seen_at desc);
create index lead_intake_abuse_requests_expires_idx
  on public.lead_intake_abuse_requests (expires_at);

alter table public.lead_intake_abuse_requests enable row level security;
alter table public.lead_intake_abuse_requests owner to postgres;
revoke all on table public.lead_intake_abuse_requests from public, anon, authenticated, service_role;

create function public.mws_check_lead_intake_abuse_v1(
  p_scope text,
  p_fingerprint_hmac text,
  p_idempotency_hmac text,
  p_previous_fingerprint_hmac text default null,
  p_previous_idempotency_hmac text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_scope text := nullif(btrim(p_scope), '');
  v_fingerprint text := lower(nullif(btrim(p_fingerprint_hmac), ''));
  v_idempotency text := lower(nullif(btrim(p_idempotency_hmac), ''));
  v_previous text := lower(nullif(btrim(p_previous_fingerprint_hmac), ''));
  v_previous_idempotency text := lower(nullif(btrim(p_previous_idempotency_hmac), ''));
  v_fingerprints text[];
  v_idempotencies text[];
  v_existing public.lead_intake_abuse_requests%rowtype;
  v_short_count integer := 0;
  v_daily_count integer := 0;
begin
  if v_scope is distinct from 'public_lead_intake_v1' then
    raise exception using errcode = '22023', message = 'Unsupported lead-intake abuse-control scope.';
  end if;
  if v_fingerprint is null or v_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid lead-intake fingerprint reference.';
  end if;
  if v_idempotency is null or v_idempotency !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid lead-intake idempotency reference.';
  end if;
  if v_previous is not null and v_previous !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid previous lead-intake fingerprint reference.';
  end if;
  if v_previous_idempotency is not null and v_previous_idempotency !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid previous lead-intake idempotency reference.';
  end if;
  if v_previous = v_fingerprint then
    v_previous := null;
  end if;
  if v_previous_idempotency = v_idempotency then
    v_previous_idempotency := null;
  end if;
  v_fingerprints := case
    when v_previous is null then array[v_fingerprint]
    else array[v_fingerprint, v_previous]
  end;
  v_idempotencies := case
    when v_previous_idempotency is null then array[v_idempotency]
    else array[v_idempotency, v_previous_idempotency]
  end;

  -- The idempotency lock is always taken before the fingerprint lock. Requests sharing either
  -- identity therefore serialize without a lock-order cycle.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'lead-intake-abuse:idempotency:' || v_scope || ':' || least(v_idempotency, coalesce(v_previous_idempotency, v_idempotency)), 0
    )
  );
  if v_previous_idempotency is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'lead-intake-abuse:idempotency:' || v_scope || ':' || greatest(v_idempotency, v_previous_idempotency), 0
      )
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lead-intake-abuse:fingerprint:' || v_scope || ':' || v_fingerprint, 0)
  );
  if v_previous is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('lead-intake-abuse:fingerprint:' || v_scope || ':' || v_previous, 0)
    );
  end if;

  -- Expired state for this exact request can never survive into replay resolution, even when
  -- the bounded general cleanup batch is saturated by older unrelated rows.
  delete from public.lead_intake_abuse_requests
  where scope = v_scope
    and idempotency_hmac = any(v_idempotencies)
    and expires_at <= v_now;

  -- Bounded opportunistic cleanup keeps request-path work predictable. A separately approved
  -- scheduler may call the owner-only cleanup function for a hard physical-retention guarantee.
  delete from public.lead_intake_abuse_requests target
  where target.ctid in (
    select candidate.ctid
    from public.lead_intake_abuse_requests candidate
    where candidate.expires_at <= v_now
    order by candidate.expires_at
    limit 100
  );

  select * into v_existing
  from public.lead_intake_abuse_requests
  where scope = v_scope and idempotency_hmac = any(v_idempotencies)
  order by case when idempotency_hmac = v_idempotency then 0 else 1 end
  limit 1;

  if found then
    if not (v_existing.fingerprint_hmac = any(v_fingerprints)) then
      return jsonb_build_object(
        'version', 1, 'allowed', false, 'decision', 'idempotency_fingerprint_conflict',
        'replay', false, 'uniqueCounted', false, 'shortWindowCount', null,
        'dailyWindowCount', null, 'retryAfterSeconds', null
      );
    end if;
    update public.lead_intake_abuse_requests
    set last_seen_at = greatest(last_seen_at, v_now)
    where scope = v_scope and idempotency_hmac = v_existing.idempotency_hmac;
    select count(*)::integer into v_short_count
    from public.lead_intake_abuse_requests
    where scope = v_scope and fingerprint_hmac = any(v_fingerprints)
      and expires_at > v_now
      and first_seen_at > v_now - interval '15 minutes';
    select count(*)::integer into v_daily_count
    from public.lead_intake_abuse_requests
    where scope = v_scope and fingerprint_hmac = any(v_fingerprints)
      and expires_at > v_now
      and first_seen_at > v_now - interval '24 hours';
    return jsonb_build_object(
      'version', 1, 'allowed', true, 'decision', 'replay_allowed',
      'replay', true, 'uniqueCounted', false, 'shortWindowCount', v_short_count,
      'dailyWindowCount', v_daily_count, 'retryAfterSeconds', 0,
      'expiresAt', v_existing.expires_at,
      'matchedPreviousIdempotency', v_existing.idempotency_hmac <> v_idempotency
    );
  end if;

  select count(*)::integer into v_short_count
  from public.lead_intake_abuse_requests
  where scope = v_scope and fingerprint_hmac = any(v_fingerprints)
    and expires_at > v_now
    and first_seen_at > v_now - interval '15 minutes';
  select count(*)::integer into v_daily_count
  from public.lead_intake_abuse_requests
  where scope = v_scope and fingerprint_hmac = any(v_fingerprints)
    and expires_at > v_now
    and first_seen_at > v_now - interval '24 hours';

  if v_short_count >= 5 then
    return jsonb_build_object(
      'version', 1, 'allowed', false, 'decision', 'short_window_limited',
      'replay', false, 'uniqueCounted', false, 'shortWindowCount', v_short_count,
      'dailyWindowCount', v_daily_count, 'retryAfterSeconds', 900
    );
  end if;
  if v_daily_count >= 20 then
    return jsonb_build_object(
      'version', 1, 'allowed', false, 'decision', 'daily_window_limited',
      'replay', false, 'uniqueCounted', false, 'shortWindowCount', v_short_count,
      'dailyWindowCount', v_daily_count, 'retryAfterSeconds', 86400
    );
  end if;

  insert into public.lead_intake_abuse_requests (
    scope, fingerprint_hmac, idempotency_hmac, first_seen_at, last_seen_at, expires_at
  ) values (
    v_scope, v_fingerprint, v_idempotency, v_now, v_now, v_now + interval '48 hours'
  );

  return jsonb_build_object(
    'version', 1, 'allowed', true, 'decision', 'unique_allowed',
    'replay', false, 'uniqueCounted', true, 'shortWindowCount', v_short_count + 1,
    'dailyWindowCount', v_daily_count + 1, 'retryAfterSeconds', 0,
    'expiresAt', v_now + interval '48 hours'
  );
end;
$function$;

alter function public.mws_check_lead_intake_abuse_v1(text,text,text,text,text) owner to postgres;
revoke all on function public.mws_check_lead_intake_abuse_v1(text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.mws_check_lead_intake_abuse_v1(text,text,text,text,text)
  to service_role;

comment on function public.mws_check_lead_intake_abuse_v1(text,text,text,text,text) is
  'P0 service-role-only atomic limiter decision. Limits are fixed in the trusted function body; inputs contain keyed HMAC references only.';

create function public.mws_cleanup_lead_intake_abuse_v1(p_batch_size integer default 1000)
returns integer
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_deleted integer;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 5000 then
    raise exception using errcode = '22023', message = 'Cleanup batch size must be between 1 and 5000.';
  end if;
  delete from public.lead_intake_abuse_requests target
  where target.ctid in (
    select candidate.ctid
    from public.lead_intake_abuse_requests candidate
    where candidate.expires_at <= clock_timestamp()
    order by candidate.expires_at
    limit p_batch_size
  );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

alter function public.mws_cleanup_lead_intake_abuse_v1(integer) owner to postgres;
revoke all on function public.mws_cleanup_lead_intake_abuse_v1(integer)
  from public, anon, authenticated, service_role;

comment on function public.mws_cleanup_lead_intake_abuse_v1(integer) is
  'Owner-only bounded cleanup primitive for a separately approved scheduler; not executable by application roles.';

commit;
