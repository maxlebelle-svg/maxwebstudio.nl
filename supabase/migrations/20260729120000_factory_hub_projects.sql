-- Max Webstudio Factory Hub: reusable production dossiers for website, webshop and food.
-- Forward-only and data preserving. Creating a dossier never publishes a customer product.
begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.customers') is null
     or pg_catalog.to_regclass('public.leads') is null
     or pg_catalog.to_regclass('public.profiles') is null then
    raise exception using errcode = '55000', message = 'Factory Hub requires customers, leads and profiles.';
  end if;
end
$preflight$;

create table if not exists public.factory_projects (
  id uuid primary key default gen_random_uuid(),
  relationship_type text not null check (relationship_type in ('lead','customer')),
  relationship_id uuid not null,
  factory_type text not null check (factory_type in ('website','webshop','food')),
  blueprint_key text not null check (blueprint_key ~ '^[a-z][a-z0-9-]{2,79}$'),
  blueprint_version integer not null check (blueprint_version between 1 and 10000),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  status text not null default 'intake' check (status in ('intake','ready','in_production','review','live','paused','archived')),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists factory_projects_relationship_updated_idx
  on public.factory_projects(relationship_type, relationship_id, updated_at desc);
create index if not exists factory_projects_type_status_idx
  on public.factory_projects(factory_type, status, updated_at desc);

alter table public.factory_projects enable row level security;
revoke all on table public.factory_projects from anon, authenticated;
grant all on table public.factory_projects to service_role;

comment on table public.factory_projects is
  'Admin-owned reusable production dossiers. Relationship integrity is verified by the admin API because relationship_id can target either leads or customers.';

commit;
