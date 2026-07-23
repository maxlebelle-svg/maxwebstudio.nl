\set ON_ERROR_STOP on

grant postgres to bootstrapadmin;
grant create on database p0_complete_production_database_recovery to postgres;
alter schema public owner to postgres;
grant usage, create on schema public to postgres;
grant usage on schema extensions, auth to postgres;
grant select, references on table auth.users to postgres;
set role postgres;

create schema supabase_migrations authorization postgres;
create table supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
insert into supabase_migrations.schema_migrations(version,name)
values ('20260718190000','public_preview_publications');

create table public.profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid references auth.users(id),
  role text,
  status text default 'active',
  is_demo boolean default false,
  environment text default 'production'
);

create table public.customers (
  id uuid primary key default extensions.gen_random_uuid(),
  auth_user_id uuid references auth.users(id),
  profile_id uuid references public.profiles(id),
  status text default 'active'
);

create table public.leads (
  id uuid primary key default extensions.gen_random_uuid(),
  company_name text,
  contact_name text,
  email text,
  phone text,
  website text,
  status text not null default 'nieuw',
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lead_status text not null default 'new',
  normalized_company_name text,
  normalized_phone text,
  external_source text,
  external_source_id text,
  last_activity_at timestamptz,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  last_contacted_at timestamptz,
  last_contacted_by uuid references auth.users(id) on delete set null,
  last_call_outcome text,
  next_action_type text,
  next_action_at timestamptz,
  next_action_note text,
  next_action_assigned_user_id uuid references auth.users(id) on delete set null,
  next_action_created_automatically boolean default false,
  appointment_at timestamptz,
  appointment_type text,
  appointment_location text,
  won_at timestamptz,
  won_by uuid references auth.users(id) on delete set null,
  lost_at timestamptz,
  lost_by uuid references auth.users(id) on delete set null,
  lost_reason text,
  lost_note text,
  acquisition_channel text,
  sourced_by_user_id uuid references auth.users(id) on delete set null,
  closed_by_user_id uuid references auth.users(id) on delete set null,
  pipeline_stage text not null default 'new',
  interest_level text not null default 'unsure',
  priority text not null default 'normal',
  is_favorite boolean not null default false,
  next_action_completed_at timestamptz,
  next_action_completed_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  constraint leads_acquisition_channel_check check (acquisition_channel is null or acquisition_channel in ('website','email','outbound_sales','referral','phone','social','partner','manual','import','other')),
  constraint leads_interest_level_check check (interest_level in ('hot','interested','unsure','not_interested')),
  constraint leads_priority_check check (priority in ('high','normal','low'))
);

comment on column public.leads.external_source is 'Technical lead source/system; no duplicate lead_source column.';
comment on column public.leads.acquisition_channel is 'Explicit commercial acquisition channel.';

create unique index leads_external_source_identity_idx on public.leads(external_source,external_source_id)
  where external_source is not null and external_source_id is not null;
create index leads_created_at_idx on public.leads(created_at);
create index leads_updated_at_idx on public.leads(updated_at);
create index leads_status_idx on public.leads(status);
create index leads_lead_status_idx on public.leads(lead_status);
create index leads_normalized_company_name_idx on public.leads(normalized_company_name);
create index leads_normalized_phone_idx on public.leads(normalized_phone);
create index leads_pipeline_stage_updated_idx on public.leads(pipeline_stage,updated_at);

