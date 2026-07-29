-- Signhost foundation: provider-neutral signing state, immutable provider evidence
-- and private storage references. No transaction can start until an approved PDF
-- template is explicitly activated.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.staff_zzp_dossiers') is null
     or pg_catalog.to_regclass('public.partner_document_versions') is null
     or pg_catalog.to_regclass('public.staff_dossier_events') is null then
    raise exception using errcode = '55000',
      message = 'Signhost foundation requires Partner Onboarding and Staff ZZP Dossier V1.';
  end if;
end
$preflight$;

create table public.partner_signing_templates (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null unique references public.partner_document_versions(id) on delete restrict,
  provider text not null default 'signhost' check (provider = 'signhost'),
  storage_bucket text not null default 'staff-private-documents' check (storage_bucket = 'staff-private-documents'),
  storage_path text not null unique check (storage_path ~ '^signing-templates/[0-9a-f-]{36}/[a-z0-9._-]+$'),
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  checksum_sha256 text not null check (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  legal_approval_reference text not null check (char_length(btrim(legal_approval_reference)) between 3 and 500),
  verification_method text not null default 'PhoneNumber' check (verification_method in ('PhoneNumber','Scribble','Consent')),
  active boolean not null default false,
  activated_at timestamptz,
  activated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint partner_signing_template_activation_check check (
    not active or (activated_at is not null and activated_by_profile_id is not null)
  )
);

create unique index partner_signing_templates_one_active_idx
  on public.partner_signing_templates(provider)
  where active;

create table public.staff_signing_transactions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.staff_zzp_dossiers(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  template_id uuid not null references public.partner_signing_templates(id) on delete restrict,
  provider text not null default 'signhost' check (provider = 'signhost'),
  provider_transaction_id uuid unique,
  provider_file_id text not null default 'zzp-overeenkomst.pdf' check (provider_file_id ~ '^[a-z0-9._-]+$'),
  status text not null default 'creating' check (status in (
    'creating','waiting_for_signer','signed_pending_scan','signed','rejected','expired','cancelled','failed'
  )),
  provider_status integer,
  signer_email text not null,
  signer_name text not null,
  countersigner_email text not null,
  countersigner_name text not null,
  signed_document_path text unique,
  receipt_path text unique,
  signed_document_sha256 text check (signed_document_sha256 is null or signed_document_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_sha256 text check (receipt_sha256 is null or receipt_sha256 ~ '^[a-f0-9]{64}$'),
  requested_at timestamptz,
  signed_at timestamptz,
  last_postback_at timestamptz,
  failure_code text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint staff_signing_artifact_pair_check check (
    (signed_document_path is null and receipt_path is null)
    or (signed_document_path is not null and receipt_path is not null)
  )
);

create unique index staff_signing_one_open_transaction_idx
  on public.staff_signing_transactions(dossier_id)
  where status in ('creating','waiting_for_signer','signed_pending_scan');
create index staff_signing_profile_created_idx
  on public.staff_signing_transactions(profile_id, created_at desc);

alter table public.staff_dossier_events
  drop constraint staff_dossier_events_subject_type_check;
alter table public.staff_dossier_events
  add constraint staff_dossier_events_subject_type_check
  check (subject_type in ('dossier','document','message','onboarding','calendar','signing_transaction'));

alter table public.partner_signing_templates enable row level security;
alter table public.staff_signing_transactions enable row level security;

create policy partner_signing_templates_super_admin_read on public.partner_signing_templates
for select to authenticated using (public.has_app_role(array['super_admin']));
create policy staff_signing_transactions_owner_read on public.staff_signing_transactions
for select to authenticated using (profile_id = public.current_profile_id());
create policy staff_signing_transactions_super_admin_read on public.staff_signing_transactions
for select to authenticated using (public.has_app_role(array['super_admin']));

revoke all on public.partner_signing_templates, public.staff_signing_transactions
  from public, anon, authenticated;
grant select, insert, update on public.partner_signing_templates, public.staff_signing_transactions
  to service_role;

commit;
