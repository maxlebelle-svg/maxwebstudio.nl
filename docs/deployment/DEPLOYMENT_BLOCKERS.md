# Deployment Blockers

Status: alle blockers starten als `pending`. Codex mag geen approvals faken.

## Wat betekent NO-GO

`NO-GO` betekent dat productie-deployment, live RLS of provider switch niet verantwoord is. De code mag voorbereid zijn, maar bewijs en handmatige goedkeuring ontbreken nog.

## Wat betekent GO

`GO` mag alleen wanneer iedere blocker `approved` of `not_applicable` is, met evidence en waar nodig een approver.

## Statussen

- `pending`: nog niet opgepakt
- `in_review`: bewijs wordt beoordeeld
- `approved`: handmatig goedgekeurd
- `rejected`: afgekeurd, deployment blijft geblokkeerd
- `not_applicable`: bewust niet van toepassing, met reden

## Blockers

| ID | Waarom | Resolved wanneer | Evidence | Wie mag goedkeuren |
| --- | --- | --- | --- | --- |
| `backup_confirmed` | Zonder backup is rollback onzeker. | Backup is gemaakt en vindbaar. | backup bestandsnaam, datum, locatie/notitie | eigenaar/technisch verantwoordelijke |
| `rls_review_approved` | RLS kan datalekken veroorzaken bij fouten. | RLS draft is gereviewd. | reviewer, datum, opmerkingen | technisch verantwoordelijke |
| `rls_test_log_completed` | Policies moeten bewezen werken in test. | Testlog is ingevuld met pass/fail. | verwijzing naar log, samenvatting | tester + eigenaar |
| `auth_test_completed` | Auth/roles bepalen toegang. | Login/profile/role tests zijn uitgevoerd. | datum, rollen, issues | technisch verantwoordelijke |
| `customer_isolation_test_completed` | Klant A/B isolatie is kritisch. | A/B, demo en anonymous scenario's pass. | datum, scenarioresultaat | eigenaar/technisch verantwoordelijke |
| `rollback_plan_approved` | Rollback moet vooraf duidelijk zijn. | Procedure is expliciet goedgekeurd. | approvedBy, datum, opmerkingen | eigenaar |
| `legacy_customer_tables_mitigated` | Legacy `customer_*` mag niet terug in live-flow. | Mitigatie is gekozen en gedocumenteerd. | verwijzing naar consolidated plan/mapping | technisch verantwoordelijke |
| `env_vars_verified` | Verkeerde env vars kunnen productie breken. | Namen/omgevingen zijn gecontroleerd zonder secrets op te slaan. | checklist, datum, omgeving | eigenaar/technisch verantwoordelijke |

## Fase 14.4A - Next actions voor Supabase test setup

Status: `blocked_pending_supabase_test_setup`

Voordat Fase 14.4B uitgevoerd kan worden:

1. Maak een apart Supabase testproject aan.
2. Leg vast dat het project niet de productieomgeving is.
3. Vul lokale of Netlify test-env-vars in zonder ze te committen.
4. Bevestig dat `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY` naar test wijzen.
5. Maak Supabase CLI of een goedgekeurde alternatieve execution route beschikbaar.
6. Voer daarna pas schema/Auth/RLS/Storage tests uit.

Blockers die hierdoor nog open blijven:

- `env_vars_verified`
- `auth_test_completed`
- `rls_test_log_completed`
- `customer_isolation_test_completed`

Nieuwe evidence mag alleen verwijzen naar testproject, screenshots/logsamenvattingen en checkliststatus. Noteer nooit keys of wachtwoorden.

## Fase 14.4B - Echte testomgeving evidence

Status: `NO-GO / BLOCKED`

Uitgevoerd:

- `supabase/schema.sql` is door gebruiker succesvol uitgevoerd op het Supabase testproject.
- `supabase/rls-policies.sql` is door gebruiker succesvol uitgevoerd op het Supabase testproject.
- Auth Admin API kon 2 testgebruikers aanmaken.
- Storage testbucket kon worden aangemaakt/hergebruikt.
- Storage upload, signed URL en private public-endpoint blokkade zijn geslaagd.

Open blockers:

| Blocker | Status | Evidence | Volgende actie |
| --- | --- | --- | --- |
| `env_vars_verified` | in_review | `.env.local` aanwezig, testflags actief, `.gitignore` sluit `.env.local` uit | Handmatig bevestigen dat Supabase URL/project id naar testproject wijzen |
| `auth_test_completed` | blocked | Auth Admin user creation PASS | Login/session/profile mapping opnieuw testen na database grants |
| `rls_test_log_completed` | blocked | RLS policies uitgevoerd, maar RLS-testrecords konden niet worden geplaatst | Grants toevoegen en RLS A/B test opnieuw draaien |
| `customer_isolation_test_completed` | blocked | Customer A/B users bestaan, maar isolatie niet uitvoerbaar | Testrecords plaatsen en A/B isolatie opnieuw testen |
| Storage evidence | in_review | Bucket/upload/signed URL/private endpoint PASS | Handmatig reviewen of bucketconfig past bij productieplan |

