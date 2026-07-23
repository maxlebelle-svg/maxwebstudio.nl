\set ON_ERROR_STOP on

begin;

set local role service_role;
do $test$
declare
  v_first jsonb;
  v_replay jsonb;
  v_conflict jsonb;
begin
  v_first := public.mws_consume_p0_staging_smoke_nonce_v1(
    'p0_staging_smoke_v1', repeat('a', 64), repeat('b', 64),
    '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e'
  );
  v_replay := public.mws_consume_p0_staging_smoke_nonce_v1(
    'p0_staging_smoke_v1', repeat('a', 64), repeat('b', 64),
    '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e'
  );
  v_conflict := public.mws_consume_p0_staging_smoke_nonce_v1(
    'p0_staging_smoke_v1', repeat('a', 64), repeat('c', 64),
    '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e'
  );
  if not (v_first ->> 'consumed')::boolean or v_first ->> 'decision' <> 'consumed' then
    raise exception 'first nonce should be consumed: %', v_first;
  end if;
  if (v_replay ->> 'consumed')::boolean or v_replay ->> 'decision' <> 'replay' then
    raise exception 'same binding should be replay: %', v_replay;
  end if;
  if (v_conflict ->> 'consumed')::boolean or v_conflict ->> 'decision' <> 'binding_conflict' then
    raise exception 'different binding should conflict: %', v_conflict;
  end if;

  begin
    perform public.mws_consume_p0_staging_smoke_nonce_v1(
      'wrong_scope', repeat('d', 64), repeat('e', 64),
      '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e'
    );
    raise exception 'wrong scope unexpectedly accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.mws_consume_p0_staging_smoke_nonce_v1(
      'p0_staging_smoke_v1', repeat('d', 64), repeat('e', 64), repeat('f', 64)
    );
    raise exception 'wrong target unexpectedly accepted';
  exception when sqlstate '22023' then null;
  end;
end
$test$;
reset role;

insert into public.p0_staging_smoke_nonces (
  scope, nonce_fingerprint, request_binding, target_binding, first_consumed_at, expires_at
) values (
  'p0_staging_smoke_v1', repeat('1', 64), repeat('2', 64),
  '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e',
  statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour'
);

set local role service_role;
do $test$
declare
  v_result jsonb;
begin
  v_result := public.mws_consume_p0_staging_smoke_nonce_v1(
    'p0_staging_smoke_v1', repeat('1', 64), repeat('3', 64),
    '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e'
  );
  if not (v_result ->> 'consumed')::boolean or v_result ->> 'decision' <> 'consumed' then
    raise exception 'expired nonce should permit fresh consumption: %', v_result;
  end if;
end
$test$;
reset role;

insert into public.p0_staging_smoke_nonces (
  scope, nonce_fingerprint, request_binding, target_binding, first_consumed_at, expires_at
)
select
  'p0_staging_smoke_v1', md5('expired-a-' || value::text) || md5('expired-b-' || value::text),
  md5('binding-a-' || value::text) || md5('binding-b-' || value::text),
  '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e',
  statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour'
from generate_series(1, 150) value;

set local role service_role;
select public.mws_consume_p0_staging_smoke_nonce_v1(
  'p0_staging_smoke_v1', repeat('4', 64), repeat('5', 64),
  '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e'
);
reset role;

do $test$
declare
  v_expired integer;
begin
  select count(*)::integer into v_expired
  from public.p0_staging_smoke_nonces where expires_at <= clock_timestamp();
  if v_expired <> 50 then
    raise exception 'bounded cleanup should remove exactly 100 general expired rows; remaining=%', v_expired;
  end if;

  if has_table_privilege('public', 'public.p0_staging_smoke_nonces', 'select')
    or has_table_privilege('anon', 'public.p0_staging_smoke_nonces', 'select')
    or has_table_privilege('authenticated', 'public.p0_staging_smoke_nonces', 'select')
    or has_table_privilege('service_role', 'public.p0_staging_smoke_nonces', 'select')
  then
    raise exception 'application role unexpectedly has direct nonce-table access';
  end if;
  if has_function_privilege('public', 'public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)', 'execute')
    or has_function_privilege('anon', 'public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)', 'execute')
    or has_function_privilege('authenticated', 'public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)', 'execute')
  then
    raise exception 'untrusted role unexpectedly has nonce RPC access';
  end if;
  if not has_function_privilege('service_role', 'public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)', 'execute')
    or not has_function_privilege('postgres', 'public.mws_consume_p0_staging_smoke_nonce_v1(text,text,text,text)', 'execute')
  then
    raise exception 'service_role or owner nonce RPC access missing';
  end if;
end
$test$;

rollback;

set role service_role;
select public.mws_consume_p0_staging_smoke_nonce_v1(
  'p0_staging_smoke_v1', repeat('6', 64), repeat('7', 64),
  '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e'
);
reset role;

set role postgres;
select public.mws_consume_p0_staging_smoke_nonce_v1(
  'p0_staging_smoke_v1', repeat('8', 64), repeat('9', 64),
  '9c7837f9516e4164cb8bf89311ed1d06499e62f6b123800a41aec0b32c71ef2e'
);
delete from public.p0_staging_smoke_nonces where nonce_fingerprint in (repeat('6', 64), repeat('8', 64));
reset role;
