-- Partner Onboarding V1 / B2: server-enforced onboarding gate and auditable progress.
-- Staging-integrated migration version: 20260726201000.
-- Forward-only. No existing profile is activated and no email is sent.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null then
    raise exception using errcode = '55000', message = 'Partner B2 requires public.profiles.';
  end if;
  if pg_catalog.to_regprocedure('public.current_profile_id()') is null
     or pg_catalog.to_regprocedure('public.has_app_role(text[])') is null then
    raise exception using errcode = '55000', message = 'Partner B2 requires the B1 role helpers.';
  end if;
end
$preflight$;

create table public.partner_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  status text not null default 'invited' check (
    status in ('invited','onboarding','active','paused','terminated')
  ),
  assigned_manager_profile_id uuid references public.profiles(id) on delete set null,
  invited_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  terminated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint partner_profiles_lifecycle_check check (
    (status <> 'active' or activated_at is not null)
    and (status <> 'paused' or paused_at is not null)
    and (status <> 'terminated' or terminated_at is not null)
  )
);

create index partner_profiles_manager_status_idx
  on public.partner_profiles(assigned_manager_profile_id, status, updated_at desc);

create table public.partner_onboardings (
  id uuid primary key default gen_random_uuid(),
  partner_profile_id uuid not null references public.partner_profiles(id) on delete restrict,
  status text not null default 'invited' check (
    status in (
      'invited','account_activated','in_progress','ready_for_assessment',
      'assessment_failed','awaiting_documents','certified','active',
      'paused','revoked','expired'
    )
  ),
  current_step text not null default 'welcome',
  training_program_version text not null default 'partner_training_nl_v1',
  invited_at timestamptz not null default clock_timestamp(),
  account_activated_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  certified_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  revoked_at timestamptz,
  expired_at timestamptz,
  completed_at timestamptz,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  reset_count integer not null default 0 check (reset_count >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint partner_onboardings_status_time_check check (
    (status <> 'account_activated' or account_activated_at is not null)
    and (status <> 'in_progress' or started_at is not null)
    and (status <> 'certified' or certified_at is not null)
    and (status <> 'active' or (certified_at is not null and activated_at is not null and completed_at is not null))
    and (status <> 'paused' or paused_at is not null)
    and (status <> 'revoked' or revoked_at is not null)
    and (status <> 'expired' or expired_at is not null)
  )
);

create unique index partner_onboardings_one_open_idx
  on public.partner_onboardings(partner_profile_id)
  where status not in ('revoked','expired');
create index partner_onboardings_status_updated_idx
  on public.partner_onboardings(status, updated_at desc);

create table public.partner_onboarding_steps (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.partner_onboardings(id) on delete restrict,
  step_key text not null check (step_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  step_order smallint not null check (step_order between 1 and 100),
  step_type text not null check (step_type in ('training','assessment','agreement')),
  required boolean not null default true,
  status text not null default 'not_started' check (
    status in ('not_started','in_progress','completed','failed','reset')
  ),
  content_version text not null,
  opened_at timestamptz,
  completed_at timestamptz,
  reset_at timestamptz,
  reset_by_profile_id uuid references public.profiles(id) on delete set null,
  completion_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(completion_metadata) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint partner_onboarding_steps_key_unique unique (onboarding_id, step_key),
  constraint partner_onboarding_steps_order_unique unique (onboarding_id, step_order),
  constraint partner_onboarding_steps_completion_check check (
    status <> 'completed' or completed_at is not null
  )
);

create index partner_onboarding_steps_progress_idx
  on public.partner_onboarding_steps(onboarding_id, required, status, step_order);

create table public.partner_onboarding_events (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.partner_onboardings(id) on delete restrict,
  partner_profile_id uuid not null references public.partner_profiles(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  subject_type text not null,
  subject_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  constraint partner_onboarding_events_once unique (onboarding_id, idempotency_key)
);

create index partner_onboarding_events_timeline_idx
  on public.partner_onboarding_events(onboarding_id, occurred_at desc);

create function public.partner_onboarding_event_immutable_guard()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin
  raise exception using errcode = '55000', message = 'Partner onboarding events are immutable.';
end
$function$;

create trigger partner_onboarding_events_immutable
before update or delete on public.partner_onboarding_events
for each row execute function public.partner_onboarding_event_immutable_guard();

create function public.partner_assert_service_role()
returns void language plpgsql stable set search_path = pg_catalog
as $function$
declare
  jwt_role text;
begin
  jwt_role := nullif(current_setting('request.jwt.claim.role', true), '');
  if jwt_role is null then
    begin
      jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    exception when others then
      jwt_role := null;
    end;
  end if;
  if jwt_role <> 'service_role' then
    raise exception using errcode = '42501', message = 'Partner onboarding mutation requires service_role.';
  end if;
end
$function$;

create function public.partner_initialize_onboarding(
  input_profile_id uuid,
  input_created_by_profile_id uuid,
  input_manager_profile_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  target_profile public.profiles%rowtype;
  partner_record public.partner_profiles%rowtype;
  onboarding_record public.partner_onboardings%rowtype;
begin
  perform public.partner_assert_service_role();
  select * into target_profile from public.profiles where id = input_profile_id for update;
  if not found or target_profile.role <> 'sales_partner'
     or target_profile.status not in ('invited','pending','active') then
    raise exception using errcode = '23514', message = 'Profile is not eligible for partner onboarding.';
  end if;

  insert into public.partner_profiles (
    profile_id, status, assigned_manager_profile_id, invited_at
  ) values (
    target_profile.id,
    case when target_profile.status = 'active' then 'onboarding' else 'invited' end,
    input_manager_profile_id,
    clock_timestamp()
  )
  on conflict (profile_id) do update set
    assigned_manager_profile_id = coalesce(excluded.assigned_manager_profile_id, public.partner_profiles.assigned_manager_profile_id),
    updated_at = clock_timestamp()
  returning * into partner_record;

  select * into onboarding_record
  from public.partner_onboardings
  where partner_profile_id = partner_record.id
    and status not in ('revoked','expired')
  order by created_at desc limit 1;

  if not found then
    insert into public.partner_onboardings (
      partner_profile_id, status, current_step, training_program_version,
      invited_at, created_by_profile_id
    ) values (
      partner_record.id, 'invited', 'welcome', 'partner_training_nl_v1',
      clock_timestamp(), input_created_by_profile_id
    ) returning * into onboarding_record;

    insert into public.partner_onboarding_steps (
      onboarding_id, step_key, step_order, step_type, content_version
    ) values
      (onboarding_record.id, 'welcome', 1, 'training', 'welcome_nl_v1'),
      (onboarding_record.id, 'vision', 2, 'training', 'vision_nl_v1'),
      (onboarding_record.id, 'working_principles', 3, 'training', 'working_principles_nl_v1'),
      (onboarding_record.id, 'lead_and_task_registration', 4, 'training', 'lead_and_task_registration_nl_v1'),
      (onboarding_record.id, 'privacy_confidentiality', 5, 'training', 'privacy_confidentiality_nl_v1'),
      (onboarding_record.id, 'responsible_customer_contact', 6, 'training', 'responsible_customer_contact_nl_v1'),
      (onboarding_record.id, 'sales_process_call_script', 7, 'training', 'sales_process_call_script_nl_v1'),
      (onboarding_record.id, 'commission_system', 8, 'agreement', 'commission_system_nl_v1'),
      (onboarding_record.id, 'knowledge_assessment', 9, 'assessment', 'knowledge_assessment_nl_v1'),
      (onboarding_record.id, 'document_acceptance', 10, 'agreement', 'document_acceptance_nl_v1');

    insert into public.partner_onboarding_events (
      onboarding_id, partner_profile_id, actor_profile_id,
      event_type, subject_type, subject_id, idempotency_key, safe_metadata
    ) values (
      onboarding_record.id, partner_record.id, input_created_by_profile_id,
      'partner.invited', 'partner_onboarding', onboarding_record.id,
      'partner-invited:' || onboarding_record.id::text,
      jsonb_build_object('trainingProgramVersion', onboarding_record.training_program_version)
    );
  end if;

  return onboarding_record.id;
end
$function$;

create function public.partner_mark_account_activated(
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
  if not found or profile_record.status not in ('invited','pending') then
    raise exception using errcode = '23514', message = 'Partner profile cannot be activated for onboarding.';
  end if;

  select pp.* into partner_record from public.partner_profiles pp
  where pp.profile_id = profile_record.id for update;
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

create function public.partner_complete_training_step(
  input_auth_user_id uuid,
  input_step_key text,
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
  step_record public.partner_onboarding_steps%rowtype;
  next_step text;
begin
  perform public.partner_assert_service_role();
  if input_step_key not in (
    'welcome','vision','working_principles','lead_and_task_registration',
    'privacy_confidentiality','responsible_customer_contact','sales_process_call_script'
  ) or char_length(input_idempotency_key) not between 16 and 160 then
    raise exception using errcode = '22023', message = 'Step cannot be self-completed.';
  end if;

  select * into profile_record from public.profiles
  where auth_user_id = input_auth_user_id and role = 'sales_partner'
    and status in ('pending','active') for share;
  select pp.* into partner_record from public.partner_profiles pp
  where pp.profile_id = profile_record.id and pp.status = 'onboarding' for share;
  select po.* into onboarding_record from public.partner_onboardings po
  where po.partner_profile_id = partner_record.id
    and po.status in ('account_activated','in_progress','ready_for_assessment','assessment_failed','awaiting_documents')
  order by po.created_at desc limit 1 for update;
  if not found then
    raise exception using errcode = '42501', message = 'Partner onboarding is not writable.';
  end if;

  select * into step_record from public.partner_onboarding_steps
  where onboarding_id = onboarding_record.id and step_key = input_step_key for update;
  if not found or step_record.step_type <> 'training' then
    raise exception using errcode = '23514', message = 'Training step is unavailable.';
  end if;

  update public.partner_onboarding_steps
  set status = 'completed', opened_at = coalesce(opened_at, clock_timestamp()),
      completed_at = coalesce(completed_at, clock_timestamp()), updated_at = clock_timestamp()
  where id = step_record.id;

  select step_key into next_step from public.partner_onboarding_steps
  where onboarding_id = onboarding_record.id and status <> 'completed'
  order by step_order limit 1;
  update public.partner_onboardings
  set status = case when status = 'account_activated' then 'in_progress' else status end,
      started_at = coalesce(started_at, clock_timestamp()),
      current_step = coalesce(next_step, current_step), updated_at = clock_timestamp()
  where id = onboarding_record.id;

  insert into public.partner_onboarding_events (
    onboarding_id, partner_profile_id, actor_profile_id, actor_auth_user_id,
    event_type, subject_type, subject_id, idempotency_key, safe_metadata
  ) values (
    onboarding_record.id, partner_record.id, profile_record.id, input_auth_user_id,
    'onboarding.step_completed', 'partner_onboarding_step', step_record.id,
    input_idempotency_key,
    jsonb_build_object('stepKey', step_record.step_key, 'contentVersion', step_record.content_version)
  ) on conflict (onboarding_id, idempotency_key) do nothing;

  return step_record.id;
end
$function$;

create function public.partner_admin_reset_step(
  input_onboarding_id uuid,
  input_step_key text,
  input_actor_profile_id uuid,
  input_reason text,
  input_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  actor_record public.profiles%rowtype;
  onboarding_record public.partner_onboardings%rowtype;
  step_record public.partner_onboarding_steps%rowtype;
begin
  perform public.partner_assert_service_role();
  if char_length(btrim(input_reason)) not between 5 and 500
     or char_length(input_idempotency_key) not between 16 and 160 then
    raise exception using errcode = '22023', message = 'Reset reason or idempotency key is invalid.';
  end if;
  select * into actor_record from public.profiles where id = input_actor_profile_id and status = 'active';
  if not found or actor_record.role not in ('super_admin','admin') then
    raise exception using errcode = '42501', message = 'Only an active admin may reset onboarding progress.';
  end if;
  select * into onboarding_record from public.partner_onboardings
  where id = input_onboarding_id for update;
  if not found or onboarding_record.status in ('active','revoked','expired') then
    raise exception using errcode = '23514', message = 'Onboarding cannot be reset in its current state.';
  end if;
  select * into step_record from public.partner_onboarding_steps
  where onboarding_id = onboarding_record.id and step_key = input_step_key for update;
  if not found then
    raise exception using errcode = '23514', message = 'Onboarding step does not exist.';
  end if;

  update public.partner_onboarding_steps
  set status = 'reset', completed_at = null, reset_at = clock_timestamp(),
      reset_by_profile_id = actor_record.id,
      completion_metadata = jsonb_build_object('resetReason', btrim(input_reason)),
      updated_at = clock_timestamp()
  where id = step_record.id;
  update public.partner_onboardings
  set status = 'in_progress', current_step = step_record.step_key,
      certified_at = null, submitted_at = null, completed_at = null,
      reset_count = reset_count + 1, updated_at = clock_timestamp()
  where id = onboarding_record.id;

  insert into public.partner_onboarding_events (
    onboarding_id, partner_profile_id, actor_profile_id, event_type,
    subject_type, subject_id, idempotency_key, safe_metadata
  ) values (
    onboarding_record.id, onboarding_record.partner_profile_id, actor_record.id,
    'onboarding.step_reset', 'partner_onboarding_step', step_record.id,
    input_idempotency_key,
    jsonb_build_object('stepKey', step_record.step_key, 'reason', btrim(input_reason))
  ) on conflict (onboarding_id, idempotency_key) do nothing;
  return step_record.id;
end
$function$;

alter table public.partner_profiles enable row level security;
alter table public.partner_onboardings enable row level security;
alter table public.partner_onboarding_steps enable row level security;
alter table public.partner_onboarding_events enable row level security;

create policy partner_profiles_self_read on public.partner_profiles
for select to authenticated using (
  exists (select 1 from public.profiles p where p.id = profile_id and p.auth_user_id = auth.uid()
    and p.role = 'sales_partner' and p.status in ('invited','pending','active'))
);
create policy partner_profiles_admin_read on public.partner_profiles
for select to authenticated using (public.has_app_role(array['super_admin','admin']));
create policy partner_profiles_manager_read on public.partner_profiles
for select to authenticated using (
  assigned_manager_profile_id = public.current_profile_id()
  and public.has_app_role(array['sales_manager'])
);

create policy partner_onboardings_self_read on public.partner_onboardings
for select to authenticated using (
  exists (
    select 1 from public.partner_profiles pp join public.profiles p on p.id = pp.profile_id
    where pp.id = partner_profile_id and p.auth_user_id = auth.uid()
      and p.role = 'sales_partner' and p.status in ('invited','pending','active')
  )
);
create policy partner_onboardings_admin_read on public.partner_onboardings
for select to authenticated using (public.has_app_role(array['super_admin','admin']));
create policy partner_onboardings_manager_read on public.partner_onboardings
for select to authenticated using (
  exists (select 1 from public.partner_profiles pp where pp.id = partner_profile_id
    and pp.assigned_manager_profile_id = public.current_profile_id())
  and public.has_app_role(array['sales_manager'])
);

create policy partner_steps_self_read on public.partner_onboarding_steps
for select to authenticated using (
  exists (
    select 1 from public.partner_onboardings po
    join public.partner_profiles pp on pp.id = po.partner_profile_id
    join public.profiles p on p.id = pp.profile_id
    where po.id = onboarding_id and p.auth_user_id = auth.uid()
      and p.role = 'sales_partner' and p.status in ('invited','pending','active')
  )
);
create policy partner_steps_admin_manager_read on public.partner_onboarding_steps
for select to authenticated using (
  public.has_app_role(array['super_admin','admin']) or exists (
    select 1 from public.partner_onboardings po join public.partner_profiles pp on pp.id = po.partner_profile_id
    where po.id = onboarding_id and pp.assigned_manager_profile_id = public.current_profile_id()
      and public.has_app_role(array['sales_manager'])
  )
);

create policy partner_events_self_read on public.partner_onboarding_events
for select to authenticated using (
  exists (
    select 1 from public.partner_profiles pp join public.profiles p on p.id = pp.profile_id
    where pp.id = partner_profile_id and p.auth_user_id = auth.uid()
      and p.role = 'sales_partner' and p.status in ('invited','pending','active')
  )
);
create policy partner_events_admin_manager_read on public.partner_onboarding_events
for select to authenticated using (
  public.has_app_role(array['super_admin','admin']) or exists (
    select 1 from public.partner_profiles pp where pp.id = partner_profile_id
      and pp.assigned_manager_profile_id = public.current_profile_id()
      and public.has_app_role(array['sales_manager'])
  )
);

revoke all on public.partner_profiles, public.partner_onboardings,
  public.partner_onboarding_steps, public.partner_onboarding_events
  from public, anon, authenticated;
grant select on public.partner_profiles, public.partner_onboardings,
  public.partner_onboarding_steps, public.partner_onboarding_events to authenticated;
grant select, insert, update on public.partner_profiles, public.partner_onboardings,
  public.partner_onboarding_steps, public.partner_onboarding_events to service_role;

revoke all on function public.partner_initialize_onboarding(uuid,uuid,uuid) from public, anon, authenticated, service_role;
revoke all on function public.partner_mark_account_activated(uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.partner_complete_training_step(uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.partner_admin_reset_step(uuid,text,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.partner_assert_service_role() from public, anon, authenticated, service_role;
revoke all on function public.partner_onboarding_event_immutable_guard() from public, anon, authenticated;
grant execute on function public.partner_initialize_onboarding(uuid,uuid,uuid) to service_role;
grant execute on function public.partner_mark_account_activated(uuid,text) to service_role;
grant execute on function public.partner_complete_training_step(uuid,text,text) to service_role;
grant execute on function public.partner_admin_reset_step(uuid,text,uuid,text,text) to service_role;
grant execute on function public.partner_assert_service_role() to service_role;
grant execute on function public.partner_onboarding_event_immutable_guard() to service_role;

commit;
