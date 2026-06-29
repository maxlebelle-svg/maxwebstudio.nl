-- Max Webstudio - Audit Logging Foundation Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
-- This foundation is intentionally minimal. Server-side functions should insert audit rows.

create or replace function public.add_audit_log(
  p_action text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_result text default 'success',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.audit_logs (
    actor_profile_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    result,
    metadata
  )
  values (
    public.current_profile_id(),
    public.current_app_role(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_result,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into new_id;

  return new_id;
end;
$$;

-- Review before production:
-- - Decide whether normal authenticated clients may execute this function directly.
-- - Prefer server-side Netlify Functions for sensitive audit inserts.
-- - Never store secrets, raw reset tokens, signed URLs or full payment-provider payloads.

