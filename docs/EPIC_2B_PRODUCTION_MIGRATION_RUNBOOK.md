# Epic 2B.6 - Production Migration Runbook

Status: `MINIMAL CLIENT PORTAL BASELINE COMPLETE / PRODUCTION AUTH CLOSED`

Doel:

- de klantportaal database veilig op productie uitrollen;
- alleen de volledige goedgekeurde migration-volgorde gebruiken;
- demo-data en stagingconfiguratie uit productie houden;
- productie-auth dicht houden totdat schema, RLS en customer-isolation bewezen zijn.

## Context

Productie:

- Supabase project: `maxwebstudio`
- Project ref: `yxxahurphdbblkuxoeje`
- Database host: `db.yxxahurphdbblkuxoeje.supabase.co`

Staging/test:

- Supabase project: `maxwebstudio-test`
- Project ref: `xlxpuuycigeqhgxqtzni`

Huidige production read-only conclusie:

- `profiles` bestaat met 1 rij;
- `change_requests` bestaat met 2 rijen;
- `000_production_existing_tables_alignment.sql` is uitgevoerd en groen gevalideerd;
- `001_client_portal_baseline.sql` is uitgevoerd en groen gevalideerd;
- `customers`, `websites`, `projects`, `client_portal_messages` en `client_portal_notifications` bestaan nu;
- finance-, CRM-, AI-, file- en logtabellen blijven buiten deze minimale livegang;
- `002_client_portal_indexes.sql` is uitgevoerd en groen gevalideerd;
- `003_client_portal_rls_enablement.sql` is uitgevoerd en groen gevalideerd;
- `004_client_portal_rls_policies_and_grants.sql` is uitgevoerd en groen gevalideerd;
- `005_client_portal_legacy_policy_cleanup.sql` is uitgevoerd en groen gevalideerd;
- legacy policies zijn verwijderd vóór productie-auth;
- schema, indexes, RLS, policies, grants en legacy cleanup zijn compleet voor de minimale klantportaal-baseline;
- productie is `NO-GO` voor alleen `013_client_portal_schema_rls_alignment.sql`.
- productie is `NO-GO` voor direct `001_schema_tables.sql` zolang oudere `profiles` en `change_requests` niet eerst zijn uitgelijnd.
- `001_schema_tables.sql` is te breed voor de eerste klantportaal-livegang en wordt vervangen door `001_client_portal_baseline.sql`.

## Releasebesluit

Deze runbook mag pas worden uitgevoerd na expliciete approval.

Toegestaan na approval:

- volledige migration-volgorde uit dit document;
- read-only validatiequeries;
- rollback volgens dit document indien nodig.

Niet toegestaan:

- alleen `013` direct uitvoeren;
- `001_schema_tables.sql` direct uitvoeren zonder `000_production_existing_tables_alignment.sql`;
- `001_schema_tables.sql` uitvoeren tijdens de eerste minimale klantportaal-livegang;
- `006_seed_demo_data_optional.sql` uitvoeren;
- demo-data seeden;
- productie-auth openzetten vóór groene validatie;
- echte klantdata verwijderen;
- RLS versoepelen om fouten te omzeilen.

## Preflight Checklist

Alles moet afgevinkt zijn vóór productie-SQL:

