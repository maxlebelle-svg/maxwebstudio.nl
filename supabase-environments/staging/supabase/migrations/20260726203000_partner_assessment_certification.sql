-- Partner Onboarding V1 / B4: server-scored assessment and verifiable certification.
-- Staging-integrated migration version: 20260726203000.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.partner_training_versions') is null
     or pg_catalog.to_regclass('public.partner_onboarding_events') is null
     or pg_catalog.to_regprocedure('public.dca_0_sha256(text)') is null then
    raise exception using errcode = '55000', message = 'Partner B4 requires B2 and B3.';
  end if;
end
$preflight$;

create table public.partner_assessment_versions (
  id uuid primary key default gen_random_uuid(),
  version_code text not null unique,
  training_version_code text not null references public.partner_training_versions(version_code) on delete restrict,
  title text not null,
  status text not null check (status in ('draft','published','retired')),
  pass_score smallint not null check (pass_score between 1 and 100),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 20),
  questions jsonb not null check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) >= 5),
  published_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (status <> 'published' or published_at is not null)
);

create table public.partner_assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.partner_onboardings(id) on delete restrict,
  assessment_version_id uuid not null references public.partner_assessment_versions(id) on delete restrict,
  attempt_number smallint not null check (attempt_number >= 1),
  submitted_answers jsonb not null check (jsonb_typeof(submitted_answers) = 'object'),
  score smallint not null check (score between 0 and 100),
  passed boolean not null,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  submitted_at timestamptz not null default clock_timestamp(),
  scored_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  unique (onboarding_id, attempt_number),
  unique (onboarding_id, idempotency_key)
);

create table public.partner_certificates (
  id uuid primary key default gen_random_uuid(),
  certificate_id text not null unique check (certificate_id ~ '^MWS-PARTNER-[A-F0-9]{16}$'),
  onboarding_id uuid not null references public.partner_onboardings(id) on delete restrict,
  partner_profile_id uuid not null references public.partner_profiles(id) on delete restrict,
  assessment_attempt_id uuid not null references public.partner_assessment_attempts(id) on delete restrict,
  partner_name text not null,
  certification_type text not null,
  training_version_code text not null,
  status text not null check (status in ('valid','revoked','expired')),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_profile_id uuid references public.profiles(id) on delete set null,
  revocation_reason text,
  verification_hash text not null check (verification_hash ~ '^[a-f0-9]{64}$'),
  disclaimer text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (onboarding_id, certificate_id),
  check (expires_at > issued_at),
  check (status <> 'revoked' or (revoked_at is not null and char_length(revocation_reason) >= 5))
);

create unique index partner_certificates_one_valid_idx
on public.partner_certificates(onboarding_id) where status = 'valid';
create index partner_certificates_lookup_idx on public.partner_certificates(certificate_id, status);

create function public.partner_assessment_immutable_guard()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin
  raise exception using errcode = '55000', message = 'Assessment attempts are immutable.';
end
$function$;
create trigger partner_assessment_attempts_immutable
before update or delete on public.partner_assessment_attempts
for each row execute function public.partner_assessment_immutable_guard();

create function public.partner_assessment_version_immutable_guard()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin
  if old.status = 'published' then
    raise exception using errcode = '55000', message = 'Published assessment versions are immutable.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$function$;
create trigger partner_assessment_versions_immutable
before update or delete on public.partner_assessment_versions
for each row execute function public.partner_assessment_version_immutable_guard();

create function public.partner_certificate_integrity_guard()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin
  if new.certificate_id <> old.certificate_id or new.onboarding_id <> old.onboarding_id
     or new.partner_profile_id <> old.partner_profile_id or new.assessment_attempt_id <> old.assessment_attempt_id
     or new.partner_name <> old.partner_name or new.certification_type <> old.certification_type
     or new.training_version_code <> old.training_version_code or new.issued_at <> old.issued_at
     or new.expires_at <> old.expires_at or new.verification_hash <> old.verification_hash
     or new.disclaimer <> old.disclaimer or new.created_at <> old.created_at then
    raise exception using errcode = '55000', message = 'Certificate identity and evidence are immutable.';
  end if;
  if old.status <> 'valid' or new.status not in ('valid','revoked','expired') then
    raise exception using errcode = '55000', message = 'Certificate status transition is not allowed.';
  end if;
  return new;
