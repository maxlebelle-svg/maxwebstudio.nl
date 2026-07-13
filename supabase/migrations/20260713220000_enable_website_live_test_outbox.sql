-- Phase 10: allow the bounded test worker to claim the website-live mail effect.
-- Additive/idempotent: no table, column, policy, grant or application data row is removed.
begin;

create or replace function public.claim_automation_outbox(
  p_worker_id text,
  p_batch_size integer default 5,
  p_lease_seconds integer default 90,
  p_environment text default 'test'
)
returns setof public.automation_outbox
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_environment <> 'test' then raise exception 'claim_environment_not_allowed' using errcode = '22023'; end if;
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,80}$' then raise exception 'invalid_worker_id' using errcode = '22023'; end if;
  return query
  with claimable as (
    select item.id from public.automation_outbox item
    where item.environment = 'test'
      and item.effect_type in ('email.journey_test', 'email.preview_ready', 'email.feedback_received', 'email.preview_approved', 'email.payment_paid', 'email.website_live')
      and ((item.status in ('pending', 'failed') and item.next_attempt_at <= now()) or (item.status = 'processing' and item.lease_expires_at < now()))
    order by item.next_attempt_at asc, item.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 5), 20))
  )
  update public.automation_outbox item set status = 'processing', attempt_count = item.attempt_count + 1, lease_owner = p_worker_id, lease_expires_at = now() + make_interval(secs => greatest(15, least(coalesce(p_lease_seconds, 90), 300))), updated_at = now()
  from claimable where item.id = claimable.id returning item.*;
end
$$;

revoke all on function public.claim_automation_outbox(text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.claim_automation_outbox(text, integer, integer, text) to service_role;

do $$
declare function_oid oid := to_regprocedure('public.claim_automation_outbox(text,integer,integer,text)')::oid;
begin
  if function_oid is null then raise exception 'claim_function_missing'; end if;
  if not exists (select 1 from pg_proc where oid = function_oid and prosecdef and proconfig @> array['search_path=public, pg_temp']) then raise exception 'claim_function_security_contract_invalid'; end if;
  if has_function_privilege('anon', function_oid, 'EXECUTE') or has_function_privilege('authenticated', function_oid, 'EXECUTE') then raise exception 'claim_function_public_execute_not_revoked'; end if;
  if not has_function_privilege('service_role', function_oid, 'EXECUTE') then raise exception 'claim_function_service_role_execute_missing'; end if;
end
$$;

commit;
