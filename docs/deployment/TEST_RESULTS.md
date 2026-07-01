# Test Results Registry

Statusopties:

- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT_APPLICABLE`

Laatste QA-run: 2026-06-29
Tester: Codex
Scope: Fase 14.4 Supabase Test Environment Validation, zonder productie, zonder echte klantdata en zonder live Mollie/Resend transacties.

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
| Schema | PASS | 2026-06-29 | Codex | Testproject schema door gebruiker uitgevoerd | Alleen Supabase testproject; geen productie |
| Auth | PASS | 2026-06-29 | Codex | Run `phase-14-4b-final-1782737698429` | Customer A/B testusers aangemaakt en login/session PASS |
| RLS | PASS | 2026-06-29 | Codex | Run `phase-14-4b-final-1782737698429` | RLS-recursie opgelost; exact-id A/B-isolatie PASS op canonical tabellen |
| Storage | PASS | 2026-06-29 | Codex | Bucket `maxwebstudio-test-evidence` | Private bucket, upload, signed URL en public-blocking PASS |
| Functions | PASS | 2026-06-29 | Codex | `node --check functions/*.js`, 24 files checked | Alleen syntax/readiness; runtime env test blijft blocked |
| Mollie | BLOCKED | 2026-06-29 | Codex | Mollie functions syntax OK via functions check | Echte testmodus/webhook niet uitgevoerd |
| Resend | BLOCKED | 2026-06-29 | Codex | Resend functions syntax OK via functions check | Echte mailtest/env test niet uitgevoerd |
| Go/No-Go | BLOCKED | 2026-06-29 | Codex | Technische Supabase evidence PASS; handmatige approvals ontbreken | Status blijft terecht NO-GO tot blockers approved zijn |
| Sprint 3 Trust Infrastructure Review | PASS | 2026-06-30 | Codex | `docs/SPRINT_3_TRUST_INFRASTRUCTURE_REVIEW.md` | 3A Audit, 3B Storage, 3C Release Governance en 3D Monitoring/Backups als foundation afgerond; productie blijft NO-GO |

## Fase 14.4 Supabase testomgeving-validatie

Uitgevoerd zonder productie, zonder SQL en zonder echte klantdata.

Belangrijkste conclusie:

- De Supabase testomgeving kon in deze werkomgeving nog niet echt gevalideerd worden.
- Er zijn geen Supabase test environment variables aanwezig.
- De Supabase CLI is niet beschikbaar in de shell.
- Daarom zijn schema execution, Auth-testgebruikers, RLS, klantisolatie en Storage bewust niet uitgevoerd.
- De releasebeslissing blijft `NO-GO / BLOCKED`.

### Environment readiness

| Check | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- |
| `SUPABASE_TEST_URL` | Niet aanwezig | BLOCKED | Env presence check gaf `false`; waarde niet gelezen of gelogd |
| `SUPABASE_TEST_ANON_KEY` | Niet aanwezig | BLOCKED | Env presence check gaf `false`; waarde niet gelezen of gelogd |
| `SUPABASE_TEST_SERVICE_ROLE_KEY` | Niet aanwezig | BLOCKED | Env presence check gaf `false`; waarde niet gelezen of gelogd |
| `SUPABASE_URL` | Niet aanwezig | BLOCKED | Geen fallback testconfiguratie aanwezig |
| `SUPABASE_ANON_KEY` | Niet aanwezig | BLOCKED | Geen fallback testconfiguratie aanwezig |
| `SUPABASE_SERVICE_ROLE_KEY` | Niet aanwezig | BLOCKED | Geen fallback testconfiguratie aanwezig |
| Supabase CLI | Niet beschikbaar | BLOCKED | `command -v supabase` gaf geen pad terug |
| Netlify CLI | Niet beschikbaar | WARNING | Runtime function tests met Netlify CLI niet uitvoerbaar in deze omgeving |
| Node.js | `v22.19.0` | PASS | Syntaxchecks kunnen lokaal worden uitgevoerd |
| Git status voor edits | Schoon | PASS | Geen openstaande wijzigingen aan het begin van 14.4 |

### Supabase test execution

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| Supabase test env-vars controleren | Alleen aanwezigheid van test/prod Supabase env-vars controleren, zonder waarden te tonen | Testconfiguratie beschikbaar of nette blocker | Geen Supabase env-vars aanwezig | BLOCKED | Geen secrets gelogd |
| Schema uitvoeren op testomgeving | Canonical schema alleen op testproject uitvoeren | Schema draait in testomgeving | Niet uitgevoerd | BLOCKED | Geen testproject/env/CLI beschikbaar |
| Customer A/B Auth-users aanmaken | Testusers aanmaken in Supabase Auth testproject | Customer A en B bestaan met profiles | Niet uitgevoerd | BLOCKED | Geen testproject/env/CLI beschikbaar |
| Auth login/logout/session | Login/logout/session met testusers controleren | Sessies werken en rollen/profiles koppelen | Niet uitgevoerd | BLOCKED | Geen testusers beschikbaar |
| RLS customers/websites/projects | Customer A/B en anonymous toegang testen | Alleen eigen data zichtbaar | Niet uitgevoerd | BLOCKED | RLS niet op testproject uitgevoerd |
| RLS quotes/invoices/subscriptions | Customer A/B toegang tot commerciele data testen | Alleen eigen data zichtbaar | Niet uitgevoerd | BLOCKED | RLS niet op testproject uitgevoerd |
| Customer A/B isolatiebewijs | Proberen data van B te lezen/schrijven als A | Cross-customer access geweigerd | Niet uitgevoerd | BLOCKED | Vereist Auth + RLS + testdata |
| Storage bucket toegang | Private bucket en signed URL flow testen | Alleen toegestane bestanden bereikbaar | Niet uitgevoerd | BLOCKED | Geen Storage testomgeving bereikbaar |
| Deployment blocker evidence | Evidence toevoegen op basis van echte testresultaten | Blockers kunnen naar review zodra bewezen | Niet toegevoegd | BLOCKED | Er is geen echte Supabase evidence |
| Release decision export 14.4 | Nieuwe releasebeslissing vastleggen | NO-GO blijft met concrete redenen | Export toegevoegd | PASS | Zie `RELEASE_DECISION_2026-06-29-14-4.md` en `.json` |

### Fase 14.4 blockers

| Blocker | Status | Reden | Nodige actie |
| --- | --- | --- | --- |
| Test Supabase environment configured | BLOCKED | Geen test env-vars aanwezig | Maak apart Supabase testproject en zet test env-vars lokaal/Netlify testcontext |
| Schema execution evidence | BLOCKED | Geen SQL uitgevoerd | Voer canonical schema uit op testproject en registreer output/screenshot |
| Auth test evidence | BLOCKED | Geen testusers aangemaakt | Maak Customer A/B testusers en test login/logout/session |
| RLS test evidence | BLOCKED | Geen RLS policies getest | Voer RLS dry-run scenario's uit en vul testlog in |
| Customer isolation evidence | BLOCKED | Geen A/B isolatie bewezen | Bewijs dat Customer A geen data van B kan lezen/schrijven |
| Storage evidence | BLOCKED | Geen bucket getest | Test private buckets en signed URL flow in testproject |
| Environment variables verified | BLOCKED | Env-vars ontbreken | Vul checklist in zonder secrets te noteren |

## Fase 14.4A Supabase test setup

Status: `blocked_pending_supabase_test_setup`

Deze fase heeft de testsetup voorbereid, maar geen testomgeving uitgevoerd.

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| Supabase test-env-vars documenteren | Benodigde variabelen vastleggen | Duidelijke lijst zonder secrets | Vastgelegd in `SUPABASE_TEST_SETUP.md` en env examples | PASS | Geen waarden toegevoegd |
| Testproject checklist | Stappen voor apart testproject documenteren | Veilig uitvoerbare checklist | Vastgelegd in `SUPABASE_TEST_SETUP.md` | PASS | Geen productie geraakt |
| Supabase CLI instructies | Gebruik documenteren zonder destructieve actie | CLI-route duidelijk, geen uitvoering | Vastgelegd in `SUPABASE_TEST_SETUP.md` | PASS | CLI niet geinstalleerd of uitgevoerd |
| `.env` templates | Template uitbreiden met testvars | Invullijst zonder secrets | `.env.example` en `.env.local.example` bijgewerkt | PASS | Waarden leeg |
| Schema/Auth/RLS/Storage instructies | Herhaalbare testflow vastleggen | 14.4B kan gericht worden uitgevoerd | Vastgelegd in `SUPABASE_TEST_SETUP.md` | PASS | Geen SQL uitgevoerd |
| Deployment blockers next actions | Blockers koppelen aan concrete setup-acties | Open blockers hebben duidelijke vervolgstappen | `DEPLOYMENT_BLOCKERS.md` bijgewerkt | PASS | Geen approvals gezet |

Open voor Fase 14.4B:

- testproject daadwerkelijk aanmaken
- env-vars lokaal of in Netlify testcontext instellen
- bevestigen dat de waarden naar test wijzen
- schema uitvoeren op testomgeving
- testusers aanmaken
- Auth/RLS/klantisolatie/Storage evidence verzamelen

## Fase 14.4B Supabase testomgeving-validatie

Status: `NO-GO / BLOCKED`

Uitgevoerd op het aparte Supabase testproject. Productie is niet aangepast en er is geen echte klantdata gebruikt.

Evidence run:

- Auth/database run: `phase-14-4b-1782735251877`
- Storage run: `phase-14-4b-storage-1782735279249`

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| `.env.local` ingelezen | Test-env-vars lokaal controleren zonder waarden te tonen | Testconfig aanwezig en `APP_ENV=test` | Supabase URL, anon key, service role key en project id aanwezig; `APP_ENV=test`, `APP_ENVIRONMENT=test` | PASS | `.env.local` blijft uitgesloten via `.gitignore` |
| Schema execution | `supabase/schema.sql` uitvoeren op leeg testproject | Schema succesvol | Door gebruiker bevestigd als succesvol uitgevoerd | PASS | Geen productie geraakt |
| RLS policies execution | `supabase/rls-policies.sql` uitvoeren op testproject | RLS/policies succesvol | Door gebruiker bevestigd als succesvol uitgevoerd | PASS | Geen productie geraakt |
| Auth testusers aanmaken | Customer A en Customer B aanmaken via Supabase Auth Admin API | 2 testusers aangemaakt | 2 testusers aangemaakt | PASS | Geen wachtwoorden of keys gelogd |
| Testrecords plaatsen via service role | Profiles/customers/testrecords plaatsen voor RLS A/B-test | Service role kan testrecords plaatsen | `POST /rest/v1/profiles` gaf 403 permission denied | FAIL | Supabase hint: `GRANT SELECT, INSERT ON public.profiles TO service_role;` |
| Auth login/session | Customer A/B login testen | Beide users kunnen inloggen | Niet uitgevoerd na database-grant failure | BLOCKED | Testrecords/profile mapping ontbreekt |
| RLS per module | Customers/websites/projects/files/quotes/invoices/subscriptions testen | Customer A/B zien alleen eigen data | Niet uitvoerbaar | BLOCKED | Testrecords konden niet worden geplaatst |
| Customer isolation | Customer A probeert B-data te lezen/schrijven en andersom | Cross-customer access geweigerd | Niet uitvoerbaar | BLOCKED | Vereist testrecords + werkende PostgREST grants |
| Anonymous DB access | Anonymous select-probe op `profiles` | Empty/401/403 zonder server error | Probe gaf 500 JSON response | FAIL | Wijst op ontbrekende grants/policy execution-readiness |
| Storage bucket | Private testbucket aanmaken of hergebruiken | Bucket beschikbaar en private | Bucket create/hergebruik status 200 | PASS | Bucket: `maxwebstudio-test-evidence` |
| Storage upload | Testobject server-side uploaden | Upload lukt | Upload status 200 | PASS | Service role alleen server-side gebruikt |
| Storage signed URL | Tijdelijke signed URL maken | Signed URL wordt gemaakt | Signed URL status 200 | PASS | Geen URL/secret opgeslagen |
| Storage public endpoint | Publieke endpoint direct openen | Private object niet publiek bereikbaar | Public endpoint status 400 | PASS | Private toegang geblokkeerd |

Conclusie:

- Auth Admin API werkt voor testuser creation.
- Storage basis werkt: private bucket, upload, signed URL en public-blocking zijn bewezen.
- Database/RLS/customer-isolation zijn nog niet gevalideerd door ontbrekende PostgREST privileges op canonical tabellen.
- Release blijft `NO-GO / BLOCKED`.

Nodige vervolgstap:

- Voeg in het testproject expliciete grants toe voor `anon`, `authenticated` en `service_role` op de canonical tabellen/sequences/functions waar nodig.
- Herhaal daarna Fase 14.4B RLS/customer-isolation tests.

## Fase 14.4C Supabase RLS permission patch

Status: `PATCH EXECUTED ON TEST / VALIDATED`

Probleem uit 14.4B:

- `POST /rest/v1/profiles` met service role gaf `403 permission denied`.
- Daardoor konden profile/customer testrecords niet geplaatst worden.
- RLS en customer isolation konden niet betrouwbaar worden getest.

Patch:

- `supabase/service-role-grants.sql`

Analyse:

| Controle | Resultaat | Status | Notities |
| --- | --- | --- | --- |
| Canonical tabellen bepaald | `profiles`, `customers`, `leads`, `websites`, `projects`, `files`, `quotes`, `quote_lines`, `invoices`, `invoice_lines`, `subscriptions`, `settings`, `demo_emails`, `activity_logs`, `import_logs` | PASS | Sluit aan op `supabase/schema.sql` |
| Helperfuncties bepaald | `current_profile_id`, `current_app_role`, `has_app_role`, `is_admin_role`, `set_updated_at` | PASS | Sluit aan op RLS helperfuncties en triggerfunctie |
| Geen legacy `customer_*` grants | Geen grants voor `customer_websites`, `customer_invoices`, `customer_subscriptions` | PASS | Canonical architectuur blijft leidend |
| Geen destructive SQL | Geen `drop`, `truncate`, `delete`, data-mutatie of schema-drop | PASS | Alleen `grant` statements |
| Service role backend/admin/testflow | `select`, `insert`, `update`, `delete` op canonical tabellen | PASS | Nodig voor server-side beheer en testrecord setup via PostgREST |
| Authenticated RLS toegang | Alleen `select` op canonical tabellen | PASS | Genoeg voor klantportaal/RLS read-isolation tests; mutaties blijven server-side |
| Anonymous RLS toegang | Alleen `select` op canonical tabellen | PASS | RLS policies bepalen dat anonymous geen klantdata krijgt |

Belangrijk:

- Deze patch is nog niet uitgevoerd.
- Eerst handmatig reviewen.
- Daarna alleen uitvoeren op het Supabase testproject.
- Daarna Fase 14.4B opnieuw draaien voor Auth/RLS/customer-isolation/storage evidence.

## Fase 14.4B rerun na service-role grants

Status: `NO-GO / BLOCKED`

Uitgevoerd op het aparte Supabase testproject nadat `supabase/service-role-grants.sql` door de gebruiker succesvol op het testproject is uitgevoerd. Productie is niet aangepast en er is geen echte klantdata gebruikt.

Evidence runs:

- Volledige rerun: `phase-14-4b-rerun-1782736453275`
- RLS foutdetail: `phase-14-4b-error-1782736500509`

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| Service role profile insert | `profiles` insert via PostgREST service role | Eerdere 403 is opgelost | 2 profiles geplaatst | PASS | `previous403Resolved=true` |
| Auth testusers aanmaken | Customer A en Customer B aanmaken via Auth Admin API | 2 testusers aangemaakt | 2 testusers aangemaakt | PASS | Geen wachtwoorden of keys gelogd |
| Auth login/session | Customer A en Customer B inloggen | Beide krijgen sessie | `loginA=true`, `loginB=true` | PASS | Auth basis werkt |
| Canonical testrecords plaatsen | Records plaatsen voor profiles/customers/websites/projects/files/quotes/quote_lines/invoices/invoice_lines/subscriptions | A/B testdata bestaat | 2 records per module geplaatst | PASS | Alleen synthetische testdata |
| RLS select eigen profile | Ingelogde klant leest eigen profile | 1 rij zichtbaar | 500 response | FAIL | `stack depth limit exceeded` |
| RLS per module | A/B exact-id reads per module | Eigen rij zichtbaar, andere klant leeg | 500 response op alle modules | FAIL | Waarschijnlijk RLS-helper recursie |
| Customer isolation | Customer A/B cross-read exact-id | Cross-customer access leeg | Niet betrouwbaar uitvoerbaar door 500 | BLOCKED | Eerst RLS-recursie oplossen |
| Anonymous DB access | Anonymous select | Leeg/401/403 zonder server error | 500 response | FAIL | Zelfde RLS-recursiepad |
| Storage bucket | Private testbucket aanmaken/hergebruiken | Bucket beschikbaar | Bucket create/hergebruik OK | PASS | Bucket: `maxwebstudio-test-evidence` |
| Storage upload | Testobject server-side uploaden | Upload lukt | Upload status 200 | PASS | Service role alleen server-side gebruikt |
| Storage signed URL | Tijdelijke signed URL maken | Signed URL wordt gemaakt | Signed URL status 200 | PASS | Geen URL/secret opgeslagen |
| Storage public endpoint | Publieke endpoint direct openen | Private object niet publiek bereikbaar | Public endpoint status 400 | PASS | Private toegang geblokkeerd |

Nieuwe technische blocker:

- RLS-selects geven `500`.
- Supabase/Postgres foutcode: `54001`.
- Foutmelding: `stack depth limit exceeded`.
- Waarschijnlijke oorzaak: RLS-recursie doordat policies/helperfuncties zoals `current_app_role()` zelf `public.profiles` raadplegen terwijl policies op `public.profiles` ook rolchecks uitvoeren.

Conclusie:

- De eerdere `403 permission denied on public.profiles` is opgelost.
- Auth en Storage zijn bewezen werkend in het testproject.
- RLS en customer isolation zijn nog niet geslaagd.
- Release blijft `NO-GO / BLOCKED`.

## Fase 14.4D RLS recursion patch

Status: `PATCH PREPARED / NOT EXECUTED`

Probleem uit de 14.4B rerun:

- RLS-selects geven `500`.
- Postgres foutcode: `54001`.
- Foutmelding: `stack depth limit exceeded`.

Analyse:

| Controle | Resultaat | Status | Notities |
| --- | --- | --- | --- |
| `current_profile_id()` | Leest `public.profiles` | RECURSION RISK | Wordt gebruikt binnen policies die via `profiles` kunnen lopen |
| `current_app_role()` | Leest `public.profiles.role` | RECURSION RISK | Wordt gebruikt door admin/staff/demo policies, ook op `profiles` |
| `has_app_role()` | Roept `current_app_role()` aan | RECURSION RISK | Erft recursierisico |
| `is_admin_role()` | Roept `has_app_role()` aan | RECURSION RISK | Erft recursierisico |
| Customer policies | Blijven gekoppeld via `customers.auth_user_id` of `customers.profile_id` | OK | Customer isolation wordt niet verzwakt |

Patch:

- `supabase/rls-recursion-patch.sql`

Impact:

- Maakt `current_profile_id()`, `current_app_role()`, `has_app_role()` en `is_admin_role()` `SECURITY DEFINER`.
- Zet een expliciete `search_path`.
- Beperkt helperlookup tot actieve profiles.
- Laat bestaande customer ownership policies intact.
- Voegt geen brede bypass policies toe.

## Fase 14.4B final rerun na RLS recursion patch

Status: `PASS / AWAITING MANUAL APPROVAL`

Uitgevoerd op het aparte Supabase testproject nadat `supabase/rls-recursion-patch.sql` door de gebruiker succesvol op het testproject is uitgevoerd. Productie is niet aangepast en er is geen echte klantdata gebruikt.

Evidence run:

- Volledige final rerun: `phase-14-4b-final-1782737698429`

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| `.env.local` testconfig | Lokale env-config controleren zonder waarden te tonen | Test-env aanwezig, gitignored en testflags actief | `SUPABASE_URL`, anon key en service role key aanwezig; `APP_ENV=test`, `APP_ENVIRONMENT=test`; `.env.local` staat in `.gitignore` | PASS | Geen secrets gelogd of opgeslagen |
| Auth testusers aanmaken | Customer A en Customer B aanmaken via Auth Admin API | 2 testusers aangemaakt | 2 testusers aangemaakt | PASS | Alleen synthetische testusers; geen wachtwoorden gelogd |
| Auth login/session | Customer A en Customer B inloggen via Supabase Auth | Beide krijgen een sessie | `loginA=true`, `loginB=true` | PASS | Auth werkt na RLS-recursiepatch |
| Canonical testrecords plaatsen | Profiles/customers/websites/projects/files/quotes/quote_lines/invoices/invoice_lines/subscriptions plaatsen | 2 records per module | 2 records per canonical module geplaatst | PASS | Service role grants blijven werken |
| Stack depth regression | Exact-id reads uitvoeren na patch | Geen `stack depth limit exceeded` meer | Geen 500 responses en geen stack depth errors op alle geteste tabellen | PASS | `noStackDepthErrors=true` |
| Customer A own access | Customer A leest eigen records per canonical tabel | Per tabel 1 rij zichtbaar | 1 rij zichtbaar voor eigen records op 10/10 tabellen | PASS | `profiles`, `customers`, `websites`, `projects`, `files`, `quotes`, `quote_lines`, `invoices`, `invoice_lines`, `subscriptions` |
| Customer A cross access | Customer A probeert Customer B records te lezen | 0 rijen zichtbaar | 0 rijen zichtbaar op 10/10 tabellen | PASS | Cross-customer access geblokkeerd door RLS |
| Customer B own access | Customer B leest eigen records per canonical tabel | Per tabel 1 rij zichtbaar | 1 rij zichtbaar voor eigen records op 10/10 tabellen | PASS | A/B-isolatie werkt beide kanten op |
| Customer B cross access | Customer B probeert Customer A records te lezen | 0 rijen zichtbaar | 0 rijen zichtbaar op 10/10 tabellen | PASS | Cross-customer access geblokkeerd door RLS |
| Anonymous DB access | Anonymous exact-id reads op Customer A records | 0 rijen, 401 of 403 zonder server error | 200 responses met 0 rijen op 10/10 tabellen | PASS | Geen klantdata zichtbaar voor anonymous |
| Storage private bucket | Bucket `maxwebstudio-test-evidence` hergebruiken | Bucket bereikbaar en private | Bucket check status 400 door bestaand bucket-hergebruik, behandeld als OK | PASS | Bucket bestond al in testproject |
| Storage upload | Testobject server-side uploaden | Upload lukt | Upload status 200 | PASS | Service role alleen server-side gebruikt |
| Storage signed URL | Tijdelijke signed URL maken | Signed URL wordt gemaakt | Signed URL status 200 | PASS | Geen URL of secret opgeslagen |
| Storage public endpoint | Publieke endpoint direct openen | Private object niet publiek bereikbaar | Public endpoint status 400 | PASS | Private toegang geblokkeerd |

Conclusie:

- De eerdere `403 permission denied` op `public.profiles` blijft opgelost.
- De eerdere `500 stack depth limit exceeded` is verdwenen.
- Auth werkt.
- RLS werkt zonder recursie.
- Customer A/B isolation is bewezen op de canonical tabellen.
- Storage werkt voor private bucket, upload, signed URL en public-blocking.
- Release blijft `NO-GO` totdat deployment blockers handmatig zijn gereviewd en approved.

## Fase 14.5 Release Candidate Approval Pack

Status: `NO-GO / AWAITING MANUAL APPROVAL`

Uitgevoerd als release-governance voorbereiding. Productie is niet aangepast, er is geen productie-SQL uitgevoerd, er is geen echte klantdata gebruikt en er zijn geen nieuwe features gebouwd.

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| Finale RC checklist | Centrale checklist maken voor resterende approvals/evidence | Checklist bestaat en wijzigt niets aan productie | `docs/deployment/RELEASE_CANDIDATE_CHECKLIST.md` toegevoegd | PASS | Governance-only |
| Manual approvals inventaris | Ontbrekende approvals vastleggen | Open approvals zijn concreet | Backup, env-vars, Auth, RLS, klantisolatie, rollback, storage en integrations vastgelegd | PASS | Geen approvals gefaket |
| Backup evidence requirements | Vastleggen welke backup-evidence nodig is | Backupmetadata bekend zonder klantdata/secrets | Backupnaam, datum, locatie, verificatie, stable commit/deploy beschreven | PASS | Evidence zelf blijft pending |
| Env-var confirmation requirements | Test/prod env-var namen vastleggen zonder waarden | Geen secrets in docs | Test- en productievariabelen benoemd zonder waarden | PASS | Handmatige bevestiging blijft nodig |
| Rollback approval requirements | Rollback approvalcriteria vastleggen | Approvalroute duidelijk | Owner, datum, frontend/database/integratie rollbackcriteria vastgelegd | PASS | Approval zelf blijft pending |
| Storage review requirements | Storage reviewcriteria vastleggen | Private bucket/signed URL reviewpad duidelijk | Private buckets, signed URLs, service-role server-side en bucket-isolatiecriteria vastgelegd | PASS | Review zelf blijft pending |
| Release decision export | Nieuwe RC release decision JSON/Markdown genereren | NO-GO export bestaat | `RELEASE_DECISION_2026-06-29-14-5.md` en `.json` toegevoegd | PASS | Status blijft NO-GO |

Conclusie:

- Release candidate approval pack is voorbereid.
- Alle resterende NO-GO punten zijn omgezet naar concrete evidence/approval-items.
- Status blijft `NO-GO` totdat approvals echt zijn ingevuld.

Rollback:

- Herstel de helperfuncties uit `supabase/rls-policies.sql`.
- Voer daarna Fase 14.4B opnieuw uit.

Belangrijk:

- Deze patch is alleen op het Supabase testproject uitgevoerd.
- Productie is niet aangepast.
- De patch is gevalideerd via de final rerun hierboven.
- Handmatige release-approval blijft vereist voordat productie overwogen mag worden.

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
# Test Results

## Fase 25 - Staging/Test Supabase Execution Plan

Status: gepland, niet uitgevoerd.

Te gebruiken documenten:

- `docs/SUPABASE_STAGING_EXECUTION_PLAN.md`
- `docs/deployment/STAGING_EXECUTION_CHECKLIST.md`
- `docs/SUPABASE_MIGRATION_DRAFT_REVIEW_CHECKLIST.md`

Resultaten worden pas ingevuld wanneer de migration drafts expliciet in een aparte Supabase testomgeving worden uitgevoerd.

## Fase 28 - Supabase Staging Execution

Status: `BLOCKED_PRE_EXECUTION`

Doel van deze run:

- migration drafts gecontroleerd uitvoeren op een afzonderlijk Supabase staging/testproject;
- iedere stap documenteren;
- tabellen, indexes, foreign keys, RLS, policies, customer isolation, demo user, interne rollen en audit foundation valideren.

Resultaat:

- De lokale `.env.local` is aanwezig en wordt uitgesloten door `.gitignore`.
- De lokale environment wijst naar test via `APP_ENV=test` en `APP_ENVIRONMENT=test`.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` en `SUPABASE_PROJECT_ID` zijn aanwezig.
- Er is geen Supabase CLI beschikbaar in deze werkomgeving.
- Er is geen database connection string aanwezig (`DATABASE_URL`, `SUPABASE_DB_URL`, `POSTGRES_URL` of vergelijkbaar).
- Daarom is er geen veilige geautomatiseerde route om de SQL migration drafts uit te voeren.
- Er is geen SQL uitgevoerd.
- Productie is niet aangepast.

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| `.env.local` preflight | Controleer alleen aanwezigheid van keys zonder waarden te tonen | Testconfig aanwezig en uitgesloten van Git | `.env.local` bestaat; `.gitignore` sluit `.env.local` uit | PASS | Geen secretwaarden gelezen of gelogd |
| Testomgeving flags | Controleer `APP_ENV` en `APP_ENVIRONMENT` | Beide staan op `test` | `APP_ENV=test`, `APP_ENVIRONMENT=test` | PASS | Past bij staging/test execution |
| Supabase env presence | Controleer aanwezigheid van Supabase URL, anon key, service role key en project id | Vereiste keys aanwezig | Alle vier aanwezig | PASS | Geen waarden opgeslagen |
| SQL execution tool | Controleer Supabase CLI en database connection string | Minimaal een veilige SQL-uitvoerroute beschikbaar | Supabase CLI ontbreekt; DB connection string ontbreekt | BLOCKED | `psql` is beschikbaar, maar zonder DB connection string niet bruikbaar |
| Migration drafts uitvoeren | Voer `001` t/m `005` uit op staging/test | Drafts uitgevoerd in volgorde | Niet uitgevoerd | BLOCKED | Veilig gestopt door ontbrekend SQL-uitvoerkanaal |
| Optional demo seed | Alleen uitvoeren als test/demo expliciet gekozen is | Demo seed optioneel | Niet uitgevoerd | NOT_APPLICABLE | Geen SQL-run gestart |
| Tabellen/indexes/FKs valideren | Query testdatabase na migration execution | Validatiegegevens beschikbaar | Niet uitgevoerd | BLOCKED | Vereist migration execution |
| RLS enablement en policies valideren | Controleer RLS en policies op staging | RLS/policies bewezen | Niet uitgevoerd | BLOCKED | Vereist migration execution |
| Customer A/B isolation | Test klantisolatie met Auth/RLS | A en B zien alleen eigen data | Niet uitgevoerd | BLOCKED | Vereist migration execution en testusers |
| Demo user isolation | Test demo-only toegang | Demo user ziet alleen demo data | Niet uitgevoerd | BLOCKED | Vereist migration execution en testdata |
| Audit foundation | Controleer audit helper en secretvrije metadata | Audit foundation veilig | Niet uitgevoerd | BLOCKED | Vereist migration execution |

Conclusie:

Fase 28 mag pas worden hervat wanneer een veilige SQL execution route beschikbaar is:

1. Supabase CLI installeren en koppelen aan het staging/testproject; of
2. een test-only database connection string toevoegen aan `.env.local`; of
3. de migration drafts handmatig uitvoeren via de Supabase SQL Editor en de resultaten hier registreren.

Tot die tijd blijft de releasebeslissing `NO-GO / BLOCKED`.

## Fase 28 - Supabase Staging Execution rerun

Status: `NO-GO / BLOCKED`

Uitgevoerd op:

- Gelinkt Supabase project: `maxwebstudio-test`
- Project ref: matcht de test `SUPABASE_URL`
- Execution route: `/opt/homebrew/bin/supabase db query --linked --file`
- Productie geraakt: nee
- Echte klantdata gebruikt: nee
- Secrets gelogd: nee

| Stap | Bestand | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| 1 | `supabase/migration-drafts/001_schema_tables.sql` | Schema/tables worden aangemaakt of bestaan idempotent | Query succesvol uitgevoerd | PASS | Geen SQL-fout |
| 2 | `supabase/migration-drafts/002_indexes.sql` | Indexes worden aangemaakt | Fout op `leads_score_idx`: kolom `lead_score` bestaat niet | FAIL | Supabase error `42703: column "lead_score" does not exist` |
| 3 | `supabase/migration-drafts/003_rls_enablement.sql` | RLS activeren | Niet uitgevoerd | BLOCKED | Gestopt na kritieke fout in stap 2 |
| 4 | `supabase/migration-drafts/004_rls_policies.sql` | Policies aanmaken | Niet uitgevoerd | BLOCKED | Gestopt na kritieke fout in stap 2 |
| 5 | `supabase/migration-drafts/005_audit_logging_foundation.sql` | Audit foundation aanmaken | Niet uitgevoerd | BLOCKED | Gestopt na kritieke fout in stap 2 |
| 6 | `supabase/migration-drafts/006_seed_demo_data_optional.sql` | Optionele demo seed | Niet uitgevoerd | NOT_APPLICABLE | Niet gekozen en execution gestopt |

Drift-analyse:

- De lokale `001_schema_tables.sql` bevat `public.leads.lead_score`.
- De stagingdatabase bevat al een oudere `public.leads` tabel zonder `lead_score`.
- Omdat `001_schema_tables.sql` `create table if not exists` gebruikt, wordt een bestaande oudere tabel niet automatisch aangepast.
- Daardoor faalt `002_indexes.sql` bij het aanmaken van `leads_score_idx`.

Geobserveerde staging `public.leads` kolommen:

- `id`
- `customer_id`
- `name`
- `company`
- `email`
- `phone`
- `source`
- `interest`
- `status`
- `converted_customer_id`
- `message`
- `is_demo`
- `environment`
- `metadata`
- `created_at`
- `updated_at`

Conclusie:

- De migration drafts zijn nog niet succesvol uitvoerbaar op deze bestaande stagingdatabase.
- De stagingdatabase is niet schoon of bevat schema drift uit eerdere testfases.
- RLS, customer isolation, demo user, interne rollen en audit foundation zijn niet getest in deze run.

Rollback:

- Geen automatische rollback uitgevoerd.
- Productie is niet geraakt.
- Aanbevolen: stagingdatabase resetten/nieuwe testbranch gebruiken of een expliciete schema-drift patch maken in een aparte fixfase.

Next action:

1. Gebruik geen schema-drift patch voor deze stagingdatabase.
2. Volg `docs/deployment/STAGING_RESET_PLAN.md`.
3. Reset de stagingdatabase of maak een nieuwe schone testbranch na expliciete approval.
4. Herhaal Fase 28 vanaf stap 1.
5. Voer RLS/customer isolation pas uit nadat alle migration drafts zonder kritieke fout zijn toegepast.

### Resetbesluit na schema drift

Status: `blocked_pending_manual_staging_reset_approval`

Uitkomst:

- Er wordt geen schema-drift patch gemaakt voor `public.leads`.
- De stagingdatabase moet worden gereset of vervangen door een schone testbranch.
- Resetprocedure is vastgelegd in `docs/deployment/STAGING_RESET_PLAN.md`.
- Fase 28 mag daarna opnieuw starten vanaf `001_schema_tables.sql`.

Open evidence:

- Bevestiging dat reset uitsluitend `maxwebstudio-test` raakt.
- Bevestiging dat er geen echte klantdata in staging staat.
- Bevestiging of testdata eerst geexporteerd moet worden.
- Handmatige approval om testdata te verwijderen.

## Fase 28 - Supabase Staging Execution na reset

Status: `NO-GO / BLOCKED`

Uitgevoerd op:

- Gelinkt Supabase project: `maxwebstudio-test`
- Project ref: matcht de test `SUPABASE_URL`
- Execution route: `/opt/homebrew/bin/supabase db query --linked`
- Productie geraakt: nee
- Echte klantdata gebruikt: nee
- Secrets gelogd: nee

Reset:

- `public` schema is gereset op het gelinkte staging/testproject.
- Voor reset stonden er 22 publieke tabellen in staging.
- Na reset waren er 0 publieke tabellen.
- Geen productieproject geraakt.

Migration resultaten:

| Stap | Bestand | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- |
| Reset | `public` schema reset | Uitgevoerd op `maxwebstudio-test` | PASS | Alleen staging/test |
| 1 | `supabase/migration-drafts/001_schema_tables.sql` | Query succesvol uitgevoerd | PASS | Schema/tables aangemaakt |
| 2 | `supabase/migration-drafts/002_indexes.sql` | Query succesvol uitgevoerd | PASS | Eerdere `lead_score` drift opgelost |
| 3 | `supabase/migration-drafts/003_rls_enablement.sql` | Query succesvol uitgevoerd | PASS | RLS enablement toegepast |
| 4 | `supabase/migration-drafts/004_rls_policies.sql` | Query succesvol uitgevoerd | PASS | Policies aangemaakt zonder SQL-fout |
| 5 | `supabase/migration-drafts/005_audit_logging_foundation.sql` | Query succesvol uitgevoerd | PASS | Audit helper aangemaakt |
| 6 | `supabase/migration-drafts/006_seed_demo_data_optional.sql` | Query succesvol uitgevoerd | PASS | Alleen test/demo seed |

Structurele validatie:

| Check | Resultaat | Status |
| --- | --- | --- |
| Public table count | 22 tabellen | PASS |
| `public.leads.lead_score` | Kolom bestaat | PASS |
| Belangrijke leadfinderkolommen | `branch`, `region`, `website_status`, `call_status`, `lead_score` bestaan | PASS |
| Index count | 85 indexes | PASS |
| RLS enabled tables | 22 tabellen met RLS | PASS |
| Policy count | 70 policies | PASS |
| Optional demo seed | 1 demo customer, 1 demo website, 1 demo setting | PASS |

Customer isolation test:

| Testnaam | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- |
| Customer A/B testdata | Testusers, profiles, customers en websites aangemaakt | Testdata succesvol aangemaakt | PASS | Alleen staging/testdata met `example.test` |
| Customer A isolation | Customer A ziet eigen records, niet Customer B | Query faalde voordat RLS kon evalueren | BLOCKED | `ERROR 42501: permission denied for table customers` |
| Customer B isolation | Customer B ziet eigen records, niet Customer A | Niet uitgevoerd na permission blocker | BLOCKED | Stop na kritieke blocker |

Nieuwe blocker:

- De migration drafts maken schema, indexes, RLS en policies aan, maar geven de runtime database roles nog niet de minimale tabelrechten die nodig zijn om RLS te evalueren.
- Supabase hint: `GRANT SELECT ON public.customers TO authenticated;`
- Waarschijnlijk is een expliciete grants-migration nodig voor `authenticated`, `anon` waar passend en `service_role`, afgestemd op RLS.

Conclusie:

- De staging reset en alle migration drafts zijn succesvol uitgevoerd.
- De eerdere schema drift is opgelost.
- RLS policies zijn aangemaakt, maar Customer A/B isolation is nog niet bewezen.
- Release blijft `NO-GO / BLOCKED` totdat runtime role grants expliciet zijn ontworpen, uitgevoerd op staging en Customer A/B isolation volledig PASS is.

Rollback:

- Geen rollback uitgevoerd.
- Productie is niet geraakt.
- Staging kan opnieuw worden gereset conform `STAGING_RESET_PLAN.md` als een grants-fixfase fout loopt.

Next action:

1. Maak een expliciete runtime role grants draft/patch voor staging.
2. Review minimale grants per rol/tabel.
3. Voer de grants alleen op staging uit na approval.
4. Herhaal Customer A/B isolation, demo user isolation en role checks.

### Fase 28.2 - Runtime Role Grants Patch

Status: `PATCH EXECUTED ON STAGING / VALIDATED`

Patch:

- `supabase/migration-drafts/007_runtime_role_grants.sql`

Doel:

- PostgreSQL table privileges toevoegen zodat RLS policies daadwerkelijk geevalueerd kunnen worden voor Supabase runtime roles.
- De eerder gevonden `permission denied for table customers` blocker oplossen.

Grant review:

| Rol | Grants | Reden | Status |
| --- | --- | --- | --- |
| `anon` | Alleen schema usage, geen app table grants | Publieke website mag geen directe klantdata lezen | PREPARED |
| `authenticated` | Select/insert/update/delete op app-tabellen waar RLS policies acties toestaan | Logged-in customers en interne rollen gebruiken DB role `authenticated`; RLS blijft leidend | PREPARED |
| `authenticated` op `import_logs` | Select only | Alleen admin/developer read-policy bestaat | PREPARED |
| `authenticated` op `audit_logs` | Select only | Geen directe frontend audit-mutaties; RLS beperkt read tot adminrollen | PREPARED |
| `service_role` | Select/insert/update/delete op app-tabellen en sequences | Server-side backend/admin/testflows | PREPARED |
| `add_audit_log()` | Execute alleen voor `service_role` | Audit inserts blijven server-side | PREPARED |

Uitvoering:

- Patch uitgevoerd op uitsluitend Supabase staging/testproject `maxwebstudio-test`.
- Geen productieproject geraakt.
- Geen andere migrations opnieuw uitgevoerd.
- Geen schema-drift patches.
- Geen RLS policies versoepeld.

Validatie na patch:

| Testnaam | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- |
| Runtime grants patch | `007_runtime_role_grants.sql` draait zonder SQL-fout | Patch succesvol uitgevoerd | PASS | Alleen staging/test |
| Customer A isolation | Customer A ziet eigen customer/site, niet Customer B | `own_customer_visible=1`, `other_customer_visible=0`, `own_website_visible=1`, `other_website_visible=0` | PASS | Geen permission denied vóór RLS |
| Customer B isolation | Customer B ziet eigen customer/site, niet Customer A | `own_customer_visible=1`, `other_customer_visible=0`, `own_website_visible=1`, `other_website_visible=0` | PASS | Geen permission denied vóór RLS |
| Leadfinder klanttoegang | Customer ziet geen interne leads | `visible_leads=0` | PASS | Leadfinder blijft intern |
| Audit read customer | Customer ziet geen audit logs | `visible_audit_logs=0` | PASS | Audit blijft afgeschermd |
| Audit insert customer | Customer kan niet direct audit log inserten | `permission denied for table audit_logs` | PASS | Verwachte blokkade |
| Anonymous klantdata | Anonymous krijgt geen klantdatatoegang | `permission denied for table customers` | PASS | `anon` heeft bewust geen table grants |
| Admin basisread | Admin kan beheerdata lezen | `visible_customers=3`, `visible_leads=1` | PASS | Staging testdata |
| Sales basisread | Sales kan salesdata lezen, geen audit logs | `visible_customers=3`, `visible_leads=1`, `visible_audit_logs=0` | PASS | Past bij policy |
| Support basisread | Support kan support/klantdata lezen | `visible_customers=3`, `visible_leads=1` | PASS | Staging testdata |
| Developer basisread | Developer kan technische settings lezen | `visible_customers=3`, `visible_settings=1` | PASS | Staging testdata |
| Demo user isolation | Demo user ziet demo data en geen non-demo testcustomers | `visible_demo_customers=1`, `visible_non_demo_test_customers=0`, `visible_demo_websites=1` | PASS | Demo isolatie bewezen |

Conclusie:

- De runtime role grants blocker is opgelost op staging.
- `authenticated` faalt niet meer vóór RLS-policy-evaluatie.
- Customer A/B isolation is bewezen voor klanten en websites.
- Demo user isolation is bewezen.
- Interne basisrollen werken volgens de huidige policies.

GO/NO-GO:

- Fase 28 staging database foundation: `GO`.
- Productie/live release: blijft `NO-GO` totdat production approvals, environment checks, monitoring, Storage/productie, Resend/Mollie en verdere releasecriteria expliciet zijn afgerond.

## Fase 35A.1 CRM Task Staging Write Validation

Status: `PASS`

Uitgevoerd op uitsluitend Supabase staging/testproject `maxwebstudio-test`. Productie is niet aangepast, er is geen echte klantdata gebruikt en er zijn geen nieuwe write-features toegevoegd.

Evidence run:

- Run: `phase-35a1-1782774691838`
- Scope: bestaande CRM task write MVP uit Fase 35A
- Testdata: gemarkeerd als `is_demo=true`, `environment=test`, `safeToArchive=true`

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| Testconfig aanwezig | `.env.local` aanwezigheid controleren zonder waarden te tonen | Supabase testconfig en `APP_ENV=test` beschikbaar | Supabase URL, anon key, service role key en project id aanwezig; testflags actief | PASS | Geen secretwaarden gelogd |
| Write gate uit | Provider local/demo en `maxwebstudioCrmTaskWriteEnabled` uit laten | CRM-taak lokaal opslaan, geen remote write | `fallback_local` | PASS | Lokaal opgeslagen via `maxwebstudioCrmTasks` |
| Anonymous insert blokkade | Directe `crm_tasks` insert zonder gebruiker proberen | RLS/PostgREST blokkeert write | HTTP 401 | PASS | Geen taak aangemaakt |
| Authenticated zonder profile | Testuser zonder actief profile probeert `crm_tasks` insert | RLS blokkeert write | HTTP 403 | PASS | Geen taak aangemaakt |
| Sales profile setup | Testuser met actief `sales` profile aanmaken | Interne rol beschikbaar voor RLS-test | Rol `sales` beschikbaar | PASS | Synthetische testuser/profile |
| CRM task write via bestaande service | Provider `supabase-write-test` + `maxwebstudioCrmTaskWriteEnabled=true`, daarna `saveCrmTaskWithWriteFallback()` gebruiken | Taak komt in `public.crm_tasks` terecht | `supabase_created` | PASS | Bestaande servicepad gevalideerd |
| Sales readback | De aangemaakte taak teruglezen met sales-token | Sales kan eigen/roltoegestane taak lezen | 1 rij zichtbaar | PASS | RLS evalueert succesvol |
| Anonymous readback | De aangemaakte taak proberen te lezen zonder gebruiker | Geen toegang of lege response | HTTP 401 | PASS | Geen publieke taaktoegang |

Conclusie:

- De eerste low-risk write-MVP voor `crm_tasks` is op staging bewezen.
- De lokale fallback werkt wanneer de gate uit staat.
- RLS blokkeert anonymous en authenticated users zonder actief profile.
- Een interne `sales` rol kan via de bestaande write-service een testtaak aanmaken.
- Testdata is bewust gemarkeerd als veilige staging-testdata en niet verwijderd, zodat er geen delete-feature nodig was.

Resterend:

- Productie-write-mode blijft `NO-GO`.
- Server-side audit logging is nog niet actief voor deze write.
- Fijnmazigere sales/support ownership policies blijven later nodig voordat bredere productie-writes live mogen.

## Fase 35B Lead Notes Write MVP

Status: `PASS / STAGING VALIDATED`

Scope:

- Tweede low-risk write-MVP voor leadnotities.
- Geen productie, geen echte klantdata, geen scraping of externe API.
- Geen volledige lead overwrite; alleen `notes`, `updated_at` en veilige metadata.

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| Lead note service syntax | `leadNoteWriteService.js` controleren | Geen syntaxfouten | Syntaxcheck groen | PASS | Geen runtime secrets |
| Lead note local fallback | Gate uit, lokale lead, notitie opslaan | Notitie wordt lokaal appended | `lead note fallback test: ok` | PASS | `maxwebstudioLeadFinderLeads`, status `fallback_local` |
| Supabase testconfig aanwezig | `.env.local` aanwezigheid controleren zonder waarden te tonen | Testconfig aanwezig | Supabase keys en testflags aanwezig | PASS | Geen secretwaarden gelogd |
| DNS naar Supabase staging | Supabase host resolven | Host bereikbaar | DNS ok | PASS | Eerdere `ENOTFOUND` was een tijdelijke runtime/netwerk-blocker |
| Demo-record isolation check | Eerste run met `is_demo=true` testlead | Niet gebruiken als customer-isolation bewijs | Demo-policy maakte record bewust zichtbaar | NOT_APPLICABLE | Demo-records zijn bedoeld voor brede demo-read policies |
| Staging lead note write | Sales-role testlead bijwerken via bestaande service | Notitie komt in `public.leads.notes` | Notitie appended op synthetische non-demo testlead | PASS | Run `phase-35b1-rerun-1782775482334` |
| Allowed fields guard | Vergelijk velden voor/na update | Alleen `notes`, `updated_at` en veilige metadata wijzigen | Alleen toegestane velden gewijzigd | PASS | Geen volledige lead overwrite |
| Customer/no-profile RLS | Customer/no-profile probeert leadnote write | RLS blokkeert update | Customer en no-profile kregen 0 rows; anonymous kreeg 401 | PASS | Customer read gaf ook 0 rows |

Conclusie:

- De leadnote write-MVP is technisch toegevoegd, lokale fallback is bewezen en staging write/RLS is gevalideerd.
- De eerdere DNS-blocker is opgelost; de Supabase staging-host en algemene DNS-resolutie werken weer.
- Customer isolation is bewezen met synthetische testdata (`environment=test`, `is_demo=false`, `safeToArchive=true`), omdat demo-records bewust via demo-read policies zichtbaar kunnen zijn.
- Productie blijft `NO-GO`.

## Fase 35C Change Requests Write MVP

Status: `PASS / STAGING VALIDATED`

Scope:

- Derde low-risk write-MVP voor wijzigingsverzoeken vanuit het klantportaal.
- Customer mag alleen een nieuw `change_request` aanmaken.
- Geen update, delete of statuswijziging door customer.
- Geen productie, geen echte klantdata en geen admin-workflow.

Evidence runs:

- Eerste security run: `phase-35c-1782798481392`
- RLS patch: `supabase/migration-drafts/008_change_request_customer_ownership.sql`
- Herhaalde PASS-run: `phase-35c-rerun-1782798584503`

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| Change request service syntax | `changeRequestWriteService.js` controleren | Geen syntaxfouten | Syntaxcheck groen | PASS | Geen runtime secrets |
| Change request local fallback | Gate uit, lokale klant, verzoek opslaan | Verzoek wordt lokaal opgeslagen | `change request fallback test: ok` | PASS | `maxwebstudioChangeRequests`, status `fallback_local` |
| Customer eigen insert | Customer met eigen `customer_id` maakt wijzigingsverzoek aan | Insert toegestaan | HTTP 201, 1 rij | PASS | Run `phase-35c-rerun-1782798584503` |
| Customer spoof met eigen `auth_user_id` | Customer probeert ander `customer_id` mee te sturen | RLS blokkeert insert | Eerst kwetsbaar, na patch HTTP 403 | PASS | Patch `008` vereist `owns_customer(customer_id)` |
| Customer spoof zonder `auth_user_id` | Customer probeert ander `customer_id` zonder auth_user_id | RLS blokkeert insert | HTTP 403 | PASS | Geen spoofing toegestaan |
| Anonymous insert | Anonymous probeert wijzigingsverzoek aan te maken | RLS/PostgREST blokkeert write | HTTP 401 | PASS | Geen publieke write-toegang |
| Customer read isolation | Customer leest eigen en andere customer requests | Alleen eigen request zichtbaar | Eigen rows 1, andere rows 0 | PASS | Customer isolation bewezen |

Conclusie:

- De klantportaal change-request create-MVP werkt met local fallback en staging write.
- De eerste stagingrun vond terecht een RLS-spoofingrisico in de bestaande insert/read policies.
- Patch `008_change_request_customer_ownership.sql` scherpt `change_requests_owner_read` en `change_requests_customer_insert` aan zonder andere writes te verbreden.
- Productie blijft `NO-GO` totdat production approvals, server-side audit logging en write-governance zijn afgerond.

## Fase 35D Client Portal Messages Write MVP

Status: `PASS / STAGING VALIDATED`

Scope:

- Vierde low-risk write-MVP voor klantportaalberichten.
- Customer mag alleen een nieuw bericht binnen eigen klantcontext aanmaken.
- Geen update, delete of sender spoofing.
- Geen productie, geen echte klantdata en geen externe services.

Evidence run:

- Run: `phase-35d-1782800213876`
- RLS patch: `supabase/migration-drafts/009_client_portal_message_customer_ownership.sql`

| Testnaam | Stappen | Verwacht resultaat | Werkelijk resultaat | Status | Evidence / notities |
| --- | --- | --- | --- | --- | --- |
| Client portal message service syntax | `clientPortalMessageWriteService.js` controleren | Geen syntaxfouten | Syntaxcheck groen | PASS | Geen runtime secrets |
| Client portal message local fallback | Gate uit, lokale klant, bericht opslaan | Bericht wordt lokaal opgeslagen | `client portal message fallback test: ok` | PASS | `maxwebstudioClientPortalMessages`, status `fallback_local` |
| Customer eigen insert | Customer met eigen `customer_id` maakt bericht aan | Insert toegestaan | HTTP 201, 1 rij | PASS | Run `phase-35d-1782800213876` |
| Sender spoofing | Customer probeert `sender_type=admin` | RLS blokkeert insert | HTTP 403 | PASS | Sender blijft customer-only |
| Customer spoofing | Customer probeert ander `customer_id` | RLS blokkeert insert | HTTP 403 | PASS | Ownership afgedwongen |
| Sender profile spoofing | Customer probeert ander `sender_profile_id` | RLS blokkeert insert | HTTP 403 | PASS | Eigen profile verplicht |
| No-profile user | Authenticated user zonder profile probeert insert | RLS blokkeert insert | HTTP 403 | PASS | Geldig profile vereist |
| Anonymous insert | Anonymous probeert bericht aan te maken | RLS/PostgREST blokkeert write | HTTP 401 | PASS | Geen publieke write-toegang |
| Customer read isolation | Customer leest eigen en andere customer messages | Alleen eigen message zichtbaar | Eigen rows 1, andere rows 0 | PASS | Customer isolation bewezen |

Conclusie:

- De klantportaalbericht create-MVP werkt met local fallback en staging write.
- Patch `009_client_portal_message_customer_ownership.sql` scherpt owner insert aan voor customer context en sender identity.
- Sprint 1 low-risk writes is nu volledig gevalideerd op staging: CRM Tasks, Lead Notes, Change Requests en Client Portal Messages.
- Productie blijft `NO-GO` totdat production approvals, server-side audit logging en write-governance zijn afgerond.

## Sprint 1 Review Low-risk Writes

Status: `PASS / COMPLETED`

| Module | Evidence run | Staging | Fallback | RLS/security | Productie |
| --- | --- | --- | --- | --- | --- |
| CRM Tasks | `phase-35a1-1782774691838` | PASS | PASS | PASS | NO-GO |
| Lead Notes | `phase-35b1-rerun-1782775482334` | PASS | PASS | PASS | NO-GO |
| Change Requests | `phase-35c-rerun-1782798584503` | PASS | PASS | PASS | NO-GO |
| Client Portal Messages | `phase-35d-1782800213876` | PASS | PASS | PASS | NO-GO |

Conclusie:

- Sprint 1 is volledig staging-gevalideerd.
- Productie-write-mode blijft dicht.
- Sprint 2 mag pas starten na expliciete medium-risk writeplanning, auditstrategie en production governance.

## Sprint 2A Project Status Write

Status: `PASS / STAGING VALIDATED`

Scope:

- Alleen `projects`.
- Alleen `status`, `phase`, `progress`, `updated_at` en veilige metadata.
- Geen project create/delete/archive.
- Geen `customer_id`, `website_id`, notes, ownership of finance fields.
- Alleen via `supabase-write-test` en `maxwebstudioProjectStatusWriteEnabled=true`.

Staging patch:

- `supabase/migration-drafts/010_project_status_update_grants.sql`
- Uitgevoerd op staging/testproject `maxwebstudio-test`.
- Doel: `authenticated` update beperken tot projectstatuskolommen voordat RLS policies evalueren.

Evidence:

- Eerste run: `phase-35-2a-1782801289791`
- Bevinding: customer/no-profile requests kregen HTTP 200 met lege resultset; er werd geen rij aangepast. Testverwachting aangescherpt naar "0 rows changed = blocked".
- PASS-run: `phase-35-2a-1782801332755`

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Support update | Bevoegde interne rol kan projectstatus aanpassen | HTTP 200, status `development`, progress `45` | PASS | RLS `projects_support_update` werkt |
| Customer update | Customer kan projectstatus niet wijzigen | HTTP 200 met 0 gewijzigde rijen | PASS | RLS blokkeert effectieve update |
| Anonymous update | Anonymous wordt geblokkeerd | HTTP 401 | PASS | Geen publieke write-toegang |
| No-profile update | Authenticated zonder profile kan niet wijzigen | HTTP 200 met 0 gewijzigde rijen | PASS | Geen effectieve update |
| Customer/ownership spoof | Extra `customer_id` veld wordt geblokkeerd | HTTP 403 | PASS | Column-level grants blokkeren gevoelige velden |
| Notes/extra field spoof | Extra `notes` veld wordt geblokkeerd | HTTP 403 | PASS | Alleen statuskolommen toegestaan |
| Customer portal read | Customer leest bijgewerkte projectstatus via RLS/readlaag | HTTP 200, status `development`, progress `45` | PASS | Klantportaal-read blijft klantveilig |
| Local fallback | Gate/provider uit gebruikt localStorage fallback | `fallback_local` | PASS | Geen Supabase write zonder gate |

Conclusie:

- Sprint 2A Project Status Write is staging-gevalideerd.
- Productie-write-mode blijft `NO-GO`.
- Server-side audit logging ontbreekt nog.
- Patch `010` is alleen staging-toegepast en vereist production release approval vóór live.

## Sprint 2B Customer Contact Write

Status: `PASS / STAGING GEVALIDEERD`

Scope:

- Alleen `customers`.
- Alleen `name`, `email`, `phone`, `notes`, `updated_at` en veilige metadata.
- Geen customer create/delete/archive.
- Geen `auth_user_id`, `profile_id`, ownership, status, portal/login, facturatie, abonnementen of rollen.
- Alleen via `supabase-write-test` en `maxwebstudioCustomerContactWriteEnabled=true`.

Voorbereide staging patch:

- `supabase/migration-drafts/011_customer_contact_update_grants.sql`
- Doel: `authenticated` update beperken tot customer-contactkolommen voordat RLS policies evalueren.

Uitgevoerde checks:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| JS syntax | Gewijzigde JS is valide | `node --check` groen | PASS | `customerContactWriteService`, provider, storage keys |
| Admin inline script | Dashboard script valide | Groen | PASS | Inline scriptcheck |
| Local fallback | Gate/provider uit gebruikt localStorage fallback | `fallback_local` | PASS | Geen Supabase write zonder gate |
| Staging patch `011` | Patch uitgevoerd op `maxwebstudio-test` | Uitgevoerd | PASS | Alleen `011_customer_contact_update_grants.sql` |
| Interne rol update | Sales/support/admin kan contactvelden updaten | Sales update HTTP 200 | PASS | Run `sprint-2b-1782814316233` |
| Customer/no-profile/anonymous blokkade | Geen effectieve update | Customer/no-profile 0 rows, anonymous HTTP 401 | PASS | RLS blokkeert effectieve update |
| Spoofing | Extra status/auth/profile velden blokkeren | HTTP 403 | PASS | Status/auth/company spoofing geblokkeerd |
| Readback | Bijgewerkte contactdata leesbaar via read-layer | Bijgewerkte contactvelden zichtbaar, status/company ongewijzigd | PASS | Customer owner read ook PASS |

Conclusie:

- Sprint 2B Customer Contact Write is staging-gevalideerd.
- Productie-write-mode blijft `NO-GO`.
- Patch `011` is alleen staging-toegepast en vereist production release approval vóór live.
- Server-side audit logging ontbreekt nog.

## Sprint 2C Website Operational Write

Status: `PASS / STAGING GEVALIDEERD`

Scope:

- Alleen `websites`.
- Alleen `status`, `care_package`, `notes`, `last_checked_at`, `updated_at` en veilige metadata.
- Geen website create/delete/archive.
- Geen `customer_id`, `profile_id`, domein, GitHub, Netlify, hosting/deployment configuratie, billing of ownershipvelden.
- Alleen via `supabase-write-test` en `maxwebstudioWebsiteOperationalWriteEnabled=true`.

Staging patch:

- `supabase/migration-drafts/012_website_operational_update_grants.sql`
- Doel: `authenticated` update beperken tot website-operationele kolommen voordat RLS policies evalueren.

Uitgevoerde checks:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| JS syntax | Gewijzigde JS is valide | `node --check` groen | PASS | `websiteOperationalWriteService`, provider, storage keys |
| Admin inline script | Dashboard script valide | Groen | PASS | Inline scriptcheck |
| Local fallback | Gate/provider uit gebruikt localStorage fallback | `fallback_local` | PASS | Geen Supabase write zonder gate |
| Staging patch `012` | Patch uitgevoerd op `maxwebstudio-test` | Uitgevoerd | PASS | Alleen `012_website_operational_update_grants.sql` |
| Interne rol update | Developer/admin kan operationele websitevelden updaten | Developer update HTTP 200 | PASS | Run `sprint-2c-1782814909471` |
| Customer/no-profile/anonymous blokkade | Geen effectieve update | Customer/no-profile 0 rows, anonymous HTTP 401 | PASS | RLS blokkeert effectieve update |
| Spoofing | Extra customer/domain/deployment velden blokkeren | HTTP 403 | PASS | Customer/domain/Netlify spoofing geblokkeerd |
| Readback | Bijgewerkte website operationele data leesbaar via read-layer | Status/onderhoud/notities zichtbaar, domain/Netlify ongewijzigd | PASS | Customer portal read ook PASS |

Conclusie:

- Sprint 2C Website Operational Write is staging-gevalideerd.
- Sprint 2 Operationele Workflow Writes is volledig staging-gevalideerd.
- Productie-write-mode blijft `NO-GO`.
- Patch `012` is alleen staging-toegepast en vereist production release approval vóór live.
- Server-side audit logging ontbreekt nog.

## Sprint 2 Review

Status: `PASS / AFGEROND`

Reviewdocument:

- `docs/SPRINT_2_OPERATIONAL_WORKFLOW_WRITES_REVIEW.md`

Samenvatting:

| Sprint 2 onderdeel | Evidence run | Staging | RLS/security | Fallback | Productie |
| --- | --- | --- | --- | --- | --- |
| Project Status Updates | `phase-35-2a-1782801332755` | PASS | PASS | PASS | NO-GO |
| Customer Contact Updates | `sprint-2b-1782814316233` | PASS | PASS | PASS | NO-GO |
| Website Operational Updates | `sprint-2c-1782814909471` | PASS | PASS | PASS | NO-GO |

Conclusie:

- Sprint 2 completion: `100%`.
- Productie-write-mode blijft dicht.
- Volgende aanbevolen sprint: `Production Readiness Sprint`.

## Klantportaal v1A - Staging Auth Readiness Validation

Status: `PARTIAL PASS / AUTH NOG NIET LIVE / PRODUCTIE NO-GO`

Scope:

- Alleen readinessvalidatie voor `public/login.html`, `public/klantportaal.html`, `client-auth-config` en lokale stagingconfig.
- Geen Supabase Auth activatie.
- Geen SQL.
- Geen RLS-wijzigingen.
- Geen echte klantdata.

Uitgevoerde checks:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| `.env.local` aanwezigheid | Staging/testconfig lokaal aanwezig zonder waarden te tonen | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PROJECT_ID`, `APP_ENV`, `APP_ENVIRONMENT` aanwezig | PASS | Geen waarden gelogd |
| `.env.local` Git-ignore | Secrets niet in repo | `.env.local` en `.env.*.local` genegeerd | PASS | `git check-ignore` bevestigt `.env.local` |
| Omgevingsflags | Testomgeving herkenbaar | `APP_ENV=test`, `APP_ENVIRONMENT=test` | PASS | Geen productie-indicator in flags |
| Supabase URL-vorm | Browserveilige project URL | `https` en `.supabase.co` host | PASS | Hostnaam niet gelogd |
| Client auth config | Alleen publieke config teruggeven | HTTP 200, `supabaseUrl` en `supabaseAnonKey` aanwezig, geen service role in response | PASS | Geen secretwaarden gelogd |
| Frontend readiness service | Config detecteren zonder Auth live te zetten | `ready_for_staging_auth`, `authLive=false`, 1 blocker | PASS | Blocker: Auth blijft uit tot staging approval |
| Login inline script | Geen syntaxfout | Inline script OK | PASS | Geen UI redesign |
| Klantportaal inline script | Geen syntaxfout | Inline script OK | PASS | Fallback/readiness blijft actief |
| Normale bezoekersstatus | Geen technische Supabase-melding | Login blijft fallback `Binnenkort beschikbaar` zolang Auth niet live is | PASS | Gebaseerd op codepad/readiness |
| Login/logout echte stagingaccount | Alleen uitvoeren als stagingaccount veilig beschikbaar is | Niet uitgevoerd | BLOCKED | Testaccounts nog niet actief gebruikt |
| Password reset | Alleen uitvoeren als staging reset veilig is ingericht | Niet uitgevoerd | BLOCKED | Resetflow nog niet live gekoppeld |

Bevinding:

- Tijdens de validatie werd een kleine readiness-bug gevonden in `clientAuthReadinessService`.
- De bug is hersteld zodat de readiness-service lokaal correct `ready_for_staging_auth` kan rapporteren zonder Auth live te zetten.

Conclusie:

- Klantportaal v1A is klaar voor de volgende stap: echte staging Auth wiring met testaccounts.
- Productie blijft `NO-GO`.
- Echte login/logout, password reset en Customer A/B Auth-isolatie moeten nog met stagingaccounts worden uitgevoerd.

## Klantportaal v1B - Staging Login/Logout Test

Status: `PARTIAL PASS / GELDIGE LOGIN GEBLOKKEERD DOOR ONTBREKEN TESTACCOUNT / PRODUCTIE NO-GO`

Scope:

- Alleen staging/local env.
- Alleen publieke Supabase Auth endpoint met anon key.
- Geen productie-auth geactiveerd.
- Geen SQL.
- Geen RLS-wijzigingen.
- Geen echte klantdata.

Uitgevoerde checks:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Staging config aanwezig | Testconfig beschikbaar zonder waarden te tonen | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `APP_ENV=test`, `APP_ENVIRONMENT=test` aanwezig | PASS | Geen waarden gelogd |
| Testaccountcredentials aanwezig | Geldig staging testaccount beschikbaar | Geen testaccount e-mail/wachtwoord keys aanwezig in `.env.local` | BLOCKED | Geldige login niet veilig uitvoerbaar zonder credentials |
| Supabase Auth endpoint bereikbaar | Endpoint bereikbaar op staging URL | Endpoint reageert | PASS | Geen waarden gelogd |
| Verkeerd wachtwoord/dummy account | Auth blokkeert foutieve login | HTTP 400 met errorpayload | PASS | Geen geldig account gebruikt |
| Logout met geldige sessie | Sessie kan worden beëindigd | Niet uitgevoerd | BLOCKED | Vereist geldige staging sessie |
| Klantportaal alleen met geldige sessie | Zonder sessie geen echte klantdata | Huidige portal blijft demo/fallback en production Auth uit | PASS | Geen klantdata zichtbaar gemaakt |
| Niet-ingelogde bezoeker fallback | Bezoeker ziet geen technische Auth-details | Login blijft `Binnenkort beschikbaar` zolang Auth niet live is | PASS | Codepad ongewijzigd |
| Password reset | Alleen testen wanneer staging resetmail veilig is ingericht | Niet uitgevoerd | BLOCKED | Wacht op staging testaccount en mailconfig |

Conclusie:

- Staging Auth endpoint is bereikbaar en blokkeert foutieve login.
- Echte login/logout is nog niet bewezen, omdat er geen veilige testaccountcredentials beschikbaar zijn.
- Productie blijft `NO-GO`.
- Volgende stap: staging testaccounts en tijdelijke testcredentials veilig beschikbaar maken buiten de repo.

## Klantportaal Auth Config Debug

Status: `DIAGNOSE COMPLETE / GEEN AUTH ACTIVATIE / PRODUCTIE NO-GO`

Aanleiding:

- `login.html` toont nog `Binnenkort beschikbaar` terwijl `.env.local` publieke Supabase config bevat.

Uitgevoerde checks:

| Check | Resultaat | Status | Notities |
| --- | --- | --- | --- |
| `.env.local` keys | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENV`, `APP_ENVIRONMENT` aanwezig | PASS | Geen waarden getoond |
| Service role scope | `SUPABASE_SERVICE_ROLE_KEY` staat lokaal, maar wordt niet door `client-auth-config` teruggegeven | PASS | Server-side only blijft intact |
| Directe function test | `functions/client-auth-config.js` geeft met geladen env alleen `supabaseUrl` en `supabaseAnonKey` terug | PASS | Geen service role in response |
| Lokale endpoint via static localhost | `/.netlify/functions/client-auth-config` en `/api/client-auth-config` niet bereikbaar in deze sessie | BLOCKED | Gewone/static server laadt Netlify Functions niet |
| Readiness-service keynamen | Verwacht `supabaseUrl`/`SUPABASE_URL` en `supabaseAnonKey`/`SUPABASE_ANON_KEY` | PASS | Keynamen kloppen |
| Auth live flag | `authLive=false` en `supabaseAuthActive=false` houden echte login verborgen | PASS | Bewust beveiligingsgedrag |

Conclusie:

- De oorzaak is niet een ontbrekende `.env.local`, maar de route van `.env.local` naar de browser.
- `login.html` kan `.env.local` niet direct lezen.
- Voor lokale Auth-tests moet de site via Netlify Dev/functions of veilige runtime-config draaien.
- `Binnenkort beschikbaar` blijft terecht zichtbaar zolang `authLive=false`.

Next actions:

1. Start lokale test via Netlify Dev of configureer een veilige runtime-config met alleen `SUPABASE_URL` en `SUPABASE_ANON_KEY`.
2. Houd `SUPABASE_SERVICE_ROLE_KEY` server-side only.
3. Zet echte login pas aan in een aparte staging Auth wiring fase.

## Klantportaal v1C - Enable Staging Auth UI Locally

Status: `IMPLEMENTED / WACHT OP GELDIGE TESTACCOUNTVALIDATIE / PRODUCTIE NO-GO`

Scope:

- Alleen staging/local Auth UI gate.
- Geen productie-auth.
- Geen SQL.
- Geen RLS-wijzigingen.
- Geen service role naar frontend.

Toegevoegd gedrag:

- `CLIENT_PORTAL_AUTH_LIVE=true` is vereist om de echte login UI te tonen.
- De flag werkt alleen wanneer `APP_ENV=test` of `APP_ENVIRONMENT=test`.
- `client-auth-config` geeft de flag en environment labels door naast de publieke Supabase config.
- `supabaseAuthProvider` kan in staging via Supabase Auth REST inloggen, uitloggen, sessie herstellen en password reset starten.
- Supabase sessie wordt lokaal bewaard onder een staging-auth key, niet als productie-auth.

Checks:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Feature flag template | `CLIENT_PORTAL_AUTH_LIVE=false` in voorbeelden | Toegevoegd | PASS | Geen secrets |
| Productie dicht | Auth alleen actief bij test/staging env | Gate vereist test/staging | PASS | Productie blijft fallback |
| Service role scope | Geen service role naar frontend | Function geeft alleen publieke config + env labels + flag terug | PASS | Geen secretwaarden |
| JS syntax | Gewijzigde JS valide | `node --check` groen | PASS | Zie commitchecks |
| Geldige login | Testaccount kan inloggen | Nog niet uitgevoerd | BLOCKED | Wacht op staging testaccountcredentials |
| Logout | Geldige sessie kan uitloggen | Nog niet uitgevoerd | BLOCKED | Vereist geldige sessie |
| Session restore | Refresh behoudt sessie | Nog niet uitgevoerd | BLOCKED | Vereist geldige sessie |
| Password reset | Staging resetmail werkt | Nog niet uitgevoerd | BLOCKED | Vereist staging mail/testaccount |

## Klantportaal v1D - Link Staging Auth User to Demo Client Profile

Status: `IMPLEMENTED / STAGING-DEMO LINK READY / PRODUCTIE NO-GO`

Scope:

- Alleen local/staging.
- Geen productie-auth.
- Geen echte klantdata.
- Geen SQL.
- Geen RLS-wijzigingen.
- Geen service role naar frontend.

Resultaat:

- Een geldige Supabase staging-sessie kan nu lokaal worden gekoppeld aan een veilige demo-klant.
- `/klantportaal.html` vult automatisch `demo-staging-testklant` als klantcontext wanneer geen `customerId` in de URL staat.
- Het portaal toont daarna demo klantdata in plaats van `Klant niet gevonden`.
- De bronmelding vermeldt duidelijk dat dit een staging/demo-klantportaal is.
- Er is een staging-uitlogknop toegevoegd die de Supabase staging-sessie en lokale demo-sessie wist.

Checks:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Staging Auth bridge | Supabase staging user koppelt aan demo klant | Bridge seeding toegevoegd | PASS | Alleen als `CLIENT_PORTAL_AUTH_LIVE` + test/staging actief is |
| Productie dicht | Geen productie-auth of echte klantdata | Gate vereist staging/test | PASS | Geen SQL/RLS-wijzigingen |
| Service role scope | Geen service role naar frontend | Niet gebruikt | PASS | Alleen bestaande publieke staging-sessie |
| Klantportaal fallback | Geen `Klant niet gevonden` na staging login | Demo customer context wordt gezet | READY_FOR_MANUAL_VERIFY | Browsertest na login nodig |
| Logout | Staging/demo sessie wissen | Uitlogknop toegevoegd | READY_FOR_MANUAL_VERIFY | Te testen met ingelogde staging-sessie |

## Klantportaal v1E - Validate Staging Portal Session Flow

Status: `PASS WITH LOCAL STAGING SESSION SIMULATION / PRODUCTIE NO-GO`

Scope:

- Alleen local/staging.
- Geen productie-auth.
- Geen echte klantdata.
- Geen SQL.
- Geen RLS-wijzigingen.
- Geen service role naar frontend.

Validatie:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Login met testklant | Supabase staging login zet sessie | Eerder handmatig bewezen door gebruiker | PASS | `testklant@maxwebstudio.nl` redirect naar klantportaal werkt |
| Dashboard demo-data zichtbaar | Staging sessie koppelt aan demo klant | Simulatie seedt `demo-staging-testklant` + dashboardrecords | PASS | Geen echte klantdata |
| Refresh behoudt sessie | Bridge blijft actief bij bestaande Supabase sessie | `refreshActive=true` | PASS | Sessieherstel via local staging session |
| Logout werkt | Supabase staging sessie + lokale sessie weg | `afterLogoutActive=false`, `currentSessionAfterLogout=false` | PASS | Uitlogknop aanwezig in portaal |
| Na logout geen klantdata zichtbaar | Geen klantcontext zonder sessie | Bridge blijft inactief zonder Supabase sessie | PASS | Directe toegang zonder sessie valt terug op veilige fallback |
| Password reset-flow | Reset alleen via staging Auth | Niet opnieuw uitgevoerd | NOT_RUN | Apart te testen met staging mailconfig |
| Secrets/logs | Geen keys, wachtwoorden of service role | Secrets-scan groen | PASS | Alleen publieke staging sessie/context |

Conclusie:

- De staging klantportaalflow is rond voor login -> demo-dashboard -> refresh -> logout -> veilige fallback.
- Password reset blijft optioneel voor aparte mailconfig-validatie.
- Productie blijft `NO-GO` totdat echte klantprofielkoppeling, RLS en release approval live zijn bewezen.

## Klantportaal v1F - Validate Staging Password Reset

Status: `PARTIAL PASS / SUPABASE EMAIL VALIDATION BLOCKER / PRODUCTIE NO-GO`

Scope:

- Alleen local/staging.
- Geen productie-auth.
- Geen echte klantdata.
- Geen SQL.
- Geen RLS-wijzigingen.
- Geen service role naar frontend.

Validatie:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Reset endpoint bereikbaar | Supabase staging ontvangt request | Request bereikt staging Auth endpoint | PASS | Publieke anon key gebruikt, geen service role |
| Project/context | Staging project wordt gebruikt | Project ref en key-type veilig vastgesteld | PASS | Geen keywaarden gelogd |
| Resetmail aanvragen | Supabase accepteert testaccount voor recovery | Supabase retourneert `email_address_invalid` | BLOCKED | Testaccount/e-mailconfig moet in Supabase Auth worden gecontroleerd |
| Redirect URL/config | Recovery redirect wordt meegegeven | `/login.html?type=recovery` wordt als redirect voorbereid | PASS | Supabase moet localhost/staging URL toestaan |
| Foutmelding | Veilig en duidelijk | UI toont veilige resetfout; Developer Mode toont Supabase code/message | PASS | Geen e-mail, wachtwoord of keys in logs |
| Secrets/logs | Geen gevoelige waarden | Secrets-scan groen | PASS | Alleen code/status/project-ref/key-type |

Conclusie:

- De frontend reset-flow is correct gekoppeld aan Supabase staging en geeft veilige feedback.
- Supabase weigert de huidige resetaanvraag met `email_address_invalid`.
- Next action: controleer in Supabase Auth of het testaccount/e-mailadres exact bestaat en of recovery/mailinstellingen en redirect URLs voor localhost/staging toegestaan zijn.

## Epic 1.8 - Portal QA & UX Polish

Status: `PASS / STAGING-DEMO UX / PRODUCTIE NO-GO`

Scope:

- Alleen staging/demo klantportaal.
- Geen productiegegevens.
- Geen SQL.
- Geen RLS-wijzigingen.
- Geen OpenAI.
- Geen backendwijzigingen.

Validatie:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Loginpagina | Login UI bereikbaar via localhost | Loginpagina laadt via `localhost:8888` | PASS | Echte loginvelden zichtbaar in staging/local |
| Foutieve login | Duidelijke foutmelding zonder technische details | `Inloggen is niet gelukt. Controleer je e-mailadres en wachtwoord.` | PASS | Geen secrets of technische codes zichtbaar |
| Directe portal zonder sessie | Geen klantdata zichtbaar | Veilige fallback met `Naar login` en `Terug naar website` | PASS | Klantsecties/formulieren verborgen |
| Mobiel | Geen horizontale overflow | 390px viewport zonder overflow | PASS | Fallback blijft compact |
| Console | Geen console-errors | Geen errors gevonden | PASS | In-app browser QA |
| Technische termen | Geen klantzichtbare technische termen | Geen `RLS`, `SQL`, service role of anon key zichtbaar | PASS | Alleen klantvriendelijke fallback |
| Geldige staging login | Niet opnieuw uitvoeren zonder testwachtwoord | Eerder bewezen in v1E | NOT_RUN | Geen credentials in deze sessie gebruikt of gelogd |

Polish:

- directe toegang zonder klantcontext toont nu een nette veilige fallback;
- klantsecties en formulieren worden verborgen zolang er geen geldige klant/sessie is;
- bronmelding is klantvriendelijk gemaakt.

## Epic 2A.8 - Production Data Layer QA

Status: `PASS / LOCAL STATIC QA / PRODUCTIE NO-GO`

Scope:

- Alleen production-ready klantportaal datalagen.
- Geen productie-auth.
- Geen echte klantdata.
- Geen SQL.
- Geen RLS-wijzigingen.
- Geen OpenAI/Mollie.
- Geen nieuwe features.

Gecontroleerde datalagen:

- klantprofielcontext;
- Mijn Website/projectcontext;
- wijzigingsverzoeken;
- berichten;
- facturen/offertes/abonnementen;
- notificaties.

Validatie:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Klantprofielcontext zonder sessie | Geen klantdata, veilige fallback | `profile_missing` | PASS | Geen actieve Supabase Auth-sessie geeft geen payload |
| Website/projectcontext zonder sessie | Geen website/projectdata | `missing` | PASS | Fallback blijft beschikbaar |
| Wijzigingsverzoeken zonder sessie | Geen Supabase-read/write | `missing` | PASS | Geen klantdata zonder context |
| Berichten zonder sessie | Geen berichten uit Supabase | `missing` | PASS | Fallback blijft beschikbaar |
| Finance zonder sessie | Geen facturen/offertes/abonnementen uit Supabase | `missing` | PASS | Geen betaal- of factuurdata zonder context |
| Notificaties zonder sessie | Geen notificaties uit Supabase | `missing` | PASS | Actiecentrum valt terug op demo/local |
| Portal inline script | Script parsebaar | `Inline scripts OK (1)` | PASS | Geen syntax regressie |
| Service syntax | Nieuwe en bestaande contextservices parsebaar | `node --check` groen | PASS | Geen runtime feature toegevoegd |
| Service role frontend scan | Geen service-role in gewijzigde frontend paden | Secrets-scan groen | PASS | Alleen een oude documentatieregel met testmetadata matcht |
| Directe toegang zonder sessie | Geen klantdata zichtbaar | Contextservices geven geen `found` state | PASS | Echte browser-login niet opnieuw uitgevoerd |

Conclusie:

- Alle Epic 2A datalagen werken samen als production-ready foundation met veilige fallback.
- Zonder geldige sessie/customer-context wordt geen echte klantdata opgehaald of getoond.
- De bestaande staging/demo-flow blijft intact.
- Productie blijft `NO-GO` totdat echte Supabase-tabellen, RLS en production Auth-rollout opnieuw zijn gevalideerd.

## Epic 2B.4 - Production Database Preflight Inspection

Status: `PARTIAL PASS / DB READ BLOCKED / PRODUCTIE NO-GO`

Scope:

- Alleen read-only inspectie.
- Geen SQL die schema/data wijzigt.
- Geen migration apply.
- Geen deletes.
- Geen demo seed.
- Geen productie-auth activatie.

Validatie:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Productieproject | `maxwebstudio` is productie | `maxwebstudio` gevonden | PASS | Project ref `yxxahurphdbblkuxoeje` |
| Productie database host | Productie host bekend | `db.yxxahurphdbblkuxoeje.supabase.co` | PASS | Alleen host/ref vastgelegd, geen secrets |
| Staging/testproject | `maxwebstudio-test` blijft test | `maxwebstudio-test` gevonden | PASS | Project ref `xlxpuuycigeqhgxqtzni` |
| CLI linkstatus | CLI niet per ongeluk op productie | Lokale link staat op `maxwebstudio-test`; productie `linked: false` | PASS | `supabase/.temp/project-ref` bevat testref |
| Lokale env scheiding | `.env.local` niet productie | `.env.local` wijst naar testref | PASS | Geen values of keys gelogd |
| Productie tabellen | Tabellen read-only uitlezen | Niet uitgevoerd | BLOCKED | Productie DB connection string ontbreekt |
| Productie RLS/policies | Policies read-only uitlezen | Niet uitgevoerd | BLOCKED | Productie DB connection string ontbreekt |
| Productie datacounts | Counts van portal-tabellen uitlezen | Niet uitgevoerd | BLOCKED | Productie DB connection string ontbreekt |
| Echte klantdata check | Hard bevestigen dat productie leeg/veilig is | Niet uitvoerbaar in deze sessie | BLOCKED | Vereist datacounts op productie |
| Migration 013 safety | Conflicten met bestaande schema detecteren | Alleen statisch beoordeeld | PARTIAL | DB-read nodig voor harde conflictcheck |

Conclusie:

- Productie is correct geïdentificeerd.
- De lokale CLI is veilig gekoppeld aan staging/test en niet aan productie.
- Er is geen productie SQL uitgevoerd.
- Productie schema execution blijft `NO-GO` tot een read-only DB-inspectie met productie connection string of Supabase SQL Editor is afgerond.

Volgende stap:

- `Epic 2B.5 - Production read-only SQL inspection`

## Epic 2B.5 - Production Read-only SQL Inspection

Status: `READ COMPLETED / CONDITIONAL GO FULL ORDER / DIRECT 013 NO-GO`

Scope:

- Alleen read-only SQL-inspectie.
- Geen schemawijzigingen.
- Geen writes.
- Geen deletes.
- Geen migration apply.
- Geen demo seed.
- Geen secrets loggen of committen.

Validatie:

| Test | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| Production DB route | Tijdelijke DB connection string of SQL Editor output beschikbaar | Handmatige SQL Editor output aangeleverd | PASS | Geen secrets gelogd |
| CLI link safety | CLI niet op productie | CLI blijft op `maxwebstudio-test` | PASS | Productie niet gelinkt |
| Bestaande tabellen | Read-only tabeloverzicht | `profiles` en `change_requests` bestaan; portal-basistabellen ontbreken | PARTIAL_PASS | Basismigrations moeten eerst draaien |
| Bestaande kolommen | Read-only kolomoverzicht | Nog inhoudelijk beoordelen voor bestaande tabellen | NEEDS_REVIEW | Vooral `profiles` en `change_requests` |
| Bestaande RLS policies | Read-only policy-overzicht | Nog inhoudelijk beoordelen op afwijkende helpers/policies | NEEDS_REVIEW | Geen standalone GO voor `013` |
| Row counts | Counts voor portal-tabellen | `profiles`: 1, `change_requests`: 2, overige portal-tabellen ontbreken | PASS_WITH_CAUTION | Bestaande records inhoudelijk checken |
| Echte klantdata | Hard bewijs leeg/veilig | Nog bevestigen voor bestaande 3 records | NEEDS_CONFIRMATION | Geen deletes uitvoeren |
| Migration 013 conflicts | Conflict/no-conflict conclusie | `013` faalt standalone door ontbrekende tabellen | DIRECT_013_NO_GO | Full migration order is conditional GO |

Read-only SQL voor handmatige uitvoering is toegevoegd aan:

- `docs/EPIC_2B_PRODUCTION_SCHEMA_DEPLOYMENT_READINESS.md`

Conclusie:

- Productie is `CONDITIONAL GO` voor de volledige migration-volgorde.
- Productie is `NO-GO` voor het direct uitvoeren van alleen `013_client_portal_schema_rls_alignment.sql`.
- Reden: `013` verwacht bestaande canonical tabellen, terwijl `customers`, `websites`, `projects`, `client_portal_messages`, `quotes`, `invoices`, `subscriptions` en `client_portal_notifications` ontbreken.
- Er is geen productie SQL uitgevoerd door Codex.

## Epic 2B.11 - Production Client Portal Baseline Checkpoint

Status: `PASS / BASELINE COMPLETE / PRODUCTIE-AUTH NO-GO`

Scope:

- Alleen review en documentatie.
- Geen SQL uitgevoerd door Codex.
- Geen productie gewijzigd door Codex.
- Geen productie-auth geactiveerd.
- Geen demo seed.
- Geen OpenAI/Mollie/Resend.

Uitgevoerd op productie `maxwebstudio` volgens handmatige Supabase SQL Editor-flow:

| Migration | Verwacht | Resultaat | Status | Notities |
| --- | --- | --- | --- | --- |
| `000_production_existing_tables_alignment.sql` | Bestaande `profiles`/`change_requests` veilig uitlijnen | Uitgevoerd en gevalideerd | PASS | Geen data delete/rename |
| `001_client_portal_baseline.sql` | Minimale klantportaal-tabellen aanmaken | Uitgevoerd en gevalideerd | PASS | Geen brede platformtabellen |
| `002_client_portal_indexes.sql` | Alleen minimale klantportaal-indexes | Uitgevoerd en gevalideerd | PASS | Geen brede platform-indexes |
| `003_client_portal_rls_enablement.sql` | RLS aan op 7 klantportaal-tabellen | Uitgevoerd en gevalideerd | PASS | Productie-auth blijft dicht |
| `004_client_portal_rls_policies_and_grants.sql` | Minimale policies en grants | Uitgevoerd en gevalideerd | PASS | `anon` geen klantdata-grants; `authenticated` minimale grants |
| `005_client_portal_legacy_policy_cleanup.sql` | Oude policies verwijderen | Uitgevoerd en gevalideerd | PASS | Legacy profile update/read policies verwijderd |

Bevestigde validaties:

| Controle | Resultaat | Status |
| --- | --- | --- |
| Klantportaal-tabellen bestaan | Bevestigd | PASS |
| Row counts gecontroleerd | Bevestigd | PASS |
| Triggers bestaan | Bevestigd | PASS |
| Indexes bestaan | Bevestigd | PASS |
| Geen brede platform-indexes | Bevestigd | PASS |
| RLS op 7 klantportaal-tabellen | Bevestigd | PASS |
| Policies aangemaakt | Bevestigd | PASS |
| Legacy policies verwijderd | Bevestigd | PASS |
| Demo seed uitgesloten | Bevestigd | PASS |
| Finance/CRM/AI/brede platformtabellen uitgesloten | Bevestigd | PASS |

Conclusie:

- De minimale productie-databasebasis voor het klantportaal is compleet.
- Productie-auth blijft `NO-GO` totdat RLS/customer-isolation en frontend production-auth rollout apart groen zijn.
- Er zijn geen open schema blockers voor de volgende validatiefase.

Aanbevolen read-only eindcontrole vóór productie-auth:

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

## Production Frontend Rollout - Auth Gate Foundation

Datum: 2026-07-01

Status: `PASS / PREPARED`

Scope:

- productie-auth gate voorbereid in frontend/serverless config;
- geen productieconfig gewijzigd;
- geen SQL uitgevoerd;
- geen writes geopend.

Resultaten:

- `client-auth-config` accepteert production environment alleen met `CLIENT_PORTAL_AUTH_LIVE=true`: PASS;
- client readiness herkent production auth releasegate: PASS;
- Supabase Auth provider kan dezelfde veilige login/reset-flow voor production gebruiken: PASS;
- service-role blijft buiten frontend: PASS;
- production write gates blijven gesloten: PASS;
- syntax/checks: PASS.

Open live-validatie:

- Netlify production env vars zonder waarden controleren;
- live `/login.html` met production flag testen;
- live logout/session restore/password reset testen;
- RLS/customer isolation met echte productiecontext testen.

## Production Netlify Env Check

Datum: 2026-07-01

Status: `PASS / MANUAL NETLIFY CONFIG REQUIRED`

Controle zonder secrets:

- productieproject moet `maxwebstudio` zijn: PASS;
- productie project ref moet `yxxahurphdbblkuxoeje` zijn: PASS;
- `SUPABASE_URL` moet naar `yxxahurphdbblkuxoeje.supabase.co` wijzen: REQUIRED;
- `SUPABASE_ANON_KEY` moet de productie anon/publishable key zijn: REQUIRED;
- `SUPABASE_PROJECT_ID=yxxahurphdbblkuxoeje`: REQUIRED;
- `APP_ENV=production`: REQUIRED;
- `APP_ENVIRONMENT=production`: REQUIRED;
- `CLIENT_PORTAL_AUTH_LIVE=true` pas na releasebevestiging: REQUIRED LATER;
- `CLIENT_PORTAL_REDIRECT_URL=https://maxwebstudio.nl/login.html`: REQUIRED;
- `ADMIN_REDIRECT_URL=https://maxwebstudio.nl/admin-dashboard.html`: REQUIRED.

Browser-safety:

- `client-auth-config` geeft geen `SUPABASE_SERVICE_ROLE_KEY` terug: PASS;
- frontend gebruikt alleen `SUPABASE_URL` en `SUPABASE_ANON_KEY` voor browser-auth: PASS;
- service-role is alleen toegestaan in backend/serverless functies: PASS;
- production write gates blijven gesloten: PASS.

NO-GO totdat handmatig in Netlify bevestigd:

- waarden zijn aanwezig in production environment;
- waarden wijzen naar production project `maxwebstudio`;
- `CLIENT_PORTAL_AUTH_LIVE` is bewust op het juiste moment gezet;
- live auth smoke test is uitgevoerd.
