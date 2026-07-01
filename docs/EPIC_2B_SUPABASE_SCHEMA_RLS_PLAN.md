# Epic 2B - Supabase Schema & RLS Implementation Plan

Status: `PLAN / SQL PREVIEW ONLY / DO NOT RUN`

Doel:

Dit document vertaalt de Epic 2A production data foundation naar een concreet Supabase schema- en RLS-uitvoeringsplan voor het klantportaal.

Belangrijk:

- Dit document voert geen SQL uit.
- Dit document activeert geen productie-auth.
- Dit document gebruikt geen echte klantdata.
- Dit document is de reviewbasis voordat staging SQL opnieuw gecontroleerd wordt uitgevoerd.

## Scope

Epic 2B richt zich op de klantportaalproductielijn:

- `profiles`
- `customers`
- `websites`
- `projects`
- `change_requests`
- `client_portal_messages`
- `quotes`
- `invoices`
- `subscriptions`
- `client_portal_notifications`

De prompt noemt `portal_messages` en `finance_items`. Voor productie houden we bewust de bestaande canonical tabellen aan:

- `portal_messages` wordt `client_portal_messages`;
- `finance_items` blijft gesplitst in `quotes`, `invoices` en `subscriptions`.

Waarom:

- de frontend production data foundation leest deze canonical tabellen al;
- bestaande migration drafts en RLS-plannen gebruiken deze namen;
- finance-data heeft verschillende risico's per type: offerte, factuur en abonnement mogen niet in een te brede generieke tabel verdwijnen.

## Uitgangspunten

1. Supabase Auth is de enige production identity source.
2. `profiles.auth_user_id = auth.uid()` koppelt de ingelogde gebruiker.
3. `profiles.customer_id` of `customers.auth_user_id` bepaalt klantcontext.
4. Iedere klantgebonden tabel gebruikt `customer_id`.
5. Customers lezen alleen eigen records.
6. Customers mogen geen ownership-, role-, finance-, status- of deploymentvelden wijzigen.
7. Interne rollen gebruiken eigen policies en worden altijd geaudit.
8. Service role blijft uitsluitend server-side.
9. Demo/staging records moeten herkenbaar zijn via `environment` en/of `is_demo`.
10. Productie bevat geen demo/staging/testrecords.

## Rollen

| Rol | Doel | Klantportaalrechten |
| --- | --- | --- |
| `admin` | Dagelijks beheer | Lezen/schrijven op klantportaaldata, geen ongeteste live payments |
| `support` | Klantondersteuning | Lezen, statusupdates op operationele modules |
| `sales` | Offertes en klantopvolging | Lezen en salesvelden beheren, geen factuurbetaling wijzigen |
| `developer` | Technische ondersteuning | Beperkte technische reads, geen klantcommunicatie of finance writes |
| `customer` | Klantportaal | Alleen eigen klantdata lezen, beperkte creates op requests/messages |
| `demo_user` | Demo/staging | Alleen demo/test records |

## Ownership Helpers

RLS moet recursie vermijden. Helperfuncties moeten `security definer` gebruiken waar nodig en geen policies triggeren die opnieuw dezelfde tabel lezen.

SQL-preview:

```sql
-- PREVIEW ONLY - DO NOT RUN

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.id
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.status = 'active'
  limit 1
$$;

create or replace function public.current_customer_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(p.customer_id, c.id)
  from public.profiles p
  left join public.customers c
    on c.profile_id = p.id
    or c.auth_user_id = p.auth_user_id
  where p.auth_user_id = auth.uid()
    and p.status = 'active'
  limit 1
$$;

create or replace function public.current_app_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(p.role, 'customer')
  from public.profiles p
  where p.auth_user_id = auth.uid()
    and p.status = 'active'
  limit 1
$$;

create or replace function public.has_app_role(allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_app_role() = any(allowed_roles)
$$;
```

## Tabelstructuur

### `profiles`

Doel:

- Auth/role brug tussen `auth.users` en platformdata.

Velden:

- `id uuid primary key`
- `auth_user_id uuid references auth.users(id)`
- `customer_id uuid references public.customers(id)`
- `name text`
- `email text`
- `phone text`
- `role text`
- `status text`
- `is_demo boolean default false`
- `environment text default 'production'`
- `metadata jsonb default '{}'`
- `last_login_at timestamptz`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- unique `profiles_auth_user_id_idx` op `auth_user_id`
- index `profiles_customer_id_idx` op `customer_id`
- index `profiles_role_status_idx` op `role`, `status`

RLS:

- customer leest eigen profile;
- interne rollen lezen alle profiles;
- customer mag niet eigen role/status/customer_id wijzigen;
- writes voor roles alleen admin/server-side.

### `customers`

