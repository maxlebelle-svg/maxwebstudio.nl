-- Max Webstudio - Supabase PostgREST grants for canonical schema
-- Fase 14.4C: permission patch for the Supabase test environment first.
-- Purpose:
-- - allow server-side service_role flows to manage canonical platform tables via PostgREST
-- - allow authenticated/anon roles to reach tables so RLS policies can make the final access decision
-- - keep grants scoped to the canonical Max Webstudio tables/functions only
--
-- Execute first on the Supabase test project only.
-- Do not execute on production until Fase 14.4B rerun passes and release blockers are reviewed.

grant usage on schema public to anon, authenticated, service_role;

grant execute on function public.current_profile_id() to anon, authenticated, service_role;
grant execute on function public.current_app_role() to anon, authenticated, service_role;
grant execute on function public.has_app_role(text[]) to anon, authenticated, service_role;
grant execute on function public.is_admin_role() to anon, authenticated, service_role;
grant execute on function public.set_updated_at() to service_role;

grant select on table
  public.profiles,
  public.customers,
  public.leads,
  public.websites,
  public.projects,
  public.files,
  public.quotes,
  public.quote_lines,
  public.invoices,
  public.invoice_lines,
  public.subscriptions,
  public.settings,
  public.demo_emails,
  public.activity_logs,
  public.import_logs
to anon, authenticated;

grant select, insert, update, delete on table
  public.profiles,
  public.customers,
  public.leads,
  public.websites,
  public.projects,
  public.files,
  public.quotes,
  public.quote_lines,
  public.invoices,
  public.invoice_lines,
  public.subscriptions,
  public.settings,
  public.demo_emails,
  public.activity_logs,
  public.import_logs
to service_role;
