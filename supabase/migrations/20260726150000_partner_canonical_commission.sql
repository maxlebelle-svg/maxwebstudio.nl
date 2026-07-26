-- Partner Onboarding V1 / B5: canonical invoice commission and controlled acknowledgements.
-- This migration never reads or writes public.customer_invoices.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.invoices') is null or pg_catalog.to_regclass('public.invoice_lines') is null
     or pg_catalog.to_regclass('public.quotes') is null or pg_catalog.to_regclass('public.leads') is null
     or pg_catalog.to_regclass('public.partner_certificates') is null then
    raise exception using errcode='55000',message='Partner B5 requires canonical finance and B1-B4.';
  end if;
end
$preflight$;

create table public.partner_commission_plans (
  id uuid primary key default gen_random_uuid(), plan_code text not null unique,
  name text not null, description text not null, created_at timestamptz not null default clock_timestamp()
);
create table public.partner_commission_plan_versions (
  id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.partner_commission_plans(id) on delete restrict,
  version_code text not null unique, status text not null check(status in ('draft','published','retired')),
  calculation_method text not null check(calculation_method in ('progressive','retroactive_tier')),
  currency text not null default 'EUR' check(currency='EUR'), locale text not null default 'nl-NL',
  basis text not null check(basis='paid_revenue_ex_vat'), tiers jsonb not null check(jsonb_typeof(tiers)='array' and jsonb_array_length(tiers)>=1),
  include_one_time_projects boolean not null default true, include_subscriptions boolean not null default false,
  effective_from timestamptz not null, effective_until timestamptz, published_at timestamptz,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  check(status<>'published' or published_at is not null)
);
create table public.partner_commission_assignments (
  id uuid primary key default gen_random_uuid(), partner_profile_id uuid not null references public.partner_profiles(id) on delete restrict,
  plan_version_id uuid not null references public.partner_commission_plan_versions(id) on delete restrict,
  status text not null check(status in ('assigned','accepted','ended')), assigned_at timestamptz not null default clock_timestamp(),
  accepted_at timestamptz, ended_at timestamptz, created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create unique index partner_commission_assignments_open_idx on public.partner_commission_assignments(partner_profile_id) where status in ('assigned','accepted');

create table public.partner_lead_attributions (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete restrict,
  partner_profile_id uuid not null references public.partner_profiles(id) on delete restrict,
  status text not null check(status in ('valid','disputed','revoked')),
  attribution_method text not null check(attribution_method in ('first_valid_claim','admin_assignment','admin_correction')),
  reason text not null, attributed_at timestamptz not null default clock_timestamp(), ended_at timestamptz,
  idempotency_key text not null unique check(char_length(idempotency_key) between 16 and 160),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
create unique index partner_lead_attributions_one_valid_idx on public.partner_lead_attributions(lead_id) where status='valid';

create table public.partner_payment_events (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete restrict,
  provider text not null, provider_event_id text not null, provider_payment_id text not null,
  event_type text not null check(event_type in ('paid','refund','chargeback')),
  original_payment_event_id uuid references public.partner_payment_events(id) on delete restrict,
  amount_ex_vat_cents bigint not null check(amount_ex_vat_cents>0), currency text not null default 'EUR' check(currency='EUR'),
  occurred_at timestamptz not null, idempotency_key text not null check(char_length(idempotency_key) between 16 and 160),
  created_at timestamptz not null default clock_timestamp(),
  unique(provider,provider_event_id), unique(provider,event_type,provider_payment_id), unique(idempotency_key),
  check((event_type='paid' and original_payment_event_id is null) or (event_type<>'paid' and original_payment_event_id is not null))
);

create table public.partner_commission_ledger_entries (
  id uuid primary key default gen_random_uuid(), partner_profile_id uuid not null references public.partner_profiles(id) on delete restrict,
  attribution_id uuid not null references public.partner_lead_attributions(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_event_id uuid not null references public.partner_payment_events(id) on delete restrict,
  plan_version_id uuid not null references public.partner_commission_plan_versions(id) on delete restrict,
  entry_type text not null check(entry_type in ('earned','refund','chargeback','adjustment')),
  basis_ex_vat_cents bigint not null, commission_cents bigint not null, currency text not null default 'EUR' check(currency='EUR'),
  earning_month date not null, status text not null default 'validated' check(status in ('provisional','validated','invoiced','paid','reversed')),
  reason text not null, idempotency_key text not null unique, created_at timestamptz not null default clock_timestamp(),
  unique(payment_event_id,entry_type),
  check((entry_type='earned' and basis_ex_vat_cents>0 and commission_cents>=0) or (entry_type in ('refund','chargeback') and basis_ex_vat_cents<0 and commission_cents<=0) or entry_type='adjustment')
);
create index partner_commission_ledger_month_idx on public.partner_commission_ledger_entries(partner_profile_id,earning_month,status,created_at);

create table public.partner_document_versions (
  id uuid primary key default gen_random_uuid(), version_code text not null unique, document_type text not null,
  title text not null, content text not null, content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  status text not null check(status in ('draft','published','retired')), review_status text not null check(review_status in ('internal_approved','legal_review_required','legally_reviewed')),
  effective_from timestamptz not null, published_at timestamptz, created_at timestamptz not null default clock_timestamp()
);
create table public.partner_document_acceptances (
  id uuid primary key default gen_random_uuid(), onboarding_id uuid not null references public.partner_onboardings(id) on delete restrict,
  document_version_id uuid not null references public.partner_document_versions(id) on delete restrict,
  partner_profile_id uuid not null references public.partner_profiles(id) on delete restrict,
  declaration_version text not null, accepted_at timestamptz not null default clock_timestamp(), idempotency_key text not null,
  created_at timestamptz not null default clock_timestamp(), unique(onboarding_id,document_version_id), unique(onboarding_id,idempotency_key)
);

create function public.partner_immutable_finance_guard() returns trigger language plpgsql set search_path=pg_catalog
as $function$ begin raise exception using errcode='55000',message='Partner finance and acceptance evidence is immutable.'; end $function$;
create trigger partner_payment_events_immutable before update or delete on public.partner_payment_events for each row execute function public.partner_immutable_finance_guard();
create trigger partner_commission_ledger_immutable before update or delete on public.partner_commission_ledger_entries for each row execute function public.partner_immutable_finance_guard();
create trigger partner_document_acceptances_immutable before update or delete on public.partner_document_acceptances for each row execute function public.partner_immutable_finance_guard();

create function public.partner_published_business_version_guard() returns trigger language plpgsql set search_path=pg_catalog
as $function$ begin if old.status='published' then raise exception using errcode='55000',message='Published partner business versions are immutable.'; end if; return case when tg_op='DELETE' then old else new end; end $function$;
create trigger partner_commission_plan_versions_immutable before update or delete on public.partner_commission_plan_versions for each row execute function public.partner_published_business_version_guard();
create trigger partner_document_versions_immutable before update or delete on public.partner_document_versions for each row execute function public.partner_published_business_version_guard();

create function public.partner_progressive_commission_cents(input_basis bigint,input_tiers jsonb)
returns bigint language plpgsql immutable set search_path=pg_catalog
as $function$
declare tier jsonb; previous_limit bigint:=0; tier_limit bigint; applicable bigint; rate_bps integer; result bigint:=0;
begin
  if input_basis<=0 then return 0; end if;
  for tier in select value from jsonb_array_elements(input_tiers) loop
    rate_bps:=(tier->>'rateBps')::integer;
    tier_limit:=case when tier->>'upToCents' is null then input_basis else (tier->>'upToCents')::bigint end;
    applicable:=greatest(0,least(input_basis,tier_limit)-previous_limit);
    result:=result+round(applicable::numeric*rate_bps/10000)::bigint;
    previous_limit:=tier_limit;
    exit when input_basis<=tier_limit;
  end loop;
  return result;
end
$function$;

create function public.partner_retroactive_commission_cents(input_basis bigint,input_tiers jsonb)
returns bigint language plpgsql immutable set search_path=pg_catalog
as $function$
declare tier jsonb; tier_limit bigint; rate_bps integer:=0;
begin
  if input_basis<=0 then return 0; end if;
  for tier in select value from jsonb_array_elements(input_tiers) loop
    tier_limit:=case when tier->>'upToCents' is null then input_basis else (tier->>'upToCents')::bigint end; rate_bps:=(tier->>'rateBps')::integer;
    exit when input_basis<=tier_limit;
  end loop;
  return round(input_basis::numeric*rate_bps/10000)::bigint;
end
$function$;

insert into public.partner_commission_plans(plan_code,name,description) values('standard_sales_partner','Standaard Salespartner','Progressieve commissie over daadwerkelijk ontvangen canonieke omzet exclusief btw.');
with plan as(select id from public.partner_commission_plans where plan_code='standard_sales_partner')
insert into public.partner_commission_plan_versions(plan_id,version_code,status,calculation_method,basis,tiers,effective_from,published_at)
select id,'standard_sales_partner_nl_v1','published','progressive','paid_revenue_ex_vat',
  jsonb_build_array(jsonb_build_object('upToCents',200000,'rateBps',2000),jsonb_build_object('upToCents',500000,'rateBps',2500),jsonb_build_object('upToCents',1000000,'rateBps',3000),jsonb_build_object('upToCents',null,'rateBps',3500)),
  clock_timestamp(),clock_timestamp() from plan;

insert into public.partner_document_versions(version_code,document_type,title,content,content_hash,status,review_status,effective_from,published_at) values
('partner_handbook_nl_v1','partner_handbook','Partnerhandboek V1','Interne regels voor CRM, klantdata, salesethiek, agenda, taken, leadownership, demo-opvolging, prijzen, klachten, overdracht, informatiebeveiliging en merkgebruik.',public.dca_0_sha256('partner_handbook_nl_v1'),'published','internal_approved',clock_timestamp(),clock_timestamp()),
('privacy_security_nl_v1','privacy_security','Privacy- en beveiligingsregels V1','Verwerk alleen noodzakelijke zakelijke gegevens in officiële systemen, deel ze uitsluitend met bevoegde personen en meld incidenten direct.',public.dca_0_sha256('privacy_security_nl_v1'),'published','internal_approved',clock_timestamp(),clock_timestamp()),
('partner_legal_notice_nl_v1','legal_notice','Juridische reviewmelding V1','De opdrachtovereenkomst en digitale ondertekenflow worden afzonderlijk behandeld. Deze onboardingbevestiging is geen vervanging voor een volledig ondertekende opdrachtovereenkomst.',public.dca_0_sha256('partner_legal_notice_nl_v1'),'published','legal_review_required',clock_timestamp(),clock_timestamp());

create function public.partner_assign_default_commission_plan() returns trigger language plpgsql security definer set search_path=pg_catalog,public
as $function$ begin
  insert into public.partner_commission_assignments(partner_profile_id,plan_version_id,status)
  select new.id,v.id,'assigned' from public.partner_commission_plan_versions v where v.version_code='standard_sales_partner_nl_v1'
  on conflict do nothing; return new;
end $function$;
create trigger partner_profiles_default_commission after insert on public.partner_profiles for each row execute function public.partner_assign_default_commission_plan();
insert into public.partner_commission_assignments(partner_profile_id,plan_version_id,status)
select pp.id,v.id,'assigned' from public.partner_profiles pp cross join public.partner_commission_plan_versions v
where v.version_code='standard_sales_partner_nl_v1' and not exists(select 1 from public.partner_commission_assignments a where a.partner_profile_id=pp.id and a.status in ('assigned','accepted'));

create function public.partner_accept_commission_plan(input_auth_user_id uuid,input_version_code text,input_idempotency_key text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare profile_record public.profiles%rowtype; partner_record public.partner_profiles%rowtype; onboarding_record public.partner_onboardings%rowtype; assignment_record public.partner_commission_assignments%rowtype;
begin
  perform public.partner_assert_service_role(); if char_length(input_idempotency_key) not between 16 and 160 then raise exception using errcode='22023',message='Invalid idempotency key.'; end if;
  select * into profile_record from public.profiles where auth_user_id=input_auth_user_id and role='sales_partner' and status in ('pending','active') for share;
  select * into partner_record from public.partner_profiles where profile_id=profile_record.id and status='onboarding' for share;
  select * into onboarding_record from public.partner_onboardings where partner_profile_id=partner_record.id and status not in ('active','revoked','expired') order by created_at desc limit 1 for update;
  select a.* into assignment_record from public.partner_commission_assignments a join public.partner_commission_plan_versions v on v.id=a.plan_version_id
    where a.partner_profile_id=partner_record.id and a.status in ('assigned','accepted') and v.version_code=input_version_code and v.status='published' for update;
  if not found then raise exception using errcode='23514',message='Assigned commission plan is unavailable.'; end if;
  update public.partner_commission_assignments set status='accepted',accepted_at=coalesce(accepted_at,clock_timestamp()),updated_at=clock_timestamp() where id=assignment_record.id;
  update public.partner_onboarding_steps set status='completed',completed_at=coalesce(completed_at,clock_timestamp()),completion_metadata=jsonb_build_object('planVersion',input_version_code),updated_at=clock_timestamp() where onboarding_id=onboarding_record.id and step_key='commission_system';
  insert into public.partner_onboarding_events(onboarding_id,partner_profile_id,actor_profile_id,actor_auth_user_id,event_type,subject_type,subject_id,idempotency_key,safe_metadata)
  values(onboarding_record.id,partner_record.id,profile_record.id,input_auth_user_id,'commission_plan.accepted','partner_commission_assignment',assignment_record.id,input_idempotency_key,jsonb_build_object('planVersion',input_version_code)) on conflict(onboarding_id,idempotency_key) do nothing;
  return assignment_record.id;
end $function$;

create function public.partner_accept_required_documents(input_auth_user_id uuid,input_version_codes text[],input_declaration_version text,input_idempotency_key text)
returns integer language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare profile_record public.profiles%rowtype; partner_record public.partner_profiles%rowtype; onboarding_record public.partner_onboardings%rowtype; document_record public.partner_document_versions%rowtype; required_count integer; accepted_count integer:=0;
begin
  perform public.partner_assert_service_role();
  if input_declaration_version<>'onboarding_documents_consent_nl_v1' or char_length(input_idempotency_key) not between 16 and 160 then raise exception using errcode='22023',message='Document acceptance input is invalid.'; end if;
  select * into profile_record from public.profiles where auth_user_id=input_auth_user_id and role='sales_partner' and status in ('pending','active') for share;
  select * into partner_record from public.partner_profiles where profile_id=profile_record.id and status='onboarding' for share;
  select * into onboarding_record from public.partner_onboardings where partner_profile_id=partner_record.id and status not in ('active','revoked','expired') order by created_at desc limit 1 for update;
  select count(*) into required_count from public.partner_document_versions where status='published';
  if required_count<>cardinality(input_version_codes) or exists(select 1 from public.partner_document_versions where status='published' and version_code<>all(input_version_codes)) then
    raise exception using errcode='23514',message='Every current required document version must be accepted.';
  end if;
  for document_record in select * from public.partner_document_versions where status='published' loop
    insert into public.partner_document_acceptances(onboarding_id,document_version_id,partner_profile_id,declaration_version,idempotency_key)
    values(onboarding_record.id,document_record.id,partner_record.id,input_declaration_version,input_idempotency_key||':'||document_record.version_code)
    on conflict(onboarding_id,document_version_id) do nothing; accepted_count:=accepted_count+1;
  end loop;
  update public.partner_onboarding_steps set status='completed',completed_at=coalesce(completed_at,clock_timestamp()),completion_metadata=jsonb_build_object('declarationVersion',input_declaration_version,'documentVersions',to_jsonb(input_version_codes)),updated_at=clock_timestamp() where onboarding_id=onboarding_record.id and step_key='document_acceptance';
  insert into public.partner_onboarding_events(onboarding_id,partner_profile_id,actor_profile_id,actor_auth_user_id,event_type,subject_type,subject_id,idempotency_key,safe_metadata)
  values(onboarding_record.id,partner_record.id,profile_record.id,input_auth_user_id,'documents.acknowledged','partner_onboarding',onboarding_record.id,input_idempotency_key,jsonb_build_object('declarationVersion',input_declaration_version,'documentVersions',to_jsonb(input_version_codes))) on conflict(onboarding_id,idempotency_key) do nothing;
  return accepted_count;
end $function$;

create function public.partner_admin_assign_lead(input_lead_id uuid,input_partner_profile_id uuid,input_actor_profile_id uuid,input_reason text,input_idempotency_key text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare actor_record public.profiles%rowtype; result_id uuid;
begin perform public.partner_assert_service_role();
  select * into actor_record from public.profiles where id=input_actor_profile_id and status='active' and role in ('super_admin','admin');
  if not found or char_length(btrim(input_reason))<5 or char_length(input_idempotency_key) not between 16 and 160 then raise exception using errcode='42501',message='Active admin, reason and idempotency key required.'; end if;
  select id into result_id from public.partner_lead_attributions where idempotency_key=input_idempotency_key; if found then return result_id; end if;
  update public.partner_lead_attributions set status='revoked',ended_at=clock_timestamp() where lead_id=input_lead_id and status='valid';
  insert into public.partner_lead_attributions(lead_id,partner_profile_id,status,attribution_method,reason,idempotency_key,created_by_profile_id)
  values(input_lead_id,input_partner_profile_id,'valid','admin_assignment',btrim(input_reason),input_idempotency_key,actor_record.id) returning id into result_id; return result_id;
end $function$;

create function public.partner_record_canonical_payment(input_invoice_id uuid,input_provider text,input_provider_payment_id text,input_provider_event_id text,input_attribution_id uuid,input_idempotency_key text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare invoice_record public.invoices%rowtype; quote_record public.quotes%rowtype; attribution_record public.partner_lead_attributions%rowtype; assignment_record public.partner_commission_assignments%rowtype; version_record public.partner_commission_plan_versions%rowtype; existing_event public.partner_payment_events%rowtype; payment_event public.partner_payment_events%rowtype; result_id uuid; basis bigint; prior_basis bigint; prior_commission bigint; total_commission bigint; incremental bigint; month_start date;
begin perform public.partner_assert_service_role();
  if char_length(input_idempotency_key) not between 16 and 160 or char_length(input_provider)<2 or char_length(input_provider_payment_id)<3 or char_length(input_provider_event_id)<3 then raise exception using errcode='22023',message='Invalid canonical payment identity.'; end if;
  select * into existing_event from public.partner_payment_events where provider=input_provider and provider_payment_id=input_provider_payment_id and event_type='paid';
  if found then select id into result_id from public.partner_commission_ledger_entries where payment_event_id=existing_event.id and entry_type='earned'; return result_id; end if;
  select * into invoice_record from public.invoices where id=input_invoice_id for share;
  if not found or invoice_record.status<>'paid' or invoice_record.paid_at is null or invoice_record.mollie_payment_status<>'paid'
     or invoice_record.mollie_payment_id is distinct from input_provider_payment_id or invoice_record.environment<>'production'
     or invoice_record.deleted_at is not null or invoice_record.archived_at is not null or invoice_record.subtotal<=0 then
    raise exception using errcode='23514',message='Canonical invoice is not a qualifying paid sale.';
  end if;
  select * into quote_record from public.quotes where id=invoice_record.source_quote_id and status='accepted' and accepted_at is not null for share;
  if not found then raise exception using errcode='23514',message='A canonically accepted quote is required.'; end if;
  select * into attribution_record from public.partner_lead_attributions where id=input_attribution_id and status='valid' for share;
  if not found or not exists(select 1 from public.leads l where l.id=attribution_record.lead_id and l.converted_customer_id=invoice_record.customer_id) then
    raise exception using errcode='23514',message='Valid lead attribution is required.';
  end if;
  if not exists(select 1 from public.partner_profiles pp join public.profiles p on p.id=pp.profile_id
    where pp.id=attribution_record.partner_profile_id and pp.status='active' and p.status='active')
    or not exists(select 1 from public.partner_certificates c where c.partner_profile_id=attribution_record.partner_profile_id and c.status='valid' and c.expires_at>clock_timestamp()) then
    raise exception using errcode='23514',message='Partner must hold active valid certification.';
  end if;
  select a.* into assignment_record from public.partner_commission_assignments a where a.partner_profile_id=attribution_record.partner_profile_id and a.status='accepted' for share;
  select * into version_record from public.partner_commission_plan_versions where id=assignment_record.plan_version_id and status='published';
  if not found or not version_record.include_one_time_projects or (invoice_record.subscription_id is not null and not version_record.include_subscriptions) then raise exception using errcode='23514',message='Commission plan does not qualify this sale.'; end if;
  basis:=round(invoice_record.subtotal*100)::bigint; month_start:=date_trunc('month',invoice_record.paid_at at time zone 'Europe/Amsterdam')::date;
  select coalesce(sum(basis_ex_vat_cents),0) into prior_basis from public.partner_commission_ledger_entries where partner_profile_id=attribution_record.partner_profile_id and earning_month=month_start and entry_type='earned';
  if version_record.calculation_method='retroactive_tier' then
    prior_commission:=public.partner_retroactive_commission_cents(prior_basis,version_record.tiers); total_commission:=public.partner_retroactive_commission_cents(prior_basis+basis,version_record.tiers);
  else
    prior_commission:=public.partner_progressive_commission_cents(prior_basis,version_record.tiers); total_commission:=public.partner_progressive_commission_cents(prior_basis+basis,version_record.tiers);
  end if;
  incremental:=total_commission-prior_commission;
  insert into public.partner_payment_events(invoice_id,provider,provider_event_id,provider_payment_id,event_type,amount_ex_vat_cents,occurred_at,idempotency_key)
  values(invoice_record.id,input_provider,input_provider_event_id,input_provider_payment_id,'paid',basis,invoice_record.paid_at,input_idempotency_key) returning * into payment_event;
  insert into public.partner_commission_ledger_entries(partner_profile_id,attribution_id,invoice_id,payment_event_id,plan_version_id,entry_type,basis_ex_vat_cents,commission_cents,earning_month,reason,idempotency_key)
  values(attribution_record.partner_profile_id,attribution_record.id,invoice_record.id,payment_event.id,version_record.id,'earned',basis,incremental,month_start,'Canonical paid invoice',input_idempotency_key) returning id into result_id;
  return result_id;
end $function$;

create function public.partner_reverse_canonical_payment(input_provider text,input_original_payment_id text,input_reversal_event_id text,input_reversal_type text,input_reason text,input_idempotency_key text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public
as $function$
declare original_event public.partner_payment_events%rowtype; original_entry public.partner_commission_ledger_entries%rowtype; reversal_event public.partner_payment_events%rowtype; result_id uuid;
begin perform public.partner_assert_service_role();
  if input_reversal_type not in ('refund','chargeback') or char_length(btrim(input_reason))<5 or char_length(input_idempotency_key) not between 16 and 160 then raise exception using errcode='22023',message='Invalid reversal.'; end if;
  select * into reversal_event from public.partner_payment_events where provider=input_provider and provider_event_id=input_reversal_event_id;
  if found then select id into result_id from public.partner_commission_ledger_entries where payment_event_id=reversal_event.id; return result_id; end if;
  select * into original_event from public.partner_payment_events where provider=input_provider and provider_payment_id=input_original_payment_id and event_type='paid' for share;
  select * into original_entry from public.partner_commission_ledger_entries where payment_event_id=original_event.id and entry_type='earned' for share;
  if not found then raise exception using errcode='23514',message='Original canonical commission entry is missing.'; end if;
  insert into public.partner_payment_events(invoice_id,provider,provider_event_id,provider_payment_id,event_type,original_payment_event_id,amount_ex_vat_cents,occurred_at,idempotency_key)
  values(original_event.invoice_id,input_provider,input_reversal_event_id,input_original_payment_id,input_reversal_type,original_event.id,original_event.amount_ex_vat_cents,clock_timestamp(),input_idempotency_key) returning * into reversal_event;
  insert into public.partner_commission_ledger_entries(partner_profile_id,attribution_id,invoice_id,payment_event_id,plan_version_id,entry_type,basis_ex_vat_cents,commission_cents,earning_month,reason,idempotency_key)
  values(original_entry.partner_profile_id,original_entry.attribution_id,original_entry.invoice_id,reversal_event.id,original_entry.plan_version_id,input_reversal_type,-original_entry.basis_ex_vat_cents,-original_entry.commission_cents,original_entry.earning_month,btrim(input_reason),input_idempotency_key) returning id into result_id; return result_id;
end $function$;

alter table public.partner_commission_plans enable row level security; alter table public.partner_commission_plan_versions enable row level security; alter table public.partner_commission_assignments enable row level security; alter table public.partner_lead_attributions enable row level security; alter table public.partner_payment_events enable row level security; alter table public.partner_commission_ledger_entries enable row level security; alter table public.partner_document_versions enable row level security; alter table public.partner_document_acceptances enable row level security;
create policy partner_commission_assignment_self_read on public.partner_commission_assignments for select to authenticated using(exists(select 1 from public.partner_profiles pp join public.profiles p on p.id=pp.profile_id where pp.id=partner_profile_id and p.auth_user_id=auth.uid()));
create policy partner_commission_ledger_self_read on public.partner_commission_ledger_entries for select to authenticated using(exists(select 1 from public.partner_profiles pp join public.profiles p on p.id=pp.profile_id where pp.id=partner_profile_id and p.auth_user_id=auth.uid()));
create policy partner_document_acceptance_self_read on public.partner_document_acceptances for select to authenticated using(exists(select 1 from public.partner_profiles pp join public.profiles p on p.id=pp.profile_id where pp.id=partner_profile_id and p.auth_user_id=auth.uid()));
create policy partner_finance_admin_read on public.partner_commission_ledger_entries for select to authenticated using(public.has_app_role(array['super_admin','admin']));
revoke all on public.partner_commission_plans,public.partner_commission_plan_versions,public.partner_commission_assignments,public.partner_lead_attributions,public.partner_payment_events,public.partner_commission_ledger_entries,public.partner_document_versions,public.partner_document_acceptances from public,anon,authenticated;
grant select on public.partner_commission_assignments,public.partner_commission_ledger_entries,public.partner_document_acceptances to authenticated;
grant select,insert,update on public.partner_commission_plans,public.partner_commission_plan_versions,public.partner_commission_assignments,public.partner_lead_attributions,public.partner_payment_events,public.partner_commission_ledger_entries,public.partner_document_versions,public.partner_document_acceptances to service_role;
revoke all on function public.partner_accept_commission_plan(uuid,text,text),public.partner_accept_required_documents(uuid,text[],text,text),public.partner_admin_assign_lead(uuid,uuid,uuid,text,text),public.partner_record_canonical_payment(uuid,text,text,text,uuid,text),public.partner_reverse_canonical_payment(text,text,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.partner_accept_commission_plan(uuid,text,text),public.partner_accept_required_documents(uuid,text[],text,text),public.partner_admin_assign_lead(uuid,uuid,uuid,text,text),public.partner_record_canonical_payment(uuid,text,text,text,uuid,text),public.partner_reverse_canonical_payment(text,text,text,text,text,text) to service_role;
revoke all on function public.partner_progressive_commission_cents(bigint,jsonb),public.partner_retroactive_commission_cents(bigint,jsonb),public.partner_immutable_finance_guard(),public.partner_published_business_version_guard(),public.partner_assign_default_commission_plan() from public,anon,authenticated;
grant execute on function public.partner_progressive_commission_cents(bigint,jsonb),public.partner_retroactive_commission_cents(bigint,jsonb),public.partner_immutable_finance_guard(),public.partner_published_business_version_guard(),public.partner_assign_default_commission_plan() to service_role;

commit;
