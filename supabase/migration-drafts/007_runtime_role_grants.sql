-- Max Webstudio - Runtime Role Grants Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
--
-- Why this exists:
-- PostgreSQL checks table privileges before evaluating RLS policies.
-- Without minimal grants, Supabase runtime roles can fail with
-- "permission denied for table ..." before the RLS policy is reached.
--
-- Security model:
-- - RLS remains the source of truth for row-level access.
-- - anon receives no customer-data table grants.
-- - authenticated receives only the SQL operation grants needed for
--   policies to evaluate for logged-in users and internal app roles.
-- - service_role receives backend/admin grants and must never be exposed
--   to browser/frontend code.

begin;

grant usage on schema public to anon, authenticated, service_role;

-- Keep anonymous visitors away from canonical app tables by default.
-- Public website content must not depend on direct table reads.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Logged-in users and internal roles all reach PostgREST as authenticated.
-- RLS policies in 004_rls_policies.sql still decide which rows and operations
-- are actually allowed for customer, admin, sales, support and developer roles.
grant select, insert, update, delete on table
  public.profiles,
  public.customers,
  public.leads,
  public.websites,
  public.projects,
  public.quotes,
  public.quote_lines,
  public.invoices,
  public.invoice_lines,
  public.subscriptions,
  public.files,
  public.change_requests,
  public.crm_tasks,
  public.client_portal_messages,
  public.client_portal_notifications,
  public.ai_drafts,
  public.ai_assistant_drafts,
  public.settings,
  public.demo_emails,
  public.activity_logs
to authenticated;

-- Import logs are operational/developer evidence only. The current RLS plan
-- only defines read access for admin/developer roles.
grant select on table public.import_logs to authenticated;

-- Audit logs should not be directly mutated from normal frontend clients.
-- Read access is still filtered by RLS to super_admin/admin.
grant select on table public.audit_logs to authenticated;

-- Service role is used only server-side for Netlify Functions, admin flows,
-- migrations and controlled tests. It must never be placed in frontend config.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select, update on all sequences in schema public to service_role;

-- Helper functions used inside RLS policies need execute privileges for
-- authenticated requests. The audit insert helper remains service_role-only.
grant execute on function public.current_profile_id() to authenticated, service_role;
grant execute on function public.current_app_role() to authenticated, service_role;
grant execute on function public.has_app_role(text[]) to authenticated, service_role;
grant execute on function public.is_admin_role() to authenticated, service_role;
grant execute on function public.is_staff_role() to authenticated, service_role;
grant execute on function public.is_demo_context() to authenticated, service_role;
grant execute on function public.owns_customer(uuid) to authenticated, service_role;
grant execute on function public.is_demo_record(boolean, text) to authenticated, service_role;

revoke all on function public.add_audit_log(text, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.add_audit_log(text, text, uuid, text, jsonb) to service_role;

commit;
