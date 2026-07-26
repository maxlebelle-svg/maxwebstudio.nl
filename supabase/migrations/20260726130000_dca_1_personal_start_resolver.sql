-- DCA-1: service-only token resolver for /start/:token.
-- The raw token is hashed immediately and never persisted or returned.

begin;

create or replace function public.dca_1_open_personal_start(input_activation_token text)
returns table (
  activation_link_id uuid,
  invitation_id uuid,
  lead_id uuid,
  customer_id uuid,
  project_id uuid,
  preview_publication_id uuid,
  preview_version_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  token_digest text;
  link_record public.client_activation_links%rowtype;
  invitation_record public.lead_demo_invitations%rowtype;
begin
  perform public.dca_0_assert_service_role();
  if input_activation_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Persoonlijke link is ongeldig.';
  end if;

  token_digest := public.dca_0_sha256(input_activation_token);
  select * into link_record
  from public.client_activation_links
  where token_hash = token_digest
  for update;

  if not found or link_record.status not in ('active','opened') then
    raise exception using errcode = 'P0002', message = 'Persoonlijke link is niet actief.';
  end if;
  if link_record.expires_at <= pg_catalog.clock_timestamp() then
    update public.client_activation_links set status = 'expired' where id = link_record.id;
    update public.lead_demo_invitations set status = 'link_expired', dca_phase = 'expired'
      where id = link_record.lead_demo_invitation_id;
    return;
  end if;

  select * into invitation_record
  from public.lead_demo_invitations
  where id = link_record.lead_demo_invitation_id
  for update;
  if not found or invitation_record.status in ('revoked','link_expired','send_failed')
     or invitation_record.lead_id is distinct from link_record.lead_id
     or invitation_record.preview_version_id is distinct from link_record.preview_version_id then
    raise exception using errcode = '23514', message = 'Uitnodigingsbinding is niet geldig.';
  end if;

  if not exists (
    select 1
    from public.leads lead
    join public.demo_journeys journey on journey.id = invitation_record.demo_journey_id
    join public.website_preview_versions preview on preview.id = link_record.preview_version_id
    join public.public_preview_publications publication on publication.id = link_record.preview_publication_id
    where lead.id = link_record.lead_id
      and journey.lead_id = lead.id
      and preview.demo_journey_id = journey.id
      and publication.preview_version_id = preview.id
      and publication.enabled = true
      and publication.revoked_at is null
      and (
        (lead.converted_customer_id is null and link_record.customer_id is null
          and publication.relationship_type = 'lead' and publication.relationship_id = lead.id)
        or
        (lead.converted_customer_id is not null and link_record.customer_id = lead.converted_customer_id
          and publication.relationship_type = 'customer' and publication.relationship_id = lead.converted_customer_id)
      )
  ) then
    raise exception using errcode = '23514', message = 'Previewownership is niet meer geldig.';
  end if;

  update public.client_activation_links
  set status = 'opened', opened_at = coalesce(opened_at, pg_catalog.clock_timestamp())
  where id = link_record.id
  returning * into link_record;
  update public.lead_demo_invitations
  set opened_at = coalesce(opened_at, pg_catalog.clock_timestamp()), dca_phase = 'link_opened'
  where id = invitation_record.id;

  return query select link_record.id, invitation_record.id, link_record.lead_id,
    link_record.customer_id, link_record.project_id, link_record.preview_publication_id,
    link_record.preview_version_id;
end
$function$;

revoke all on function public.dca_1_open_personal_start(text) from public, anon, authenticated;
grant execute on function public.dca_1_open_personal_start(text) to service_role;

commit;