end
$function$;
create trigger partner_certificates_integrity
before update on public.partner_certificates
for each row execute function public.partner_certificate_integrity_guard();
create trigger partner_certificates_no_delete
before delete on public.partner_certificates
for each row execute function public.partner_assessment_immutable_guard();

insert into public.partner_assessment_versions (
  version_code, training_version_code, title, status, pass_score, max_attempts, questions, published_at
) values (
  'partner_knowledge_nl_v1', 'partner_training_nl_v1', 'Kennistoets Partnertraining V1',
  'published', 80, 3,
  jsonb_build_array(
    jsonb_build_object('id','q1','prompt','Wat gaat bij Max Webstudio voor een snelle verkoop?','options',jsonb_build_array('De hoogste korting','Het klantbelang','Een mondelinge toezegging'),'correct','Het klantbelang'),
    jsonb_build_object('id','q2','prompt','Wanneer leg je een volgende actie vast?','options',jsonb_build_array('Na ieder relevant contact','Alleen na een verkoop','Aan het einde van de maand'),'correct','Na ieder relevant contact'),
    jsonb_build_object('id','q3','prompt','Welke betaallink mag je gebruiken?','options',jsonb_build_array('Een eigen betaalverzoek','Alleen de officiële betaallink','Iedere werkende betaallink'),'correct','Alleen de officiële betaallink'),
    jsonb_build_object('id','q4','prompt','Wat doe je bij onzekerheid over een toezegging?','options',jsonb_build_array('Toch beloven om tempo te houden','De klant laten gokken','Escaleren naar een bevoegde collega'),'correct','Escaleren naar een bevoegde collega'),
    jsonb_build_object('id','q5','prompt','Welke gegevens horen in een leadnotitie?','options',jsonb_build_array('Objectieve relevante afspraken','Privémeningen over de contactpersoon','Onnodige bijzondere persoonsgegevens'),'correct','Objectieve relevante afspraken'),
    jsonb_build_object('id','q6','prompt','Hoe ga je om met een verzoek om niet meer te bellen?','options',jsonb_build_array('Negeren na een week','Respecteren en registreren','Overdragen aan een ander account'),'correct','Respecteren en registreren'),
    jsonb_build_object('id','q7','prompt','Mag een salespartner zelfstandig korting toezeggen?','options',jsonb_build_array('Altijd','Alleen met vastgelegde bevoegdheid','Als de klant direct betaalt'),'correct','Alleen met vastgelegde bevoegdheid'),
    jsonb_build_object('id','q8','prompt','Waar bewaar je klantdata?','options',jsonb_build_array('In de officiële systemen','In een privéchat voor gemak','Op ieder beschikbaar apparaat'),'correct','In de officiële systemen'),
    jsonb_build_object('id','q9','prompt','Wat is het doel van een belscript?','options',jsonb_build_array('Druk maximaliseren','Een professionele gespreksstructuur bieden','Bezwaren negeren'),'correct','Een professionele gespreksstructuur bieden'),
    jsonb_build_object('id','q10','prompt','Wanneer opent de Sales Workspace?','options',jsonb_build_array('Na accountactivatie','Na de eerste trainingsstap','Na volledige gecontroleerde onboarding'),'correct','Na volledige gecontroleerde onboarding')
  ), clock_timestamp()
);