Doel:

- centrale klantbron.

Velden:

- `id uuid primary key`
- `profile_id uuid references public.profiles(id)`
- `auth_user_id uuid references auth.users(id)`
- `name text`
- `company text`
- `email text`
- `phone text`
- `website text`
- `package text`
- `status text`
- `portal_status text`
- `customer_since date`
- `notes text`
- `internal_notes text`
- `is_demo boolean default false`
- `environment text default 'production'`
- `metadata jsonb default '{}'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`
- `archived_at timestamptz`

Indexes:

- index `customers_profile_id_idx`
- index `customers_auth_user_id_idx`
- index `customers_status_idx`
- index `customers_environment_idx`

RLS:

- customer leest eigen customer;
- customer krijgt geen interne notities in frontend payload;
- interne rollen lezen/schrijven volgens rol;
- production seed mag geen demo customer bevatten.

### `websites`

Doel:

- klantvriendelijke website status en operationele websitegegevens.

Velden:

- `id uuid primary key`
- `customer_id uuid references public.customers(id) not null`
- `project_id uuid references public.projects(id)`
- `name text`
- `domain text`
- `live_url text`
- `status text`
- `maintenance_status text`
- `maintenance_plan text`
- `publish_status text`
- `ssl_status text`
- `hosting_status text`
- `backup_status text`
- `last_backup_at timestamptz`
- `last_checked_at timestamptz`
- `last_deploy_at timestamptz`
- `seo_notes text`
- `seo_score int`
- `performance_score int`
- `internal_notes text`
- `metadata jsonb default '{}'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index `websites_customer_id_idx`
- index `websites_project_id_idx`
- index `websites_status_idx`

RLS:

- customer leest eigen websites;
- customer mag geen hosting/deployment/domein/ownership wijzigen;
- interne rollen beheren operationele velden via aparte write gates.

### `projects`

Doel:

- klantvriendelijke projectstatus.

Velden:

- `id uuid primary key`
- `customer_id uuid references public.customers(id) not null`
- `website_id uuid references public.websites(id)`
- `name text`
- `type text`
- `status text`
- `phase text`
- `progress int`
- `start_date date`
- `deadline date`
- `public_notes text`
- `internal_notes text`
- `metadata jsonb default '{}'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index `projects_customer_id_idx`
- index `projects_website_id_idx`
- index `projects_status_idx`

RLS:

- customer leest eigen projectstatus;
- customer mag projectstatus niet wijzigen;
- interne rollen beheren beperkte statusvelden.

### `change_requests`

Doel:

- klant kan veilig wijzigingsverzoeken aanmaken en eigen verzoeken lezen.

Velden:

- `id uuid primary key`
- `customer_id uuid references public.customers(id) not null`
- `auth_user_id uuid references auth.users(id)`
- `website_id uuid references public.websites(id)`
- `project_id uuid references public.projects(id)`
- `type text`
- `category text`
- `title text`
- `description text`
- `priority text`
- `status text default 'nieuw'`
- `source text`
- `metadata jsonb default '{}'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`
- `completed_at timestamptz`

Indexes:

- index `change_requests_customer_id_idx`
- index `change_requests_auth_user_id_idx`
- index `change_requests_status_idx`

RLS:

- customer leest eigen requests;
- customer mag eigen request aanmaken;
- insert moet `customer_id = current_customer_id()` afdwingen;
- customer mag geen status/ownership wijzigen;
- anonymous/no-profile blokkeert.

### `client_portal_messages`

Doel:

- korte klantportaalberichten tussen klant en Max Webstudio.

Velden:

- `id uuid primary key`
- `customer_id uuid references public.customers(id) not null`
- `auth_user_id uuid references auth.users(id)`
- `sender_type text`
- `subject text`
- `body text`
- `status text default 'unread'`
- `read_at timestamptz`
- `metadata jsonb default '{}'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index `client_portal_messages_customer_id_idx`
- index `client_portal_messages_auth_user_id_idx`
- index `client_portal_messages_created_at_idx`

RLS:

- customer leest eigen messages;
- customer mag eigen message aanmaken met `sender_type = 'customer'`;
- customer mag geen admin/support/system sender spoofen;
- status/read_at writes later apart beoordelen.

### Finance: `quotes`, `invoices`, `subscriptions`

Doel:

- offertes, facturen en abonnementen read-only tonen in het klantportaal.

Klantportaalvelden:

- `customer_id`
- `type`
- `title`
- `description`
- `amount`
- `currency`
- `status`
- `due_date`
- `paid_at`
- `created_at`
- `updated_at`

Canonical mapping:

- `quotes`: gebruikt `quote_number`, `proposal`, `status`, `quote_date`, `valid_until`, `total`, `accepted_at`;
- `invoices`: gebruikt `invoice_number`, `notes`, `status`, `mollie_payment_status`, `invoice_date`, `due_date`, `paid_at`, `total`;
- `subscriptions`: gebruikt `plan`, `status`, `billing_cycle`, `total_incl_vat`, `next_invoice_date`, `mandate_status`.

Indexes:

- `quotes_customer_id_idx`
- `invoices_customer_id_idx`
- `subscriptions_customer_id_idx`
- status/date indexes per tabel.

RLS:

- customer leest eigen quotes/invoices/subscriptions;
- customer schrijft niets op finance-tabellen;
- akkoord geven, betalen, Mollie, PDF download en statusmutaties verlopen later via server-side endpoints;
- interne rollen krijgen alleen noodzakelijke toegang en worden geaudit.

### `client_portal_notifications`

Doel:

- actiecentrum en klantvriendelijke meldingen.

Velden:

- `id uuid primary key`
- `customer_id uuid references public.customers(id) not null`
- `title text`
- `message text`
- `type text`
- `related_type text`
- `related_id uuid`
- `cta_label text`
- `cta_target text`
- `read_at timestamptz`
- `metadata jsonb default '{}'`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Indexes:

- index `client_portal_notifications_customer_id_idx`
- index `client_portal_notifications_type_idx`
- index `client_portal_notifications_read_at_idx`

RLS:

- customer leest eigen notificaties;
- customer writes blijven uit tot een aparte read-status release;
- notificaties mogen geen interne debugdetails, secrets, payment provider details of deploymentinformatie bevatten.

## Policy Matrix

| Tabel | Customer read | Customer insert | Customer update | Interne rollen |
| --- | --- | --- | --- | --- |
| `profiles` | eigen profile | nee | beperkte self-update later | admin/support/developer volgens rol |
| `customers` | eigen customer | nee | nee | admin/sales/support |
| `websites` | eigen websites | nee | nee | admin/support/developer |
| `projects` | eigen projects | nee | nee | admin/support/developer |
| `change_requests` | eigen requests | ja, eigen customer | nee | admin/support |
| `client_portal_messages` | eigen messages | ja, sender customer | nee | admin/support |
| `quotes` | eigen quotes | nee | nee | admin/sales/support |
| `invoices` | eigen invoices | nee | nee | admin/support |
| `subscriptions` | eigen subscriptions | nee | nee | admin/support |
| `client_portal_notifications` | eigen notifications | nee | nee | admin/support |

## RLS Policy Preview

SQL-preview:

```sql
-- PREVIEW ONLY - DO NOT RUN

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.websites enable row level security;
alter table public.projects enable row level security;
alter table public.change_requests enable row level security;
alter table public.client_portal_messages enable row level security;
alter table public.quotes enable row level security;
alter table public.invoices enable row level security;
alter table public.subscriptions enable row level security;
alter table public.client_portal_notifications enable row level security;

create policy profiles_customer_read_own
  on public.profiles
  for select
  to authenticated
  using (auth_user_id = auth.uid());

create policy customers_customer_read_own
  on public.customers
  for select
  to authenticated
  using (id = public.current_customer_id());

create policy websites_customer_read_own
  on public.websites
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy projects_customer_read_own
  on public.projects
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy change_requests_customer_read_own
  on public.change_requests
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy change_requests_customer_insert_own
  on public.change_requests
  for insert
  to authenticated
  with check (
    customer_id = public.current_customer_id()
    and auth_user_id = auth.uid()
    and coalesce(status, 'nieuw') in ('nieuw', 'open')
  );

create policy messages_customer_read_own
  on public.client_portal_messages
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy messages_customer_insert_own
  on public.client_portal_messages
  for insert
  to authenticated
  with check (
    customer_id = public.current_customer_id()
    and auth_user_id = auth.uid()
    and sender_type = 'customer'
  );

create policy quotes_customer_read_own
  on public.quotes
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy invoices_customer_read_own
  on public.invoices
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy subscriptions_customer_read_own
  on public.subscriptions
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy notifications_customer_read_own
  on public.client_portal_notifications
  for select
  to authenticated
  using (customer_id = public.current_customer_id());

create policy internal_roles_read_customers
  on public.customers
  for select
  to authenticated
  using (public.has_app_role(array['admin', 'support', 'sales', 'developer']));
```

Let op:

- Dit is een preview, geen definitieve migration.
- Policy-namen moeten tijdens uitvoering gecontroleerd worden tegen bestaande policies.
- Runtime grants moeten minimaal blijven en RLS leidend houden.
- Column-level privileges moeten gevoelige writes blokkeren voordat RLS policy evaluation brede mutaties toestaat.

## Runtime Grants Preview

SQL-preview:

```sql
-- PREVIEW ONLY - DO NOT RUN

