-- Release Readiness R2-B1: policy helper function EXECUTE ACL hardening.
-- Exact signatures:
--   public.current_app_role()
--   public.current_profile_id()
--   public.has_app_role(text[])
--   public.is_admin_role()
--   public.is_demo_context()
--   public.is_demo_record(boolean, text)
--   public.is_staff_role()
--   public.owns_customer(uuid)
-- Current: PUBLIC, authenticated, service_role and postgres can execute.
-- Target: authenticated, service_role and postgres can execute; PUBLIC/anon cannot.
-- Non-goals: no function definition, policy, default privilege, table, schema or sequence change.
-- Rollback category: separately approved append-only restoration of the exact pre-state PUBLIC grants.
-- Evidence: docs/release-readiness/R2B_* and R2B1_*.

revoke execute on function public.current_app_role() from public;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.current_app_role() to service_role;

revoke execute on function public.current_profile_id() from public;
grant execute on function public.current_profile_id() to authenticated;
grant execute on function public.current_profile_id() to service_role;

revoke execute on function public.has_app_role(text[]) from public;
grant execute on function public.has_app_role(text[]) to authenticated;
grant execute on function public.has_app_role(text[]) to service_role;

revoke execute on function public.is_admin_role() from public;
grant execute on function public.is_admin_role() to authenticated;
grant execute on function public.is_admin_role() to service_role;

revoke execute on function public.is_demo_context() from public;
grant execute on function public.is_demo_context() to authenticated;
grant execute on function public.is_demo_context() to service_role;

revoke execute on function public.is_demo_record(boolean, text) from public;
grant execute on function public.is_demo_record(boolean, text) to authenticated;
grant execute on function public.is_demo_record(boolean, text) to service_role;

revoke execute on function public.is_staff_role() from public;
grant execute on function public.is_staff_role() to authenticated;
grant execute on function public.is_staff_role() to service_role;

revoke execute on function public.owns_customer(uuid) from public;
grant execute on function public.owns_customer(uuid) to authenticated;
grant execute on function public.owns_customer(uuid) to service_role;
