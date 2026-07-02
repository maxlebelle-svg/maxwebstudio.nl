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

## RC1 Final Handmatige Validatiechecklist

Status: `READY FOR MANUAL EXECUTION`

Gebruik deze korte checklist voor de laatste RC1-test met een intern testaccount en een testfactuur. Noteer alleen veilige evidence: datum, tester, testaccount-label, quote/factuur-id, Netlify deploy-id, commit hash en uitkomst. Noteer nooit wachtwoorden, tokens, API keys of volledige betaalgegevens.

Voorwaarden:

- Gebruik alleen een intern testaccount of expliciet goedgekeurde eerste klant.
- Mollie blijft in testmodus; er wordt geen live geld geind.
- Resend/Mollie/Supabase keys blijven server-side en worden niet in screenshots of docs gezet.
- Test directe toegang zonder sessie in een incognito venster of na logout.

### 1. Geldig Klantaccount

- [ ] `https://maxwebstudio.nl/login.html` opent zonder console-breaking errors.
- [ ] Inloggen met geldig klantaccount lukt.
- [ ] Het klantportaal opent met de juiste klantcontext.
- [ ] Er verschijnt geen demo-portaal of demo-fallback na geldige login.
- [ ] Lege websites/projecten/berichten/facturen worden netjes als lege staat getoond, niet als "klant niet gevonden".

### 2. Wijzigingsverzoek

- [ ] Tab/sectie `Wijzigingen` opent.
- [ ] Type, titel, omschrijving en prioriteit zijn bruikbaar op desktop en mobiel.
- [ ] `Wijziging aanvragen` geeft een duidelijke succesmelding of nette foutmelding.
- [ ] Het nieuwe verzoek is zichtbaar in het klantportaal of adminportaal.
- [ ] Geen klantdata van een andere klant zichtbaar.

### 3. Bericht

- [ ] Tab/sectie `Berichten` opent.
- [ ] Nieuw bericht sturen geeft een duidelijke succesmelding of nette foutmelding.
- [ ] Het bericht is zichtbaar in de gespreksthread of admincontext.
- [ ] De layout voelt als korte directe communicatie, niet als technische log.

### 4. Offerte Akkoord

- [ ] Offertelink opent professioneel en mobiel bruikbaar.
- [ ] Klantnaam, pakket, bedrag en toelichting kloppen.
- [ ] Akkoord geven vereist duidelijke klantactie.
- [ ] Na akkoord is status `Geaccepteerd` zichtbaar in admin/offertecontext.
- [ ] Er start geen automatische provisioning zonder adminbevestiging.

### 5. Factuur

- [ ] Factuurlink opent professioneel en mobiel bruikbaar.
- [ ] Klant, bedrag, status en omschrijving kloppen.
- [ ] Print/downloadweergave is bruikbaar.
- [ ] `Betaal factuur` verschijnt alleen wanneer er een betaallink bestaat.
- [ ] Zonder betaallink toont de pagina een nette uitleg.

### 6. Mollie Testbetaling

- [ ] Netlify production gebruikt Mollie testmodus voor deze validatie.
- [ ] Adminactie `Maak betaallink` maakt server-side een Mollie testbetaling aan.
- [ ] Er komt geen Mollie key naar de frontend.
- [ ] Mollie test checkout opent.
- [ ] Testbetaling wordt afgerond zonder live geld.
- [ ] Webhook of veilige fallback-test verwerkt de status.
- [ ] Factuurpagina toont daarna `Betaald`.
- [ ] Klantportaal toont daarna `Betaald`.

### 7. Logout

- [ ] Logout werkt vanuit het klantportaal.
- [ ] Na logout keert de gebruiker terug naar login of veilige fallback.
- [ ] Browser back/direct URL toont geen klantdata meer zonder sessie.

### 8. Directe Toegang Zonder Sessie

- [ ] Open `https://maxwebstudio.nl/klantportaal.html` zonder sessie.
- [ ] Er verschijnt alleen een veilige login/fallback melding.
- [ ] Er is geen demo-portaal zichtbaar.
- [ ] Er is geen klantdata zichtbaar.

### RC1 GO/NO-GO