create function public.partner_submit_assessment(
  input_auth_user_id uuid,
  input_assessment_version_code text,
  input_answers jsonb,
  input_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare
  profile_record public.profiles%rowtype;
  partner_record public.partner_profiles%rowtype;
  onboarding_record public.partner_onboardings%rowtype;
  version_record public.partner_assessment_versions%rowtype;
  existing_record public.partner_assessment_attempts%rowtype;
  attempt_record public.partner_assessment_attempts%rowtype;
  question jsonb;
  total_count integer;
  correct_count integer := 0;
  attempt_count integer;
  calculated_score integer;
  did_pass boolean;
  training_incomplete integer;
begin
  perform public.partner_assert_service_role();
  if jsonb_typeof(input_answers) <> 'object' or char_length(input_idempotency_key) not between 16 and 160 then
    raise exception using errcode = '22023', message = 'Assessment input is invalid.';
  end if;
  select * into profile_record from public.profiles
    where auth_user_id = input_auth_user_id and role = 'sales_partner' and status in ('pending','active') for share;
  select * into partner_record from public.partner_profiles where profile_id = profile_record.id and status = 'onboarding' for share;
  select * into onboarding_record from public.partner_onboardings
    where partner_profile_id = partner_record.id and status in ('in_progress','ready_for_assessment','assessment_failed','awaiting_documents')
    order by created_at desc limit 1 for update;
  if not found then raise exception using errcode = '42501', message = 'Assessment is not available.'; end if;
  select count(*) into training_incomplete from public.partner_onboarding_steps
    where onboarding_id = onboarding_record.id and step_type = 'training' and required and status <> 'completed';
  if training_incomplete > 0 then raise exception using errcode = '23514', message = 'Training must be completed first.'; end if;
  select * into version_record from public.partner_assessment_versions
    where version_code = input_assessment_version_code and training_version_code = onboarding_record.training_program_version
      and status = 'published';
  if not found then raise exception using errcode = '23514', message = 'Assessment version is not available.'; end if;
  select * into existing_record from public.partner_assessment_attempts
    where onboarding_id = onboarding_record.id and idempotency_key = input_idempotency_key;
  if found then
    return jsonb_build_object('attemptId',existing_record.id,'attemptNumber',existing_record.attempt_number,
      'score',existing_record.score,'passed',existing_record.passed,'passScore',version_record.pass_score);
  end if;
  select count(*) into attempt_count from public.partner_assessment_attempts where onboarding_id = onboarding_record.id;
  if attempt_count >= version_record.max_attempts then
    raise exception using errcode = '23514', message = 'Maximum assessment attempts reached.';
  end if;
  total_count := jsonb_array_length(version_record.questions);
  for question in select value from jsonb_array_elements(version_record.questions)
  loop
    if input_answers ->> (question ->> 'id') = question ->> 'correct' then correct_count := correct_count + 1; end if;
  end loop;
  calculated_score := round((correct_count::numeric / total_count::numeric) * 100)::integer;
  did_pass := calculated_score >= version_record.pass_score;
  insert into public.partner_assessment_attempts (
    onboarding_id, assessment_version_id, attempt_number, submitted_answers, score, passed, idempotency_key
  ) values (
    onboarding_record.id, version_record.id, attempt_count + 1, input_answers, calculated_score, did_pass, input_idempotency_key
  ) returning * into attempt_record;
  update public.partner_onboarding_steps set
    status = case when did_pass then 'completed' else 'failed' end,
    completed_at = case when did_pass then clock_timestamp() else null end,
    completion_metadata = jsonb_build_object('assessmentVersion',version_record.version_code,'attemptId',attempt_record.id,'score',calculated_score),
    updated_at = clock_timestamp()
    where onboarding_id = onboarding_record.id and step_key = 'knowledge_assessment';
  update public.partner_onboardings set
    status = case when did_pass then 'awaiting_documents' else 'assessment_failed' end,
    current_step = case when did_pass then 'document_acceptance' else 'knowledge_assessment' end,
    submitted_at = clock_timestamp(), updated_at = clock_timestamp()
    where id = onboarding_record.id;
  insert into public.partner_onboarding_events (
    onboarding_id, partner_profile_id, actor_profile_id, actor_auth_user_id, event_type,
    subject_type, subject_id, idempotency_key, safe_metadata
  ) values (
    onboarding_record.id, partner_record.id, profile_record.id, input_auth_user_id,
    'assessment.scored', 'partner_assessment_attempt', attempt_record.id, input_idempotency_key,
    jsonb_build_object('assessmentVersion',version_record.version_code,'score',calculated_score,'passed',did_pass,'attemptNumber',attempt_record.attempt_number)
  );
  return jsonb_build_object('attemptId',attempt_record.id,'attemptNumber',attempt_record.attempt_number,
    'score',calculated_score,'passed',did_pass,'passScore',version_record.pass_score);
end
$function$;

create function public.partner_finalize_certification(input_auth_user_id uuid, input_idempotency_key text)
returns text language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare
  profile_record public.profiles%rowtype;
  partner_record public.partner_profiles%rowtype;
  onboarding_record public.partner_onboardings%rowtype;
  attempt_record public.partner_assessment_attempts%rowtype;
  certificate_record public.partner_certificates%rowtype;
  incomplete_count integer;
  generated_id text;
  issued timestamptz := clock_timestamp();
begin
  perform public.partner_assert_service_role();
  if char_length(input_idempotency_key) not between 16 and 160 then raise exception using errcode = '22023', message = 'Invalid idempotency key.'; end if;
  select * into profile_record from public.profiles where auth_user_id = input_auth_user_id and role = 'sales_partner' and status in ('pending','active') for update;
  select * into partner_record from public.partner_profiles where profile_id = profile_record.id and status in ('onboarding','active') for update;
  select * into onboarding_record from public.partner_onboardings where partner_profile_id = partner_record.id
    and status in ('awaiting_documents','certified','active') order by created_at desc limit 1 for update;
  if not found then raise exception using errcode = '42501', message = 'Certification is not available.'; end if;
  select certificate_id into generated_id from public.partner_certificates where onboarding_id = onboarding_record.id and status = 'valid';
  if found then return generated_id; end if;
  select count(*) into incomplete_count from public.partner_onboarding_steps where onboarding_id = onboarding_record.id and required and status <> 'completed';
  if incomplete_count > 0 then raise exception using errcode = '23514', message = 'All required onboarding steps must be completed.'; end if;
  select * into attempt_record from public.partner_assessment_attempts where onboarding_id = onboarding_record.id and passed order by attempt_number desc limit 1;
  if not found then raise exception using errcode = '23514', message = 'A passing assessment is required.'; end if;
  generated_id := 'MWS-PARTNER-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into public.partner_certificates (
    certificate_id,onboarding_id,partner_profile_id,assessment_attempt_id,partner_name,certification_type,
    training_version_code,status,issued_at,expires_at,verification_hash,disclaimer
  ) values (
    generated_id,onboarding_record.id,partner_record.id,attempt_record.id,coalesce(nullif(profile_record.name,''),profile_record.email),
    'Gecertificeerd Max Webstudio Salespartner',onboarding_record.training_program_version,'valid',issued,issued + interval '1 year',
    public.dca_0_sha256(generated_id || ':' || onboarding_record.id::text || ':' || issued::text),
    'Interne Max Webstudio-kwalificatie; geen wettelijk erkend diploma.'
  ) returning * into certificate_record;
  update public.partner_onboardings set status='active',certified_at=issued,activated_at=issued,completed_at=issued,updated_at=issued where id=onboarding_record.id;
  update public.partner_profiles set status='active',activated_at=coalesce(activated_at,issued),updated_at=issued where id=partner_record.id;
  update public.profiles set status='active',updated_at=issued where id=profile_record.id and status='pending';
  insert into public.partner_onboarding_events (
    onboarding_id,partner_profile_id,actor_profile_id,actor_auth_user_id,event_type,subject_type,subject_id,idempotency_key,safe_metadata
  ) values (
    onboarding_record.id,partner_record.id,profile_record.id,input_auth_user_id,'certificate.issued','partner_certificate',certificate_record.id,input_idempotency_key,
    jsonb_build_object('certificateId',generated_id,'trainingVersion',onboarding_record.training_program_version,'expiresAt',certificate_record.expires_at)
  );
  return generated_id;
