-- DRAFT ONLY - STAGING PATCH FOR SPRINT 2B VALIDATION
-- DO NOT RUN ON PRODUCTION WITHOUT RELEASE APPROVAL.
--
-- Purpose:
-- Limit authenticated customer updates to Sprint 2B contact fields.
-- PostgreSQL checks column privileges before RLS policies are evaluated, so this
-- prevents browser clients from updating auth_user_id, profile_id, status,
-- portal_status, billing-related fields or ownership-related data.
--
-- RLS remains the source of truth for row/role access:
-- - customers_admin_manage allows admin roles.
-- - customers_sales_update allows sales roles.
-- - customer owner policies remain read-only.

begin;

revoke update on table public.customers from authenticated;

grant update (name, email, phone, notes, updated_at, metadata)
  on table public.customers
  to authenticated;

commit;
