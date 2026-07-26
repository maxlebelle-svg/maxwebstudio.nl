-- Partner Onboarding V1 / Phase B correction: certification and activation are separate controls.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.partner_certificates') is null
     or pg_catalog.to_regprocedure('public.partner_finalize_certification(uuid,text)') is null then
    raise exception using errcode='55000',message='Partner activation control requires B4 certification.';
  end if;
end
$preflight$;

alter table public.partner_certificates
  add column certificate_version text not null default 'mws_sales_partner_certificate_v1',
  add column authorized_signer_name text not null default 'Max Webstudio Directie',
  add column authorized_signer_title text not null default 'Bevoegde vertegenwoordiger',
  add column verification_path text;

update public.partner_certificates
set verification_path='/admin-partners.html?certificateId='||certificate_id
where verification_path is null;
alter table public.partner_certificates alter column verification_path set not null;

with agreement as (
  select 'Conceptuele opdrachtovereenkomst tussen Max Webstudio als opdrachtgever en de zelfstandig salespartner als opdrachtnemer. De opdrachtnemer werkt zelfstandig, heeft geen vaste urengarantie, bepaalt in beginsel zelf waar en wanneer werkzaamheden worden uitgevoerd, draagt eigen belastingen, verzekeringen en administratie, mag opdrachten binnen redelijke grenzen weigeren en mag voor andere opdrachtgevers werken. De opdrachtnemer kan Max Webstudio niet juridisch binden, gebruikt uitsluitend goedgekeurde prijzen en toezeggingen, beschermt persoonsgegevens en vertrouwelijke informatie en factureert goedgekeurde commissieoverzichten. Commissie ontstaat uitsluitend volgens de gekoppelde planversie over kwalificerende daadwerkelijk ontvangen canonieke omzet. Deze door Max Webstudio opgestelde concepttekst vereist juridische beoordeling voor brede ingebruikname; de feitelijke samenwerking blijft bepalend.'::text as content
)
insert into public.partner_document_versions(
  version_code,document_type,title,content,content_hash,status,review_status,effective_from,published_at
) select
  'partner_assignment_agreement_nl_v1','assignment_agreement','Opdrachtovereenkomst zelfstandig salespartner V1',
  agreement.content,public.dca_0_sha256(agreement.content),
  'published','legal_review_required',clock_timestamp(),clock_timestamp()
from agreement;

create or replace function public.partner_accept_required_documents(
  input_auth_user_id uuid,input_version_codes text[],input_declaration_version text,input_idempotency_key text
) returns integer language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare
  profile_record public.profiles%rowtype; partner_record public.partner_profiles%rowtype;
  onboarding_record public.partner_onboardings%rowtype; document_record public.partner_document_versions%rowtype;
  required_count integer; accepted_count integer:=0;
begin
  perform public.partner_assert_service_role();
  if input_declaration_version<>'partner_phase_b_documents_and_agreement_nl_v2'
     or char_length(input_idempotency_key) not between 16 and 160 then
    raise exception using errcode='22023',message='Document and agreement acceptance input is invalid.';
  end if;
  select * into profile_record from public.profiles where auth_user_id=input_auth_user_id and role='sales_partner' and status in ('pending','active') for share;
  select * into partner_record from public.partner_profiles where profile_id=profile_record.id and status='onboarding' for share;
  select * into onboarding_record from public.partner_onboardings where partner_profile_id=partner_record.id and status not in ('active','revoked','expired') order by created_at desc limit 1 for update;
  select count(*) into required_count from public.partner_document_versions where status='published';
  if required_count<>cardinality(input_version_codes)
     or exists(select 1 from public.partner_document_versions where status='published' and version_code<>all(input_version_codes)) then
    raise exception using errcode='23514',message='Every current required document and agreement version must be accepted.';
  end if;
  for document_record in select * from public.partner_document_versions where status='published' loop
    insert into public.partner_document_acceptances(onboarding_id,document_version_id,partner_profile_id,declaration_version,idempotency_key)
    values(onboarding_record.id,document_record.id,partner_record.id,input_declaration_version,input_idempotency_key||':'||document_record.version_code)
    on conflict(onboarding_id,document_version_id) do nothing;
    accepted_count:=accepted_count+1;
  end loop;
  update public.partner_onboarding_steps set status='completed',completed_at=coalesce(completed_at,clock_timestamp()),
    completion_metadata=jsonb_build_object('declarationVersion',input_declaration_version,'documentVersions',to_jsonb(input_version_codes)),updated_at=clock_timestamp()
    where onboarding_id=onboarding_record.id and step_key='document_acceptance';
  insert into public.partner_onboarding_events(onboarding_id,partner_profile_id,actor_profile_id,actor_auth_user_id,event_type,subject_type,subject_id,idempotency_key,safe_metadata)
  values(onboarding_record.id,partner_record.id,profile_record.id,input_auth_user_id,'agreement_and_documents.accepted','partner_onboarding',onboarding_record.id,input_idempotency_key,
    jsonb_build_object('declarationVersion',input_declaration_version,'documentVersions',to_jsonb(input_version_codes)))
  on conflict(onboarding_id,idempotency_key) do nothing;
  return accepted_count;
