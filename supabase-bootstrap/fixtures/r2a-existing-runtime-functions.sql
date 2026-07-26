\set ON_ERROR_STOP on

-- R2-A existing-line fixture only: exact deployed pre-migration definitions.
-- Bodies originate from the immutable R2-A.1 runtime evidence.

CREATE OR REPLACE FUNCTION public.current_app_role()
 RETURNS text LANGUAGE sql STABLE CALLED ON NULL INPUT PARALLEL UNSAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(p.role, 'anonymous')
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') = 'active'
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.current_profile_id()
 RETURNS uuid LANGUAGE sql STABLE CALLED ON NULL INPUT PARALLEL UNSAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') = 'active'
  limit 1
$function$;

CREATE OR REPLACE FUNCTION public.has_app_role(allowed_roles text[])
 RETURNS boolean LANGUAGE sql STABLE CALLED ON NULL INPUT PARALLEL UNSAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(public.current_app_role(), 'anonymous') = any(allowed_roles)
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_role()
 RETURNS boolean LANGUAGE sql STABLE CALLED ON NULL INPUT PARALLEL UNSAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_app_role(array['super_admin', 'admin'])
$function$;

CREATE OR REPLACE FUNCTION public.is_demo_context()
 RETURNS boolean LANGUAGE sql STABLE CALLED ON NULL INPUT PARALLEL UNSAFE SECURITY DEFINER
 SET search_path TO 'public'
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
 RETURNS boolean LANGUAGE sql STABLE CALLED ON NULL INPUT PARALLEL UNSAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.is_demo_context()
    and (coalesce(record_is_demo, false) = true or coalesce(record_environment, '') = 'demo')
$function$;

CREATE OR REPLACE FUNCTION public.is_staff_role()
 RETURNS boolean LANGUAGE sql STABLE CALLED ON NULL INPUT PARALLEL UNSAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.has_app_role(array['super_admin', 'admin', 'sales', 'support', 'developer'])
$function$;

CREATE OR REPLACE FUNCTION public.owns_customer(target_customer_id uuid)
 RETURNS boolean LANGUAGE sql STABLE CALLED ON NULL INPUT PARALLEL UNSAFE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.customers c
    where c.id = target_customer_id
      and (c.auth_user_id = auth.uid() or c.profile_id = public.current_profile_id())
  )
$function$;

ALTER FUNCTION public.current_app_role() OWNER TO postgres;
ALTER FUNCTION public.current_profile_id() OWNER TO postgres;
ALTER FUNCTION public.has_app_role(text[]) OWNER TO postgres;
ALTER FUNCTION public.is_admin_role() OWNER TO postgres;
ALTER FUNCTION public.is_demo_context() OWNER TO postgres;
ALTER FUNCTION public.is_demo_record(boolean,text) OWNER TO postgres;
ALTER FUNCTION public.is_staff_role() OWNER TO postgres;
ALTER FUNCTION public.owns_customer(uuid) OWNER TO postgres;

SET ROLE postgres;
REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_profile_id() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_app_role(text[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_admin_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_demo_context() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_demo_record(boolean,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_staff_role() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.owns_customer(uuid) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.current_app_role() TO PUBLIC, postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO PUBLIC, postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_role(text[]) TO PUBLIC, postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_role() TO PUBLIC, postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.is_demo_context() TO PUBLIC, postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.is_demo_record(boolean,text) TO PUBLIC, postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_role() TO PUBLIC, postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.owns_customer(uuid) TO PUBLIC, postgres, service_role, authenticated;
RESET ROLE;
