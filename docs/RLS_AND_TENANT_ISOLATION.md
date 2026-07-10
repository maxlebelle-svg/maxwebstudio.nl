# RLS And Tenant Isolation

Dit document beschrijft het bewijsmodel voor Supabase RLS en klantisolatie.

## Bronnen

Belangrijkste bestanden:

- `/supabase/schema.sql`
- `/supabase/rls-policies.sql`
- `/supabase/migration-drafts/004_rls_policies.sql`
- `/public/src/services/clientPortalDataService.js`
- `/public/src/services/clientFinanceContextService.js`
- `/public/src/services/clientWebsiteProjectContextService.js`

## Policy Model

RLS moet minimaal afdwingen:

- interne adminrollen beheren operationele tabellen;
- sales leest sales/klant/offerte/factuurdata;
- support leest klant/project/factuurdata;
- developers lezen technische operationele data;
- customers lezen alleen eigen records;
- demo users lezen alleen demo records met `environment = 'demo'`.

Eigen klantdata wordt bepaald via:

```sql
customers.auth_user_id = auth.uid()
or customers.profile_id = public.current_profile_id()
```

Child-tabellen gebruiken `customer_id` of parent joins naar `customers`.

## Live Bewijs Dat Nodig Is

Deze repo bevat policyvoorbereiding. Definitief bewijs vraagt een live of staging Supabase-project.

Testmatrix:

1. Klant A leest eigen `customers`, `websites`, `projects`, `quotes`, `invoices`, `subscriptions`.
2. Klant A kan klant B niet lezen.
3. Klant A kan geen interne notities, settings, activity logs of import logs lezen.
4. Demo-user leest alleen demo records.
5. Sales leest leads/customers/quotes/invoices, maar geen developer/settings.
6. Support leest customer/project/invoice, maar beheert geen finance.
7. Developer leest technische tabellen, maar markeert geen facturen betaald.
8. Anonieme gebruiker leest geen klantdata.

## SQL Smokechecks

Gebruik in staging minimaal:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
and tablename in ('profiles','customers','websites','projects','quotes','invoices','subscriptions','files');

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Daarna met echte JWT's of Supabase client-sessies testen per rol.

## Status Op 2026-07-10

Statisch bewijs:

- RLS policies zijn voorbereid in SQL.
- Customer ownership policies zijn aanwezig.
- Admin mutaties blijven server-side via service role en `verifyAdmin()`.

Nog live te bewijzen:

- policies zijn daadwerkelijk toegepast op productie;
- anon/authenticated grants staan correct;
- klant A/B isolatie is met echte accounts gecontroleerd;
- legacy tabellen lekken geen klantdata buiten compatibilityflows.
