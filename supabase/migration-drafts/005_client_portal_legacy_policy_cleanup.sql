-- Max Webstudio - Client Portal Legacy Policy Cleanup Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION AUTH
--
-- Purpose:
-- Remove older client portal RLS policies that predate the minimal production
-- customer-isolation policy set.
--
-- Run after:
-- - 004_client_portal_rls_policies_and_grants.sql
--
-- Safety rules:
-- - No table changes.
-- - No data changes.
-- - No grants changes.
-- - No demo seed.
-- - No production Auth activation.
-- - No broad platform tables.

begin;

drop policy if exists "Clients can read own profile" on public.profiles;
drop policy if exists "Clients can update own profile" on public.profiles;
drop policy if exists "Clients can read own change requests" on public.change_requests;

commit;