RC1 mag pas naar `GO` wanneer minimaal deze punten groen zijn:

- [ ] Geldige login + juiste klantcontext: PASS.
- [ ] Directe toegang zonder sessie: PASS.
- [ ] Wijzigingsverzoek: PASS.
- [ ] Bericht: PASS.
- [ ] Offerte akkoord: PASS.
- [ ] Factuur openen: PASS.
- [ ] Mollie testbetaling: PASS, of expliciet `not_applicable` met reden en owner approval.
- [ ] Logout + geen klantdata na logout: PASS.

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

Status van deze audit:

- Repo templates gecontroleerd: `.env.example` en `.env.local.example`.
- Function runtime usage gecontroleerd via `process.env.*`.
- Netlify live-config kon vanuit deze lokale repo niet automatisch worden uitgelezen: geen Netlify CLI, geen `.netlify/state.json`, geen `NETLIFY_AUTH_TOKEN` en geen `NETLIFY_SITE_ID` aanwezig.
- Daarom blijft Netlify env-var confirmation `in_review` totdat de Netlify UI of Netlify API metadata handmatig is bevestigd.

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

## Netlify Env-Var Context Audit

Controleer in Netlify per deploy context zonder waarden te kopiëren.

| Key | Vereist volgens repo | Gebruikt door runtime/functions | Production | Deploy preview | Branch deploy | Local/dev | Risico als ontbreekt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `SUPABASE_URL` | ja | ja | te bevestigen | te bevestigen indien preview Supabase gebruikt | te bevestigen indien branch Supabase gebruikt | lokaal via `.env.local` | Supabase reads/writes en Auth-config falen |
| `SUPABASE_ANON_KEY` | ja | ja | te bevestigen | te bevestigen indien preview Auth/RLS test | te bevestigen indien branch Auth/RLS test | lokaal via `.env.local` | Client Auth-config en RLS reads falen |
| `SUPABASE_SERVICE_ROLE_KEY` | ja, server-only | ja | te bevestigen | bewust wel/niet bevestigen | bewust wel/niet bevestigen | alleen lokaal/server-side | Admin/functions kunnen geen server-side Supabase acties uitvoeren |
| `SUPABASE_PROJECT_ID` | ja | indirect/checklist | te bevestigen | te bevestigen | te bevestigen | lokaal via `.env.local` | Test/prod verwisseling minder goed controleerbaar |
| `ADMIN_TOKEN` | ja | ja | te bevestigen | te bevestigen indien admin functions getest worden | te bevestigen indien admin functions getest worden | lokaal indien admin tests | Admin endpoints blokkeren of zijn niet testbaar |
| `SITE_URL` | ja | ja | te bevestigen | contextspecifiek bevestigen | contextspecifiek bevestigen | lokaal via `.env.local` | Mollie/Auth/e-mail links kunnen naar verkeerde URL wijzen |
| `APP_ENVIRONMENT` | ja | ja/checklist | `production` bevestigen | `test` of `preview` bevestigen | `test` of branchnaam bevestigen | `test` | Verkeerde environment-logica of releasebesluit |
| `DATA_PROVIDER_MODE` | ja | ja/app settings | productie-modus bevestigen | preview-modus bevestigen | branch-modus bevestigen | local/hybrid | Data-provider kan onverwacht local/Supabase kiezen |
| `RESEND_API_KEY` | ja | ja | te bevestigen indien e-mail live moet | alleen testkey of niet aanwezig | alleen testkey of niet aanwezig | optioneel test | E-mails worden overgeslagen of falen |
| `FROM_EMAIL` | ja | ja | te bevestigen | te bevestigen indien e-mailtest | te bevestigen indien e-mailtest | optioneel | Afzender valt terug of Resend weigert |
| `ADMIN_EMAIL` | ja | ja | te bevestigen | te bevestigen indien notificaties getest | te bevestigen indien notificaties getest | optioneel | Interne notificaties vallen terug of missen BCC |
| `LEAD_TO_EMAIL` | ja | ja | te bevestigen | te bevestigen indien leadtest | te bevestigen indien leadtest | optioneel | Leadmails vallen terug of gaan niet naar juiste inbox |
| `LEAD_FROM_EMAIL` | ja | ja | te bevestigen | te bevestigen indien leadtest | te bevestigen indien leadtest | optioneel | Leadmail-afzender valt terug of faalt |
| `MOLLIE_API_KEY` | ja | ja | alleen live key bij production GO | niet gebruiken of testkey apart | niet gebruiken of testkey apart | niet gebruiken of testkey | Betaalverzoeken/webhooks falen of raken verkeerde Mollie omgeving |
| `MOLLIE_WEBHOOK_SECRET` | ja in template | beperkt/optioneel | te bevestigen indien webhookvalidatie actief is | optioneel test | optioneel test | optioneel | Webhookvalidatie kan incompleet zijn |
| `EMAIL_PROVIDER` | ja | ja | optioneel, default `resend` | optioneel | optioneel | optioneel | Provider-keuze niet expliciet |
| `BASE_URL` | ja | ja, `mollie-products.js` | te bevestigen of vervangen door `SITE_URL`-strategie | contextspecifiek | contextspecifiek | lokaal via `.env.local` | Product/payment links kunnen fallback gebruiken |
| `MOLLIE_MODE` | ja | ja, `mollie-products.js` | `live` pas bij GO | `test` indien gebruikt | `test` indien gebruikt | `test` | Verkeerde Mollie key-selectie |
| `MOLLIE_TEST_API_KEY` | ja | ja, `mollie-products.js` | optioneel/niet production | te bevestigen indien Mollie test | te bevestigen indien Mollie test | optioneel | Mollie testproducten werken niet |

