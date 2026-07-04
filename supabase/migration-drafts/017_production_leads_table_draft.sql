-- Draft only: create the production leads source when approved.
-- This is intentionally non-destructive and should be reviewed before deploy.

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  company_name text,
  contact_name text,
  email text,
  phone text,
  website text,
  status text not null default 'nieuw',
  owner_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_owner_id_idx on public.leads(owner_id);
create index if not exists leads_created_by_idx on public.leads(created_by);
create index if not exists leads_assigned_to_idx on public.leads(assigned_to);
create index if not exists leads_created_at_idx on public.leads(created_at desc);
create index if not exists leads_updated_at_idx on public.leads(updated_at desc);

alter table public.leads enable row level security;

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists set_leads_updated_at on public.leads;
    create trigger set_leads_updated_at
      before update on public.leads
      for each row
      execute function public.set_updated_at();
  end if;
end $$;

drop policy if exists leads_admin_manage on public.leads;
create policy leads_admin_manage
  on public.leads
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role in ('super_admin', 'admin')
        and p.status in ('active', 'invited')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role in ('super_admin', 'admin')
        and p.status in ('active', 'invited')
    )
  );

drop policy if exists leads_sales_manager_read_update on public.leads;
create policy leads_sales_manager_read_update
  on public.leads
  for all
  using (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role = 'sales_manager'
        and p.status in ('active', 'invited')
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role = 'sales_manager'
        and p.status in ('active', 'invited')
    )
  );

drop policy if exists leads_sales_partner_select_own on public.leads;
create policy leads_sales_partner_select_own
  on public.leads
  for select
  using (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role = 'sales_partner'
        and p.status in ('active', 'invited')
    )
    and auth.uid() in (owner_id, created_by, assigned_to)
  );

drop policy if exists leads_sales_partner_insert_own on public.leads;
create policy leads_sales_partner_insert_own
  on public.leads
  for insert
  with check (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role = 'sales_partner'
        and p.status in ('active', 'invited')
    )
    and auth.uid() in (owner_id, created_by, assigned_to)
  );

drop policy if exists leads_sales_partner_update_own on public.leads;
create policy leads_sales_partner_update_own
  on public.leads
  for update
  using (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role = 'sales_partner'
        and p.status in ('active', 'invited')
    )
    and auth.uid() in (owner_id, created_by, assigned_to)
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.auth_user_id = auth.uid()
        and p.role = 'sales_partner'
        and p.status in ('active', 'invited')
    )
    and auth.uid() in (owner_id, created_by, assigned_to)
  );

grant select, insert, update on table public.leads to authenticated;

comment on table public.leads is 'Draft production sales leads table. Deploy only after production schema review.';