Belangrijkste technische blocker:

- `POST /rest/v1/profiles` met service role gaf `403 permission denied for table profiles`.
- Supabase gaf als hint: `GRANT SELECT, INSERT ON public.profiles TO service_role;`
- Hierdoor zijn database/RLS/customer-isolation tests nog niet betrouwbaar uitvoerbaar.

Geen blocker is automatisch approved.

## Fase 14.4D - RLS recursion patch

Status: `PATCH EXECUTED ON TEST / VALIDATED`

Patchbestand:

- `supabase/rls-recursion-patch.sql`

Doel:

- RLS-recursie oplossen in helperfuncties die `public.profiles` raadplegen.
- Customer isolation intact houden.
- Geen brede bypass policies toevoegen.

Verwachte impact:

- `current_profile_id()` en `current_app_role()` kunnen profile/role lookup uitvoeren zonder recursie door profile-RLS.
- `has_app_role()` en `is_admin_role()` blijven dezelfde rolgrens gebruiken.
- Policies op klanten, websites, projecten, bestanden, offertes, facturen en abonnementen blijven ownership afdwingen via customer-koppelingen.

Rollback:

- Herstel helperfunctie-definities uit `supabase/rls-policies.sql`.
- Herhaal RLS/customer-isolation tests.

Uitgevoerd:

1. `supabase/rls-recursion-patch.sql` is door de gebruiker uitgevoerd op het Supabase testproject.
2. Fase 14.4B exact-id RLS/customer-isolation tests zijn herhaald.
3. Customer A/B isolation is technisch PASS in run `phase-14-4b-final-1782737698429`.
4. Blockers blijven in review totdat handmatige approval is vastgelegd.

## Fase 14.4C - Permission patch voorbereid

Status: `PATCH PREPARED / NOT EXECUTED`

Patchbestand:

- `supabase/service-role-grants.sql`

Doel:

- PostgREST-grants toevoegen voor de canonical tabellen.
- Service role backend/admin/testflows toestaan via de REST API.
- `anon` en `authenticated` genoeg tabeltoegang geven zodat RLS policies de daadwerkelijke toegang kunnen bepalen.

Scope:

- Alleen canonical tabellen uit `supabase/schema.sql`.
- Geen legacy `customer_*` tabellen.
- Geen data-mutaties.
- Geen productie-execution.

Volgende actie:

1. Review `supabase/service-role-grants.sql`.
2. Voer de patch alleen uit op het Supabase testproject.
3. Herhaal Fase 14.4B.
4. Zet blockers pas in review/approved na echte Customer A/B evidence.

## Fase 14.4B rerun - Evidence na grants

Status: `NO-GO / BLOCKED`

Uitgevoerd nadat `supabase/service-role-grants.sql` succesvol op het Supabase testproject is uitgevoerd.

Verbeterd:

- De eerdere `403 permission denied for table profiles` is opgelost.
- Service role kan via PostgREST testprofiles plaatsen.
- Auth Admin API kan testgebruikers aanmaken.
- Customer A/B kunnen inloggen.
- Canonical testrecords konden worden geplaatst.
- Storage private bucket/upload/signed URL/public-blocking blijft PASS.

Nieuwe blocker:

- RLS-selects geven `500 stack depth limit exceeded`.
- Dit wijst op RLS-recursie in de rol/profile helperlaag.
- Customer isolation is daarom nog niet bewezen.

Open blockers:

| Blocker | Status | Evidence | Volgende actie |
| --- | --- | --- | --- |
| `auth_test_completed` | in_review | Auth users created + login PASS | Profile/RLS mapping pas afronden na RLS-recursiefix |
| `rls_test_log_completed` | blocked | RLS select faalt met `stack depth limit exceeded` | RLS helper/policies aanpassen zodat `profiles` niet recursief zichzelf bevraagt |
| `customer_isolation_test_completed` | blocked | A/B testrecords bestaan, maar reads falen met 500 | Na RLS-recursiefix A/B exact-id test opnieuw draaien |
| `env_vars_verified` | in_review | `.env.local` testflags actief en gitignored | Handmatig bevestigen dat project werkelijk test is |

Geen blocker is automatisch approved.

## Fase 14.4B final rerun - Evidence na RLS recursion patch

Status: `NO-GO / AWAITING MANUAL APPROVAL`

Uitgevoerd nadat `supabase/rls-recursion-patch.sql` succesvol op het Supabase testproject is uitgevoerd.

Verbeterd:

