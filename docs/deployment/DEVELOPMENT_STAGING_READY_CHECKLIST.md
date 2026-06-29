# Development & Staging Ready Checklist

Status: Fase 28.1 checklist.  
Doel: objectief bepalen of Fase 28 opnieuw mag starten.

## Tooling

- [x] Supabase CLI is aanwezig.
- [x] Supabase CLI versie is genoteerd: `2.108.0`.
- [x] Supabase CLI staat in de shell `PATH` of wordt bewust via absoluut pad gebruikt: `/opt/homebrew/bin/supabase`.
- [x] Supabase CLI is gekoppeld aan het test/staging project `maxwebstudio-test`.
- [ ] Of: psql fallback heeft een test-only database connection string.
- [x] Git werkt.
- [x] Node.js werkt.

## Environment

- [x] `.env.local` bestaat.
- [x] `.env.local` staat in `.gitignore`.
- [x] `APP_ENV=test`.
- [x] `APP_ENVIRONMENT=test`.
- [x] `SUPABASE_URL` aanwezig.
- [x] `SUPABASE_ANON_KEY` aanwezig.
- [x] `SUPABASE_SERVICE_ROLE_KEY` aanwezig.
- [x] `SUPABASE_PROJECT_ID` aanwezig.
- [x] Geen secretwaarden staan in docs of git output.

## Staging Project

- [x] Project is aantoonbaar test/staging: `maxwebstudio-test`.
- [x] Project is niet productie.
- [ ] Geen echte klantdata aanwezig.
- [x] Service role key wordt alleen lokaal/server-side gebruikt.

## Migration Drafts

- [ ] `001_schema_tables.sql` gereviewd.
- [ ] `002_indexes.sql` gereviewd.
- [ ] `003_rls_enablement.sql` gereviewd.
- [ ] `004_rls_policies.sql` gereviewd.
- [ ] `005_audit_logging_foundation.sql` gereviewd.
- [ ] `006_seed_demo_data_optional.sql` keuze vastgelegd.

## Execution

- [x] Execution route gekozen: Supabase CLI via `/opt/homebrew/bin/supabase`.
- [ ] SQL wordt per bestand uitgevoerd.
- [ ] Stopcondities zijn bekend.
- [ ] Rollback/reset route is bekend.
- [ ] Tester/reviewer is bekend.

## Evidence

- [ ] `TEST_RESULTS.md` wordt per stap bijgewerkt.
- [ ] `DEPLOYMENT_BLOCKERS.md` wordt bijgewerkt.
- [ ] Release decision markdown/json wordt bijgewerkt.
- [ ] Customer A/B isolation evidence wordt toegevoegd.
- [ ] Demo user evidence wordt toegevoegd.
- [ ] Audit/security evidence wordt toegevoegd.

## Ready Status

Fase 28 mag pas opnieuw starten als alle verplichte items hierboven zijn afgevinkt of expliciet `NOT_APPLICABLE` zijn gemaakt met reden.
