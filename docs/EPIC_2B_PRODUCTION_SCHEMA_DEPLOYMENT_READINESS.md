# Epic 2B.3 - Production Schema Deployment Readiness

Status: `CONDITIONAL GO / FULL MIGRATION ORDER ONLY / DIRECT 013 NO-GO`

Doel:

- de productie-uitrol van het klantportaal schema/RLS veilig voorbereiden;
- bevestigen welke Supabase omgeving productie is;
- vastleggen welke migrations later uitgevoerd mogen worden;
- voorkomen dat demo-data, staging-accounts of ongeteste RLS in productie terechtkomen.

## Omgevingen

| Omgeving | Supabase project | Project ref | Status |
| --- | --- | --- | --- |
| Production | `maxwebstudio` | `yxxahurphdbblkuxoeje` | actief, niet gelinkt aan lokale CLI |
| Staging/test | `maxwebstudio-test` | `xlxpuuycigeqhgxqtzni` | actief, gelinkt aan lokale CLI |

Bevinding:

- De lokale CLI-link staat op `maxwebstudio-test`.
- Productie `maxwebstudio` is zichtbaar en gezond, maar niet lokaal gelinkt.
- `.env.local` staat op test/staging en blijft genegeerd.
- Productie-uitvoering vereist een expliciet, tijdelijk production execution moment.

## Preflight Status

| Controle | Status | Bevinding |
| --- | --- | --- |
| Productieproject vastgesteld | PASS | `maxwebstudio`, ref `yxxahurphdbblkuxoeje` |
| Staging gescheiden van productie | PASS | CLI-link staat op `maxwebstudio-test` |
| Lokale env gescheiden van productie | PASS | `.env.local` gebruikt test/staging context |
| Service role niet naar frontend | PASS | `client-auth-config` geeft alleen `SUPABASE_URL` en `SUPABASE_ANON_KEY` terug |
| Migration draft aanwezig | PASS | `supabase/migration-drafts/013_client_portal_schema_rls_alignment.sql` |
| Rollback-notes aanwezig | PASS | `docs/deployment/ROLLBACK_PLAN.md` |
| Demo seed uitgesloten | PASS | `006_seed_demo_data_optional.sql` mag niet op productie |
| Huidige productie-tabellen | PARTIAL PASS | `profiles` en `change_requests` bestaan; klantportaal-basistabellen ontbreken |
| Echte productie-klantdata | CONDITIONAL | `profiles` heeft 1 rij en `change_requests` heeft 2 rijen; bevestig inhoud vóór execution |
| RLS runtime op productie | BLOCKED | pas bewijsbaar na migration execution en isolatietest |
| Productie env vars in hosting | BLOCKED | Netlify production env moet handmatig worden gecontroleerd zonder secrets te tonen |

Conclusie:

- Productie is `CONDITIONAL GO` voor de volledige migration-volgorde.
- Productie is `NO-GO` voor het direct uitvoeren van alleen `013_client_portal_schema_rls_alignment.sql`.
- Reden: migration `013` verwacht bestaande canonical tabellen zoals `customers`, `websites`, `projects`, `client_portal_messages`, `quotes`, `invoices`, `subscriptions` en `client_portal_notifications`.

## Read-only Productie Inspectie

Voer deze inspectie alleen uit met het productieproject `maxwebstudio` en zonder data te wijzigen.

### Projectcontrole

Controleer dat de verbinding naar deze host/ref wijst:

```text
db.yxxahurphdbblkuxoeje.supabase.co
```

Niet naar:

```text
db.xlxpuuycigeqhgxqtzni.supabase.co
```

### Tabellencontrole

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

### Datacounts

```sql
select 'profiles' as table_name, count(*) from public.profiles
union all select 'customers', count(*) from public.customers
union all select 'websites', count(*) from public.websites
union all select 'projects', count(*) from public.projects
union all select 'change_requests', count(*) from public.change_requests
union all select 'client_portal_messages', count(*) from public.client_portal_messages
union all select 'quotes', count(*) from public.quotes
union all select 'invoices', count(*) from public.invoices
union all select 'subscriptions', count(*) from public.subscriptions
union all select 'client_portal_notifications', count(*) from public.client_portal_notifications;
```

Als een tabel nog niet bestaat, noteer dat als `missing`; dat is acceptabel vóór de eerste schema-uitrol.

