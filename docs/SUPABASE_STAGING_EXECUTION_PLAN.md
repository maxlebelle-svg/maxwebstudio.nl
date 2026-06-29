# Supabase Staging/Test Execution Plan

Status: Fase 25 planning/checklist.  
Doel: veilig testen van de migration drafts in een aparte Supabase staging/testomgeving.  
Dit document voert geen SQL uit.

## Harde Grenzen

- Geen productieproject gebruiken.
- Geen echte klantdata gebruiken.
- Geen Supabase CLI run vanuit deze fase.
- Geen SQL uitvoeren voordat de uitvoering expliciet is goedgekeurd.
- Geen API keys of secrets documenteren.
- Geen OpenAI, Mollie of Resend live-acties.

## Voorwaarden Voor Start

1. Apart Supabase testproject bestaat.
2. Projectnaam/ID is aantoonbaar test/staging.
3. `.env.local` of Netlify testcontext verwijst naar test, niet productie.
4. `APP_ENV=test` en `APP_ENVIRONMENT=test`.
5. Service role key blijft alleen lokaal/server-side.
6. Backup/rollbackprocedure is gelezen.
7. Migration drafts zijn gereviewd met `SUPABASE_MIGRATION_DRAFT_REVIEW_CHECKLIST.md`.
8. Release/deployment blocker voor staging execution is handmatig goedgekeurd.

## SQL-Testvolgorde

Voer later alleen in test/staging uit en leg elk resultaat vast in `docs/deployment/TEST_RESULTS.md`.

| Stap | Bestand | Doel | Stopconditie |
|---|---|---|---|
| 1 | `001_schema_tables.sql` | Tabellen, FKs, statusvelden, timestamps en triggers | Stop bij syntax-, FK- of constraintfout |
| 2 | `002_indexes.sql` | Indexes op ownership, status, parent en dashboardvelden | Stop bij indexfout die queryplanning of deployment raakt |
| 3 | `003_rls_enablement.sql` | RLS activeren per tabel | Stop als tabel ontbreekt of RLS niet aan gaat |
| 4 | `004_rls_policies.sql` | Helpers en policies | Stop bij recursie, policy conflict of permissiefout |
| 5 | `005_audit_logging_foundation.sql` | Audit helper/foundation | Stop als normale clients brede insertrechten krijgen |
| 6 | `006_seed_demo_data_optional.sql` | Optionele demo/testdata | Alleen uitvoeren in test/demo na expliciete keuze |

## Validatie Per Stap

### 1. Schema/Tables

Controleer:

- alle tabellen bestaan;
- legacy `customer_websites`, `customer_invoices`, `customer_subscriptions` zijn niet opnieuw aangemaakt;
- alle FK-relaties bestaan;
- status/check constraints bestaan;
- `created_at` en `updated_at` bestaan waar relevant;
- soft-deletevelden zoals `archived_at`/`deleted_at` bestaan waar relevant.

Minimale tabellen:

- `profiles`
- `customers`
- `websites`
- `projects`
- `quotes`
- `quote_lines`
- `invoices`
- `invoice_lines`
- `subscriptions`
- `files`
- `change_requests`
- `leads`
- `crm_tasks`
- `client_portal_messages`
- `client_portal_notifications`
- `ai_drafts`
- `ai_assistant_drafts`
- `audit_logs`

### 2. Indexes

Controleer indexes op:

- `auth_user_id`
- `profile_id`
- `customer_id`
- parent IDs zoals `quote_id` en `invoice_id`
- statusvelden
- datums zoals `due_date`, `next_invoice_date`, `follow_up_date`
- audit/activity timestamps

### 3. RLS Enablement

Controleer voor alle tabellen:

- RLS is enabled.
- Geen tabel met klantdata blijft zonder RLS.
- Anonymous krijgt geen directe toegang tot customer data.

### 4. RLS Policies

Controleer:

- helperfuncties veroorzaken geen stack depth/recursion errors;
- `customer` ziet alleen eigen records;
- `demo_user` ziet alleen `is_demo = true` of `environment = demo`;
- `sales` ziet salesdata maar geen Developer Tools/securitydata;
- `support` ziet supportdata maar geen payment writes;
- `developer` ziet technische readiness maar geen klantbetaling-mutaties;
- `quote_lines` en `invoice_lines` erven toegang via parent ownership.

### 5. Audit Logging

Controleer:

- audit helper bestaat;
- audit insert bevat geen secrets;
- normale klantrol kan audit logs niet lezen;
- audit logs zijn admin/security only;
- gevoelige acties kunnen later server-side gelogd worden.

### 6. Optional Demo Seed

Alleen in test/demo:

- seed records gebruiken `is_demo = true`;
- seed records gebruiken `environment = demo`;
- demo_user kan demo records lezen;
- customer/admin isolatie blijft intact.

## Testscenario's

### Admin Ziet Nodige Data

- Login als admin testuser.
- Selecteer customers, websites, projects, quotes, invoices, subscriptions, files, change_requests.
- Verwacht: admin kan beheerdata lezen.
- Verwacht niet: service role in frontend of secrets in response.

### Klant Ziet Alleen Eigen Data

- Maak Customer A en Customer B met eigen Auth-users/profiles.
- Login als Customer A.
- Selecteer eigen customer, websites, projects, quotes, invoices, subscriptions, files, messages en notifications.
- Probeer Customer B records te lezen.
- Verwacht: Customer B records leeg/geblokkeerd.

### Demo User Ziet Alleen Demo Data

- Login als demo_user.
- Lees demo customers/websites/projects/quotes/invoices/subscriptions.
- Probeer production/test customer records te lezen.
- Verwacht: alleen demo records zichtbaar.

### Leadfinder Blijft Intern

- Login als sales/admin.
- Controleer `leads` read/write.
- Login als customer.
- Probeer leads te lezen.
- Verwacht: customer krijgt geen leadfinder data.

### AI Drafts Blijven Intern

- Login als admin/developer.
- Controleer `ai_drafts` en `ai_assistant_drafts`.
- Login als customer.
- Probeer AI drafts te lezen.
- Verwacht: geen toegang.

### Audit Logs Lekken Geen Secrets

- Maak test audit event zonder gevoelige inhoud.
- Controleer dat customer geen audit logs kan lezen.
- Controleer metadata op afwezigheid van secrets, signed URLs, reset tokens en providerpayloads.

## Rollback Plan Voor Staging

Omdat dit een testomgeving is:

1. Stop direct na de eerste kritieke fout.
2. Exporteer foutmelding en SQL stap naar `TEST_RESULTS.md`.
3. Gebruik Supabase database reset/branch reset of herstel snapshot indien beschikbaar.
4. Verwijder geen productiegegevens; productie mag niet geraakt zijn.
5. Pas migration draft aan in Git in een aparte fixfase.
6. Herhaal vanaf stap 1 op een schone testomgeving.

Rollback naar productie is niet van toepassing zolang de uitvoering correct in test/staging blijft.

## Evidence

Leg vast:

- datum/tijd;
- testprojectnaam of niet-geheime project-ID;
- uitgevoerde bestanden;
- pass/fail per SQL-stap;
- queryresultaten voor tabel/index/RLS checks;
- screenshots of queryoutput voor Customer A/B isolation;
- reviewer/approver;
- open blockers.

## Go/No-Go

Staging execution is pas geslaagd wanneer:

- alle SQL-drafts in testomgeving zijn uitgevoerd zonder kritieke fout;
- alle tabellen/indexes/RLS checks pass zijn;
- Customer A/B isolation bewezen is;
- demo isolation bewezen is;
- leadfinder en AI-drafts intern blijven;
- audit logs geen secrets lekken;
- testresultaten en blockers zijn bijgewerkt.

Productie blijft daarna nog steeds No-Go tot aparte production release approval.

