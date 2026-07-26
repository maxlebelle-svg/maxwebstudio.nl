-- Release Readiness R2-A: harden the fixed search path of exactly eight role/tenant helpers.
-- Authoritative evidence: docs/release-readiness/evidence/r2a-current-functions/.
-- Preconditions: exact R2-A.1 identities, bodies, metadata, owners and ACLs are present.
-- Scope: CREATE OR REPLACE the eight listed signatures with their exact deployed bodies.
-- Only intended state change: function-level search_path from public to pg_catalog.
-- Non-goals: ACLs, grants, owners, policies, tables, data, indexes, constraints, Auth and Storage.
-- Rollback category: append-only compensating migration restoring the captured search_path=public definitions.
-- Foundation F0 remains COMPLETE AND FROZEN; historical migrations and the baseline are immutable.

CREATE OR REPLACE FUNCTION public.current_app_role()
 RETURNS text
 LANGUAGE sql
 STABLE
 CALLED ON NULL INPUT
 PARALLEL UNSAFE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(p.role, 'anonymous')
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') = 'active'
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 CALLED ON NULL INPUT
 PARALLEL UNSAFE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') = 'active'
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.has_app_role(allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
 CALLED ON NULL INPUT
 PARALLEL UNSAFE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select coalesce(public.current_app_role(), 'anonymous') = any(allowed_roles)
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 CALLED ON NULL INPUT
 PARALLEL UNSAFE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select public.has_app_role(array['super_admin', 'admin'])
$function$;

CREATE OR REPLACE FUNCTION public.is_demo_context()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 CALLED ON NULL INPUT
 PARALLEL UNSAFE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.auth_user_id = auth.uid()
      and coalesce(p.status, 'active') = 'active'
      and (p.role = 'demo_user' or coalesce(p.is_demo, false) = true or p.environment = 'demo')
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_demo_record(record_is_demo boolean, record_environment text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 CALLED ON NULL INPUT
 PARALLEL UNSAFE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select public.is_demo_context()
    and (coalesce(record_is_demo, false) = true or coalesce(record_environment, '') = 'demo')
$function$;

CREATE OR REPLACE FUNCTION public.is_staff_role()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 CALLED ON NULL INPUT
 PARALLEL UNSAFE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer'])
$function$;

CREATE OR REPLACE FUNCTION public.owns_customer(target_customer_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 CALLED ON NULL INPUT
 PARALLEL UNSAFE
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select exists (
    select 1
    from public.customers c
    where c.id = target_customer_id
      and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id())
  )
$function$;