- [ ] Supabase dashboard staat op project `maxwebstudio`.
- [ ] Project ref is `yxxahurphdbblkuxoeje`.
- [ ] SQL Editor of DB connection wijst niet naar `maxwebstudio-test`.
- [ ] Lokale CLI-link staat niet per ongeluk op productie, tenzij expliciet tijdelijk approved.
- [ ] Backup/snapshot is bevestigd.
- [ ] Schema-only export of metadata snapshot is opgeslagen.
- [ ] Row counts vóór execution zijn vastgelegd.
- [ ] De bestaande `profiles` rij is inhoudelijk beoordeeld.
- [ ] De bestaande `change_requests` records zijn inhoudelijk beoordeeld.
- [ ] Bestaande `profiles` kolommen zijn compatibel.
- [ ] Bestaande `change_requests` kolommen zijn compatibel.
- [ ] Bestaande policies/functions hebben geen blocker.
- [ ] Netlify production env vars zijn gecontroleerd zonder secrets te tonen.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` blijft server-side only.
- [ ] Productie-auth blijft dicht.
- [ ] Rollback-approver is bevestigd.
- [ ] Release approver heeft expliciet GO gegeven.

## Backup/Snapshot Stap

Vóór de eerste migration:

1. Maak of bevestig een Supabase backup/snapshot.
2. Leg datum, tijd, uitvoerder en project ref vast.
3. Leg de laatste stabiele Git commit vast.
4. Bevestig dat Netlify rollback naar de laatste stabiele deploy mogelijk is.
5. Bewaar de preflight row counts in `TEST_RESULTS.md` of release-notities.

Minimum bewijs:

```text
Project: maxwebstudio
Ref: yxxahurphdbblkuxoeje
Backup/snapshot: confirmed
Rollback approver: confirmed
Execution approver: confirmed
Demo seed: excluded
```

## Migration Volgorde

Voer exact deze volgorde uit.

### Stap 1

Bestand:

```text
supabase/migration-drafts/000_production_existing_tables_alignment.sql
```

Doel:

- bestaande oudere `profiles` tabel aanvullen met canonical kolommen;
- bestaande oudere `change_requests` tabel aanvullen met canonical kolommen;
- bestaande records intact houden;
- veilige defaults zetten voor toekomstige records.

Controle na stap:

- `profiles.email` bestaat;
- `profiles.phone` bestaat;
- `profiles.role` bestaat;
- `profiles.status` bestaat;
- `profiles.is_demo` bestaat;
- `profiles.environment` bestaat;
- `profiles.metadata` bestaat;
- `profiles.updated_at` bestaat;
- `change_requests.customer_id` bestaat;
- `change_requests.auth_user_id` bestaat;
- `change_requests.website_id` bestaat;
- `change_requests.project_id` bestaat;
- `change_requests.title` bestaat;
- `change_requests.description` bestaat;
- `change_requests.priority` bestaat;
- `change_requests.status` bestaat;
- `change_requests.metadata` bestaat;
- `change_requests.updated_at` bestaat.

Rollback:

- Bij fout vóór commit: transactie faalt en wordt niet toegepast.
- Bij fout na commit: restore Supabase backup/snapshot; verwijder geen kolommen handmatig zonder review.

### Stap 2

Bestand:

```text
supabase/migration-drafts/001_client_portal_baseline.sql
```

Doel:

- alleen de minimale klantportaal-baseline aanmaken;
- `customers`, `websites`, `projects`, `client_portal_messages` en `client_portal_notifications` aanmaken;
- bestaande `change_requests` verder veilig aanvullen voor klantportaalgebruik;
- `set_updated_at` helper/triggers alleen voor deze beperkte tabellenset toevoegen.

Controle na stap:

- `customers` bestaat;
- `websites` bestaat;
- `projects` bestaat;
- `client_portal_messages` bestaat;
- `client_portal_notifications` bestaat;
- `profiles` bestaat nog;
- `change_requests` bestaat nog.
- finance-tabellen bestaan nog niet door deze stap;
- CRM/AI/logging tabellen bestaan nog niet door deze stap.

Rollback:

- Bij fout vóór commit: transactie faalt en wordt niet toegepast.
- Bij fout na gedeeltelijke toepassing: stop, gebruik Supabase backup/snapshot; verwijder geen data handmatig.

### Stap 3

Bestand:

```text
supabase/migration-drafts/002_client_portal_indexes.sql
```

Doel:

- alleen indexes toevoegen voor `profiles`, `customers`, `websites`, `projects`, `change_requests`, `client_portal_messages` en `client_portal_notifications`;
- geen finance-, CRM-, AI-, file- of logindexes aanmaken.

Controle na stap:

- indexes bestaan voor klant-, website-, project-, wijzigings-, berichten- en notificatiequeries;
- er zijn geen indexes aangemaakt op uitgesloten brede platformtabellen.

Rollback:

- Bij fout vóór commit: transactie faalt en wordt niet toegepast.
- Bij fout na commit: stop en herstel via backup/snapshot of maak een aparte reviewed rollback-migration.

### Stap 4

Bestand:

```text
supabase/migration-drafts/003_client_portal_rls_enablement.sql
```

Doel:

- RLS aanzetten voor alleen de minimale klantportaal-tabellen.

Controle na stap:

- `relrowsecurity = true` voor `profiles`, `customers`, `websites`, `projects`, `change_requests`, `client_portal_messages` en `client_portal_notifications`;
- uitgesloten brede platformtabellen worden niet geraakt.

Rollback:

- Niet handmatig RLS uitschakelen zonder review. Bij kritieke fout: stop, rollback via backup/snapshot of aparte reviewed rollback-migration.

### Stap 5

Bestand:

```text
supabase/migration-drafts/004_client_portal_rls_policies_and_grants.sql
```

Doel:

- minimale helper functions toevoegen;
- RLS policies toevoegen voor klantisolatie, staff/admin toegang en klantveilige creates;
- runtime grants toevoegen zodat PostgreSQL RLS kan evalueren.

Controle na stap:

- policies bestaan op de zeven minimale klantportaal-tabellen;
- `anon` heeft geen directe klantportaal-table grants;
- `authenticated` heeft alleen minimale grants;
- `service_role` blijft server-side only;
- Customer A/B isolation test is verplicht voordat productie-auth open mag.

Rollback:

- Bij fout vóór commit: transactie faalt en wordt niet toegepast.
- Bij fout na commit: productie-auth blijft dicht; herstel via backup/snapshot of aparte reviewed rollback-migration.

### Stap 6

Bestand:

```text
supabase/migration-drafts/005_client_portal_legacy_policy_cleanup.sql
```

Doel:

- oude legacy policies verwijderen die vóór de minimale production RLS-set bestonden;
- voorkomen dat klanten via oude profile/update policies meer kunnen dan bedoeld;
- policy-ruis verwijderen voordat productie-auth open mag.

Verwijdert alleen:

- `"Clients can read own profile"` op `public.profiles`;
- `"Clients can update own profile"` op `public.profiles`;
- `"Clients can read own change requests"` op `public.change_requests`.

Controle na stap:

- deze drie legacy policies bestaan niet meer;
- de nieuwe minimale policies uit `004` bestaan nog;
- grants blijven ongewijzigd;
- productie-auth blijft dicht tot customer-isolation groen is.

Rollback:

- Bij fout vóór commit: transactie faalt en wordt niet toegepast.
- Bij fout na commit: productie-auth blijft dicht; alleen herstellen via reviewed policy migration als dat nodig blijkt.

## Niet Automatisch Doorgaan Met Brede Migrations

Na `005_client_portal_legacy_policy_cleanup.sql` stopt deze minimale productie-uitrol opnieuw voor validatie.

Niet automatisch doorgaan met bestaande brede migrations:

- `002_indexes.sql`
- `003_rls_enablement.sql`
- `004_rls_policies.sql`
- `005_audit_logging_foundation.sql`
- `007_runtime_role_grants.sql`
- `008_change_request_customer_ownership.sql`
- `009_client_portal_message_customer_ownership.sql`
- `013_client_portal_schema_rls_alignment.sql`

Reden:

- deze bestanden zijn nog gebaseerd op het brede platformschema;
- ze verwijzen naar uitgesloten tabellen zoals leads, finance, files, CRM, AI, settings en logs;
- de minimale klantportaal-livegang gebruikt nu de aparte `002_client_portal_*`, `003_client_portal_*` en `004_client_portal_*` drafts.

Volgende stap na `005`-validatie:

- voer RLS/customer-isolation tests uit voordat productie-auth open mag.

## Niet Uitvoeren

Niet uitvoeren op productie:

```text
supabase/migration-drafts/001_schema_tables.sql
```

Reden:

- te breed voor de eerste klantportaal-livegang;
- bevat leads, crm_tasks, finance, files, AI drafts, settings, demo_emails, activity/import/audit logs en brede trigger setup.

Niet uitvoeren op productie:

```text
supabase/migration-drafts/006_seed_demo_data_optional.sql
```

Reden:

- productie mag geen demo-data, testklanten, staging-accounts of mockrecords bevatten.

Nog niet uitvoeren zonder aparte release approval:

```text
supabase/migration-drafts/010_project_status_update_grants.sql
supabase/migration-drafts/011_customer_contact_update_grants.sql
supabase/migration-drafts/012_website_operational_update_grants.sql
```

Reden:

- deze horen bij production admin/operational write rollout;
- klantportaal production schema/RLS kan eerst live zonder deze extra write-grants.

## Controle Na Elke Stap

Na elke migration:

1. Controleer dat de SQL zonder fout is voltooid.
2. Noteer tijdstip en bestand.
3. Draai alleen relevante read-only checks.
4. Stop direct bij fout.
5. Houd productie-auth dicht.
6. Leg blockers vast in `TEST_RESULTS.md`.

Minimale read-only checks:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Post-migration Validatie

Schema:

- alle klantportaal-tabellen bestaan;
- alle benodigde columns bestaan;
- foreign keys bestaan;
- indexes bestaan;
- helper functions bestaan.

RLS:

- RLS staat aan op alle klantportaal-tabellen;
- anonymous wordt geblokkeerd;
- no-profile user wordt geblokkeerd;
- customer ziet alleen eigen customerdata;
- Customer A ziet Customer B nooit;
- staff/admin ziet alleen wat de rol toestaat.

Data:

- geen demo seed;
- geen staging accounts;
- geen placeholder/mockrecords;
- bestaande 1 `profiles` en 2 `change_requests` records zijn nog verklaarbaar/veilig.

Checkpointstatus:

- `000_production_existing_tables_alignment.sql`: uitgevoerd/groen;
- `001_client_portal_baseline.sql`: uitgevoerd/groen;
- `002_client_portal_indexes.sql`: uitgevoerd/groen;
- `003_client_portal_rls_enablement.sql`: uitgevoerd/groen;
- `004_client_portal_rls_policies_and_grants.sql`: uitgevoerd/groen;
- `005_client_portal_legacy_policy_cleanup.sql`: uitgevoerd/groen;
- productie-auth blijft dicht tot RLS/customer-isolation en frontend-auth rollout groen zijn.

Read-only controlequeries voor eindcontrole:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'profiles',
    'customers',
    'websites',
    'projects',
    'change_requests',
    'client_portal_messages',
    'client_portal_notifications'
  )
order by table_name;
```

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles',
    'customers',
    'websites',
    'projects',
    'change_requests',
    'client_portal_messages',
    'client_portal_notifications'
  )
