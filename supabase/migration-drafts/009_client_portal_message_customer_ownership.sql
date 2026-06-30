-- DRAFT ONLY - STAGING APPLIED IN FASE 35D AFTER EXPLICIT VALIDATION NEED
-- DO NOT RUN ON PRODUCTION WITHOUT RELEASE APPROVAL.
-- Purpose:
-- Tighten customer-facing client portal message RLS so customers can only
-- create messages as themselves inside their own customer context. Sender
-- fields must not be spoofable from the browser.

drop policy if exists client_portal_messages_owner_read on public.client_portal_messages;
drop policy if exists client_portal_messages_owner_insert on public.client_portal_messages;

create policy client_portal_messages_owner_read
  on public.client_portal_messages
  for select
  using (public.owns_customer(customer_id));

create policy client_portal_messages_owner_insert
  on public.client_portal_messages
  for insert
  with check (
    customer_id is not null
    and public.owns_customer(customer_id)
    and sender_type = 'customer'
    and status = 'open'
    and sender_profile_id = public.current_profile_id()
    and (
      profile_id is null
      or profile_id = public.current_profile_id()
    )
  );