### Demo/testdata controle

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and column_name in ('is_demo', 'environment', 'source');
```

Als relevante kolommen bestaan, controleer dat productie geen demo/staging records bevat.

## Uitvoeringsvolgorde Voor Conditional GO

Productie mag alleen deze volledige volgorde gebruiken na expliciete approval.

1. `001_schema_tables.sql`
2. `002_indexes.sql`
3. `003_rls_enablement.sql`
4. `004_rls_policies.sql`
5. `005_audit_logging_foundation.sql`
6. `007_runtime_role_grants.sql`
7. `008_change_request_customer_ownership.sql`
8. `009_client_portal_message_customer_ownership.sql`
9. `013_client_portal_schema_rls_alignment.sql`

Niet uitvoeren op productie:

- `006_seed_demo_data_optional.sql`

Nog apart goedkeuren voordat ze op productie mogen:

- `010_project_status_update_grants.sql`
- `011_customer_contact_update_grants.sql`
- `012_website_operational_update_grants.sql`

Reden:

- `010` t/m `012` horen bij operationele admin writes.
- Het klantportaal kan eerst live met Auth, customer context, reads en klantveilige low-risk creates.
- Productie admin-writes krijgen een aparte releasegate.

### Waarom `013` niet standalone mag draaien

De read-only productie-inspectie laat zien:

- `profiles` bestaat al met 1 rij;
- `change_requests` bestaat al met 2 rijen;
- `customers` ontbreekt;
- `websites` ontbreekt;
- `projects` ontbreekt;
- `client_portal_messages` ontbreekt;
- `quotes` ontbreekt;
- `invoices` ontbreekt;
- `subscriptions` ontbreekt;
- `client_portal_notifications` ontbreekt.

Migration `013_client_portal_schema_rls_alignment.sql` begint met `alter table` statements op bestaande tabellen. Daardoor faalt `013` direct wanneer `public.customers` en de andere canonical tabellen nog niet bestaan.

Correcte aanpak:

1. Eerst `001_schema_tables.sql` om ontbrekende canonical tabellen aan te maken.
2. Daarna `002` t/m `009` voor indexes, RLS, policies, audit en ownership hardening.
3. Daarna pas `013` voor klantportaal schema/RLS alignment.

### Niet uitvoeren op productie

Nooit uitvoeren tijdens deze productie-uitrol:

- `006_seed_demo_data_optional.sql`

Reden:

- productie mag geen demo-data, staging-accounts, testklanten of mockrecords bevatten;
- eerste echte klantdata wordt pas na schema/RLS validatie en release approval gekoppeld.

### Eerst controleren op bestaande tabellen/kolommen

Vóór execution moet handmatig bevestigd zijn:

- de ene bestaande `profiles` rij is geen waardevolle klantdata of mag veilig blijven;
- de twee bestaande `change_requests` records zijn geen waardevolle klantdata of zijn compatibel met het canonical schema;
- `profiles` bevat minimaal compatibele kolommen voor `id`, `auth_user_id`, `role`, `status`, `created_at` en `updated_at`;
- `change_requests` bevat compatibele kolommen voor `id`, `customer_id`, `auth_user_id`, `website_id`, `project_id`, `title`, `description`, `priority`, `status`, `created_at` en `updated_at`, of wordt door de volledige migrationvolgorde veilig aangevuld;
- bestaande helper functions hebben geen afwijkende signatures;
- bestaande policies op `profiles` en `change_requests` blokkeren de nieuwe RLS-set niet onverwacht.

## Rollback Stappen

Voor execution:

1. Maak een Supabase backup/snapshot.
2. Bevestig Netlify rollback naar laatste stabiele deploy.
3. Leg commit hash, migrationlijst en execution window vast.
4. Bevestig rollback-approver.

Bij kritieke fout:

1. Stop direct met verdere migrations.
2. Houd productie-auth dicht.
3. Leg fout, stapnummer en context vast.
4. Rollback via Supabase backup/snapshot als data-integriteit geraakt is.
5. Als alleen policies/grants geraakt zijn: herstel policies handmatig na review.
6. Controleer anonymous/customer/admin toegang opnieuw.
7. Heropen productie pas na nieuwe approval.

Nooit automatisch doen:

- echte klantdata verwijderen;
- demo-data seeden;
- RLS versoepelen om een fout te omzeilen;
- service-role keys naar frontend brengen.

## Testplan Na Uitvoering

### Schema

- tabellen bestaan;
- columns uit `013` bestaan;
- foreign keys bestaan;
- indexes bestaan.

### RLS

- RLS staat aan op alle klantportaal-tabellen;
- anonymous wordt geblokkeerd;
- no-profile gebruiker wordt geblokkeerd;
- Customer A ziet Customer B niet;
- customer kan eigen data lezen;
- customer kan alleen eigen `change_requests` aanmaken;
- customer kan alleen eigen `client_portal_messages` aanmaken;
- customer kan geen finance wijzigen;
- staff/admin policies werken alleen voor bevoegde interne rollen.

### Frontend/Auth

- productie-auth blijft dicht totdat schema/RLS groen is;
- service-role wordt niet naar browser gestuurd;
- `client-auth-config` geeft alleen browserveilige config terug;
- directe toegang zonder sessie toont veilige fallback;
- na login wordt alleen eigen klantcontext geladen.

### Data

- geen demo seed in productie;
- geen staging accounts in productie;
- geen placeholder/mock records in productie;
- eerste echte klant wordt pas na release approval gekoppeld.

## Production Go/No-Go

Productie schema execution is `CONDITIONAL GO` voor de volledige migration-volgorde zodra:

- read-only productie-inspectie is uitgevoerd en opgeslagen;
- de 1 `profiles` rij en 2 `change_requests` records inhoudelijk veilig/compatibel zijn verklaard;
- productie env vars in Netlify gescheiden zijn van test;
- backup/snapshot is bevestigd;
- rollback approver is bevestigd;
- expliciete approval voor execution is gegeven.

Direct alleen `013_client_portal_schema_rls_alignment.sql` uitvoeren blijft:

```text
NO-GO
```

Na deze checks kan de status naar:

```text
GO FOR FULL PRODUCTION MIGRATION ORDER
```

## Epic 2B.4 - Production Database Preflight Inspection

Status: `PARTIAL PASS / DB READ BLOCKED / NO SQL EXECUTED`

Doel:

- productieproject `maxwebstudio` read-only inspecteren vóór schema/RLS execution;
- bevestigen dat de CLI niet per ongeluk op productie gelinkt staat;
- bestaande tabellen, policies, RLS en datacounts controleren voordat migrations draaien.

### Uitgevoerde read-only controles

| Controle | Resultaat | Status |
| --- | --- | --- |
| Supabase projecten ophalen | `maxwebstudio` en `maxwebstudio-test` zichtbaar | PASS |
| Productieproject bevestigen | `maxwebstudio`, ref `yxxahurphdbblkuxoeje` | PASS |
| Productie database host bevestigen | `db.yxxahurphdbblkuxoeje.supabase.co` | PASS |
| Staging/testproject bevestigen | `maxwebstudio-test`, ref `xlxpuuycigeqhgxqtzni` | PASS |
| CLI linkstatus controleren | lokale link staat op `maxwebstudio-test` | PASS |
| Productie niet lokaal linken | productie heeft `linked: false` | PASS |
| `.env.local` projectcontext controleren | wijst naar test ref `xlxpuuycigeqhgxqtzni` | PASS |
| Productie DB-tabellen uitlezen | productie DB connection string ontbreekt | BLOCKED |
| Productie RLS/policies uitlezen | productie DB connection string ontbreekt | BLOCKED |
| Productie datacounts uitlezen | productie DB connection string ontbreekt | BLOCKED |
| Echte klantdata hard bevestigen | vereist productie datacounts | BLOCKED |

### Niet uitgevoerd

- Geen SQL uitgevoerd.
- Geen migration apply uitgevoerd.
- Geen productieproject gelinkt.
- Geen deletes.
- Geen demo seed.
- Geen productie-auth opengezet.
- Geen schema of data gewijzigd.

### Waarom de database-inspectie nog blokkeert

De Supabase CLI kan veilig projectmetadata ophalen via de ingelogde account, maar tabellen, policies, RLS en datacounts vereisen een echte databaseverbinding.

De beschikbare lokale configuratie bevat alleen de test/staging projectref:

```text
xlxpuuycigeqhgxqtzni
```

Voor productie-inspectie is een tijdelijke, read-only execution route nodig naar:

```text
yxxahurphdbblkuxoeje
```

Veilige opties:

1. Tijdelijke productie database connection string gebruiken met `supabase db query --db-url`, zonder de projectlink te wijzigen.
2. De read-only SQL uit dit document handmatig draaien in de Supabase SQL Editor van project `maxwebstudio`.
3. Tijdelijk productie linken alleen na expliciete approval, inspectie uitvoeren, en direct terug linken naar `maxwebstudio-test`. Deze optie heeft niet de voorkeur.

### Migration 013 conflict-inschatting

Zonder productie DB-read kan conflictvrij toepassen nog niet hard worden bevestigd.

Wel statisch beoordeeld:

- `013_client_portal_schema_rls_alignment.sql` gebruikt vooral `alter table ... add column if not exists`;
- nieuwe indexes gebruiken `create index if not exists`;
- RLS policies worden via `drop policy if exists` en `create policy` beheerd;
- de migration bevat geen seed-data;
- de migration bevat geen deletes van klantdata;
- de migration wijzigt geen auth users;
- de migration voert geen OpenAI/Mollie/Resend acties uit.

Potentiële conflicten die alleen via DB-read zichtbaar worden:

- bestaande policies met dezelfde of afwijkende namen;
- bestaande kolommen met ander datatype;
- bestaande foreign keys met afwijkende delete/update rules;
- bestaande data die nieuwe constraints blokkeert;
- bestaande RLS helpers met afwijkende implementatie.

### Backup/export advies

Ook als productie volgens verwachting leeg is, blijft vóór execution verplicht:

1. Supabase backup/snapshot bevestigen.
2. Schema-only export of metadata snapshot maken.
3. Datacounts per klantportaal-tabel vastleggen.
4. Rollback approver bevestigen.
5. Production env vars in Netlify controleren zonder secrets te tonen.

### Epic 2B.4 conclusie

Productie is correct geïdentificeerd en de lokale CLI staat veilig op staging/test.

Maar de echte database preflight is nog niet volledig afgerond, omdat er geen productie DB-read route beschikbaar is in deze sessie.

Status blijft:

```text
PRODUCTION SCHEMA EXECUTION: NO-GO
```

Volgende veilige stap:

```text
Epic 2B.5 - Production read-only SQL inspection
```

Daarvoor is expliciet nodig:

- productie DB connection string of Supabase SQL Editor read-only uitvoering;
- geen migration apply;
- alleen select queries voor tabellen, policies, RLS en datacounts.

## Epic 2B.5 - Production Read-only SQL Inspection

Status: `READ COMPLETED BY SQL EDITOR / CONDITIONAL GO / DIRECT 013 NO-GO`

Doel:

- bestaande productie-tabellen read-only uitlezen;
- bestaande kolommen read-only uitlezen;
- bestaande RLS policies read-only uitlezen;
- row counts voor klantportaal-tabellen vastleggen;
- conflicten met `013_client_portal_schema_rls_alignment.sql` beoordelen;
- bepalen of productie leeg/veilig genoeg is voor schema/RLS execution.

### Beschikbare execution routes

Gecontroleerd:

- `.env.local` bevat alleen staging/test Supabase config.
- Er is geen lokale `DATABASE_URL`, `SUPABASE_DB_URL` of `POSTGRES_URL` voor productie.
- De lokale Supabase CLI-link staat nog op `maxwebstudio-test`.
- Productie `maxwebstudio` is bewust niet tijdelijk gelinkt.

Resultaat:

```text
Production read-only SQL inspection is handmatig uitgevoerd via Supabase SQL Editor output.
```

Samenvatting van aangeleverde output:

- `profiles` bestaat met 1 rij;
- `change_requests` bestaat met 2 rijen;
- `customers` ontbreekt;
- `websites` ontbreekt;
- `projects` ontbreekt;
- `client_portal_messages` ontbreekt;
- `quotes` ontbreekt;
- `invoices` ontbreekt;
- `subscriptions` ontbreekt;
- `client_portal_notifications` ontbreekt.

### Read-only SQL voor handmatige inspectie

Voer onderstaande queries alleen uit op Supabase project:

```text
maxwebstudio / yxxahurphdbblkuxoeje
```

Controleer vóór uitvoering dat de SQL Editor niet in project `maxwebstudio-test` staat.

#### 1. Bestaande public tabellen

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
```

