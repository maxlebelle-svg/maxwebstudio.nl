-- Production-lineage prerequisite for CP-A.
-- Forward-only: creates the proven canonical commercial model only when absent.
-- Existing relations are validated and never rewritten. Legacy customer_* rows stay untouched.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare
  dependency text;
  spec record;
  actual_type text;
begin
  foreach dependency in array array[
    'public.customers',
    'public.projects',
    'public.websites',
    'public.profiles',
    'public.website_preview_versions',
    'auth.users'
  ] loop
    if to_regclass(dependency) is null then
      raise exception 'CP-A canonical prerequisite is missing: %', dependency
        using errcode = '42P01';
    end if;
  end loop;

  for spec in
    select * from (values
      ('public.quotes','id','uuid'),
      ('public.quotes','customer_id','uuid'),
      ('public.quotes','status','text'),
      ('public.quotes','subtotal','numeric'),
      ('public.quotes','vat','numeric'),
      ('public.quotes','total','numeric'),
      ('public.quote_lines','id','uuid'),
      ('public.quote_lines','quote_id','uuid'),
      ('public.quote_lines','line_total','numeric'),
      ('public.invoices','id','uuid'),
      ('public.invoices','customer_id','uuid'),
      ('public.invoices','status','text'),
      ('public.invoices','subtotal','numeric'),
      ('public.invoices','vat','numeric'),
      ('public.invoices','total','numeric'),
      ('public.invoice_lines','id','uuid'),
      ('public.invoice_lines','invoice_id','uuid'),
      ('public.subscriptions','id','uuid'),
      ('public.subscriptions','customer_id','uuid'),
      ('public.subscriptions','status','text'),
      ('public.subscriptions','total_incl_vat','numeric')
    ) as expected(relation_name, column_name, data_type)
  loop
    if to_regclass(spec.relation_name) is not null then
      select format_type(a.atttypid, a.atttypmod)
      into actual_type
      from pg_attribute a
      where a.attrelid = to_regclass(spec.relation_name)
        and a.attname = spec.column_name
        and a.attnum > 0
        and not a.attisdropped;

      if actual_type is null then
        raise exception 'CP-A canonical prerequisite found partial relation %. Missing column %', spec.relation_name, spec.column_name
          using errcode = '42703';
      end if;
      if spec.data_type = 'numeric' then
        if actual_type not like 'numeric%' then
          raise exception 'CP-A canonical prerequisite incompatible %.% type: %', spec.relation_name, spec.column_name, actual_type
            using errcode = '42804';
        end if;
      elsif actual_type is distinct from spec.data_type then
        raise exception 'CP-A canonical prerequisite incompatible %.% type: %', spec.relation_name, spec.column_name, actual_type
          using errcode = '42804';
      end if;
    end if;
  end loop;
end;
$preflight$;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  quote_number text,
  type text,
  title text,
  status text not null default 'draft',
  quote_date date,
  valid_until date,
  subtotal numeric(12,2) not null default 0,
  vat numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  converted_to_invoice_id uuid,
  accepted_at timestamptz,
  sent_at timestamptz,
  proposal text,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_status_check check (status in ('draft', 'sent', 'accepted', 'rejected', 'expired', 'archived')),
  constraint quotes_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 21,
  line_total numeric(12,2) not null default 0,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  source_quote_id uuid references public.quotes(id) on delete set null,
  subscription_id uuid,
  invoice_number text,
  type text,
  title text,
  status text not null default 'draft',
  invoice_date date,
  due_date date,
  paid_at timestamptz,
  subtotal numeric(12,2) not null default 0,
  vat numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_link text,
  pdf_file_path text,
  mollie_payment_id text,
  mollie_checkout_url text,
  mollie_payment_status text,
  mollie_payment_created_at timestamptz,
  mollie_payment_expires_at timestamptz,
  email_sent_at timestamptz,
  payment_reminder_sent_at timestamptz,
  paid_email_sent_at timestamptz,
  expired_email_sent_at timestamptz,
  email_last_error text,
  notes text,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_status_check check (status in ('draft', 'sent', 'paid', 'expired', 'canceled', 'failed', 'archived')),
  constraint invoices_environment_check check (environment in ('production', 'test', 'demo'))
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 21,
  line_total numeric(12,2) not null default 0,
  position integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  website_id uuid references public.websites(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  plan text,
  status text not null default 'active',
  billing_cycle text not null default 'monthly',
  price_ex_vat numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 21,
  total_incl_vat numeric(12,2) not null default 0,
  start_date date,
  next_invoice_date date,
  last_invoice_id uuid references public.invoices(id) on delete set null,
  last_invoice_date date,
  auto_invoice_enabled boolean not null default false,
  mollie_customer_id text,
  mollie_subscription_id text,
  mollie_mandate_id text,
  mandate_status text,
  mandate_checkout_url text,
  retry_status text,
  subscription_risk_level text not null default 'normal',
  internal_notes text,
  last_payment_at timestamptz,
  next_payment_at timestamptz,
  canceled_at timestamptz,
  paused_at timestamptz,
  resumed_at timestamptz,
  is_demo boolean not null default false,
  environment text not null default 'production',
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_status_check check (status in ('active', 'pending_mandate', 'paused', 'canceled', 'expired', 'archived')),
  constraint subscriptions_billing_cycle_check check (billing_cycle in ('monthly', 'quarterly', 'yearly')),
  constraint subscriptions_risk_check check (subscription_risk_level in ('normal', 'attention', 'high')),
  constraint subscriptions_environment_check check (environment in ('production', 'test', 'demo'))
);

