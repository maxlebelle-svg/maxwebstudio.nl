# Development Environment & Staging Readiness

Status: Fase 28.1 release-engineering plan.  
Doel: de lokale ontwikkelomgeving gereedmaken voor veilige, reproduceerbare Supabase Staging Execution.

Dit document voert geen SQL uit, draait geen Supabase CLI, wijzigt geen staging of productie en bevat geen secrets.

## Uitkomst

Huidige status: `NOT_READY`

Reden:

- Supabase CLI is geinstalleerd, maar staat niet in de shell `PATH` die Codex gebruikt.
- Supabase CLI versie is bevestigd via absoluut pad: `2.108.0`.
- De CLI probeerde telemetry naar `~/.supabase` te schrijven; dat valt buiten de toegestane workspace. De versiecheck werkt met tijdelijke `HOME=/private/tmp`.
- De CLI is nog niet aantoonbaar gekoppeld aan uitsluitend het test/staging project.
- Er is geen test-only PostgreSQL connection string aanwezig.
- Migration drafts kunnen daardoor nog niet veilig en reproduceerbaar vanuit deze werkomgeving worden uitgevoerd.

## Huidige Tooling

| Tool | Status | Gebruik |
| --- | --- | --- |
| Git | Aanwezig | Versiebeheer en release evidence |
| Node.js | Aanwezig | Syntaxchecks, JSON parsechecks, readiness scripts |
| npm | Aanwezig | Project tooling indien nodig |
| psql | Aanwezig | Fallback voor SQL execution, maar alleen met test-only DB connection string |
| Supabase CLI | Aanwezig, niet volledig bruikbaar | Versie `2.108.0`; niet in Codex PATH; projectlink nog niet bewezen |
| Netlify CLI | Ontbreekt | Niet nodig voor SQL execution, later nuttig voor function runtime tests |

## Benodigde `.env.local` Variabelen

Waarden mogen nooit in documentatie of logs worden gezet.

### Verplicht Voor Staging Preflight