grant usage on schema public to anon, authenticated;

grant select on
  public.profiles,
  public.customers,
  public.websites,
  public.projects,
  public.change_requests,
  public.client_portal_messages,
  public.quotes,
  public.invoices,
  public.subscriptions,
  public.client_portal_notifications
to authenticated;

grant insert (customer_id, auth_user_id, website_id, project_id, type, category, title, description, priority, source, metadata)
  on public.change_requests
to authenticated;

grant insert (customer_id, auth_user_id, sender_type, subject, body, status, metadata)
  on public.client_portal_messages
to authenticated;
```

Geen customer grants voor:

- finance writes;
- role/status/ownership updates;
- website deployment/domein/hosting writes;
- project status writes;
- notification read-status writes.

## Staging Testdata

Staging mag testdata bevatten met:

- `environment = 'test'`;
- `is_demo = true`;
- herkenbare e-mails zoals `customer-a@example.test`, `customer-b@example.test`, `testklant@maxwebstudio.nl`;
- twee klantprofielen voor Customer A/B isolatie;
- minimaal 1 website, project, request, message, quote, invoice, subscription en notification per klant.

Productie mag nooit bevatten:

- `@example.test`;
- `demo-staging-*`;
- `environment = 'test'`;
- `is_demo = true` tenzij expliciet demo-tenant voor sales buiten echte klantdata.

## Testaccounts

Staging:

- Customer A: eigen customer, eigen records.
- Customer B: eigen customer, eigen records.
- Admin: interne rol voor review.
- Support: beperkte interne rol.
- No-profile user: moet geblokkeerd worden.
- Anonymous: moet geblokkeerd worden.

Minimale tests:

- Customer A ziet nooit Customer B.
- Customer B ziet nooit Customer A.
- Customer kan eigen requests/messages aanmaken.
- Customer kan geen finance writes doen.
- Customer kan geen project/website/customer ownership wijzigen.
- Anonymous krijgt geen portaldata.
- No-profile user krijgt geen portaldata.
- Admin/support ziet wat de rol toestaat.

## Rollbackplan

Voor staging:

1. Maak backup of schema snapshot voordat SQL wordt uitgevoerd.
2. Voer helpers, grants en policies in aparte migration op.
3. Stop direct bij policy recursion, permission denied of cross-customer access.
4. Rollback per migration:
   - drop nieuwe policies;
   - revoke nieuwe grants;
   - drop helperfuncties alleen als er geen afhankelijkheden zijn;
   - herstel vorige schema snapshot indien nodig.
5. Leg iedere stap vast in `docs/deployment/TEST_RESULTS.md`.

Voor productie:

- Geen uitvoering zonder release approval.
- Geen uitvoering zonder staging PASS.
- Geen uitvoering zonder rollback dry-run.
- Geen uitvoering met demo/testdata in productie.

## Uitvoeringsvolgorde

1. Review dit document tegen `SUPABASE_CANONICAL_SCHEMA.md`.
2. Review RLS tegen `SUPABASE_RLS_POLICY_PLAN.md`.
3. Maak draft migration voor klantportaal schema-alignment.
4. Maak draft migration voor RLS policies.
5. Maak draft migration voor runtime grants.
6. Seed alleen staging testdata.
7. Test Customer A/B isolation.
8. Test customer creates voor change requests en messages.
9. Test finance en notifications read-only.
10. Vul `TEST_RESULTS.md` en blockers bij.
11. Pas na GO verder naar production rollout.

## Go/No-Go Criteria

GO voor staging execution pas als:

- schema reviewed;
- RLS reviewed;
- helperfuncties gecontroleerd op recursie;
- runtime grants minimaal zijn;
- rollbackplan klaar is;
- testaccounts beschikbaar zijn;
- geen productieproject gekoppeld is.

NO-GO bij:

- ontbrekende Customer A/B testaccounts;
- open RLS blocker;
- onduidelijke ownership mapping;
- service-role exposure;
- demo/testdata in productie;
- ontbrekend rollbackplan.

## Bewust Niet Gedaan

- geen SQL uitgevoerd;
- geen migration aangemaakt;
- geen Supabase schema gewijzigd;
- geen productie-auth geactiveerd;
- geen echte klantdata gebruikt;
- geen runtime code gewijzigd;
- geen OpenAI/Mollie/Resend gekoppeld.

## Volgende Stap

`Epic 2B.2 - Draft Customer Portal Schema/RLS Migrations`

Doel van die stap:

- dit plan omzetten naar draft SQL-bestanden;
- nog steeds niets uitvoeren;
- reviewbare migrations klaarzetten voor staging execution.
