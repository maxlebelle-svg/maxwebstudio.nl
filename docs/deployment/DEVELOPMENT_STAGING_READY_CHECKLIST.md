# Development & Staging Ready Checklist

Status: Fase 28.1 checklist.  
Doel: objectief bepalen of Fase 28 opnieuw mag starten.

## Tooling

- [x] Supabase CLI is aanwezig.
- [x] Supabase CLI versie is genoteerd: `2.108.0`.
- [ ] Supabase CLI staat in de shell `PATH` of wordt bewust via absoluut pad gebruikt.
- [ ] Supabase CLI is gekoppeld aan het test/staging project.
- [ ] Of: psql fallback heeft een test-only database connection string.
- [ ] Git werkt.
- [ ] Node.js werkt.

## Environment

- [ ] `.env.local` bestaat.
- [ ] `.env.local` staat in `.gitignore`.
- [ ] `APP_ENV=test`.
- [ ] `APP_ENVIRONMENT=test`.
- [ ] `SUPABASE_URL` aanwezig.
- [ ] `SUPABASE_ANON_KEY` aanwezig.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` aanwezig.
- [ ] `SUPABASE_PROJECT_ID` aanwezig.
- [ ] Geen secretwaarden staan in docs of git output.

## Staging Project

- [ ] Project is aantoonbaar test/staging.
- [ ] Project is niet productie.
- [ ] Geen echte klantdata aanwezig.
- [ ] Service role key wordt alleen lokaal/server-side gebruikt.

## Migration Drafts

- [ ] `001_schema_tables.sql` gereviewd.
- [ ] `002_indexes.sql` gereviewd.
- [ ] `003_rls_enablement.sql` gereviewd.
- [ ] `004_rls_policies.sql` gereviewd.
- [ ] `005_audit_logging_foundation.sql` gereviewd.
- [ ] `006_seed_demo_data_optional.sql` keuze vastgelegd.

## Execution

- [ ] Execution route gekozen: Supabase CLI, psql of SQL Editor.
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
