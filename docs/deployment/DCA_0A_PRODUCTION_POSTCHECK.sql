begin transaction read only;

select
  'DCA_0A_POSTCHECK'::text as audit_section,
  count(*) filter (
    where publication.relationship_type = 'lead'
      and lead.id is null
      and publication.enabled
      and publication.revoked_at is null
  )::integer as active_orphan_count,
  count(*) filter (
    where publication.relationship_type = 'lead'
      and lead.id is null
      and not publication.enabled
      and publication.revoked_at is not null
  )::integer as revoked_orphan_count,
  current_setting('transaction_read_only') as transaction_read_only
from public.public_preview_publications publication
join public.website_preview_versions preview on preview.id = publication.preview_version_id
left join public.leads lead on lead.id = publication.relationship_id;

rollback;
