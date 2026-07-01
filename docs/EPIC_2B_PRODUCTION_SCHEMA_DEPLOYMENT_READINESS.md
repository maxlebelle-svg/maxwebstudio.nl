# Epic 2B.3 - Production Schema Deployment Readiness

Status: `PREFLIGHT PREPARED / PRODUCTION EXECUTION NO-GO UNTIL FINAL DB READ`

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
| Huidige productie-tabellen | BLOCKED | vereist read-only productie database inspectie |
| Echte productie-klantdata | BLOCKED | gebruiker geeft aan dat er geen klantdata is, maar dit moet read-only worden bevestigd |
| RLS runtime op productie | BLOCKED | pas bewijsbaar na migration execution en isolatietest |
| Productie env vars in hosting | BLOCKED | Netlify production env moet handmatig worden gecontroleerd zonder secrets te tonen |

Conclusie:

- De deployment is voorbereid, maar productie blijft `NO-GO`.
- De volgende stap is een read-only productie-inspectie van tabellen en datacounts.
- Pas na expliciete bevestiging dat productie leeg/veilig is mag SQL worden uitgevoerd.

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

## Uitvoeringsvolgorde Als Preflight Groen Wordt

Productie mag alleen deze volgorde gebruiken na expliciete approval.

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

Productie schema execution blijft `NO-GO` totdat:

- read-only productie-inspectie is uitgevoerd;
- productie datacounts veilig/leeg zijn bevestigd;
- productie env vars in Netlify gescheiden zijn van test;
- backup/snapshot is bevestigd;
- rollback approver is bevestigd;
- expliciete approval voor execution is gegeven.

Na deze checks kan de status naar `GO FOR PRODUCTION SCHEMA EXECUTION`.