- De eerdere `403 permission denied for table profiles` blijft opgelost.
- De eerdere `500 stack depth limit exceeded` is verdwenen.
- Auth Admin API kan testgebruikers aanmaken.
- Customer A/B kunnen inloggen.
- Canonical testrecords konden worden geplaatst.
- RLS exact-id reads werken zonder recursie.
- Customer A ziet uitsluitend eigen records.
- Customer B ziet uitsluitend eigen records.
- Cross-customer access geeft 0 rijen.
- Anonymous access geeft 0 rijen.
- Storage private bucket/upload/signed URL/public-blocking blijft PASS.

Evidence:

- Run: `phase-14-4b-final-1782737698429`
- Tabellen: `profiles`, `customers`, `websites`, `projects`, `files`, `quotes`, `quote_lines`, `invoices`, `invoice_lines`, `subscriptions`
- Resultaat per tabel:
  - Customer A own: 1 rij
  - Customer A cross: 0 rijen
  - Customer B own: 1 rij
  - Customer B cross: 0 rijen
  - Anonymous: 0 rijen

Open blockers:

| Blocker | Status | Evidence | Volgende actie |
| --- | --- | --- | --- |
| `env_vars_verified` | in_review | `.env.local` aanwezig, testflags actief en gitignored | Eigenaar bevestigt handmatig dat de URL/project id naar het testproject wijzen |
| `auth_test_completed` | in_review | Auth users created + login/session PASS in run `phase-14-4b-final-1782737698429` | Handmatige review/approval toevoegen |
| `rls_test_log_completed` | in_review | RLS exact-id reads PASS; geen `stack depth limit exceeded` meer | Handmatige review/approval toevoegen |
| `customer_isolation_test_completed` | in_review | Customer A/B isolation PASS op 10/10 canonical tabellen | Handmatige review/approval toevoegen |
| Storage evidence | in_review | Private bucket/upload/signed URL/public-blocking PASS | Handmatig reviewen of bucketconfig past bij productieplan |
| `rollback_plan_approved` | pending | Rollbackplan bestaat, maar approval ontbreekt | Eigenaar reviewt en keurt rollbackplan goed |
| `backup_confirmed` | pending | Geen nieuwe backup-evidence in deze run | Backup-evidence toevoegen voor production readiness |

Belangrijk:

- Deze technische tests geven sterke release-evidence.
- Geen blocker is automatisch approved.
- Release blijft `NO-GO` totdat de vereiste handmatige approvals en backup-evidence zijn vastgelegd.

## Fase 14.5 - Release Candidate Approval Pack

Status: `NO-GO / AWAITING MANUAL APPROVAL`

Nieuw centraal document:

- `docs/deployment/RELEASE_CANDIDATE_CHECKLIST.md`

Doel:

- Alle resterende blockers omzetten naar concrete approval/evidence-items.
- Een finale checklist maken voordat er een GO/NO-GO releasebesluit genomen wordt.
- Geen productie wijzigen en geen approvals faken.

Approval/evidence-items:

| Item | Status | Evidence / document | Volgende actie |
| --- | --- | --- | --- |
| Backup evidence | pending | `RELEASE_CANDIDATE_CHECKLIST.md` beschrijft benodigde metadata | Backup maken/aanwijzen en verificatie vastleggen |
| Env-var confirmation | in_review | Test/prod variabelenlijst vastgelegd zonder waarden | Eigenaar bevestigt scheiding test/productie |
| Auth approval | in_review | Run `phase-14-4b-final-1782737698429` | Handmatig reviewen en approve/reject vastleggen |
| RLS review approval | pending | RLS policies, service grants en recursion patch beschikbaar | Technische review vastleggen |
| RLS testlog approval | in_review | RLS exact-id tests PASS | Handmatig reviewen en approve/reject vastleggen |
| Customer isolation approval | in_review | A/B isolation PASS op 10/10 canonical tabellen | Handmatig reviewen en approve/reject vastleggen |
| Rollback approval | pending | `ROLLBACK_PLAN.md` + RC checklist | Owner approval vastleggen |
| Storage review | in_review | Private bucket/upload/signed URL/public-blocking PASS | Productie bucketstrategie reviewen |
| Mollie readiness | pending | Nog geen live/testmodus evidence in deze RC | Testen of bewust `not_applicable` maken |
| Resend readiness | pending | Nog geen live/testmail evidence in deze RC | Testen of bewust `not_applicable` maken |
| Netlify Functions runtime | pending | Syntax PASS, runtime calls niet in deze RC bewezen | Runtime test of bewust `not_applicable` maken |

Release blijft `NO-GO` totdat alle vereiste blockers `approved` of `not_applicable` zijn.

## Netlify environment variables audit

Status: `NO-GO / ENV VAR CONFIRMATION REQUIRED`

Uitgevoerd zonder secretwaarden te tonen.

Wat is gecontroleerd:

- `.env.example`
- `.env.local.example`
- `netlify.toml`
- Functions met `process.env.*`
- Lokale Netlify metadata/auth beschikbaarheid

Resultaat:

- Repo templates bevatten de belangrijkste Supabase, Admin, Resend, Mollie en URL keys.
- Runtime/functions gebruiken dezelfde kernkeys.
- Extra runtime keys gevonden en toegevoegd aan de env templates: `EMAIL_PROVIDER`, `BASE_URL`, `MOLLIE_MODE`, `MOLLIE_TEST_API_KEY`.
- Lokale repo bevat geen Netlify CLI, geen `.netlify/state.json`, geen `NETLIFY_AUTH_TOKEN` en geen `NETLIFY_SITE_ID`.
- Daardoor kon de echte Netlify environment variable configuratie per deploy context niet automatisch worden uitgelezen.

Deploy-context status:

| Context | Status | Risico | Volgende actie |
| --- | --- | --- | --- |
| Production | te bevestigen | Hoog als production functions secrets missen | Bevestig alle production keys in Netlify UI |
| Deploy preview | te bevestigen / mogelijk not_applicable | Middel als previews Supabase/Auth/RLS moeten testen | Bevestig of preview eigen testkeys krijgt of bewust geen adminflows draait |
| Branch deploy | te bevestigen / mogelijk not_applicable | Middel als branch deploys als testomgeving gebruikt worden | Bevestig branch-context policy |
| Local/dev | gedeeltelijk bewezen via `.env.local` testflags | Laag voor repo, maar geen Netlify bewijs | Blijft lokale evidence; geen Netlify approval |

Specifieke beoordeling `SUPABASE_SERVICE_ROLE_KEY`:

- Repo-gebruik is server-side via Netlify Functions.
- Er is geen bewijs dat de key in frontendcode of docs met waarde staat.
- Het is veilig dat deze key bewust maar in 1 deploy context staat als alleen die context server-side Supabase adminflows mag uitvoeren.
- Het is release-blokkerend als production functions live moeten draaien maar de key alleen in een andere context staat.
- Deploy previews/branch deploys zonder service role key zijn acceptabel als admin/write tests daar bewust `not_applicable` zijn.

Open blocker update:

| Blocker | Status | Evidence | Volgende actie |
| --- | --- | --- | --- |
| `env_vars_verified` | blocked | Repo/templates/runtime geaudit; Netlify live contexten niet uitleesbaar vanuit lokale repo | Handmatig Netlify UI/API export controleren en contextstatus vastleggen |
| `netlify_functions_runtime` | pending | Function env usage in kaart gebracht; runtime context secrets niet bewezen | Test minimaal één function in de beoogde deploy context |
| `resend_readiness` | pending | `RESEND_API_KEY`, `FROM_EMAIL`, `ADMIN_EMAIL`, `LEAD_*` vereist/optioneel in kaart | Bevestig contexten en testmail of markeer not_applicable |
| `mollie_readiness` | pending | `MOLLIE_API_KEY`, `MOLLIE_MODE`, `MOLLIE_TEST_API_KEY` en `BASE_URL` staan nu in templates | Bevestig contexten en testmodus of markeer not_applicable |

Next actions:

1. Open Netlify > Site configuration > Environment variables.
2. Controleer per key alleen aanwezigheid en deploy context, geen waarden kopiëren.
3. Leg vast of `SUPABASE_SERVICE_ROLE_KEY` alleen production heeft of ook test/preview.
4. Bevestig of `EMAIL_PROVIDER`, `BASE_URL`, `MOLLIE_MODE` en `MOLLIE_TEST_API_KEY` per context nodig zijn of bewust optioneel/not_applicable.
5. Houd release `NO-GO` totdat `env_vars_verified` handmatig approved is.

## Bewijsregels

- Geen secrets in evidence.
- Geen API keys, tokens of wachtwoorden opslaan.
- Evidence is tekst/notitie in Developer Mode of documentverwijzing.
- Approved/rejected vraagt handmatige bevestiging.
## Fase 14.2 - Evidence en manual approval flow

Elke blocker gebruikt nu een blocker-specifiek evidence schema. Codex mag blockers niet automatisch goedkeuren.

Statusflow:

- `pending`
- `in_review`
- `approved`
- `rejected`
- `not_applicable`

Regels:

- `approved` vereist alle verplichte evidencevelden.
- `approved` vereist een reviewer/approver.
- `rejected` vereist een reden.
- `not_applicable` vereist een reden.
- reset naar `pending` vereist een reden.
- GO kan alleen wanneer alle blockers `approved` of `not_applicable` zijn.

Evidencevelden:

| Blocker | Verplichte velden |
| --- | --- |
| backup_confirmed | backupName, backupDate, backupLocation, verifiedBy, notes |
| rls_review_approved | reviewer, reviewDate, reviewedDocs, findings, approvalNotes |
| rls_test_log_completed | testLogReference, testDate, passCount, failCount, blockedCount, summary |
| auth_test_completed | testDate, rolesTested, loginFlowResult, profileMappingResult, issues |
| customer_isolation_test_completed | testDate, customerAScenario, customerBScenario, demoScenario, anonymousScenario, resultSummary |
| rollback_plan_approved | approver, approvalDate, rollbackPlanVersion, rollbackNotes |
| legacy_customer_tables_mitigated | mitigationDecision, reviewedFiles, riskAcceptedBy, mitigationNotes |
| env_vars_verified | environmentName, verifiedBy, verificationDate, checkedVariables, missingVariables, notes |