alter table public.leads enable row level security;
create policy leads_admin_manage on public.leads for all to public
using (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role=any(array['super_admin'::text,'admin'::text]) and p.status=any(array['active'::text,'invited'::text])))
with check (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role=any(array['super_admin'::text,'admin'::text]) and p.status=any(array['active'::text,'invited'::text])));
create policy leads_sales_manager_read_update on public.leads for all to public
using (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_manager'::text and p.status=any(array['active'::text,'invited'::text])))
with check (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_manager'::text and p.status=any(array['active'::text,'invited'::text])));
create policy leads_sales_partner_insert_own on public.leads for insert to public
with check (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_partner'::text and p.status=any(array['active'::text,'invited'::text])) and ((auth.uid()=owner_id or auth.uid()=created_by) or auth.uid()=assigned_to));
create policy leads_sales_partner_select_own on public.leads for select to public
using (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_partner'::text and p.status=any(array['active'::text,'invited'::text])) and ((auth.uid()=owner_id or auth.uid()=created_by) or auth.uid()=assigned_to));
create policy leads_sales_partner_update_own on public.leads for update to public
using (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_partner'::text and p.status=any(array['active'::text,'invited'::text])) and ((auth.uid()=owner_id or auth.uid()=created_by) or auth.uid()=assigned_to))
with check (exists (select 1 from public.profiles p where p.auth_user_id=auth.uid() and p.role='sales_partner'::text and p.status=any(array['active'::text,'invited'::text])) and ((auth.uid()=owner_id or auth.uid()=created_by) or auth.uid()=assigned_to));

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
alter function public.set_updated_at() owner to postgres;

create trigger set_leads_updated_at before update on public.leads
for each row execute function public.set_updated_at();

\ir ../../supabase/migrations/20260721010000_harden_role_helper_search_paths.sql

-- Current production semantics captured by the target-locked read-only helper audit.
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path to public as $function$
  select coalesce(p.role, 'anonymous')
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') in ('active', 'invited')
  limit 1
$function$;

create or replace function public.current_profile_id()
returns uuid language sql stable security definer set search_path to public as $function$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') in ('active', 'invited')
  limit 1
$function$;

create or replace function public.is_demo_context()
returns boolean language sql stable security definer set search_path to public as $function$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.status, 'active') = 'active'
      and (
        p.role = 'demo_user'
        or coalesce(p.is_demo, false) = true
        or coalesce(p.environment, '') = 'demo'
      )
  )
$function$;

create or replace function public.is_staff_role()
returns boolean language sql stable security definer set search_path to public as $function$
  select public.has_app_role(array[
    'super_admin',
    'admin',
    'sales_manager',
    'sales_partner',
    'designer',
    'developer',
    'support'
  ])
$function$;

create or replace function public.owns_customer(target_customer_id uuid)
returns boolean language sql stable security definer set search_path to public as $function$
  select target_customer_id is not null
    and exists (
      select 1
      from public.customers c
      where c.id = target_customer_id
        and coalesce(c.status, 'active') <> 'archived'
        and (
          c.auth_user_id = auth.uid()
          or c.profile_id = public.current_profile_id()
        )
    )
$function$;

alter function public.current_app_role() set search_path to public;
alter function public.current_profile_id() set search_path to public;
alter function public.has_app_role(text[]) set search_path to public;
alter function public.is_admin_role() set search_path to public;
alter function public.is_demo_context() set search_path to public;
alter function public.is_demo_record(boolean,text) set search_path to public;
alter function public.is_staff_role() set search_path to public;
alter function public.owns_customer(uuid) set search_path to public;

grant execute on function public.current_app_role() to public, authenticated, service_role;
grant execute on function public.current_profile_id() to public, authenticated, service_role;
grant execute on function public.has_app_role(text[]) to public, authenticated, service_role;
grant execute on function public.is_admin_role() to public, authenticated, service_role;
grant execute on function public.is_demo_context() to public, authenticated, service_role;
grant execute on function public.is_demo_record(boolean,text) to public, authenticated, service_role;
grant execute on function public.is_staff_role() to public, authenticated, service_role;
grant execute on function public.owns_customer(uuid) to public, authenticated, service_role;
grant execute on function public.set_updated_at() to public, service_role;

revoke all on table public.profiles, public.customers, public.leads from public, anon, authenticated;
grant select, insert, update, delete on table public.profiles, public.customers, public.leads to service_role;
reset role;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
insert into auth.users(id) values ('42000000-0000-4000-8000-000000000099');
set role postgres;
grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.leads to authenticated;

insert into public.profiles(auth_user_id,role,status,environment)
values ('42000000-0000-4000-8000-000000000099','sales_manager','active','production');

insert into public.leads(
  company_name,contact_name,email,phone,website,status,notes,environment,metadata,
  created_at,updated_at,lead_status,normalized_company_name,normalized_phone,
  external_source,external_source_id,last_activity_at
)
select
  'Legacy Company ' || n,
  'Legacy Contact ' || ((n - 1) % 8 + 1),
  'legacy-' || n || '@example.invalid',
  '+31 6 ' || lpad(n::text,8,'0'),
  case when n=27 then null else 'https://legacy-' || n || '.example.invalid' end,
  case when n % 4=0 then 'contact' else 'nieuw' end,
  case when n=1 then repeat('n',6223) else 'preserved legacy note ' || n end,
  'production',jsonb_build_object('fixture','production-catalog','ordinal',n),
  timestamptz '2026-07-01 00:00:00+00' + n * interval '1 minute',
  timestamptz '2026-07-02 00:00:00+00' + n * interval '1 minute',
  case when n % 4=0 then 'contacted' else 'new' end,
  case when n<=11 then 'legacy company ' || n else null end,
  case when n<=5 then '316' || lpad(n::text,8,'0') else null end,
  case when n<=12 then 'legacy-source-' || ((n-1)%3+1) else null end,
  case when n=1 then 'legacy-external-id-000000000000000001' else null end,
  case when n<=12 then timestamptz '2026-07-03 00:00:00+00' + n * interval '1 minute' else null end
from generate_series(1,27) n;
