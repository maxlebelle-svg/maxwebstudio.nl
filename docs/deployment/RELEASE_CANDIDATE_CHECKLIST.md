# Release Candidate Approval Pack

Status: `NO-GO / AWAITING MANUAL APPROVAL`

Deze checklist bereidt de release candidate voor. Dit document voert niets uit, deployt niets en wijzigt geen productie.

## Doel

Alle resterende NO-GO punten omzetten naar concrete approval/evidence-items zodat daarna pas een expliciet GO/NO-GO releasebesluit genomen kan worden.

## Niet Doen In Deze Fase

- Geen productie deploy.
- Geen productie database wijzigen.
- Geen nieuwe features bouwen.
- Geen echte klantdata gebruiken.
- Geen secrets in documentatie zetten.
- Geen approvals namens de eigenaar invullen.

## Finale Release Candidate Checklist

| Onderdeel | Benodigde evidence | Status | Eigenaar/Reviewer | Notities |
| --- | --- | --- | --- | --- |
| Backup | Backupnaam, datum, locatie en verificatie-notitie | pending | eigenaar/technisch verantwoordelijke | Vereist voor `backup_confirmed` |
| Test/prod env-var scheiding | Checklist met bevestiging dat test en productie aparte projecten/keys gebruiken | in_review | eigenaar/technisch verantwoordelijke | Waarden nooit noteren |
| Auth approval | Review van Auth A/B testresultaten | in_review | technisch verantwoordelijke | Evidence run `phase-14-4b-final-1782737698429` |
| RLS approval | Review van RLS policies en testresultaten | in_review | technisch verantwoordelijke | Geen recursie meer; A/B-isolatie PASS |
| Customer isolation approval | Handmatige review van A/B-isolatie | in_review | eigenaar/technisch verantwoordelijke | Cross-customer reads geven 0 rijen |
| Storage review | Review private bucket, signed URL flow en public-blocking | in_review | technisch verantwoordelijke | Bucket `maxwebstudio-test-evidence` PASS in test |
| Rollback approval | Expliciete goedkeuring rollbackprocedure | pending | eigenaar | Zie `ROLLBACK_PLAN.md` |
| Legacy `customer_*` mitigatie | Bevestiging canonical architectuur blijft leidend | in_review | technisch verantwoordelijke | Geen legacy grants in nieuwe patches |
| Mollie readiness | Testmodus evidence of bewuste not-applicable voor RC | pending | eigenaar/technisch verantwoordelijke | Geen live betaling in deze fase |
| Resend readiness | Testmail evidence of bewuste not-applicable voor RC | pending | eigenaar/technisch verantwoordelijke | Geen secrets in docs |
| Netlify Functions runtime | Testcalls in testcontext of bewuste not-applicable voor RC | pending | technisch verantwoordelijke | Syntax is PASS; runtime nog los bevestigen |

## Ontbrekende Approvals

| Blocker | Huidige status | Nodig voor approval |
| --- | --- | --- |
| `backup_confirmed` | pending | Backupbestand/locatie/datum + verificatie door eigenaar |
| `env_vars_verified` | in_review | Handmatige bevestiging test/prod scheiding zonder waarden te noteren |
| `auth_test_completed` | in_review | Review en approval van Auth PASS evidence |
| `rls_review_approved` | pending | Review van RLS SQL, service grants en recursiepatch |
| `rls_test_log_completed` | in_review | Review en approval van RLS PASS evidence |
| `customer_isolation_test_completed` | in_review | Review en approval van A/B-isolatie evidence |
| `rollback_plan_approved` | pending | Expliciete owner approval op rollbackprocedure |
| `legacy_customer_tables_mitigated` | in_review | Bevestiging dat canonical tabellen leidend blijven |

## Backup Evidence Nodig

Leg alleen metadata vast, nooit secrets of klantinhoud:

- Backupnaam.
- Backupdate.
- Backuplocatie of Supabase backup reference.
- Wie heeft de backup gecontroleerd.
- Korte restore/rollback-notitie.
- Laatste stabiele Git commit.
- Laatste stabiele Netlify deploy.

## Environment Variables Bevestiging

Bevestig per omgeving alleen status, nooit waarden.

### Test

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_ID`
- `APP_ENV=test`
- `APP_ENVIRONMENT=test`

### Productie

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_ID`
- `ADMIN_TOKEN`
- `SITE_URL`
- `APP_ENVIRONMENT=production`
- `DATA_PROVIDER_MODE`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_EMAIL`
- `MOLLIE_API_KEY`

## Rollback Approval

Voor approval moet expliciet worden vastgelegd:

- Approved by.
- Datum.
- Welke rollbackroute geldt voor frontend.
- Welke rollbackroute geldt voor database.
- Welke webhook/integratie-acties handmatig gepauzeerd worden bij incident.
- Welke communicatie naar klanten nodig is bij datatoegang-incident.

## Storage Review

Te reviewen:

- Buckets blijven private.
- Downloads verlopen via signed URLs of server-side functions.
- Geen publieke factuur- of klantbestandlinks.
- Service role blijft server-side.
- Klant A/B storage-isolatie moet voor productie nog op de definitieve bucketstructuur worden bevestigd.

## Final Release Decision Regels

Release mag pas naar `GO` wanneer:

- Iedere blocker `approved` of `not_applicable` is.
- Backup-evidence is ingevuld.
- Rollbackplan is approved.
- Test/prod env-var scheiding is bevestigd.
- RLS/customer-isolation evidence is handmatig approved.
- Storage review is approved of bewust buiten scope gezet.
- Er geen open `FAIL` is in `TEST_RESULTS.md`.

Tot die tijd blijft de status:

- `NO-GO / AWAITING MANUAL APPROVAL`
