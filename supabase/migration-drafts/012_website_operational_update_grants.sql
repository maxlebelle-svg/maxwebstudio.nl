-- DRAFT ONLY - STAGING PATCH FOR SPRINT 2C VALIDATION
-- DO NOT RUN ON PRODUCTION WITHOUT RELEASE APPROVAL.
--
-- Purpose:
-- Limit authenticated website updates to Sprint 2C operational fields.
-- PostgreSQL checks column privileges before RLS policies are evaluated, so this
-- prevents browser clients from updating customer_id, profile_id, domain,
-- hosting/deployment configuration, billing-related data or ownership-related data.
--
-- RLS remains the source of truth for row/role access:
-- - websites_admin_manage allows admin roles.
-- - websites_developer_update allows developer role.
-- - customer owner policies remain read-only.

begin;

revoke update on table public.websites from authenticated;

grant update (status, care_package, notes, last_checked_at, updated_at, metadata)
  on table public.websites
  to authenticated;

commit;
