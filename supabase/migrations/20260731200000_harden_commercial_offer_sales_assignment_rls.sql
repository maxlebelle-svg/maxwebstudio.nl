begin;

do $preflight$
begin
  if to_regclass('public.commercial_offers') is null
    or to_regclass('public.commercial_offer_versions') is null
    or to_regclass('public.commercial_offer_lines') is null
    or to_regclass('public.commercial_offer_document_bindings') is null
    or to_regclass('public.leads') is null
    or to_regclass('public.customers') is null
    or to_regprocedure('public.has_app_role(text[])') is null
    or to_regprocedure('public.current_profile_id()') is null
    or to_regprocedure('public.owns_customer(uuid)') is null then
    raise exception using
      errcode = '55000',
      message = 'Commercial sales-assignment RLS repair prerequisites are missing';
  end if;
end
$preflight$;

create function public.commercial_current_user_has_sales_relationship_access_v1(
  input_relationship_type text,
  input_relationship_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if input_relationship_id is null
    or input_relationship_type not in ('lead', 'customer') then
    return false;
  end if;

  -- Customer sessions must return before either assignment table is touched.
  if not public.has_app_role(array['sales_partner','sales']) then
    return false;
  end if;

  if input_relationship_type = 'lead' then
    return exists (
      select 1
      from public.leads l
      where l.id = input_relationship_id
        and (
          l.assigned_user_id = auth.uid()
          or l.metadata->>'assignedUserId' = auth.uid()::text
          or l.metadata->>'ownerAuthUserId' = auth.uid()::text
          or l.metadata->>'ownerProfileId' = public.current_profile_id()::text
        )
    );
  end if;

  return exists (
    select 1
    from public.customers c
    where c.id = input_relationship_id
      and (
        c.metadata->>'assignedUserId' = auth.uid()::text
        or c.metadata->>'ownerAuthUserId' = auth.uid()::text
        or c.metadata->>'ownerProfileId' = public.current_profile_id()::text
      )
  );
end
$function$;

revoke all on function public.commercial_current_user_has_sales_relationship_access_v1(text,uuid)
from public, anon, service_role;
revoke all on function public.commercial_current_user_has_sales_relationship_access_v1(text,uuid)
from authenticated;
grant execute on function public.commercial_current_user_has_sales_relationship_access_v1(text,uuid)
to authenticated;

drop policy if exists commercial_offers_scoped_read on public.commercial_offers;
create policy commercial_offers_scoped_read
on public.commercial_offers
for select
to authenticated
using (
  public.has_app_role(array['super_admin','admin','sales_manager'])
  or (customer_id is not null and public.owns_customer(customer_id))
  or public.commercial_current_user_has_sales_relationship_access_v1(relationship_type,relationship_id)
);

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
        or public.commercial_current_user_has_sales_relationship_access_v1(o.relationship_type,o.relationship_id)
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
        or public.commercial_current_user_has_sales_relationship_access_v1(o.relationship_type,o.relationship_id)
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
        or public.commercial_current_user_has_sales_relationship_access_v1(o.relationship_type,o.relationship_id)
      )
  )
);

comment on function public.commercial_current_user_has_sales_relationship_access_v1(text,uuid) is
  'Boolean-only sales assignment check for commercial RLS. It never exposes relationship rows and rejects non-sales app roles before reading assignment tables.';

notify pgrst, 'reload schema';

commit;
