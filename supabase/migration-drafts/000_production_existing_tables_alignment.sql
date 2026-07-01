-- Max Webstudio - Production Existing Tables Alignment Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW EXISTING PRODUCTION RECORDS BEFORE EXECUTION
--
-- Purpose:
-- Production currently contains older versions of public.profiles and
-- public.change_requests. The canonical 001_schema_tables.sql uses
-- CREATE TABLE IF NOT EXISTS and therefore will not add missing columns to
-- existing tables. This pre-migration aligns only those existing tables so
-- the full production migration order can continue safely.
--
-- Safety rules:
-- - No deletes.
-- - No renames.
-- - No data backfill or existing row rewrites.
-- - No demo seed.
-- - No production Auth activation.
-- - No NOT NULL constraints forced on existing records.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles alignment
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists role text,
  add column if not exists status text,
  add column if not exists is_demo boolean,
  add column if not exists environment text,
  add column if not exists metadata jsonb,
  add column if not exists updated_at timestamptz;

alter table public.profiles
  alter column role set default 'customer',
  alter column status set default 'active',
  alter column is_demo set default false,
  alter column environment set default 'production',
  alter column metadata set default '{}'::jsonb,
  alter column updated_at set default now();

-- Do not add NOT NULL/check constraints here. Existing production rows must be
-- reviewed first; canonical constraints can be handled in a later hardening
-- migration after the baseline schema is green.

-- ---------------------------------------------------------------------------
-- change_requests alignment
-- ---------------------------------------------------------------------------

alter table public.change_requests
  add column if not exists customer_id uuid,
  add column if not exists auth_user_id uuid,
  add column if not exists website_id uuid,
  add column if not exists project_id uuid,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists priority text,
  add column if not exists status text,
  add column if not exists metadata jsonb,
  add column if not exists updated_at timestamptz;

alter table public.change_requests
  alter column priority set default 'normal',
  alter column status set default 'nieuw',
  alter column metadata set default '{}'::jsonb,
  alter column updated_at set default now();

-- Foreign keys for customer_id, website_id and project_id are intentionally
-- deferred to the canonical migration flow. Those referenced tables are created
-- by 001_schema_tables.sql.

commit;
