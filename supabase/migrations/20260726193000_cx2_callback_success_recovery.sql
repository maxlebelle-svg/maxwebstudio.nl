-- CX2 Sprint 3 callback closure: recover an already completed activation without
-- repeating writes. This is an additive, staging-first security contract.

begin;

create or replace function public.cx2_resolve_magic_link_completion(
  input_state_hash text,
  input_auth_user_id uuid
)
returns table (
  customer_id uuid,
  profile_id uuid,
  preview_version_id uuid,
  customer_created boolean,
  portal_path text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  challenge_record public.cx2_magic_link_challenges%rowtype;
  invitation_record public.lead_demo_invitations%rowtype;
  link_record public.client_activation_links%rowtype;
  lead_record public.leads%rowtype;
  profile_record public.profiles%rowtype;
  customer_record public.customers%rowtype;
  preview_record public.website_preview_versions%rowtype;
  auth_email text;
begin
  perform public.dca_0_assert_service_role();
  if input_state_hash !~ '^[0-9a-f]{64}$' or input_auth_user_id is null then
    raise exception using errcode = '22023', message = 'CX2 callback is invalid.';
  end if;

  select * into challenge_record
  from public.cx2_magic_link_challenges
  where state_hash = input_state_hash;
  if not found then
    raise exception using errcode = '22023', message = 'CX2 callback is invalid.';
  end if;
  if challenge_record.status in ('prepared','sent')
     and challenge_record.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = '55000', message = 'CX2 callback is expired.';
  end if;
  if challenge_record.status <> 'consumed' then
    raise exception using errcode = '55000', message = 'CX2 callback is not completed.';
  end if;
  if challenge_record.verified_auth_user_id is distinct from input_auth_user_id then
    raise exception using errcode = '42501', message = 'CX2 callback identity mismatch.';
  end if;

  select lower(btrim(email)) into auth_email
  from auth.users
  where id = input_auth_user_id and email_confirmed_at is not null;
  if auth_email is null then
    raise exception using errcode = '42501', message = 'CX2 verified identity is required.';
  end if;

  select * into invitation_record from public.lead_demo_invitations
  where id = challenge_record.invitation_id;
  select * into link_record from public.client_activation_links
  where id = challenge_record.activation_link_id;
  if invitation_record.id is null or link_record.id is null then
    raise exception using errcode = '23514', message = 'CX2 callback ownership is ambiguous.';
  end if;
  if invitation_record.status = 'revoked' or link_record.status in ('revoked','rotated') then
    raise exception using errcode = '55000', message = 'CX2 callback is revoked.';
  end if;
  if invitation_record.status = 'link_expired' or link_record.status = 'expired' then
    raise exception using errcode = '55000', message = 'CX2 callback is expired.';
  end if;
  if invitation_record.status <> 'activated' or link_record.status <> 'activated'
     or invitation_record.auth_user_id is distinct from input_auth_user_id
     or auth_email is distinct from invitation_record.normalized_email
     or auth_email is distinct from link_record.intended_email then
    raise exception using errcode = '42501', message = 'CX2 callback identity mismatch.';
  end if;

  select * into lead_record from public.leads where id = link_record.lead_id;
  select * into profile_record from public.profiles where id = invitation_record.profile_id;
  select * into customer_record from public.customers where id = link_record.customer_id;
  select * into preview_record from public.website_preview_versions where id = link_record.preview_version_id;
  if lead_record.id is null or profile_record.id is null or customer_record.id is null or preview_record.id is null
     or lead_record.converted_customer_id is distinct from customer_record.id
     or profile_record.auth_user_id is distinct from input_auth_user_id
     or profile_record.role is distinct from 'customer'
     or customer_record.auth_user_id is distinct from input_auth_user_id
     or customer_record.profile_id is distinct from profile_record.id
     or preview_record.customer_id is distinct from customer_record.id then
    raise exception using errcode = '23514', message = 'CX2 callback ownership is ambiguous.';
  end if;
  if preview_record.project_id is not null and not exists (
    select 1 from public.projects project
    where project.id = preview_record.project_id and project.customer_id = customer_record.id
  ) then
    raise exception using errcode = '23514', message = 'CX2 callback project ownership is ambiguous.';
  end if;
  if not exists (
    select 1 from public.public_preview_publications publication
    where publication.id = link_record.preview_publication_id
      and publication.preview_version_id = preview_record.id
      and publication.relationship_type = 'customer'
      and publication.relationship_id = customer_record.id
      and publication.enabled = true
      and publication.revoked_at is null
  ) then
    raise exception using errcode = '23514', message = 'CX2 callback publication ownership is ambiguous.';
  end if;

  return query select customer_record.id, profile_record.id, preview_record.id,
    false, '/klantportaal.html?view=website'::text;
end
$function$;

revoke all on function public.cx2_resolve_magic_link_completion(text,uuid)
  from public, anon, authenticated;
grant execute on function public.cx2_resolve_magic_link_completion(text,uuid)
  to service_role;

commit;
