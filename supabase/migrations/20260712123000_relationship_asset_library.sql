begin;

-- This migration must be self-contained. Production does not apply
-- supabase/schema.sql before timestamped migrations.
create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  name text,
  file_type text,
  category text,
  location text,
  storage_path text,
  status text default 'active',
  notes text,
  is_client_visible boolean not null default true,
  is_demo boolean default false,
  environment text default 'production',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.files add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.files add column if not exists original_lead_id uuid references public.leads(id) on delete set null;
alter table public.files add column if not exists uploaded_by_auth_user_id uuid references auth.users(id) on delete set null;
alter table public.files add column if not exists uploaded_by_type text not null default 'admin';
alter table public.files add column if not exists source_module text not null default 'asset_manager';
alter table public.files add column if not exists original_filename text;
alter table public.files add column if not exists mime_type text;
alter table public.files add column if not exists size_bytes bigint not null default 0;
alter table public.files add column if not exists checksum text;
alter table public.files add column if not exists usage_rights_confirmed boolean not null default false;
alter table public.files add column if not exists is_primary boolean not null default false;
alter table public.files add column if not exists is_client_visible boolean not null default true;
alter table public.files add column if not exists replaced_file_id uuid references public.files(id) on delete set null;
alter table public.files drop constraint if exists files_status_check;
alter table public.files add constraint files_status_check check (status in ('new','reviewing','active','in_review','approved','rejected','replaced','archived'));
alter table public.files add constraint files_one_relationship_check check (num_nonnulls(lead_id, customer_id) = 1) not valid;
alter table public.files add constraint files_uploader_type_check check (uploaded_by_type in ('admin','sales','customer','system'));

create unique index if not exists files_customer_checksum_unique on public.files(customer_id, checksum) where customer_id is not null and checksum is not null and status <> 'archived';
create unique index if not exists files_lead_checksum_unique on public.files(lead_id, checksum) where lead_id is not null and checksum is not null and status <> 'archived';
create index if not exists files_lead_id_idx on public.files(lead_id, created_at desc);
create index if not exists files_customer_review_idx on public.files(customer_id, status, created_at desc);

create table if not exists public.asset_requests (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  original_lead_id uuid references public.leads(id) on delete set null,
  title text not null,
  instructions text,
  requested_categories text[] not null default '{}',
  minimum_count integer not null default 1 check (minimum_count between 1 and 100),
  deadline date,
  status text not null default 'open' check (status in ('open','partial','complete','expired','cancelled')),
  created_by_auth_user_id uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_requests_one_relationship_check check (num_nonnulls(lead_id, customer_id) = 1)
);
create index if not exists asset_requests_customer_idx on public.asset_requests(customer_id, status, created_at desc);
create index if not exists asset_requests_lead_idx on public.asset_requests(lead_id, status, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('relationship-assets','relationship-assets',false,8388608,array['image/jpeg','image/png','image/webp','image/svg+xml','video/mp4','video/webm','application/pdf','text/plain','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

alter table public.files enable row level security;
alter table public.asset_requests enable row level security;
drop policy if exists files_customer_read_own on public.files;
create policy files_customer_read_own on public.files for select to authenticated using (customer_id is not null and public.owns_customer(customer_id) and is_client_visible = true);
drop policy if exists asset_requests_customer_read_own on public.asset_requests;
create policy asset_requests_customer_read_own on public.asset_requests for select to authenticated using (customer_id is not null and public.owns_customer(customer_id));
grant select on public.files, public.asset_requests to authenticated;
grant select, insert, update on public.files, public.asset_requests to service_role;

commit;
