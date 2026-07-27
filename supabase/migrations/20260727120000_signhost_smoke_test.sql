do $preflight$
begin
  if pg_catalog.to_regclass('public.profiles') is null
     or pg_catalog.to_regclass('public.staff_signing_transactions') is null
     or pg_catalog.to_regprocedure('public.has_app_role(text[])') is null then
    raise exception using errcode = '55000',
      message = 'Signhost smoke tests require profiles and the Signhost foundation.';
  end if;
end
$preflight$;

create table public.signhost_smoke_tests (
  id uuid primary key default gen_random_uuid(),
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  request_key text not null unique check (char_length(request_key) between 16 and 160),
  provider text not null default 'signhost' check (provider = 'signhost'),
  provider_transaction_id uuid unique,
  provider_file_id text not null default 'signhost-technische-test.pdf' check (provider_file_id ~ '^[a-z0-9._-]+$'),
  signer_email text not null,
  signer_name text not null,
  template_bucket text not null default 'staff-private-documents' check (template_bucket = 'staff-private-documents'),
  template_path text not null check (template_path ~ '^signhost-smoke-tests/template/[a-z0-9._-]+$'),
  template_sha256 text not null check (template_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'creating' check (status in (
    'creating','waiting_for_signer','signed','rejected','expired','cancelled','failed'
  )),
  provider_status integer,
  signed_document_path text unique,
  receipt_path text unique,
  signed_document_sha256 text check (signed_document_sha256 is null or signed_document_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_sha256 text check (receipt_sha256 is null or receipt_sha256 ~ '^[a-f0-9]{64}$'),
  failure_code text,
  requested_at timestamptz,
  signed_at timestamptz,
  last_postback_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index signhost_smoke_tests_requested_idx
  on public.signhost_smoke_tests(requested_by_profile_id, created_at desc);

alter table public.signhost_smoke_tests enable row level security;

create policy signhost_smoke_tests_superadmin_read
  on public.signhost_smoke_tests
  for select
  to authenticated
  using (public.has_app_role(array['super_admin']));

revoke all on public.signhost_smoke_tests from anon, authenticated;
grant select on public.signhost_smoke_tests to authenticated;
grant select, insert, update, delete on public.signhost_smoke_tests to service_role;