order by c.relname;
```

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'customers',
    'websites',
    'projects',
    'change_requests',
    'client_portal_messages',
    'client_portal_notifications'
  )
order by tablename, policyname;
```

```sql
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'profiles',
    'customers',
    'websites',
    'projects',
    'change_requests',
    'client_portal_messages',
    'client_portal_notifications'
  )
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;
```

```sql
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
  and policyname in (
    'Clients can read own profile',
    'Clients can update own profile',
    'Clients can read own change requests'
  )
order by tablename, policyname;
```

Frontend:

- service-role wordt niet naar browser gestuurd;
- productie-auth blijft dicht tot validatie groen is;
- klantportaal toont veilige fallback zonder sessie;
- na testlogin wordt alleen eigen klantcontext geladen.

## RLS/Customer-isolation Test

Vereiste scenario's:

1. Anonymous leest `customers`: geblokkeerd.
2. Anonymous leest `websites`: geblokkeerd.
3. No-profile authenticated user leest klantdata: geblokkeerd.
4. Customer A leest eigen `customers`: toegestaan.
5. Customer A leest Customer B: geblokkeerd.
6. Customer A leest eigen website/project: toegestaan.
7. Customer A kan geen uitgesloten finance/CRM/AI-tabellen benaderen via deze minimale livegang.
8. Customer A maakt eigen `change_request`: toegestaan.
9. Customer A spoofed `customer_id`: geblokkeerd.
10. Customer A maakt eigen `client_portal_message`: toegestaan.
11. Customer A spoofed `sender_type` of `auth_user_id`: geblokkeerd.
12. Admin/support leest klantdata volgens rol: toegestaan.
13. Customer kan geen roles, ownership, finance, website of project mutaties uitvoeren.