### Service Role Key Context Beoordeling

`SUPABASE_SERVICE_ROLE_KEY` mag nooit in frontendcode, publieke runtimeconfig of documentatie met waarde staan. In deze repo wordt de key alleen server-side via Netlify Functions gebruikt.

Als `SUPABASE_SERVICE_ROLE_KEY` bewust maar in 1 Netlify deploy context staat:

- Dat is veilig wanneer alleen die context server-side Supabase adminflows mag uitvoeren.
- Dat blokkeert bewust admin/functions in andere contexten.
- Deploy previews en branch deploys moeten dan niet gebruikt worden voor admin/Supabase-write tests, tenzij daar een aparte test service role key is ingesteld.
- Production GO vereist dat production functions toegang hebben tot de production service role key.

Risico-inschatting:

- Laag voor security als de key alleen server-side en contextspecifiek staat.
- Middel voor release readiness zolang niet handmatig bevestigd is welke context de key heeft.
- Hoog als production functions live moeten werken maar de key alleen in een niet-production context staat.

## Template Coverage T.o.v. Runtime

Aanwezig in `.env.example` en `.env.local.example`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_ID`
- `APP_ENV`
- `APP_ENVIRONMENT`
- `DATA_PROVIDER`
- `DATA_PROVIDER_MODE`
- `ADMIN_TOKEN`
- `SITE_URL`
- `CLIENT_PORTAL_REDIRECT_URL`
- `ADMIN_REDIRECT_URL`
- `EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_EMAIL`
- `LEAD_TO_EMAIL`
- `LEAD_FROM_EMAIL`
- `BASE_URL`
- `MOLLIE_MODE`
- `MOLLIE_API_KEY`
- `MOLLIE_TEST_API_KEY`
- `MOLLIE_WEBHOOK_SECRET`

Eerder gevonden als runtime-only en nu toegevoegd aan `.env.example` en `.env.local.example`:

- `EMAIL_PROVIDER`
- `BASE_URL`
- `MOLLIE_MODE`
- `MOLLIE_TEST_API_KEY`

Aanbevolen next actions:

1. Bevestig in Netlify UI per key in welke context deze aanwezig is: production, deploy preview, branch deploy en eventueel local/dev.
2. Noteer alleen `present/missing/not_applicable`, nooit waarden.
3. Beslis of `SUPABASE_SERVICE_ROLE_KEY` alleen production krijgt of ook een aparte test/preview context.
4. Bevestig of de toegevoegde runtime keys per context nodig zijn of bewust `not_applicable`.
5. Test minimaal één Netlify Function in de context waarin production straks draait.

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
