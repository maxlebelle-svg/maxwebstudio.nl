\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
create schema if not exists auth;
do $roles$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end
$roles$;

create table auth.users(id uuid primary key);
create table public.profiles(id uuid primary key, auth_user_id uuid not null references auth.users(id), role text not null, status text not null);
create table public.leads(id uuid primary key, assigned_user_id uuid, metadata jsonb not null default '{}'::jsonb);
create table public.customers(id uuid primary key, metadata jsonb not null default '{}'::jsonb);
create table public.demo_journeys(id uuid primary key, lead_id uuid references public.leads(id), customer_id uuid references public.customers(id));
create table public.factory_projects(id uuid primary key, relationship_type text not null, relationship_id uuid not null);

create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
create function public.current_profile_id() returns uuid language sql stable as $$select null::uuid$$;
create function public.has_app_role(text[]) returns boolean language sql stable as $$select false$$;
create function public.owns_customer(uuid) returns boolean language sql stable as $$select false$$;
