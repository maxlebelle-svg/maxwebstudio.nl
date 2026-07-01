# Epic 2B.6 - Production Migration Runbook

Status: `RUNBOOK READY / NO SQL EXECUTED`

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
- `customers`, `websites`, `projects`, `client_portal_messages`, `quotes`, `invoices`, `subscriptions` en `client_portal_notifications` ontbreken;
- productie is `CONDITIONAL GO` voor de volledige migration-volgorde;
- productie is `NO-GO` voor alleen `013_client_portal_schema_rls_alignment.sql`.
- productie is `NO-GO` voor direct `001_schema_tables.sql` zolang oudere `profiles` en `change_requests` niet eerst zijn uitgelijnd.

## Releasebesluit

Deze runbook mag pas worden uitgevoerd na expliciete approval.

Toegestaan na approval:

- volledige migration-volgorde uit dit document;
- read-only validatiequeries;
- rollback volgens dit document indien nodig.

Niet toegestaan:

- alleen `013` direct uitvoeren;
- `001_schema_tables.sql` direct uitvoeren zonder `000_production_existing_tables_alignment.sql`;
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
supabase/migration-drafts/001_schema_tables.sql
```

Doel:

- ontbrekende canonical tabellen aanmaken;
- bestaande `profiles` en `change_requests` ongemoeid laten waar ze al bestaan;
- basisconstraints en timestamps voorbereiden.

Controle na stap:

- `customers` bestaat;
- `websites` bestaat;
- `projects` bestaat;
- `quotes` bestaat;
- `invoices` bestaat;
- `subscriptions` bestaat;
- `client_portal_messages` bestaat;
- `client_portal_notifications` bestaat;
- `profiles` bestaat nog;
- `change_requests` bestaat nog.

Rollback:

- Bij fout vóór commit: transactie faalt en wordt niet toegepast.
- Bij fout na gedeeltelijke toepassing: stop, gebruik Supabase backup/snapshot; verwijder geen data handmatig.

### Stap 3

Bestand:

```text
supabase/migration-drafts/002_indexes.sql
```

Doel:

- indexes voor performance, joins en RLS-readiness.

Controle na stap:

- indexes bestaan zonder fout;
- geen indexfouten op ontbrekende kolommen.

Rollback:

- Bij indexfout stoppen en blocker documenteren.
- Geen handmatige schema-patches zonder review.

### Stap 4

Bestand:

```text
supabase/migration-drafts/003_rls_enablement.sql
```

Doel:

- RLS aanzetten op canonical tabellen.

Controle na stap:

- RLS staat aan op alle klantportaal-tabellen.

Rollback:

- Bij fout stoppen.
- Productie-auth blijft dicht.
- Herstel via backup/snapshot of expliciet reviewed RLS rollback.

### Stap 5

Bestand:

```text
supabase/migration-drafts/004_rls_policies.sql
```

Doel:

- basis RLS helper functions en policies plaatsen.

Controle na stap:

- helper functions bestaan;
- policies bestaan;
- anonymous toegang is niet per ongeluk open.

Rollback:

- Bij policyfout stoppen.
- Geen policy versoepelen als snelle fix.

### Stap 6

Bestand:

```text
supabase/migration-drafts/005_audit_logging_foundation.sql
```

Doel:

- audit logging foundation voorbereiden.

Controle na stap:

- audit foundation objecten bestaan;
- geen secrets of gevoelige payloads verplicht gemaakt.

Rollback:

- Bij fout stoppen en audit foundation opnieuw reviewen.

### Stap 7

Bestand:

```text
supabase/migration-drafts/007_runtime_role_grants.sql
```

Doel:

- minimale runtime grants zodat RLS policies geëvalueerd kunnen worden.

Controle na stap:

- `authenticated` heeft minimale tabelrechten;
- RLS blijft leidend;
- grants maken geen brede data-openstelling.

Rollback:

- Bij te brede grant: stop, revoke na review of restore snapshot.

### Stap 8

Bestand:

```text
supabase/migration-drafts/008_change_request_customer_ownership.sql
```

Doel:

- change request ownership/customer spoofing fix toepassen.

Controle na stap:

- customer kan alleen eigen wijzigingsverzoeken aanmaken/lezen;
- spoofing van `customer_id` wordt geblokkeerd.

Rollback:

- Bij ownershipfout productie-auth dicht houden en policy herstellen via review.

### Stap 9

Bestand:

```text
supabase/migration-drafts/009_client_portal_message_customer_ownership.sql
```

Doel:

- client portal message ownership/customer spoofing fix toepassen.

Controle na stap:

- customer kan alleen eigen berichten aanmaken/lezen;
- sender/customer spoofing wordt geblokkeerd.

Rollback:

- Bij ownershipfout productie-auth dicht houden en policy herstellen via review.

### Stap 10

Bestand:

```text
supabase/migration-drafts/013_client_portal_schema_rls_alignment.sql
```

Doel:

- klantportaal schema/RLS alignment afronden;
- portalvelden toevoegen;
- strictere customer-facing policies plaatsen;
- klantportaal read/write basis klaarmaken.

Controle na stap:

- `profiles.customer_id` bestaat;
- `customers.internal_notes` bestaat;
- website portalvelden bestaan;
- project notes velden bestaan;
- `change_requests.type` bestaat;
- `client_portal_messages.auth_user_id` bestaat;
- notificatie CTA/related velden bestaan;
- policies uit `013` bestaan;
- helper functions bestaan;
- runtime grants zijn aanwezig.

Rollback:

- Bij fout direct stoppen.
- Productie-auth dicht houden.
- Restore backup/snapshot als schema-consistentie geraakt is.
- Alleen policy rollback uitvoeren na review.

## Niet Uitvoeren

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
7. Customer A leest finance van Customer B: geblokkeerd.
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

Deze runbook is klaar voor review.

Er is nog niets uitgevoerd.

Volgende stap:

```text
Epic 2B.7 - Production migration execution approval
```
