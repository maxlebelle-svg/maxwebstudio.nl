\set ON_ERROR_STOP on

create role bootstrapadmin login superuser createdb createrole inherit;
create role postgres nologin nosuperuser nocreatedb nocreaterole inherit;
create role authenticated nologin nosuperuser nocreatedb nocreaterole noinherit;
create role anon nologin nosuperuser nocreatedb nocreaterole noinherit;
create role service_role nologin nosuperuser nocreatedb nocreaterole noinherit bypassrls;

create schema auth authorization bootstrapadmin;
create schema storage authorization bootstrapadmin;
create schema extensions authorization bootstrapadmin;

create extension pgcrypto with schema extensions;

create table auth.users (
  id uuid primary key default extensions.gen_random_uuid()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null
);

revoke all on schema auth, storage from public;
revoke all on all tables in schema auth, storage from public;
