# Supabase Migration Draft Review Checklist

Status: Fase 24 reviewdocument.  
Doel: bepalen wanneer de migration drafts veilig naar een testomgeving mogen.

## Bestanden In Scope

- `supabase/migration-drafts/001_schema_tables.sql`
- `supabase/migration-drafts/002_indexes.sql`
- `supabase/migration-drafts/003_rls_enablement.sql`
- `supabase/migration-drafts/004_rls_policies.sql`
- `supabase/migration-drafts/005_audit_logging_foundation.sql`
- `supabase/migration-drafts/006_seed_demo_data_optional.sql`
- `supabase/migration-drafts/007_runtime_role_grants.sql`
- `supabase/migration-drafts/008_change_request_customer_ownership.sql`
- `supabase/migration-drafts/009_client_portal_message_customer_ownership.sql`

## Reviewstappen Voor Uitvoering

### 1. Schema Review

- Controleer alle tabellen tegen `SUPABASE_RLS_POLICY_PLAN.md`.
- Controleer foreign keys en circulaire relaties.
- Controleer statuswaarden/check constraints.
- Controleer soft-delete/archiefvelden.
- Controleer dat legacy `customer_*` tabellen niet worden aangemaakt.

### 2. Index Review

- Controleer indexes op ownershipvelden zoals `customer_id`, `auth_user_id` en parent IDs.
- Controleer indexes voor dashboardfilters, statusvelden en betalingsvelden.
- Controleer dat indexes geen gevoelige data blootleggen; indexes zijn technisch, geen access policy.

### 3. RLS Review

- Controleer helperfuncties op recursie.
- Controleer Customer A/B isolation per klantgebonden tabel.
- Controleer child table policies via parent ownership.
- Controleer dat `demo_user` alleen demo/environment demo kan lezen.
- Controleer dat `sales`, `support` en `developer` geen betaal-/migratierechten krijgen.

### 4. Audit Logging Review

- Controleer dat `audit_logs` niet door normale frontend-clients gemuteerd kan worden.
- Controleer dat secrets, signed URLs, reset tokens en volledige provider payloads niet gelogd worden.
- Controleer of server-side Netlify Functions later audit inserts gaan uitvoeren.

### 5. Seed/Demo Review

- `006_seed_demo_data_optional.sql` is test/demo-only.
- Niet uitvoeren op productie tenzij expliciet goedgekeurd.
- Controleer dat alle seed records `is_demo = true` en `environment = 'demo'` gebruiken.

### 6. Deployment Preconditions

- Backup bevestigd.
- Rollbackplan bevestigd.
- Staging/test Supabase project bevestigd.
- Productieproject expliciet uitgesloten tijdens test.
- Environment variables gecontroleerd zonder secretwaarden te tonen.
- Reviewer/approver geregistreerd in deployment blockers.

### 7. Runtime Role Grants Review

- Controleer dat PostgreSQL table privileges minimaal genoeg zijn om RLS te laten evalueren.
- Controleer dat `anon` geen directe klantdatatabelrechten krijgt.
- Controleer dat `authenticated` alleen werkt in combinatie met bestaande RLS policies.
- Controleer dat `service_role` alleen server-side wordt gebruikt.
- Controleer dat `audit_logs` niet direct door normale frontend-clients gemuteerd kan worden.
- Controleer dat `add_audit_log()` niet publiek uitvoerbaar is.

## Go/No-Go Voor Testomgeving

Go naar testomgeving mag pas wanneer:

- schema review akkoord is;
- RLS review akkoord is;
- seed/demo keuze expliciet is;
- rollbackplan klaarstaat;
- er geen open critical blockers zijn.

Productie blijft No-Go totdat testomgeving bewijs levert voor:

- Auth/profiles mapping;
- Customer A/B isolation;
- demo/productie isolatie;
- admin/sales/support/developer rolgrenzen;
- Storage/signed URL flows;
- audit logging basis.