- `APP_ENV`
- `APP_ENVIRONMENT`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_ID`

Verwachte waarden/context:

- `APP_ENV=test`
- `APP_ENVIRONMENT=test`
- Supabase keys moeten naar het aparte test/staging project wijzen.

### Verplicht Voor psql Fallback

Een van:

- `SUPABASE_DB_URL`
- `DATABASE_URL`
- `POSTGRES_URL`

Voorwaarde:

- de connection string moet uitsluitend naar het Supabase test/staging project wijzen;
- nooit naar productie;
- nooit committen;
- nooit tonen in logs.

### Optioneel Voor Later

- `NETLIFY_AUTH_TOKEN`
- `NETLIFY_SITE_ID`
- `MOLLIE_TEST_API_KEY`
- `RESEND_API_KEY`

Deze zijn niet nodig voor migration execution en mogen geen blocker zijn voor Fase 28, tenzij de scope wordt uitgebreid naar function/runtime/integration tests.

## Voorkeursroute: Supabase CLI

Gebruik de Supabase CLI als primaire route zodra deze beschikbaar is.

Waarom:

- herhaalbaar;
- beter passend bij Supabase workflows;
- minder handmatige copy-paste;
- eenvoudiger te documenteren;
- beter geschikt voor toekomstige staging/production releaseprocessen.

Voorwaarden:

1. Supabase CLI is geinstalleerd.
2. CLI is gekoppeld aan uitsluitend het test/staging project.
3. Project-ID is aantoonbaar niet productie.
4. Migration drafts zijn gereviewd.
5. Rollbackprocedure is gelezen.
6. `TEST_RESULTS.md` is klaar voor evidence.

## Fallbackroute: psql Met Test-Only Connection String

Gebruik psql alleen wanneer Supabase CLI niet beschikbaar of niet geschikt is.

Voorwaarden:

1. `SUPABASE_DB_URL`, `DATABASE_URL` of `POSTGRES_URL` is aanwezig in `.env.local`.
2. De connection string wijst aantoonbaar naar test/staging.
3. De connection string wordt niet getoond, gelogd of gecommit.
4. Elk SQL-bestand wordt afzonderlijk uitgevoerd.
5. Na elke stap wordt evidence vastgelegd.

## Derde Route: Supabase SQL Editor

Gebruik de SQL Editor alleen wanneer CLI en psql niet beschikbaar zijn.

Nadelen:

- minder reproduceerbaar;
- meer handmatig;
- meer kans op copy-paste fouten;
- evidence moet handmatig worden vastgelegd.

Minimale eisen:

- per SQL-bestand uitvoeren;
- geen meerdere fases tegelijk plakken;
- na elke stap resultaat vastleggen;
- screenshots/queryoutput als evidence bewaren;
- stop direct bij fout.

## Migration Execution Volgorde

Voer exact deze volgorde aan:

1. `supabase/migration-drafts/001_schema_tables.sql`
2. `supabase/migration-drafts/002_indexes.sql`
3. `supabase/migration-drafts/003_rls_enablement.sql`
4. `supabase/migration-drafts/004_rls_policies.sql`
5. `supabase/migration-drafts/005_audit_logging_foundation.sql`
6. `supabase/migration-drafts/006_seed_demo_data_optional.sql` alleen bij expliciete test/demo keuze

Stop direct bij:

- SQL syntax error;
- FK/constraint error;
- ontbrekende tabel;
- RLS-recursie;
- permission error;
- onverwachte legacy `customer_*` structuur;
- bewijs dat de omgeving productie is.

## Rollback En Reset

Omdat Fase 28 alleen staging/test mag raken:

1. Stop bij eerste kritieke fout.
2. Leg fout, SQL-stap en context vast in `TEST_RESULTS.md`.
3. Reset testdatabase, herstel snapshot of maak nieuwe testbranch.
4. Corrigeer migration draft in Git in een aparte fixfase.
5. Herhaal vanaf stap 1.

Geen rollback SQL schrijven zonder aparte review.

## Evidence Proces

Leg per stap vast:

- datum;
- tester;
- gekozen execution route;
- niet-geheime projectreferentie;
- SQL-bestand;
- verwacht resultaat;
- werkelijk resultaat;
- status: `PASS`, `FAIL`, `BLOCKED` of `NOT_APPLICABLE`;
- foutmelding zonder secrets;
- vervolgactie.

Bewaar in:

- `docs/deployment/TEST_RESULTS.md`
- `docs/deployment/DEPLOYMENT_BLOCKERS.md`
- nieuwe release decision markdown/json wanneer nodig

## Ready Checklist

Fase 28 mag opnieuw starten wanneer:

- [ ] Supabase CLI aanwezig en gekoppeld aan test/staging, of psql fallback met test-only DB URL aanwezig.
- [ ] `.env.local` bevat alle verplichte testvariabelen.
- [ ] `.env.local` wordt door Git genegeerd.
- [ ] Project-ID/URL is bevestigd als test/staging.
- [ ] Migration drafts zijn gereviewd.
- [ ] Rollbackprocedure is gelezen.
- [ ] `TEST_RESULTS.md` is klaar voor stap-voor-stap evidence.
- [ ] Er is besloten of demo seed wel/niet wordt uitgevoerd.
- [ ] Er is een stop/rollback-afspraak bij kritieke fout.

## Ready/Not Ready Besluit

Huidige status: `NOT_READY`

Verbeterd:

- Supabase CLI is lokaal aanwezig.
- Versie `2.108.0` is bevestigd.

Ontbreekt nog:

- Supabase CLI moet bruikbaar zijn in de Codex shell via `PATH` of expliciet absoluut pad.
- Supabase CLI moet veilig gekoppeld zijn aan uitsluitend het test/staging project, of een test-only database connection string moet beschikbaar zijn voor psql fallback.
- Telemetry/config writes moeten binnen toegestane lokale omgeving kunnen plaatsvinden of bewust via tijdelijke HOME worden uitgevoerd.

Aanbevolen volgende actie:

Maak de CLI bruikbaar voor de execution-shell en bevestig de staging projectkoppeling zonder SQL uit te voeren. Gebruik psql alleen als fallback wanneer een test-only database connection string veilig beschikbaar is.
