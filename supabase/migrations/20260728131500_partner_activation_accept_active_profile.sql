-- Allow an already-active sales partner to finish the onboarding activation
-- handshake. This is intentionally idempotent and never downgrades a profile.

begin;

create or replace function public.partner_mark_account_activated(
  input_auth_user_id uuid,
  input_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  profile_record public.profiles%rowtype;
  partner_record public.partner_profiles%rowtype;
  onboarding_record public.partner_onboardings%rowtype;
begin
  perform public.partner_assert_service_role();
  if char_length(input_idempotency_key) not between 16 and 160 then
    raise exception using errcode = '22023', message = 'Invalid activation idempotency key.';
  end if;

  select * into profile_record from public.profiles
  where auth_user_id = input_auth_user_id and role = 'sales_partner' for update;
  if not found or profile_record.status not in ('invited','pending','active') then
    raise exception using errcode = '23514', message = 'Partner profile cannot be activated for onboarding.';
  end if;

  select pp.* into partner_record from public.partner_profiles pp
  where pp.profile_id = profile_record.id for update;
  if not found then
    raise exception using errcode = '23514', message = 'Partner profile is missing.';
  end if;

  select po.* into onboarding_record from public.partner_onboardings po
  where po.partner_profile_id = partner_record.id and po.status not in ('revoked','expired')
  order by po.created_at desc limit 1 for update;
  if not found then
    raise exception using errcode = '23514', message = 'Partner onboarding is missing.';
  end if;

  if profile_record.status = 'invited' then
    update public.profiles set status = 'pending', updated_at = clock_timestamp()
    where id = profile_record.id;
  end if;

  update public.partner_profiles
  set status = 'onboarding', updated_at = clock_timestamp()
  where id = partner_record.id and status = 'invited';

  update public.partner_onboardings
  set status = case when status = 'invited' then 'account_activated' else status end,
      account_activated_at = coalesce(account_activated_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where id = onboarding_record.id;

  insert into public.partner_onboarding_events (
    onboarding_id, partner_profile_id, actor_profile_id, actor_auth_user_id,
    event_type, subject_type, subject_id, idempotency_key
  ) values (
    onboarding_record.id, partner_record.id, profile_record.id, input_auth_user_id,
    'partner.account_activated', 'partner_onboarding', onboarding_record.id,
    input_idempotency_key
  ) on conflict (onboarding_id, idempotency_key) do nothing;

  return onboarding_record.id;
end
$function$;

revoke all on function public.partner_mark_account_activated(uuid,text) from public, anon, authenticated;
grant execute on function public.partner_mark_account_activated(uuid,text) to service_role;

commit;