Alle scenario's moeten PASS zijn voordat productie-auth open mag.

## Wanneer Productie-auth Open Mag

Productie-auth blijft dicht totdat:

- volledige migration-volgorde groen is;
- post-migration schema validatie groen is;
- RLS/customer-isolation test groen is;
- service-role frontend scan groen is;
- Netlify production env vars correct en gescheiden zijn;
- rollbackpad bevestigd blijft;
- release approver expliciet productie-auth GO geeft.

Pas daarna:

- production `CLIENT_PORTAL_AUTH_LIVE` mag worden overwogen;
- eerste echte klant mag worden gekoppeld;
- klantlogin mag publiek worden vrijgegeven.

## Release Approval Checklist

- [ ] Preflight checklist compleet.
- [ ] Backup/snapshot bevestigd.
- [ ] Bestaande production records beoordeeld.
- [ ] Volledige migration-volgorde bevestigd.
- [ ] `006` uitgesloten.
- [ ] `010` t/m `012` uitgesloten of apart approved.
- [ ] Execution window bevestigd.
- [ ] Rollback approver bevestigd.
- [ ] Release approver bevestigd.
- [ ] Post-migration testplan klaar.
- [ ] Productie-auth blijft dicht tot validatie groen is.

## Eindstatus

Deze runbook is bijgewerkt voor de minimale klantportaal-productievolgorde.

- `000_production_existing_tables_alignment.sql` is uitgevoerd en groen gevalideerd.
- `001_client_portal_baseline.sql` is uitgevoerd en groen gevalideerd.
- `002_client_portal_indexes.sql` is uitgevoerd en groen gevalideerd.
- `003_client_portal_rls_enablement.sql` is uitgevoerd en groen gevalideerd.
- `004_client_portal_rls_policies_and_grants.sql` is uitgevoerd en groen gevalideerd.
- `005_client_portal_legacy_policy_cleanup.sql` is uitgevoerd en groen gevalideerd.
- Productie-auth blijft dicht totdat RLS/customer-isolation en frontend rollout groen zijn.

Volgende stap:

```text
Voer RLS/customer-isolation validatie uit met productie-auth nog dicht.
```