Audit trail:

- createdAt
- updatedAt
- statusChangedAt
- statusChangedBy
- evidenceUpdatedAt
- evidenceUpdatedBy
- approvalHistory[]

Elke history entry bewaart `fromStatus`, `toStatus`, `by`, `at`, `reason` en een evidence snapshot. Noteer nooit secrets in evidence, notes of reason.

## Fase 28 staging execution blocker

Status: `BLOCKED_PRE_EXECUTION`

Fase 28 is gestart met productieplatform-mindset, maar bewust gestopt voordat SQL werd uitgevoerd.

Evidence:

- `.env.local` bestaat en is uitgesloten via `.gitignore`.
- `APP_ENV=test` en `APP_ENVIRONMENT=test`.
- Supabase testkeys zijn aanwezig zonder waarden te tonen.
- Supabase CLI is niet beschikbaar.
- Er is geen database connection string aanwezig.
- `psql` is lokaal aanwezig, maar zonder staging database connection string niet bruikbaar.
- Geen SQL uitgevoerd.
- Geen productie geraakt.

Risico:

Zonder expliciet SQL-uitvoerkanaal zou execution alleen via handmatige of oncontroleerbare routes kunnen. Dat past niet bij de releaseguardrails.

Next actions:

1. Kies één veilige execution route:
   - Supabase CLI voor staging/test; of
   - test-only database connection string; of
   - handmatige SQL Editor execution met evidence.
2. Leg vast welke route is gekozen.
3. Herstart Fase 28 vanaf `001_schema_tables.sql`.
4. Vul `TEST_RESULTS.md` per SQL-stap aan.
5. Houd release `NO-GO` totdat staging execution, RLS en customer isolation bewezen zijn.

## Fase 28.1 development environment readiness

Status: `NOT_READY`

Readiness inventarisatie:

| Onderdeel | Status | Notitie |
| --- | --- | --- |
| Git | ready | Beschikbaar voor evidence commits |
| Node.js | ready | Beschikbaar voor checks |
| npm | ready | Beschikbaar |
| psql | partial | Aanwezig, maar geen test-only connection string |
| Supabase CLI | ready | Geinstalleerd; versie `2.108.0`; te gebruiken via `/opt/homebrew/bin/supabase`; gelinkt aan `maxwebstudio-test` |
| Netlify CLI | missing | Niet nodig voor migration execution |
| `.env.local` | ready | Aanwezig en door Git genegeerd |
| `APP_ENV` / `APP_ENVIRONMENT` | ready | Beide op test |
| Supabase test keys | present | Aanwezig zonder waarden te tonen |
| DB connection string | missing | Nodig voor psql fallback |

Aanbevolen execution route:

1. Primair: Supabase CLI installeren en koppelen aan test/staging.
2. Fallback: test-only DB connection string gebruiken met psql.
3. Handmatig: Supabase SQL Editor alleen met extra evidence per stap.

Blocker blijft open totdat route 1 of 2 klaar is, of handmatige SQL Editor execution expliciet gekozen en gedocumenteerd is.

Hercontrole na installatie:

- Supabase CLI binary gevonden via `/opt/homebrew/bin/supabase`.
- Versie bevestigd met tijdelijke HOME: `2.108.0`.
- Directe `supabase --version` werkt nog niet in de Codex shell omdat `/opt/homebrew/bin` niet in PATH staat.
- CLI probeerde telemetry/config naar `~/.supabase` te schrijven; in deze sandbox is daarvoor geen schrijfrecht.
- Geen SQL uitgevoerd en geen Supabase project geraakt.

Resterende blocker:

- Geen toolingblocker meer voor Fase 28 execution. Blijf strikt werken met het gelinkte test/staging project en leg iedere SQL-stap vast.

Ready update:

- CLI login/link is succesvol afgerond.
- Gelinkt project: `maxwebstudio-test`.
- Project ref matcht de test `SUPABASE_URL`.
- `supabase/.temp/` is toegevoegd aan `.gitignore`.
- Fase 28 kan opnieuw starten met de Supabase CLI-route.

## Fase 28 staging schema drift blocker

Status: `BLOCKED`

Fase 28 is opnieuw gestart en heeft de eerste echte migration execution op staging bereikt.

Resultaat:

- `001_schema_tables.sql`: PASS.
- `002_indexes.sql`: FAIL.
- `003_rls_enablement.sql`: niet uitgevoerd.
- `004_rls_policies.sql`: niet uitgevoerd.
- `005_audit_logging_foundation.sql`: niet uitgevoerd.
- `006_seed_demo_data_optional.sql`: niet uitgevoerd.

Fout:

- `ERROR 42703: column "lead_score" does not exist`
- Faalpunt: `create index if not exists leads_score_idx on public.leads(lead_score);`

Oorzaak:

- Staging bevat een oudere `public.leads` tabel zonder `lead_score`.
- De nieuwe schema draft gebruikt `create table if not exists`, waardoor bestaande drift niet wordt gepatcht.

Risico:

- RLS/policies uitvoeren bovenop schema drift kan onbetrouwbare of misleidende testresultaten geven.

Next actions:

1. Gebruik geen schema-drift patch voor deze stagingdatabase.
2. Volg `docs/deployment/STAGING_RESET_PLAN.md`.
3. Reset de stagingdatabase of maak een nieuwe schone testbranch na expliciete approval.
4. Herhaal daarna Fase 28 vanaf `001_schema_tables.sql`.

Release blijft `NO-GO` totdat migration execution, RLS en Customer A/B isolation volledig PASS zijn.

## Fase 28 staging reset decision

Status: `READY_FOR_MANUAL_APPROVAL`

Besluit:

- Geen schema-drift patch maken.
- Staging moet terug naar een schone canonical basis.
- Fase 28 wordt pas hervat na handmatige resetapproval.

Waarom:

- Een patch zou uitzonderingen bouwen rond een vervuilde testdatabase.
- De canonical architectuur moet op een schone stagingomgeving bewezen worden.
- RLS/customer-isolation evidence is pas betrouwbaar nadat de volledige migrationvolgorde vanaf `001` slaagt.

Plan:

- Zie `docs/deployment/STAGING_RESET_PLAN.md`.

Open approvalpunten:

- Bevestig dat reset uitsluitend `maxwebstudio-test` raakt.
- Bevestig dat productie niet gelinkt is.
- Bevestig dat er geen echte klantdata in staging staat.
- Bevestig of bestaande testdata/export nodig is.
- Bevestig dat testdata verloren mag gaan.

## Fase 28 runtime role grants blocker

Status: `RESOLVED_ON_STAGING`

Na expliciete approval is de staging reset uitgevoerd en zijn alle migration drafts succesvol toegepast op `maxwebstudio-test`.

Geslaagd:

- `public` schema reset.
- `001_schema_tables.sql`.
- `002_indexes.sql`.
- `003_rls_enablement.sql`.
- `004_rls_policies.sql`.
- `005_audit_logging_foundation.sql`.
- `006_seed_demo_data_optional.sql`.

Structurele evidence:

- 22 public tabellen.
- 85 indexes.
- 22 RLS-enabled tabellen.
- 70 policies.
- `public.leads.lead_score` bestaat.
- Demo seed aanwezig.

Blocker:

- Customer A/B isolation kon niet worden bewezen.
- RLS-test als `authenticated` faalde met `ERROR 42501: permission denied for table customers`.
- Supabase hint: `GRANT SELECT ON public.customers TO authenticated;`

Risico:

- Zonder runtime role grants kunnen frontend/Auth/RLS-flows niet betrouwbaar lezen of schrijven.
- RLS policies kunnen inhoudelijk correct zijn, maar blijven ontestbaar voor echte runtime rollen.

Next actions:

1. Ontwerp een minimale runtime role grants migration/patch.
2. Review per tabel welke acties `authenticated`, `anon` en `service_role` nodig hebben.
3. Voer grants alleen uit op staging na expliciete approval.
4. Herhaal Customer A/B isolation en demo isolation.
5. Houd release `NO-GO` tot isolatie volledig bewezen is.

Prepared patch:

- `supabase/migration-drafts/007_runtime_role_grants.sql`

Patchstatus:

- `EXECUTED_ON_STAGING / VALIDATED`

Grantstrategie:

- `anon`: schema usage, geen directe klantdatatabelrechten.
- `authenticated`: minimale SQL-operaties op app-tabellen zodat RLS policies kunnen evalueren.
- `service_role`: server-side backend/admin/test grants.
- `audit_logs`: geen directe authenticated insert/update/delete; audit helper service-role-only.

Validatie:

- Customer A/B isolation PASS.
- Demo user isolation PASS.
- Customer ziet geen Leadfinder-data.
- Customer kan audit logs niet lezen of direct muteren.
- Anonymous krijgt geen klantdatatabelrechten.
- Interne basisrollen werken volgens de huidige policies.

Resterend:

- Productie blijft `NO-GO` tot alle releasecandidate approvals en production environment checks zijn afgerond.

## Fase 35A.1 CRM task write validation

Status: `VALIDATED_ON_STAGING`

Scope:

- Alleen bestaande Fase 35A `crm_tasks` create MVP.
- Geen nieuwe write-features.
- Geen update/delete.
- Geen productieproject of echte klantdata.

Evidence:

- Run: `phase-35a1-1782774691838`
- Fallback gate-off test: `PASS`
- Anonymous insert blokkade: `PASS`
- Authenticated user zonder actief profile: `PASS`
- Sales profile write via bestaande service: `PASS`
- Sales readback: `PASS`
- Anonymous readback blokkade: `PASS`

