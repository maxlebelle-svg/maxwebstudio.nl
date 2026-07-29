-- Release Readiness R2-B2: internal trigger and normalizer EXECUTE ACL hardening.
-- Exact signatures:
--   public.guard_email_log_snapshot()
--   public.mws_normalize_company_name(text)
--   public.mws_normalize_domain(text)
--   public.mws_normalize_phone(text)
--   public.set_email_log_updated_at()
--   public.set_updated_at()
-- Current: PUBLIC, service_role and postgres can execute.
-- Target: service_role and postgres can execute; PUBLIC/anon/authenticated cannot.
-- Non-goals: no function definition, trigger, policy, default privilege, table, schema or sequence change.
-- Rollback category: separately approved append-only restoration of the exact pre-state PUBLIC grants.
-- Evidence: docs/release-readiness/R2B_* and R2B2_*.

revoke execute on function public.guard_email_log_snapshot() from public;
grant execute on function public.guard_email_log_snapshot() to service_role;

revoke execute on function public.mws_normalize_company_name(text) from public;
grant execute on function public.mws_normalize_company_name(text) to service_role;

revoke execute on function public.mws_normalize_domain(text) from public;
grant execute on function public.mws_normalize_domain(text) to service_role;

revoke execute on function public.mws_normalize_phone(text) from public;
grant execute on function public.mws_normalize_phone(text) to service_role;

revoke execute on function public.set_email_log_updated_at() from public;
grant execute on function public.set_email_log_updated_at() to service_role;

revoke execute on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to service_role;