end
$function$;

create function public.partner_revoke_certificate(input_certificate_id text,input_actor_profile_id uuid,input_reason text,input_idempotency_key text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public
as $function$
declare actor_record public.profiles%rowtype; certificate_record public.partner_certificates%rowtype; partner_record public.partner_profiles%rowtype;
begin
  perform public.partner_assert_service_role();
  if char_length(btrim(input_reason)) not between 5 and 500 or char_length(input_idempotency_key) not between 16 and 160 then raise exception using errcode='22023',message='Invalid revocation input.'; end if;
  select * into actor_record from public.profiles where id=input_actor_profile_id and status='active' and role in ('super_admin','admin');
  if not found then raise exception using errcode='42501',message='Only an active admin may revoke certification.'; end if;
  select * into certificate_record from public.partner_certificates where certificate_id=input_certificate_id for update;
  if not found then raise exception using errcode='23514',message='Certificate does not exist.'; end if;
  if certificate_record.status <> 'valid' then return certificate_record.id; end if;
  update public.partner_certificates set status='revoked',revoked_at=clock_timestamp(),revoked_by_profile_id=actor_record.id,revocation_reason=btrim(input_reason) where id=certificate_record.id;
  update public.partner_onboardings set status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp() where id=certificate_record.onboarding_id;
  select * into partner_record from public.partner_profiles where id=certificate_record.partner_profile_id;
  update public.partner_profiles set status='paused',paused_at=clock_timestamp(),updated_at=clock_timestamp() where id=partner_record.id;
  update public.profiles set status='disabled',updated_at=clock_timestamp() where id=partner_record.profile_id and status='active';
  insert into public.partner_onboarding_events (onboarding_id,partner_profile_id,actor_profile_id,event_type,subject_type,subject_id,idempotency_key,safe_metadata)
  values (certificate_record.onboarding_id,partner_record.id,actor_record.id,'certificate.revoked','partner_certificate',certificate_record.id,input_idempotency_key,
    jsonb_build_object('certificateId',certificate_record.certificate_id,'reason',btrim(input_reason)));
  return certificate_record.id;
end
$function$;

alter table public.partner_assessment_versions enable row level security;
alter table public.partner_assessment_attempts enable row level security;
alter table public.partner_certificates enable row level security;

create policy partner_attempts_self_read on public.partner_assessment_attempts for select to authenticated using (
  exists(select 1 from public.partner_onboardings po join public.partner_profiles pp on pp.id=po.partner_profile_id join public.profiles p on p.id=pp.profile_id
    where po.id=onboarding_id and p.auth_user_id=auth.uid())
);
create policy partner_attempts_admin_manager_read on public.partner_assessment_attempts for select to authenticated using (
  public.has_app_role(array['super_admin','admin']) or exists(select 1 from public.partner_onboardings po join public.partner_profiles pp on pp.id=po.partner_profile_id
    where po.id=onboarding_id and pp.assigned_manager_profile_id=public.current_profile_id() and public.has_app_role(array['sales_manager']))
);
create policy partner_certificates_self_read on public.partner_certificates for select to authenticated using (
  exists(select 1 from public.partner_profiles pp join public.profiles p on p.id=pp.profile_id where pp.id=partner_profile_id and p.auth_user_id=auth.uid())
);
create policy partner_certificates_admin_manager_read on public.partner_certificates for select to authenticated using (
  public.has_app_role(array['super_admin','admin']) or exists(select 1 from public.partner_profiles pp where pp.id=partner_profile_id
    and pp.assigned_manager_profile_id=public.current_profile_id() and public.has_app_role(array['sales_manager']))
);

revoke all on public.partner_assessment_versions,public.partner_assessment_attempts,public.partner_certificates from public,anon,authenticated;
grant select on public.partner_assessment_attempts,public.partner_certificates to authenticated;
grant select,insert,update on public.partner_assessment_versions,public.partner_assessment_attempts,public.partner_certificates to service_role;
revoke all on function public.partner_submit_assessment(uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.partner_finalize_certification(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.partner_revoke_certificate(text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.partner_submit_assessment(uuid,text,jsonb,text) to service_role;
grant execute on function public.partner_finalize_certification(uuid,text) to service_role;
grant execute on function public.partner_revoke_certificate(text,uuid,text,text) to service_role;
revoke all on function public.partner_assessment_immutable_guard() from public,anon,authenticated;
revoke all on function public.partner_assessment_version_immutable_guard() from public,anon,authenticated;
revoke all on function public.partner_certificate_integrity_guard() from public,anon,authenticated;
grant execute on function public.partner_assessment_immutable_guard() to service_role;
grant execute on function public.partner_assessment_version_immutable_guard() to service_role;
grant execute on function public.partner_certificate_integrity_guard() to service_role;

commit;
