-- Max Webstudio - RLS recursion patch
-- Fase 14.4D: prepared for Supabase test project review first.
--
-- Problem:
-- current_app_role() and current_profile_id() read public.profiles while RLS policies
-- on public.profiles and related tables call those helpers again. This can recurse
-- through RLS and trigger "stack depth limit exceeded".
--
-- Goal:
-- make the lookup helpers SECURITY DEFINER with a fixed search_path so they can
-- resolve the current user's profile/role without invoking profile RLS recursively.
-- Customer isolation remains enforced by table policies.
--
-- Execute first on the Supabase test project only.
-- Do not execute on production until Fase 14.4B rerun passes and blockers are reviewed.

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and coalesce(p.status, 'active') = 'active'
  limit 1
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'app_role', ''),
    (
      select p.role
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and coalesce(p.status, 'active') = 'active'
      limit 1
    ),
    'customer'
  )
$$;

create or replace function public.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_app_role() = any(allowed_roles)
$$;

create or replace function public.is_admin_role()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.has_app_role(array['super_admin', 'admin'])
$$;

revoke all on function public.current_profile_id() from public;
revoke all on function public.current_app_role() from public;
revoke all on function public.has_app_role(text[]) from public;
revoke all on function public.is_admin_role() from public;

grant execute on function public.current_profile_id() to anon, authenticated, service_role;
grant execute on function public.current_app_role() to anon, authenticated, service_role;
grant execute on function public.has_app_role(text[]) to anon, authenticated, service_role;
grant execute on function public.is_admin_role() to anon, authenticated, service_role;

