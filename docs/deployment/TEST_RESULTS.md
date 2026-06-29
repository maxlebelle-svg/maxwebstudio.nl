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