#### 2. Bestaande kolommen voor klantportaal-tabellen

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'profiles',
    'customers',
    'websites',
    'projects',
    'change_requests',
    'client_portal_messages',
    'quotes',
    'invoices',
    'subscriptions',
    'client_portal_notifications'
  )
order by table_name, ordinal_position;
```

#### 3. RLS status

```sql
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles',
    'customers',
    'websites',
    'projects',
    'change_requests',
    'client_portal_messages',
    'quotes',
    'invoices',
    'subscriptions',
    'client_portal_notifications'
  )
order by c.relname;
```

#### 4. Policy namen

```sql
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'profiles',
    'customers',
    'websites',
    'projects',
    'change_requests',
    'client_portal_messages',
    'quotes',
    'invoices',
    'subscriptions',
    'client_portal_notifications'
  )
order by tablename, policyname;
```

#### 5. Veilige row counts, ook als tabellen ontbreken

```sql
with target_tables(table_name) as (
  values
    ('profiles'),
    ('customers'),
    ('websites'),
    ('projects'),
    ('change_requests'),
    ('client_portal_messages'),
    ('quotes'),
    ('invoices'),
    ('subscriptions'),
    ('client_portal_notifications')
)
select
  t.table_name,
  case when c.oid is null then false else true end as exists,
  case
    when c.oid is null then null
    else (xpath('/row/cnt/text()', query_to_xml(format('select count(*) as cnt from public.%I', t.table_name), false, true, '')))[1]::text::bigint
  end as row_count