end
$function$;

create or replace function public.partner_certificate_integrity_guard()
returns trigger language plpgsql set search_path=pg_catalog
as $function$
begin
  if new.certificate_id<>old.certificate_id or new.onboarding_id<>old.onboarding_id
     or new.partner_profile_id<>old.partner_profile_id or new.assessment_attempt_id<>old.assessment_attempt_id
     or new.partner_name<>old.partner_name or new.certification_type<>old.certification_type
     or new.training_version_code<>old.training_version_code or new.certificate_version<>old.certificate_version
     or new.authorized_signer_name<>old.authorized_signer_name or new.authorized_signer_title<>old.authorized_signer_title
     or new.verification_path<>old.verification_path or new.issued_at<>old.issued_at
     or new.expires_at<>old.expires_at or new.verification_hash<>old.verification_hash
     or new.disclaimer<>old.disclaimer or new.created_at<>old.created_at then
    raise exception using errcode='55000',message='Certificate identity and evidence are immutable.';
  end if;
  if old.status<>'valid' or new.status not in ('valid','revoked','expired') then
    raise exception using errcode='55000',message='Certificate status transition is not allowed.';
  end if;
  if new.status='valid' and (new.revoked_at is distinct from old.revoked_at
     or new.revoked_by_profile_id is distinct from old.revoked_by_profile_id
     or new.revocation_reason is distinct from old.revocation_reason) then
    raise exception using errcode='55000',message='Revocation evidence requires a revoked certificate.';
  end if;
  return new;
end
$function$;

create or replace function public.partner_finalize_certification(input_auth_user_id uuid,input_idempotency_key text)
returns text language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare
  profile_record public.profiles%rowtype; partner_record public.partner_profiles%rowtype;
  onboarding_record public.partner_onboardings%rowtype; attempt_record public.partner_assessment_attempts%rowtype;
  certificate_record public.partner_certificates%rowtype; incomplete_count integer; generated_id text;
  issued timestamptz:=clock_timestamp();
begin
  perform public.partner_assert_service_role();
  if char_length(input_idempotency_key) not between 16 and 160 then raise exception using errcode='22023',message='Invalid idempotency key.'; end if;
  select * into profile_record from public.profiles where auth_user_id=input_auth_user_id and role='sales_partner' and status in ('pending','active') for update;
  select * into partner_record from public.partner_profiles where profile_id=profile_record.id and status in ('onboarding','active','paused') for update;
  select * into onboarding_record from public.partner_onboardings where partner_profile_id=partner_record.id
    and status in ('awaiting_documents','certified','active','paused') order by created_at desc limit 1 for update;
  if not found then raise exception using errcode='42501',message='Certification is not available.'; end if;
  select certificate_id into generated_id from public.partner_certificates where onboarding_id=onboarding_record.id and status='valid';
  if found then return generated_id; end if;
  select count(*) into incomplete_count from public.partner_onboarding_steps where onboarding_id=onboarding_record.id and required and status<>'completed';
  if incomplete_count>0 then raise exception using errcode='23514',message='All required onboarding steps must be completed.'; end if;
  select * into attempt_record from public.partner_assessment_attempts where onboarding_id=onboarding_record.id and passed order by attempt_number desc limit 1;
  if not found then raise exception using errcode='23514',message='A passing assessment is required.'; end if;
  generated_id:='MWS-PARTNER-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into public.partner_certificates(
    certificate_id,onboarding_id,partner_profile_id,assessment_attempt_id,partner_name,certification_type,
    training_version_code,certificate_version,authorized_signer_name,authorized_signer_title,verification_path,
    status,issued_at,expires_at,verification_hash,disclaimer
  ) values(
    generated_id,onboarding_record.id,partner_record.id,attempt_record.id,coalesce(nullif(profile_record.name,''),profile_record.email),
    'Gecertificeerd Max Webstudio Sales Partner',onboarding_record.training_program_version,'mws_sales_partner_certificate_v1',
    'Max Webstudio Directie','Bevoegde vertegenwoordiger','/admin-partners.html?certificateId='||generated_id,
    'valid',issued,issued+interval '1 year',public.dca_0_sha256(generated_id||':'||onboarding_record.id::text||':'||issued::text),
    'Interne Max Webstudio-kwalificatie; geen wettelijk erkend diploma.'
  ) returning * into certificate_record;
  update public.partner_onboardings set status='certified',certified_at=issued,updated_at=issued where id=onboarding_record.id;
  insert into public.partner_onboarding_events(
    onboarding_id,partner_profile_id,actor_profile_id,actor_auth_user_id,event_type,subject_type,subject_id,idempotency_key,safe_metadata
  ) values(
    onboarding_record.id,partner_record.id,profile_record.id,input_auth_user_id,'certificate.issued','partner_certificate',certificate_record.id,input_idempotency_key,
    jsonb_build_object('certificateId',generated_id,'certificateVersion',certificate_record.certificate_version,'trainingVersion',onboarding_record.training_program_version,'expiresAt',certificate_record.expires_at,'activationRequired',true)
  );
  return generated_id;