Resultaat:

- `crm_tasks` create-only write is bewezen op staging/test.
- De write-gate werkt: provider `supabase-write-test` + `maxwebstudioCrmTaskWriteEnabled=true` is verplicht.
- Testrecords zijn gemarkeerd als `is_demo=true`, `environment=test` en `safeToArchive=true`.

Resterende blockers:

- Productie-write-mode blijft geblokkeerd.
- Server-side audit logging ontbreekt nog.
- Fijnmazige ownership voor sales/support moet worden aangescherpt voordat bredere CRM task writes naar productie mogen.
- Leadnotities, change requests en klantportaalberichten zijn nog niet gevalideerd als writes.

## Fase 35B Lead notes write validation

Status: `VALIDATED_ON_STAGING`

Scope:

- Alleen leadnotities append/veldbeperkt.
- Geen volledige lead-update.
- Geen delete.
- Geen productieproject of echte klantdata.

Evidence:

- Local fallback: `PASS`
- Syntaxchecks: `PASS`
- Supabase testconfig aanwezig zonder waarden te tonen: `PASS`
- DNS/root cause: `PASS`, eerdere `ENOTFOUND` niet meer reproduceerbaar
- Staging write/RLS: `PASS`
- Evidence run: `phase-35b1-rerun-1782775482334`
- Allowed fields: alleen `notes`, `updated_at` en veilige metadata gewijzigd
- Customer/no-profile/anonymous: blocked of empty result zoals verwacht
- Testdata: synthetisch, `environment=test`, `is_demo=false`, `metadata.safeToArchive=true`

Belangrijke testnotitie:

- Een eerste run met `is_demo=true` is niet gebruikt als customer-isolation bewijs, omdat demo-records bewust via demo-read policies zichtbaar mogen zijn.
- De gevalideerde run gebruikt daarom non-demo synthetische testdata.

Resterende blockers:

1. Productie-write-mode blijft geblokkeerd.
2. Server-side audit logging voor leadnote writes ontbreekt nog.
3. Brede lead update/delete blijft geblokkeerd.
4. Change requests en klantportaalberichten moeten nog apart als write-MVP worden gevalideerd.

## Fase 35C Change requests write validation

Status: `VALIDATED_ON_STAGING`

Scope:

- Alleen customer create van `change_requests`.
- Geen update/delete.
- Geen customer statuswijziging.
- Geen productieproject of echte klantdata.

Evidence:

- Local fallback: `PASS`
- Syntaxchecks: `PASS`
- Eerste staging security run: `phase-35c-1782798481392`
- Bevinding: customer kon met eigen `auth_user_id` een ander `customer_id` meesturen door te brede RLS insert/read policy.
- Patch uitgevoerd op staging: `supabase/migration-drafts/008_change_request_customer_ownership.sql`
- Herhaalde staging/RLS run: `phase-35c-rerun-1782798584503`
- Eigen customer insert: `PASS`, HTTP 201
- Customer spoofing met/zonder `auth_user_id`: `PASS`, HTTP 403
- Anonymous insert: `PASS`, HTTP 401
- Customer read isolation: `PASS`, eigen rows 1, andere rows 0

Resterende blockers:

1. Productie-write-mode blijft geblokkeerd.
2. Server-side audit logging voor change-request writes ontbreekt nog.
3. De RLS-patch is alleen op staging toegepast; productie-uitvoering vereist release approval.
4. Client portal messages moeten nog apart als write-MVP worden gevalideerd.

## Fase 35D Client portal messages write validation

Status: `VALIDATED_ON_STAGING`

Scope:

- Alleen customer create van `client_portal_messages`.
- Geen update/delete.
- Geen sender spoofing.
- Geen productieproject of echte klantdata.

Evidence:

- Local fallback: `PASS`
- Syntaxchecks: `PASS`
- Patch uitgevoerd op staging: `supabase/migration-drafts/009_client_portal_message_customer_ownership.sql`
- Staging/RLS run: `phase-35d-1782800213876`
- Eigen customer insert: `PASS`, HTTP 201
- Sender spoofing `admin`: `PASS`, HTTP 403
- Customer spoofing: `PASS`, HTTP 403
- Sender profile spoofing: `PASS`, HTTP 403
- No-profile user: `PASS`, HTTP 403
- Anonymous insert: `PASS`, HTTP 401
- Customer read isolation: `PASS`, eigen rows 1, andere rows 0

Sprint 1 status:

- CRM Tasks: `VALIDATED_ON_STAGING`
- Lead Notes: `VALIDATED_ON_STAGING`
- Change Requests: `VALIDATED_ON_STAGING`
- Client Portal Messages: `VALIDATED_ON_STAGING`

Resterende blockers:

1. Productie-write-mode blijft geblokkeerd.
2. Server-side audit logging voor low-risk writes ontbreekt nog.
3. RLS-patches `008` en `009` zijn alleen op staging toegepast; productie-uitvoering vereist release approval.
4. Medium-risk writes mogen pas na Sprint Review en production governance-plan.

## Sprint 2A Project status write validation

Status: `VALIDATED_ON_STAGING`

Scope:

- Alleen interne projectstatus update op `projects`.
- Toegestane velden: `status`, `phase`, `progress`, `updated_at`, veilige metadata.
- Geen create/delete/archive.
- Geen ownership/customer/website/finance/file/AI writes.

Evidence:

- Patch uitgevoerd op staging: `supabase/migration-drafts/010_project_status_update_grants.sql`
- Eerste staging run: `phase-35-2a-1782801289791`
- Testinterpretatie aangescherpt: customer/no-profile kregen HTTP 200 met 0 gewijzigde rijen; dit is een RLS-block zonder effectieve update.
- Herhaalde staging/RLS run: `phase-35-2a-1782801332755`
- Support update: `PASS`, HTTP 200
- Customer update: `PASS`, 0 gewijzigde rijen
- Anonymous update: `PASS`, HTTP 401
- No-profile update: `PASS`, 0 gewijzigde rijen
- Customer/ownership spoofing: `PASS`, HTTP 403
- Extra field spoofing: `PASS`, HTTP 403
- Customer portal readback: `PASS`
- Local fallback: `PASS`

Resterende blockers:

1. Productie-write-mode blijft geblokkeerd.
2. Server-side audit logging voor medium-risk writes ontbreekt nog.
3. Patch `010` is alleen op staging toegepast; productie-uitvoering vereist release approval.
4. Sprint 2B mag pas starten na expliciete keuze en validatieplan voor customer contact updates.

## Sprint 2B Customer contact write validation

Status: `PASS / STAGING GEVALIDEERD / PRODUCTIE NOG GEBLOKKEERD`

Scope:

- Alleen customer contactvelden op `customers`.
- Toegestane velden: `name`, `email`, `phone`, `notes`, `updated_at`, veilige metadata.
- Geen ownership/account/status/finance/subscription/role writes.

Voorbereid:

- `public/src/services/customerContactWriteService.js`
- `supabaseProvider.updateCustomerContact()`
- Feature gate `maxwebstudioCustomerContactWriteEnabled`
- Laatste status key `maxwebstudioLastCustomerContactWriteStatus`
- Patch `supabase/migration-drafts/011_customer_contact_update_grants.sql`

Evidence:

- Local fallback: `PASS`
- JS/admin syntaxchecks: `PASS`
- Staging patch: `PASS`
- Staging validation run: `sprint-2b-1782814316233`
- Interne sales-role update: `PASS`
- Customer/no-profile/anonymous blokkade: `PASS`
- Spoofing van status/auth/company: `PASS`
- Readback: `PASS`

Opgelost:

- Supabase CLI-link naar `maxwebstudio-test` is hersteld.
- Patch `011` is uitsluitend op staging uitgevoerd.
- RLS blokkeert effectieve customer/no-profile updates.
- Anonymous wordt geblokkeerd met HTTP 401.
- Extra/spoofed velden worden met HTTP 403 geblokkeerd.

Resterende blockers:

1. Productie-write-mode blijft dicht.
2. Patch `011` is alleen staging-toegepast en vereist production release approval.
3. Server-side audit logging ontbreekt nog.
4. Sprint 2C Website Operational Updates vereist nog production release approval.

## Sprint 2C Website operational write validation

Status: `PASS / STAGING GEVALIDEERD / PRODUCTIE NOG GEBLOKKEERD`

Scope:

- Alleen operationele websitevelden op `websites`.
- Toegestane velden: `status`, `care_package`, `notes`, `last_checked_at`, `updated_at`, veilige metadata.
- Geen customer/project/profile/domain/deployment/hosting/billing/ownership writes.

Voorbereid:

- `public/src/services/websiteOperationalWriteService.js`
- `supabaseProvider.updateWebsiteOperational()`
- Feature gate `maxwebstudioWebsiteOperationalWriteEnabled`
- Laatste status key `maxwebstudioLastWebsiteOperationalWriteStatus`
- Patch `supabase/migration-drafts/012_website_operational_update_grants.sql`

Evidence:

- Local fallback: `PASS`
- JS/admin syntaxchecks: `PASS`
- Staging patch: `PASS`
- Staging validation run: `sprint-2c-1782814909471`
- Interne developer-role update: `PASS`
- Customer/no-profile/anonymous blokkade: `PASS`
- Spoofing van customer/domain/Netlify: `PASS`
- Customer portal readback: `PASS`

Resterende blockers:

1. Productie-write-mode blijft dicht.
2. Patch `012` is alleen staging-toegepast en vereist production release approval.
3. Server-side audit logging ontbreekt nog.
4. Sprint 2 Review moet nog uitgevoerd worden voordat Sprint 3 start.
