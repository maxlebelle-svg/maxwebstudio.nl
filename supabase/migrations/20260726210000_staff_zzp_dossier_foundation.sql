-- Staff dossier V1: privacy-minimal ZZP records, private document metadata,
-- persistent staff chat and immutable access evidence.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.partner_profiles') is null
     or pg_catalog.to_regprocedure('public.current_profile_id()') is null
     or pg_catalog.to_regprocedure('public.has_app_role(text[])') is null then
    raise exception using errcode = '55000',
      message = 'Staff ZZP dossier requires profiles and Partner Onboarding V1.';
  end if;
end
$preflight$;

create table public.staff_zzp_dossiers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete restrict,
  partner_profile_id uuid unique references public.partner_profiles(id) on delete set null,
  relationship_type text not null default 'zzp' check (relationship_type = 'zzp'),
  status text not null default 'draft' check (status in ('draft','submitted','changes_requested','verified','archived')),
  legal_name text,
  trade_name text,
  phone text,
  street text,
  house_number text,
  postal_code text,
  city text,
  country_code text not null default 'NL' check (country_code ~ '^[A-Z]{2}$'),
  kvk_number text check (kvk_number is null or kvk_number ~ '^[0-9]{8}$'),
  vat_number text check (vat_number is null or char_length(vat_number) between 8 and 20),
  iban text check (iban is null or iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$'),
  iban_account_name text,
  privacy_notice_version text not null default 'staff_zzp_privacy_nl_v1',
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by_profile_id uuid references public.profiles(id) on delete set null,
  change_request_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint staff_zzp_dossier_submission_check check (
    status not in ('submitted','verified') or (
      nullif(btrim(legal_name),'') is not null
      and nullif(btrim(phone),'') is not null
      and nullif(btrim(street),'') is not null
      and nullif(btrim(house_number),'') is not null
      and nullif(btrim(postal_code),'') is not null
      and nullif(btrim(city),'') is not null
      and kvk_number is not null
      and vat_number is not null
      and iban is not null
      and nullif(btrim(iban_account_name),'') is not null
      and submitted_at is not null
    )
  ),
  constraint staff_zzp_dossier_verification_check check (
    status <> 'verified' or (verified_at is not null and verified_by_profile_id is not null)
  ),
  constraint staff_zzp_dossiers_id_profile_unique unique (id, profile_id)
);

create index staff_zzp_dossiers_status_updated_idx
  on public.staff_zzp_dossiers(status, updated_at desc);

create table public.staff_zzp_documents (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  document_type text not null check (document_type in (
    'signed_assignment_agreement','identity_verification_copy',
    'bank_account_proof','kvk_extract','other'
  )),
  identity_document_type text check (
    identity_document_type is null or identity_document_type in ('passport','identity_card','driving_licence')
  ),
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[a-z0-9._-]+$'
  ),
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png')),
  size_bytes bigint not null check (size_bytes between 1 and 8388608),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending_upload' check (status in ('pending_upload','quarantined','available','rejected','archived')),
  scan_status text not null default 'pending' check (scan_status in ('pending','not_configured','clean','infected','failed')),
  purpose text not null,
  employee_declaration text not null,
  uploaded_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint staff_zzp_documents_identity_type_check check (
    (document_type = 'identity_verification_copy' and identity_document_type is not null)
    or (document_type <> 'identity_verification_copy' and identity_document_type is null)
  ),
  constraint staff_zzp_documents_dossier_owner_fk
    foreign key (dossier_id, profile_id)
    references public.staff_zzp_dossiers(id, profile_id)
    on delete restrict
);

create index staff_zzp_documents_dossier_type_idx
  on public.staff_zzp_documents(dossier_id, document_type, created_at desc);

create table public.staff_messages (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references public.profiles(id) on delete restrict,
  sender_profile_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 160),
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint staff_messages_once unique (employee_profile_id, idempotency_key)
);

create index staff_messages_thread_idx
  on public.staff_messages(employee_profile_id, created_at desc);
create index staff_messages_unread_idx
  on public.staff_messages(employee_profile_id, read_at)
  where read_at is null and archived_at is null;

create table public.staff_dossier_events (
  id uuid primary key default gen_random_uuid(),
  employee_profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  subject_type text not null check (subject_type in ('dossier','document','message','onboarding','calendar')),
  subject_id uuid not null,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata) = 'object'),
  occurred_at timestamptz not null default clock_timestamp()
);

create index staff_dossier_events_timeline_idx
  on public.staff_dossier_events(employee_profile_id, occurred_at desc);

create function public.staff_dossier_event_immutable_guard()
returns trigger language plpgsql set search_path = pg_catalog
as $function$
begin
  raise exception using errcode = '55000', message = 'Staff dossier events are immutable.';
end
$function$;

create trigger staff_dossier_events_immutable
before update or delete on public.staff_dossier_events
for each row execute function public.staff_dossier_event_immutable_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-private-documents','staff-private-documents',false,8388608,
  array['application/pdf','image/jpeg','image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.staff_zzp_dossiers enable row level security;
alter table public.staff_zzp_documents enable row level security;
alter table public.staff_messages enable row level security;
alter table public.staff_dossier_events enable row level security;

create policy staff_zzp_dossiers_owner_read on public.staff_zzp_dossiers
for select to authenticated using (profile_id = public.current_profile_id());
create policy staff_zzp_dossiers_super_admin_read on public.staff_zzp_dossiers
for select to authenticated using (public.has_app_role(array['super_admin']));
create policy staff_zzp_documents_owner_metadata_read on public.staff_zzp_documents
for select to authenticated using (profile_id = public.current_profile_id());
create policy staff_zzp_documents_super_admin_metadata_read on public.staff_zzp_documents
for select to authenticated using (public.has_app_role(array['super_admin']));
create policy staff_messages_participant_read on public.staff_messages
for select to authenticated using (
  employee_profile_id = public.current_profile_id()
  or public.has_app_role(array['super_admin'])
);
create policy staff_dossier_events_super_admin_read on public.staff_dossier_events
for select to authenticated using (public.has_app_role(array['super_admin']));

revoke all on public.staff_zzp_dossiers, public.staff_zzp_documents,
  public.staff_messages, public.staff_dossier_events from public, anon, authenticated;
grant select, insert, update on public.staff_zzp_dossiers, public.staff_zzp_documents,
  public.staff_messages to service_role;
grant select, insert on public.staff_dossier_events to service_role;
revoke all on function public.staff_dossier_event_immutable_guard() from public, anon, authenticated;
grant execute on function public.staff_dossier_event_immutable_guard() to service_role;

commit;
