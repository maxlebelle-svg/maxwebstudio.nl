-- DRAFT ONLY - STAGING PATCH FOR SPRINT 2A VALIDATION
-- DO NOT RUN ON PRODUCTION WITHOUT RELEASE APPROVAL.
--
-- Purpose:
-- Limit authenticated project updates to the Sprint 2A project-status fields.
-- PostgreSQL checks column privileges before RLS policies are evaluated, so this
-- keeps customer_id, website_id, ownership, notes and other sensitive columns
-- out of browser-write reach even when a user tampers with the request payload.
--
-- RLS remains the source of truth for row ownership and role checks:
-- - projects_admin_manage allows admin roles.
-- - projects_support_update allows support roles.
-- - customer/demo policies remain read-only for projects.

begin;

revoke update on table public.projects from authenticated;

grant update (status, phase, progress, updated_at, metadata)
  on table public.projects
  to authenticated;

commit;
