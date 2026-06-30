-- DRAFT ONLY - STAGING APPLIED IN FASE 35C AFTER EXPLICIT VALIDATION NEED
-- DO NOT RUN ON PRODUCTION WITHOUT RELEASE APPROVAL.
-- Purpose:
-- Tighten customer-facing change request RLS so auth_user_id alone can never
-- spoof another customer_id. The customer must own the customer_id, and optional
-- website/project relations must belong to the same customer.

drop policy if exists change_requests_owner_read on public.change_requests;
drop policy if exists change_requests_customer_insert on public.change_requests;

create policy change_requests_owner_read
  on public.change_requests
  for select
  using (
    (
      auth_user_id = auth.uid()
      and (
        customer_id is null
        or public.owns_customer(customer_id)
      )
    )
    or (
      auth_user_id is null
      and customer_id is not null
      and public.owns_customer(customer_id)
    )
  );

create policy change_requests_customer_insert
  on public.change_requests
  for insert
  with check (
    auth_user_id = auth.uid()
    and customer_id is not null
    and public.owns_customer(customer_id)
    and (
      website_id is null
      or exists (
        select 1
        from public.websites w
        where w.id = website_id
          and w.customer_id = change_requests.customer_id
      )
    )
    and (
      project_id is null
      or exists (
        select 1
        from public.projects p
        where p.id = project_id
          and p.customer_id = change_requests.customer_id
      )
    )
  );