do $foreign_keys$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_subscription_id_fkey'
  ) then
    alter table public.invoices
      add constraint invoices_subscription_id_fkey
      foreign key (subscription_id) references public.subscriptions(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quotes'::regclass
      and conname = 'quotes_converted_to_invoice_id_fkey'
  ) then
    alter table public.quotes
      add constraint quotes_converted_to_invoice_id_fkey
      foreign key (converted_to_invoice_id) references public.invoices(id) on delete set null;
  end if;
end;
$foreign_keys$;

do $preview_identity$
declare
  actual_type text;
begin
  select format_type(a.atttypid, a.atttypmod)
  into actual_type
  from pg_attribute a
  where a.attrelid = 'public.website_preview_versions'::regclass
    and a.attname = 'package_checksum'
    and a.attnum > 0
    and not a.attisdropped;

  if actual_type is not null and actual_type <> 'text' then
    raise exception 'incompatible public.website_preview_versions.package_checksum type: %', actual_type
      using errcode = '42804';
  end if;
end;
$preview_identity$;

alter table public.website_preview_versions
  add column if not exists package_checksum text null;

do $preview_constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.website_preview_versions'::regclass
      and conname = 'website_preview_versions_package_checksum_format'
  ) then
    alter table public.website_preview_versions
      add constraint website_preview_versions_package_checksum_format
      check (package_checksum is null or package_checksum ~ '^[0-9a-f]{64}$') not valid;
    alter table public.website_preview_versions
      validate constraint website_preview_versions_package_checksum_format;
  end if;
end;
$preview_constraint$;

create index if not exists quotes_customer_id_idx on public.quotes(customer_id);
create index if not exists quotes_project_id_idx on public.quotes(project_id);
create index if not exists quotes_status_idx on public.quotes(status);
create index if not exists quote_lines_quote_id_idx on public.quote_lines(quote_id);
create index if not exists invoices_customer_id_idx on public.invoices(customer_id);
create index if not exists invoices_project_id_idx on public.invoices(project_id);
create index if not exists invoices_subscription_id_idx on public.invoices(subscription_id);
create index if not exists invoices_status_due_idx on public.invoices(status, due_date);
create index if not exists invoices_mollie_payment_idx on public.invoices(mollie_payment_id);
create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines(invoice_id);
create index if not exists subscriptions_customer_id_idx on public.subscriptions(customer_id);
create index if not exists subscriptions_website_id_idx on public.subscriptions(website_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.subscriptions enable row level security;

do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quotes' and policyname = 'cp_a_quotes_customer_read') then
    create policy cp_a_quotes_customer_read on public.quotes for select to authenticated using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'quote_lines' and policyname = 'cp_a_quote_lines_customer_read') then
    create policy cp_a_quote_lines_customer_read on public.quote_lines for select to authenticated using (
      exists (select 1 from public.quotes q where q.id = quote_id and public.owns_customer(q.customer_id))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoices' and policyname = 'cp_a_invoices_customer_read') then
    create policy cp_a_invoices_customer_read on public.invoices for select to authenticated using (public.owns_customer(customer_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_lines' and policyname = 'cp_a_invoice_lines_customer_read') then
    create policy cp_a_invoice_lines_customer_read on public.invoice_lines for select to authenticated using (
      exists (select 1 from public.invoices i where i.id = invoice_id and public.owns_customer(i.customer_id))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'subscriptions' and policyname = 'cp_a_subscriptions_customer_read') then
    create policy cp_a_subscriptions_customer_read on public.subscriptions for select to authenticated using (public.owns_customer(customer_id));
  end if;
end;
$policies$;

revoke all on table public.quotes, public.quote_lines, public.invoices, public.invoice_lines, public.subscriptions from anon;
revoke insert, update, delete, truncate, references, trigger on table public.quotes, public.quote_lines, public.invoices, public.invoice_lines, public.subscriptions from authenticated;
grant select on table public.quotes, public.quote_lines, public.invoices, public.invoice_lines, public.subscriptions to authenticated;

do $postcondition$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'public.quotes',
    'public.quote_lines',
    'public.invoices',
    'public.invoice_lines',
    'public.subscriptions'
  ] loop
    if to_regclass(relation_name) is null then
      raise exception 'CP-A canonical prerequisite postcondition failed: %', relation_name
        using errcode = '42P01';
    end if;
  end loop;
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.website_preview_versions'::regclass
      and attname = 'package_checksum'
      and format_type(atttypid, atttypmod) = 'text'
      and attnum > 0
      and not attisdropped
  ) then
    raise exception 'CP-A canonical prerequisite package checksum postcondition failed'
      using errcode = '42804';
  end if;
end;
$postcondition$;

commit;