from target_tables t
left join pg_class c
  on c.relname = t.table_name
left join pg_namespace n
  on n.oid = c.relnamespace
 and n.nspname = 'public'
order by t.table_name;
```

#### 6. Helper functions

```sql
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'current_profile_id',
    'current_customer_id',
    'current_app_role',
    'has_app_role',
    'is_admin_role',
    'is_staff_role',
    'owns_customer'
  )
order by p.proname;
```

### Conflictcheck voor migration 013

Migration `013_client_portal_schema_rls_alignment.sql` is pas veilig uitvoerbaar als:

- bestaande kolommen dezelfde of compatibele datatypes hebben;
- bestaande policies geen onverwachte brede customer/admin toegang bevatten;
- RLS niet uit staat op klantportaal-tabellen;
- bestaande data geen nieuwe foreign keys of constraints blokkeert;
- helper functions niet met afwijkende signatures bestaan;
- row counts bevestigen dat er geen onverwachte klantdata aanwezig is.

### Huidige conclusie

| Onderdeel | Status | Resultaat |
| --- | --- | --- |
| Tabelinspectie | PARTIAL PASS | `profiles` en `change_requests` bestaan; portal-tabellen ontbreken |
| Kolominspectie | NEEDS REVIEW | bestaande `profiles` en `change_requests` kolommen moeten compatibel zijn |
| RLS/policy inspectie | NEEDS REVIEW | policy/function output moet geen afwijkende helpers tonen |
| Row counts | PASS WITH CAUTION | `profiles`: 1, `change_requests`: 2, overige portal-tabellen ontbreken |
| Klantdata aanwezig ja/nee | NEEDS CONFIRMATION | bestaande 3 records inhoudelijk bevestigen vóór execution |
| Migration 013 conflictvrij | NO-GO standalone | `013` kan niet direct draaien omdat basistabellen ontbreken |

Productie schema/RLS execution blijft:

```text
CONDITIONAL GO FOR FULL MIGRATION ORDER
```

Direct alleen `013` blijft:

```text
NO-GO
```

Volgende stap:

- backup/snapshot bevestigen;
- inhoud van bestaande `profiles` en `change_requests` records veilig/compatibel verklaren;
- volledige migration-volgorde uitvoeren, niet alleen `013`;
- daarna RLS/customer-isolation testplan uitvoeren.

## Backup/Snapshot Checklist Vóór Execution

Vóór productie-SQL:

- [ ] Supabase project `maxwebstudio` geopend, niet `maxwebstudio-test`.
- [ ] Project ref `yxxahurphdbblkuxoeje` bevestigd.
- [ ] Supabase backup/snapshot bevestigd.
- [ ] Schema-only export of metadata snapshot opgeslagen.
- [ ] Row counts vóór execution vastgelegd.
- [ ] Inhoud van 1 `profiles` record beoordeeld.
- [ ] Inhoud van 2 `change_requests` records beoordeeld.
- [ ] Rollback-approver bevestigd.
- [ ] Netlify production env vars gecontroleerd zonder secrets te tonen.
- [ ] Productie-auth blijft dicht.
- [ ] Demo seed expliciet uitgesloten.

## Post-migration RLS/Customer-isolation Testplan

Na volledige migration-volgorde:

1. Controleer dat alle klantportaal-tabellen bestaan.
2. Controleer dat RLS aan staat op alle klantportaal-tabellen.
3. Controleer dat anonymous geen klantdata kan lezen.
4. Controleer dat een user zonder profile geen klantdata kan lezen.
5. Controleer Customer A/B isolatie.
6. Controleer dat customer alleen eigen `customers`, `websites`, `projects`, `quotes`, `invoices`, `subscriptions`, `change_requests`, `client_portal_messages` en `client_portal_notifications` kan lezen.
7. Controleer dat customer alleen eigen `change_requests` kan aanmaken.
8. Controleer dat customer alleen eigen `client_portal_messages` kan aanmaken.
9. Controleer dat customer geen finance, ownership, roles, websites of projects kan wijzigen.
10. Controleer dat staff/admin policies alleen werken voor bevoegde interne rollen.
11. Controleer dat service-role niet naar frontend wordt gelekt.
12. Houd productie-auth dicht totdat bovenstaande checks groen zijn.