end
$function$;

create function public.partner_admin_set_access(
  input_partner_profile_id uuid,input_action text,input_actor_profile_id uuid,input_reason text,input_idempotency_key text
) returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare
  actor_record public.profiles%rowtype; partner_record public.partner_profiles%rowtype;
  profile_record public.profiles%rowtype; onboarding_record public.partner_onboardings%rowtype;
  existing_event public.partner_onboarding_events%rowtype; incomplete_count integer; event_name text;
begin
  perform public.partner_assert_service_role();
  if input_action not in ('activate','suspend') or char_length(btrim(input_reason)) not between 5 and 500
     or char_length(input_idempotency_key) not between 16 and 160 then
    raise exception using errcode='22023',message='Invalid partner access action.';
  end if;
  select * into actor_record from public.profiles where id=input_actor_profile_id and status='active' and role in ('super_admin','admin');
  if not found then raise exception using errcode='42501',message='Only an active admin may change partner access.'; end if;
  select * into partner_record from public.partner_profiles where id=input_partner_profile_id for update;
  select * into profile_record from public.profiles where id=partner_record.profile_id and role='sales_partner' for update;
  select * into onboarding_record from public.partner_onboardings where partner_profile_id=partner_record.id and status not in ('revoked','expired') order by created_at desc limit 1 for update;
  if not found then raise exception using errcode='23514',message='Partner onboarding is missing.'; end if;
  select * into existing_event from public.partner_onboarding_events where onboarding_id=onboarding_record.id and idempotency_key=input_idempotency_key;
  if found then return partner_record.id; end if;
  if input_action='activate' then
    select count(*) into incomplete_count from public.partner_onboarding_steps where onboarding_id=onboarding_record.id and required and status<>'completed';
    if incomplete_count>0 or onboarding_record.status not in ('certified','paused')
       or not exists(select 1 from public.partner_certificates c where c.onboarding_id=onboarding_record.id and c.status='valid' and c.expires_at>clock_timestamp()) then
      raise exception using errcode='23514',message='Partner is not eligible for explicit activation.';
    end if;
    update public.profiles set status='active',updated_at=clock_timestamp() where id=profile_record.id and status in ('pending','disabled','active');
    update public.partner_profiles set status='active',activated_at=coalesce(activated_at,clock_timestamp()),paused_at=null,updated_at=clock_timestamp() where id=partner_record.id;
    update public.partner_onboardings set status='active',activated_at=coalesce(activated_at,clock_timestamp()),completed_at=coalesce(completed_at,clock_timestamp()),paused_at=null,updated_at=clock_timestamp() where id=onboarding_record.id;
    event_name:='partner.activated';
  else
    if onboarding_record.status<>'active' or partner_record.status<>'active' or profile_record.status<>'active' then
      raise exception using errcode='23514',message='Only an active partner can be suspended.';
    end if;
    update public.profiles set status='disabled',updated_at=clock_timestamp() where id=profile_record.id;
    update public.partner_profiles set status='paused',paused_at=clock_timestamp(),updated_at=clock_timestamp() where id=partner_record.id;
    update public.partner_onboardings set status='paused',paused_at=clock_timestamp(),updated_at=clock_timestamp() where id=onboarding_record.id;
    event_name:='partner.suspended';
  end if;
  insert into public.partner_onboarding_events(onboarding_id,partner_profile_id,actor_profile_id,event_type,subject_type,subject_id,idempotency_key,safe_metadata)
  values(onboarding_record.id,partner_record.id,actor_record.id,event_name,'partner_profile',partner_record.id,input_idempotency_key,jsonb_build_object('reason',btrim(input_reason),'action',input_action));
  return partner_record.id;
end
$function$;

revoke all on function public.partner_admin_set_access(uuid,text,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.partner_admin_set_access(uuid,text,uuid,text,text) to service_role;
revoke all on function public.partner_finalize_certification(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.partner_finalize_certification(uuid,text) to service_role;

commit;
