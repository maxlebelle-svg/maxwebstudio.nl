# Test Results Registry

Statusopties:

- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT_APPLICABLE`

Laatste QA-run: 2026-06-29
Tester: Codex
Scope: Fase 14.3 Complete Test Execution, lokale release/QA-rooktest zonder productie, zonder SQL en zonder live Supabase/Auth/RLS.

## Samenvatting

| Onderdeel | Status | Datum | Tester | Evidence / link | Opmerkingen |
| --- | --- | --- | --- | --- | --- |
| CRM / klanten | PASS | 2026-06-29 | Codex | Lokale repository rooktest: `listLocalCustomers`, `canWriteCustomer` | localStorage-flow werkt; live Supabase write blijft buiten scope |
| Websites | PASS | 2026-06-29 | Codex | Lokale repository rooktest: `listLocalWebsites`, `canWriteWebsite` | localStorage-flow werkt |
| Projecten | PASS | 2026-06-29 | Codex | Lokale repository rooktest: `listLocalProjects`, `canWriteProject` | localStorage-flow werkt |
| Bestanden | PASS | 2026-06-29 | Codex | Klantportaal payload bevat gekoppeld bestand zonder interne notities | echte upload/storage blijft blocked tot Storage-test |
| Offertes | PASS | 2026-06-29 | Codex | Lokale repository rooktest: `listLocalQuotes`, `canWriteQuote` | localStorage-flow werkt |
| Facturen | PASS | 2026-06-29 | Codex | Lokale repository rooktest: `listLocalInvoices`, `canWriteInvoice` | localStorage-flow werkt |
| Abonnementen | PASS | 2026-06-29 | Codex | Lokale repository rooktest: `listLocalSubscriptions`, `canWriteSubscription` | localStorage-flow werkt |
| Klantportaal | PASS | 2026-06-29 | Codex | `runClientPortalDataTest`, sensitiveFields=0 | klantveilige payload valideert lokaal |
| Route guards | PASS | 2026-06-29 | Codex | `getRouteAccessReadiness`, status soft actief, 7 routes | hard route guards blijven blocked tot live Auth/RLS |
| Deployment readiness | PASS | 2026-06-29 | Codex | `getTestEnvironmentStatus`, status NOT READY, GO/NO-GO BLOCKED | Verwacht resultaat: eerlijk NO-GO |
| Security readiness | PASS | 2026-06-29 | Codex | `getSecurityReadinessSummary`, liveSafe=false, decision=No-Go | Verwacht resultaat: niet live |
| Release decision export | PASS | 2026-06-29 | Codex | `exportReleaseDecisionJson`, `getReleaseDecisionMarkdown` | JSON en Markdown genereren lokaal |
| Schema | BLOCKED | 2026-06-29 | Codex | Geen SQL uitgevoerd | Vereist echte Supabase testomgeving |
| Auth | BLOCKED | 2026-06-29 | Codex | Geen Supabase Auth live/testproject geactiveerd | Vereist testusers/profiles in Supabase testomgeving |
| RLS | BLOCKED | 2026-06-29 | Codex | Geen RLS SQL uitgevoerd | Vereist testproject en handmatige RLS-test |
| Storage | BLOCKED | 2026-06-29 | Codex | Geen bucket aangemaakt of getest | Vereist private bucket test |
| Functions | PASS | 2026-06-29 | Codex | `node --check functions/*.js`, 24 files checked | Alleen syntax/readiness; runtime env test blijft blocked |
| Mollie | BLOCKED | 2026-06-29 | Codex | Mollie functions syntax OK via functions check | Echte testmodus/webhook niet uitgevoerd |
| Resend | BLOCKED | 2026-06-29 | Codex | Resend functions syntax OK via functions check | Echte mailtest/env test niet uitgevoerd |
| Go/No-Go | BLOCKED | 2026-06-29 | Codex | Deployment blockers missen echte evidence/approvals | Status blijft terecht NO-GO |

## Fase 14.3 lokale rooktest

Uitgevoerd zonder productie, zonder SQL en zonder live Supabase.

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| CRM customers local list | Mock `maxwebstudioCrmCustomers` vullen en `listLocalCustomers()` uitvoeren | QA klant wordt gevonden | `qa-customer-1` gevonden | PASS | localStorage repository leest klantdata |
| CRM customer local write guard | `canWriteCustomer(customer, { target: "local" })` | Local write toegestaan | allowed=true | PASS | Supabase write niet geraakt |
| Websites local list | Mock `maxwebstudioManagedSites` vullen en `listLocalWebsites()` uitvoeren | QA website wordt gevonden | `qa-site-1` gevonden | PASS | localStorage repository leest website |
| Websites local write guard | `canWriteWebsite(website, { target: "local" })` | Local write toegestaan | allowed=true | PASS | Supabase write niet geraakt |
| Projects local list | Mock `maxwebstudioProjects` vullen en `listLocalProjects()` uitvoeren | QA project wordt gevonden | `qa-project-1` gevonden | PASS | localStorage repository leest project |
| Projects local write guard | `canWriteProject(project, { target: "local" })` | Local write toegestaan | allowed=true | PASS | Supabase write niet geraakt |
| Quotes local list | Mock `maxwebstudioQuotes` vullen en `listLocalQuotes()` uitvoeren | QA offerte wordt gevonden | `qa-quote-1` gevonden | PASS | localStorage repository leest offerte |
| Quotes local write guard | `canWriteQuote(quote, { target: "local" })` | Local write toegestaan | allowed=true | PASS | Supabase write niet geraakt |
| Invoices local list | Mock `maxwebstudioInvoices` vullen en `listLocalInvoices()` uitvoeren | QA factuur wordt gevonden | `qa-invoice-1` gevonden | PASS | localStorage repository leest factuur |
| Invoices local write guard | `canWriteInvoice(invoice, { target: "local" })` | Local write toegestaan | allowed=true | PASS | Supabase write niet geraakt |
| Subscriptions local list | Mock `maxwebstudioSubscriptions` vullen en `listLocalSubscriptions()` uitvoeren | QA abonnement wordt gevonden | `qa-sub-1` gevonden | PASS | localStorage repository leest abonnement |
| Subscriptions local write guard | `canWriteSubscription(subscription, { target: "local" })` | Local write toegestaan | allowed=true | PASS | Supabase write niet geraakt |
| Client portal payload validates | `runClientPortalDataTest(customer.id, { mode: "local" })` | Payload valide en geen gevoelige velden | valid=true, sensitiveFields=0 | PASS | klantportaal-sanitizing actief |
| Client portal hides internal notes | Payload doorzoeken op interne projectnotitie | Interne notitie ontbreekt | `internalNotes` inhoud niet aanwezig | PASS | klantveilige output |
| Client portal linked modules | Klantportaal payload controleren op websites, projecten, offertes, facturen, abonnementen, bestanden | Alle gekoppelde modules zichtbaar | alle modules count=1 | PASS | demo klantreis lokaal coherent |
| Route guard readiness | `getRouteAccessReadiness()` | Readiness beschikbaar | status=soft actief, routes=7 | PASS | hard blocking nog niet live |
| Security readiness stays non-live | `getSecurityReadinessSummary()` | No-Go / niet live | liveSafe=false, decision=No-Go | PASS | Verwachte veilige status |
| Deployment readiness stays blocked | `getTestEnvironmentStatus()` | NOT READY / BLOCKED | status=NOT READY, goNoGo=BLOCKED | PASS | Verwachte veilige status |
| Release decision export | JSON en Markdown genereren via release service | Export strings worden gemaakt | JSON bevat Max Webstudio, Markdown bevat Release Decision Summary | PASS | geen secrets |
| Blocker approval guard | `backup_confirmed` approve zonder evidence proberen | Approve wordt geblokkeerd | foutmelding over ontbrekende evidence | PASS | blocker-flow beschermt GO/NO-GO |

## RLS tests

Status: `BLOCKED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Admin leest toegestane testdata | BLOCKED | Niet uitgevoerd | Vereist Supabase testproject en RLS policies |
| Customer A ziet alleen eigen data | BLOCKED | Niet uitgevoerd | Vereist Supabase Auth + RLS |
| Customer B ziet alleen eigen data | BLOCKED | Niet uitgevoerd | Vereist Supabase Auth + RLS |
| Anonymous ziet geen klantdata | BLOCKED | Niet uitgevoerd | Vereist Supabase Auth + RLS |
| Demo-user ziet geen productiedata | BLOCKED | Niet uitgevoerd | Vereist testdata en RLS |

## Auth tests

Status: `BLOCKED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Login testuser | BLOCKED | Niet uitgevoerd | Geen live/test Supabase Auth geactiveerd |
| Profile mapping | BLOCKED | Niet uitgevoerd | Vereist testusers/profiles |
| Role mapping | BLOCKED | Niet uitgevoerd | Vereist Supabase Auth claims/profile data |
| Route guards | PASS | Lokale readiness: soft actief, 7 routes | Hard route guards blijven blocked tot Auth/RLS-test |

## Customer isolation tests

Status: `BLOCKED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Customer A scenario | BLOCKED | Niet uitgevoerd | Vereist echte A/B testdata in Supabase |
| Customer B scenario | BLOCKED | Niet uitgevoerd | Vereist echte A/B testdata in Supabase |
| Demo scenario | BLOCKED | Niet uitgevoerd | Vereist demo/productie isolatietest |
| Anonymous scenario | BLOCKED | Niet uitgevoerd | Vereist Auth/RLS-test |

## Client portal tests

Status: `PASS` voor lokale sanitized data, `BLOCKED` voor live Auth/RLS isolatie.

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Klantdashboard | PASS | `runClientPortalDataTest`, valid=true | Lokaal getest |
| Offertes | PASS | payload quotes count=1 | Lokaal getest |
| Facturen | PASS | payload invoices count=1 | Lokaal getest |
| Projecten | PASS | payload projects count=1, interne notitie verborgen | Lokaal getest |
| Bestanden | PASS | payload files count=1 | Lokaal getest; echte storage download niet getest |
| Live klantisolatie | BLOCKED | Niet uitgevoerd | Vereist Supabase Auth/RLS |

## Mollie tests

Status: `BLOCKED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Test payment aanmaken | BLOCKED | Niet uitgevoerd | Geen Mollie testmodus/env gebruikt |
| Checkoutlink openen | BLOCKED | Niet uitgevoerd | Vereist Mollie testbetaling |
| Webhook verwerken | BLOCKED | Niet uitgevoerd | Vereist webhook endpoint met test payment id |
| Factuurstatus bijwerken | BLOCKED | Niet uitgevoerd | Vereist Mollie webhook test |
| Function syntax | PASS | `node --check functions/*.js`, 24 files | Alleen code-syntax/readiness |

## Resend tests

Status: `BLOCKED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Interne mail | BLOCKED | Niet uitgevoerd | Geen Resend env/live mailtest |
| Klantbevestiging | BLOCKED | Niet uitgevoerd | Geen Resend env/live mailtest |
| Factuurmail | BLOCKED | Niet uitgevoerd | Geen Resend env/live mailtest |
| Afzender/reply-to | BLOCKED | Niet uitgevoerd | Vereist Resend domein/from controle |
| Function syntax | PASS | `node --check functions/*.js`, 24 files | Alleen code-syntax/readiness |

## Storage tests

Status: `BLOCKED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Private bucket | BLOCKED | Niet uitgevoerd | Geen Supabase Storage test |
| Signed URL | BLOCKED | Niet uitgevoerd | Geen bucket/signed URL call |
| Klantbestand isolatie | BLOCKED | Niet uitgevoerd | Vereist Auth/RLS/Storage test |
| Admin upload/download | BLOCKED | Niet uitgevoerd | Vereist server-side storage flow test |

## Functions tests

Status: `PASS` voor syntax, `BLOCKED` voor runtime env-tests.

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| JSON responses | BLOCKED | Niet runtime getest | Vereist Netlify/local function runtime |
| Admin token checks | BLOCKED | Niet runtime getest | Vereist endpoint calls met test env |
| Server-side secrets | PASS | Geen secrets toegevoegd; syntaxcheck 24 functions | Runtime env-values niet gelezen |
| Error handling | BLOCKED | Niet runtime getest | Vereist endpoint calls |
| Function syntax | PASS | `node --check functions/*.js`, 24 files | Geen syntaxfouten gevonden |

## Post-deploy checks

Status: `BLOCKED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Monitoring | BLOCKED | Niet uitgevoerd | Geen productie/test monitoring actief gemaakt |
| Rollback route bekend | PASS | Deployment docs bevatten rollbackplan | Approval blocker blijft open |
| Backup bevestigd | BLOCKED | Niet uitgevoerd | Geen backup evidence geregistreerd |
| GO/NO-GO besluit geëxporteerd | PASS | Release decision JSON/Markdown gegenereerd in rooktest | Niet als GO gebruikt; status blijft NO-GO |

## Deployment blocker evidence references

Deze QA-run vult geen blockers automatisch op `approved`. De volgende evidence is beschikbaar als referentie voor handmatige review:

| Blocker | Status na QA | Evidence reference | Opmerking |
| --- | --- | --- | --- |
| backup_confirmed | BLOCKED | Geen backup uitgevoerd | Vereist echte backupName, backupDate, backupLocation, verifiedBy |
| rls_review_approved | BLOCKED | Geen RLS review uitgevoerd | Vereist reviewer en reviewedDocs |
| rls_test_log_completed | BLOCKED | RLS tests blocked in dit bestand | Vereist testproject-resultaten |
| auth_test_completed | BLOCKED | Auth tests blocked in dit bestand | Vereist Supabase Auth testusers |
| customer_isolation_test_completed | BLOCKED | Customer isolation blocked in dit bestand | Vereist Customer A/B live test |
| rollback_plan_approved | BLOCKED | Rollback docs aanwezig, niet approved | Vereist approver en approvalDate |
| legacy_customer_tables_mitigated | BLOCKED | Geen nieuwe legacy-test uitgevoerd in 14.3 | Vereist review van consolidatiebesluit |
| env_vars_verified | BLOCKED | Geen env-var values gecontroleerd | Vereist checklist zonder secrets |

## Dag 1 - Schema

Status: `BLOCKED`

Te bewijzen:

- Canonical schema aanwezig in testomgeving.
- Canonical tabellen werken.
- Legacy `customer_*` tabellen zijn niet leidend.

Notities:

- Geen SQL uitgevoerd in Fase 14.3.
- Schema blijft testomgeving-blocker.

## Dag 2 - Auth

Status: `BLOCKED`

Te bewijzen:

- Login werkt.
- Profiles en rollen zijn correct gekoppeld.
- Route guards reageren correct.

Notities:

- Route guard readiness is lokaal PASS.
- Echte Supabase Auth-test is niet uitgevoerd.

## Dag 3 - RLS

Status: `BLOCKED`

Te bewijzen:

- Customer A/B isolatie.
- Admin toegang.
- Anonymous blokkade.
- Demo-user isolatie.

Notities:

- Geen RLS SQL uitgevoerd.
- Geen Supabase testproject geraakt.

## Dag 4 - Storage

Status: `BLOCKED`

Te bewijzen:

- Private buckets.
- Signed URLs.
- Klant ziet alleen eigen bestanden.

Notities:

- Niet uitgevoerd; vereist Supabase Storage test.

## Dag 5 - Functions

Status: `PASS` voor syntax, `BLOCKED` voor runtime.

Te bewijzen:

- Functions werken met test-env-vars.
- Secrets blijven server-side.
- Foutresponses zijn netjes.

Notities:

- 24 function files syntactisch gecontroleerd.
- Runtime endpoint-calls niet uitgevoerd.

## Dag 6 - Mollie

Status: `BLOCKED`

Te bewijzen:

- Testbetaling.
- Webhook.
- Statusupdates.

Notities:

- Niet uitgevoerd; vereist Mollie testmodus.

## Dag 7 - Resend

Status: `BLOCKED`

Te bewijzen:

- Interne e-mail.
- Klantbevestiging.
- Templates en afzender.

Notities:

- Niet uitgevoerd; vereist Resend env en echte mailtest.

## Dag 8 - Customer Tests

Status: `PASS` lokaal, `BLOCKED` live isolatie.

Te bewijzen:

- CRM.
- Klantportaal.
- Offertes/facturen.
- Projecten/websites/bestanden/abonnementen.

Notities:

- Lokale rooktest PASS voor alle bestaande localStorage modules.
- Live Supabase klantisolatie is niet uitgevoerd.

## Dag 9 - Go/No-Go

Status: `BLOCKED`

Besluit:

- NO-GO.

Open blockers:

- Backup ontbreekt.
- Auth test ontbreekt.
- RLS test ontbreekt.
- Klantisolatie ontbreekt.
- Storage runtime test ontbreekt.
- Mollie runtime test ontbreekt.
- Resend runtime test ontbreekt.
- Env-vars zijn niet handmatig geverifieerd.
- Rollbackplan is nog niet approved.

Goedgekeurd door:

- Niet van toepassing. Geen GO.
