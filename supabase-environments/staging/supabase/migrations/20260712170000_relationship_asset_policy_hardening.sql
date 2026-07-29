begin;

-- Customer asset reads must always respect both ownership and client visibility.
-- Older permissive policy names are removed because PostgreSQL ORs permissive
-- policies and would otherwise make hidden review records readable again.
alter table public.files enable row level security;
drop policy if exists "customers read own files" on public.files;
drop policy if exists files_owner_read on public.files;
drop policy if exists files_customer_read_own on public.files;
create policy files_customer_read_own
on public.files
for select
to authenticated
using (
  customer_id is not null
  and public.owns_customer(customer_id)
  and is_client_visible = true
  and exists (
    select 1
    from public.customers as customer
    left join public.profiles as profile on profile.id = customer.profile_id
    where customer.id = files.customer_id
      and lower(coalesce(customer.status, 'active')) not in (
        'archived', 'gearchiveerd', 'deleted', 'verwijderd', 'inactive',
        'inactief', 'niet_actief', 'niet actief', 'disabled', 'blocked',
        'geblokkeerd', 'revoked'
      )
      and lower(coalesce(customer.portal_status, 'prepared')) not in (
        'archived', 'gearchiveerd', 'deleted', 'verwijderd', 'inactive',
        'inactief', 'niet_actief', 'niet actief', 'disabled', 'blocked',
        'geblokkeerd', 'revoked'
      )
      and (
        customer.profile_id is null
        or lower(coalesce(profile.status, 'disabled')) = 'active'
      )
  )
);

commit;
