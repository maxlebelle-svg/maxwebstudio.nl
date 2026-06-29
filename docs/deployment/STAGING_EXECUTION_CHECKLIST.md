# Staging Execution Checklist

Status: Fase 25 checklist. Geen SQL uitvoeren vanuit dit document.

## Preflight

- [ ] Apart Supabase testproject bevestigd.
- [ ] Project wijst niet naar productie.
- [ ] `APP_ENV=test`.
- [ ] `APP_ENVIRONMENT=test`.
- [ ] Geen echte klantdata aanwezig.
- [ ] Service role key alleen server-side/setup.
- [ ] Migration drafts gereviewd.
- [ ] Rollbackprocedure gelezen.
- [ ] Reviewer/approver vastgelegd.

## SQL Draft Execution

- [ ] `001_schema_tables.sql` uitgevoerd in test.
- [ ] Tabellen bestaan.
- [ ] Legacy `customer_*` tabellen niet aangemaakt.
- [ ] `002_indexes.sql` uitgevoerd in test.
- [ ] Indexes bestaan.
- [ ] `003_rls_enablement.sql` uitgevoerd in test.
- [ ] RLS staat aan.
- [ ] `004_rls_policies.sql` uitgevoerd in test.
- [ ] Policies bestaan.
- [ ] Geen RLS-recursie.
- [ ] `005_audit_logging_foundation.sql` uitgevoerd in test.
- [ ] Audit helper gecontroleerd.
- [ ] `006_seed_demo_data_optional.sql` alleen uitgevoerd indien test/demo expliciet gekozen is.

## Rollen En Isolatie

- [ ] Admin ziet noodzakelijke beheerdata.
- [ ] Sales ziet lead/salesdata en geen security/developer acties.
- [ ] Support ziet supportdata en geen betaalmutaties.
- [ ] Developer ziet technische data en geen payment writes.
- [ ] Customer A ziet eigen data.
- [ ] Customer A ziet geen Customer B data.
- [ ] Customer B ziet eigen data.
- [ ] Demo user ziet alleen demo data.
- [ ] Anonymous ziet geen klantdata.

## Modulechecks

- [ ] Leadfinder data blijft intern.
- [ ] AI Website Wizard drafts blijven intern.
- [ ] AI Admin Assistant drafts blijven intern.
- [ ] Client portal messages zijn klant-geisoleerd.
- [ ] Client portal notifications zijn klant-geisoleerd.
- [ ] Files vereisen klantownership en later signed URL.
- [ ] Change requests zijn klant/auth gekoppeld.
- [ ] Quote lines erven quote access.
- [ ] Invoice lines erven invoice access.

## Audit/Security

- [ ] Audit logs niet zichtbaar voor customer.
- [ ] Audit logs bevatten geen secrets.
- [ ] Geen signed URLs in audit metadata.
- [ ] Geen reset tokens in audit metadata.
- [ ] Geen volledige payment provider payloads in audit metadata.
- [ ] Geen service role in frontend.

## Evidence

- [ ] `TEST_RESULTS.md` bijgewerkt.
- [ ] Deployment blockers bijgewerkt.
- [ ] Release decision bijgewerkt.
- [ ] Customer isolation evidence toegevoegd.
- [ ] Reviewer/approver toegevoegd.

