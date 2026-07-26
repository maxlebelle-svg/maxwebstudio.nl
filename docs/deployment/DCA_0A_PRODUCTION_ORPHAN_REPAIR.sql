-- DCA-0A production repair. Run separately, only after DCA-0B/C/D have passed on staging.
-- The output contains no raw IDs or slugs. This script changes exactly one proven row.

begin;

do $preflight$
declare
  candidate_count integer;
begin
  if current_user <> 'postgres' then
    raise exception using errcode = '55000', message = 'DCA-0A must run as postgres.';
  end if;
  select count(*) into candidate_count
  from public.public_preview_publications publication
  join public.website_preview_versions preview on preview.id = publication.preview_version_id
  left join public.leads lead
    on publication.relationship_type = 'lead' and lead.id = publication.relationship_id
  where publication.relationship_type = 'lead'
    and lead.id is null
    and publication.enabled = true
    and publication.revoked_at is null;
  if candidate_count <> 1 then
    raise exception using errcode = '55000',
      message = format('DCA-0A expected exactly one candidate; found %s.', candidate_count);
  end if;
  if exists (
    select 1
    from public.public_preview_publications orphan
    join public.website_preview_versions preview on preview.id = orphan.preview_version_id
    join public.public_preview_publications replacement
      on replacement.relationship_type = 'customer'
      and replacement.preview_version_id = preview.id
      and replacement.enabled = true
      and replacement.revoked_at is null
    left join public.leads lead on lead.id = orphan.relationship_id
    where orphan.relationship_type = 'lead' and lead.id is null
      and orphan.enabled and orphan.revoked_at is null
  ) then
    raise exception using errcode = '55000', message = 'DCA-0A ownership context changed.';
  end if;
end
$preflight$;

create temporary table dca_0_orphan_repair_target on commit drop as
select publication.id, publication.preview_version_id,
       encode(digest(publication.id::text, 'sha256'), 'hex') as audit_identifier,
       to_jsonb(preview) as preview_before
from public.public_preview_publications publication
join public.website_preview_versions preview on preview.id = publication.preview_version_id
left join public.leads lead
  on publication.relationship_type = 'lead' and lead.id = publication.relationship_id
where publication.relationship_type = 'lead'
  and lead.id is null
  and publication.enabled = true
  and publication.revoked_at is null
for update of publication;

do $locked_precondition$
begin
  if (select count(*) from dca_0_orphan_repair_target) <> 1 then
    raise exception using errcode = '55000', message = 'DCA-0A locked candidate count changed.';
  end if;
end
$locked_precondition$;

with changed as (
  update public.public_preview_publications publication
  set enabled = false,
      revoked_at = clock_timestamp(),
      updated_at = clock_timestamp()
  from dca_0_orphan_repair_target target
  where publication.id = target.id
    and publication.preview_version_id = target.preview_version_id
    and publication.relationship_type = 'lead'
    and publication.enabled = true
    and publication.revoked_at is null
    and not exists (select 1 from public.leads where id = publication.relationship_id)
  returning publication.id
)
select case when count(*) = 1 then 1
            else pg_catalog.current_setting('dca_0.fail_closed.rowcount_must_equal_one')::integer
       end as exact_rows_changed
from changed;

do $postcondition$
begin
  if exists (
    select 1
    from dca_0_orphan_repair_target target
    join public.public_preview_publications publication on publication.id = target.id
    where publication.enabled or publication.revoked_at is null
  ) then
    raise exception using errcode = '55000', message = 'DCA-0A candidate was not revoked.';
  end if;
  if exists (
    select 1
    from dca_0_orphan_repair_target target
    join public.website_preview_versions preview on preview.id = target.preview_version_id
    where to_jsonb(preview) is distinct from target.preview_before
  ) then
    raise exception using errcode = '55000', message = 'DCA-0A preview version changed unexpectedly.';
  end if;
end
$postcondition$;

select
  'DCA_0_ORPHANED_LEAD_PUBLICATION_REPAIR'::text as repair_reason,
  target.audit_identifier,
  1::integer as exact_rows_changed,
  (not publication.enabled and publication.revoked_at is not null) as revoked,
  true as preview_unchanged
from dca_0_orphan_repair_target target
join public.public_preview_publications publication on publication.id = target.id;

commit;
