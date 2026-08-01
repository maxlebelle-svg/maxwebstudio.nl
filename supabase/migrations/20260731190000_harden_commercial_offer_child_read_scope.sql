begin;

do $$
begin
  if to_regclass('public.commercial_offers') is null
    or to_regclass('public.commercial_offer_versions') is null
    or to_regclass('public.commercial_offer_lines') is null
    or to_regclass('public.commercial_offer_document_bindings') is null then
    raise exception 'Commercial offer foundation is required before child read-scope hardening';
  end if;
end
$$;

drop policy if exists commercial_offer_versions_scoped_read on public.commercial_offer_versions;
create policy commercial_offer_versions_scoped_read
on public.commercial_offer_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.commercial_offers o
    where o.id = commercial_offer_versions.offer_id
      and (
        public.has_app_role(array['super_admin','admin','sales_manager'])
        or (
          o.customer_id is not null
          and public.owns_customer(o.customer_id)
          and commercial_offer_versions.status not in ('draft','ready_for_review')
        )
        or (
          public.has_app_role(array['sales_partner','sales'])
          and (
            (
              o.relationship_type = 'lead'
              and exists (
                select 1
                from public.leads l
                where l.id = o.relationship_id
                  and (
                    l.assigned_user_id = auth.uid()
                    or l.metadata->>'assignedUserId' = auth.uid()::text
                    or l.metadata->>'ownerAuthUserId' = auth.uid()::text
                    or l.metadata->>'ownerProfileId' = public.current_profile_id()::text
                  )
              )
            )
            or (
              o.relationship_type = 'customer'
              and exists (
                select 1
                from public.customers c
                where c.id = o.relationship_id
                  and (
                    c.metadata->>'assignedUserId' = auth.uid()::text
                    or c.metadata->>'ownerAuthUserId' = auth.uid()::text
                    or c.metadata->>'ownerProfileId' = public.current_profile_id()::text
                  )
              )
            )
          )
        )
      )
  )
);

drop policy if exists commercial_offer_lines_scoped_read on public.commercial_offer_lines;
create policy commercial_offer_lines_scoped_read
on public.commercial_offer_lines
for select
to authenticated
using (
  exists (
    select 1
    from public.commercial_offer_versions v
    join public.commercial_offers o on o.id = v.offer_id
    where v.id = commercial_offer_lines.offer_version_id
      and (
        public.has_app_role(array['super_admin','admin','sales_manager'])
        or (
          o.customer_id is not null
          and public.owns_customer(o.customer_id)
          and v.status not in ('draft','ready_for_review')
        )
        or (
          public.has_app_role(array['sales_partner','sales'])
          and (
            (
              o.relationship_type = 'lead'
              and exists (
                select 1
                from public.leads l
                where l.id = o.relationship_id
                  and (
                    l.assigned_user_id = auth.uid()
                    or l.metadata->>'assignedUserId' = auth.uid()::text
                    or l.metadata->>'ownerAuthUserId' = auth.uid()::text
                    or l.metadata->>'ownerProfileId' = public.current_profile_id()::text
                  )
              )
            )
            or (
              o.relationship_type = 'customer'
              and exists (
                select 1
                from public.customers c
                where c.id = o.relationship_id
                  and (
                    c.metadata->>'assignedUserId' = auth.uid()::text
                    or c.metadata->>'ownerAuthUserId' = auth.uid()::text
                    or c.metadata->>'ownerProfileId' = public.current_profile_id()::text
                  )
              )
            )
          )
        )
      )
  )
);

drop policy if exists commercial_offer_documents_scoped_read on public.commercial_offer_document_bindings;
create policy commercial_offer_documents_scoped_read
on public.commercial_offer_document_bindings
for select
to authenticated
using (
  exists (
    select 1
    from public.commercial_offer_versions v
    join public.commercial_offers o on o.id = v.offer_id
    where v.id = commercial_offer_document_bindings.offer_version_id
      and (
        public.has_app_role(array['super_admin','admin','sales_manager'])
        or (
          o.customer_id is not null
          and public.owns_customer(o.customer_id)
          and v.status not in ('draft','ready_for_review')
        )
        or (
          public.has_app_role(array['sales_partner','sales'])
          and (
            (
              o.relationship_type = 'lead'
              and exists (
                select 1
                from public.leads l
                where l.id = o.relationship_id
                  and (
                    l.assigned_user_id = auth.uid()
                    or l.metadata->>'assignedUserId' = auth.uid()::text
                    or l.metadata->>'ownerAuthUserId' = auth.uid()::text
                    or l.metadata->>'ownerProfileId' = public.current_profile_id()::text
                  )
              )
            )
            or (
              o.relationship_type = 'customer'
              and exists (
                select 1
                from public.customers c
                where c.id = o.relationship_id
                  and (
                    c.metadata->>'assignedUserId' = auth.uid()::text
                    or c.metadata->>'ownerAuthUserId' = auth.uid()::text
                    or c.metadata->>'ownerProfileId' = public.current_profile_id()::text
                  )
              )
            )
          )
        )
      )
  )
);

notify pgrst, 'reload schema';

commit;
