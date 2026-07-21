\set ON_ERROR_STOP on

begin;

do $test$
declare
  v_result jsonb;
  v_index integer;
  v_fingerprint constant text := repeat('a', 64);
begin
  for v_index in 1..5 loop
    v_result := public.mws_check_lead_intake_abuse_v1(
      'public_lead_intake_v1', v_fingerprint, md5('short-' || v_index::text) || md5('short-b-' || v_index::text), null
    );
    if not (v_result ->> 'allowed')::boolean or v_result ->> 'decision' <> 'unique_allowed' then
      raise exception 'request % should be allowed: %', v_index, v_result;
    end if;
  end loop;
  v_result := public.mws_check_lead_intake_abuse_v1(
    'public_lead_intake_v1', v_fingerprint, repeat('b', 64), null
  );
  if (v_result ->> 'allowed')::boolean or v_result ->> 'decision' <> 'short_window_limited' then
    raise exception 'sixth request should be short-window limited: %', v_result;
  end if;

  v_result := public.mws_check_lead_intake_abuse_v1(
    'public_lead_intake_v1', v_fingerprint, md5('short-1') || md5('short-b-1'), null
  );
  if not (v_result ->> 'allowed')::boolean or not (v_result ->> 'replay')::boolean
    or (v_result ->> 'uniqueCounted')::boolean
  then
    raise exception 'same idempotency replay should be allowed without counting: %', v_result;
  end if;

  v_result := public.mws_check_lead_intake_abuse_v1(
    'public_lead_intake_v1', repeat('c', 64), md5('short-1') || md5('short-b-1'), null
  );
  if (v_result ->> 'allowed')::boolean or v_result ->> 'decision' <> 'idempotency_fingerprint_conflict' then
    raise exception 'cross-fingerprint idempotency reuse should conflict: %', v_result;
  end if;

  v_result := public.mws_check_lead_intake_abuse_v1(
    'public_lead_intake_v1', repeat('7', 64), repeat('8', 64), null, null
  );
  if not (v_result ->> 'allowed')::boolean or (v_result ->> 'replay')::boolean then
    raise exception 'pre-rotation request should be uniquely allowed: %', v_result;
  end if;
  v_result := public.mws_check_lead_intake_abuse_v1(
    'public_lead_intake_v1', repeat('9', 64), repeat('0', 64), repeat('7', 64), repeat('8', 64)
  );
  if not (v_result ->> 'allowed')::boolean or not (v_result ->> 'replay')::boolean
    or not (v_result ->> 'matchedPreviousIdempotency')::boolean
  then
    raise exception 'secret-rotation replay should match previous HMAC references: %', v_result;
  end if;
end
$test$;

insert into public.lead_intake_abuse_requests (
  scope, fingerprint_hmac, idempotency_hmac, first_seen_at, last_seen_at, expires_at
)
select
  'public_lead_intake_v1', repeat('d', 64),
  md5('daily-' || value::text) || md5('daily-b-' || value::text),
  statement_timestamp() - interval '1 hour', statement_timestamp() - interval '1 hour',
  statement_timestamp() + interval '47 hours'
from generate_series(1, 20) value;

do $test$
declare
  v_result jsonb;
begin
  v_result := public.mws_check_lead_intake_abuse_v1(
    'public_lead_intake_v1', repeat('d', 64), repeat('e', 64), null
  );
  if (v_result ->> 'allowed')::boolean or v_result ->> 'decision' <> 'daily_window_limited' then
    raise exception 'twenty-first daily request should be limited: %', v_result;
  end if;

  begin
    perform public.mws_check_lead_intake_abuse_v1('wrong_scope', repeat('a', 64), repeat('f', 64), null);
    raise exception 'wrong scope unexpectedly accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.mws_check_lead_intake_abuse_v1('public_lead_intake_v1', 'raw-ip', repeat('f', 64), null);
    raise exception 'invalid fingerprint unexpectedly accepted';
  exception when sqlstate '22023' then null;
  end;
end
$test$;

insert into public.lead_intake_abuse_requests (
  scope, fingerprint_hmac, idempotency_hmac, first_seen_at, last_seen_at, expires_at
) values (
  'public_lead_intake_v1', repeat('1', 64), repeat('2', 64),
  statement_timestamp() - interval '49 hours', statement_timestamp() - interval '49 hours',
  statement_timestamp() - interval '1 hour'
);

set local role postgres;
do $test$
declare
  v_deleted integer;
begin
  v_deleted := public.mws_cleanup_lead_intake_abuse_v1(100);
  if v_deleted < 1 then raise exception 'expired cleanup removed no rows'; end if;
end
$test$;
reset role;

do $test$
begin
  if has_table_privilege('anon', 'public.lead_intake_abuse_requests', 'select')
    or has_table_privilege('authenticated', 'public.lead_intake_abuse_requests', 'select')
    or has_table_privilege('service_role', 'public.lead_intake_abuse_requests', 'select')
  then
    raise exception 'application role unexpectedly has direct table access';
  end if;
  if has_function_privilege('anon', 'public.mws_check_lead_intake_abuse_v1(text,text,text,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.mws_check_lead_intake_abuse_v1(text,text,text,text,text)', 'execute')
  then
    raise exception 'public role unexpectedly has decision RPC access';
  end if;
  if not has_function_privilege('service_role', 'public.mws_check_lead_intake_abuse_v1(text,text,text,text,text)', 'execute')
    or not has_function_privilege('postgres', 'public.mws_check_lead_intake_abuse_v1(text,text,text,text,text)', 'execute')
  then
    raise exception 'service_role or owner decision RPC access missing';
  end if;
  if has_function_privilege('service_role', 'public.mws_cleanup_lead_intake_abuse_v1(integer)', 'execute')
    or has_function_privilege('anon', 'public.mws_cleanup_lead_intake_abuse_v1(integer)', 'execute')
    or has_function_privilege('authenticated', 'public.mws_cleanup_lead_intake_abuse_v1(integer)', 'execute')
  then
    raise exception 'cleanup must remain owner-only';
  end if;
end
$test$;

rollback;

set role service_role;
select public.mws_check_lead_intake_abuse_v1(
  'public_lead_intake_v1', repeat('3', 64), repeat('4', 64), null
);
reset role;

set role postgres;
select public.mws_check_lead_intake_abuse_v1(
  'public_lead_intake_v1', repeat('5', 64), repeat('6', 64), null
);
reset role;

delete from public.lead_intake_abuse_requests
where fingerprint_hmac in (repeat('3', 64), repeat('5', 64));
