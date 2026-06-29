# Security

Dit document beschrijft security-richtlijnen en bekende aandachtspunten.

## Basisregels

- Nooit API keys hardcoden.
- Geen secrets committen.
- Geen gevoelige data in frontend JavaScript.
- Valideer input server-side.
- Sla klantdata alleen duurzaam en bewust op.
- Log geen gevoelige data onnodig.
- Vraag toestemming voor security-relevante wijzigingen.

## Huidige Security Positie

Aanwezig:

- Netlify security headers:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- Mollie API key via environment variable.
- Resend API key via environment variable.
- Admin intakes beschermd met bearer token.
- Server-side prijscontrole voor Mollie.
- Klantenportaal gebruikt Supabase Auth met anon key en RLS.
- Service role key blijft server-side in Netlify Functions.

## Bekende Risico's

### Tijdelijke Intake-Opslag

`intake-storage.js` gebruikt `/tmp`.

Risico:

- data is niet duurzaam
- data kan verdwijnen
- niet geschikt als CRM of permanente opslag

Aanbeveling:

- vervangen door duurzame opslag na technische keuze.

### Webhook En Duurzame Status

`mollie-webhook.js` logt algemene websitebetalingen en slaat factuurstatussen duurzaam op wanneer `customer_invoices.mollie_payment_id` overeenkomt.

Risico:

- algemene website-aanbetalingen zijn nog niet gekoppeld aan een duurzaam orderoverzicht
- onboarding is nog niet stevig gekoppeld aan betaalstatus

Aanbeveling:

- algemene websitebetalingen later ook duurzaam opslaan.

### Formulieren

Input wordt deels gevalideerd.

Aanbevelingen:

- rate limiting of spambeperking overwegen
- server-side validatie blijven gebruiken
- veilige DOM-opbouw gebruiken voor formulierdata

### Klantenportaal Auth

Het klantenportaal gebruikt:

- Supabase Auth voor login
- `SUPABASE_ANON_KEY` in de browser
- RLS op `profiles` en `change_requests`
- RLS op canonical klanttabellen; oude `customer_websites`-policies zijn legacy en mogen niet als basis voor nieuwe productiefeatures worden gebruikt
- `auth.uid()` als grens tussen klantaccounts
- admin-profielbeheer via `ADMIN_TOKEN` en een server-side Netlify Function
- Admin CRM-bewerkingen voor klantprofielen lopen via `/.netlify/functions/admin-client-profiles`
- CRM-acties zoals uitnodigen, wachtwoord-reset, login koppelen en archiveren vereisen `ADMIN_TOKEN` en gebruiken de service role alleen server-side.
- Admin-only notities staan in `public.admin_customer_notes` met RLS ingeschakeld en zonder klantbeleid. Deze notities mogen niet in het klantdashboard worden getoond.
- Website Operations gebruikte historisch `public.customer_websites`; nieuwe productieontwikkeling moet naar canonical `websites` met customer/profile-koppeling.
- Website Health mutaties lopen via `/.netlify/functions/admin-website-health`, vereisen `ADMIN_TOKEN` en gebruiken de service role alleen server-side.
- Billingdata gebruikte historisch `public.customer_subscriptions` en `public.customer_invoices`; nieuwe productieontwikkeling moet naar canonical `subscriptions`, `invoices` en `invoice_lines`.
- Billing-mutaties lopen via `/.netlify/functions/admin-billing`, vereisen `ADMIN_TOKEN` en gebruiken de service role alleen server-side.
- Factuur-PDF's staan in private Supabase Storage bucket `invoice-pdfs`.
- Klantdownloads lopen via `/.netlify/functions/invoice-download`, vereisen een Supabase Auth JWT en gebruiken korte signed URLs.
- Mollie betaalverzoeken voor facturen lopen via `/.netlify/functions/admin-mollie-payment`, vereisen `ADMIN_TOKEN` en gebruiken `MOLLIE_API_KEY` alleen server-side.
- Mollie onderhoudsabonnementen lopen via `/.netlify/functions/admin-mollie-subscription`, vereisen `ADMIN_TOKEN` en gebruiken `MOLLIE_API_KEY` alleen server-side.
- Mollie webhookstatussen worden server-side opgehaald en gekoppeld via `customer_invoices.mollie_payment_id`, `customer_subscriptions.mandate_payment_id` of `customer_subscriptions.mollie_subscription_id`.

Risico:

- Zonder correcte RLS kan een anon key te veel data lezen.
- Bestaande wijzigingsverzoeken zonder `auth_user_id` zijn niet zichtbaar voor klanten.
- Websiteomgevingen zonder `customer_auth_user_id` zijn niet zichtbaar voor klanten.
- Abonnementen of facturen zonder `customer_auth_user_id` zijn niet zichtbaar voor klanten.
- Factuur-PDF paden mogen geen publieke URL's zijn; `admin-billing.js` accepteert alleen private objectpaden.
- `mollie_checkout_url` is zichtbaar voor de gekoppelde klant via RLS; deze URL mag alleen worden opgeslagen nadat de payment server-side is aangemaakt.
- Actieve checkoutlinks worden hergebruikt om onbedoelde dubbele betaalverzoeken te voorkomen.
- Het admin-dashboard heeft nog geen volledige admin-login, rollenmodel of audit trail.
- `ADMIN_TOKEN` is een tussenlaag en moet strikt geheim blijven.

Aanbevelingen:

- RLS SQL uit `/docs/supabase-client-portal.sql` uitvoeren voordat het portaal live wordt gebruikt.
- Profielen en bestaande wijzigingsverzoeken zorgvuldig koppelen aan de juiste `auth_user_id`.
- Geen service role key in browsercode plaatsen.
- Vervang het tijdelijke admin-tokenmodel later door echte admin-authenticatie met rollen en logging.
- Voer de CRM-kolommen uit `/docs/supabase-client-portal.sql` uit zodat e-mail, telefoon en klantstatus duurzaam in `profiles` worden opgeslagen.
- Voer ook de admin-notities tabel uit `/docs/supabase-client-portal.sql` uit voordat interne klantnotities operationeel worden gebruikt.
- Gebruik `customer_websites` alleen nog als legacy-referentie. Nieuwe Website Operations livegang moet op canonical `websites` en bijbehorende RLS worden gebaseerd.
- Voer `/docs/supabase-website-health.sql` uit voordat health monitoring operationeel wordt gebruikt.
- Voer `/docs/supabase-billing.sql` uit voordat facturatie en abonnementen operationeel worden gebruikt.
- Voer `/docs/supabase-invoice-storage.sql` uit voordat factuur-PDF downloads operationeel worden gebruikt.
- Voer `/docs/supabase-mollie-payments.sql` uit voordat Mollie betaalverzoeken voor facturen operationeel worden gebruikt.
- Voer `/docs/supabase-invoice-emails.sql` uit voordat factuur-e-mailnotificaties operationeel worden gebruikt.
- Voer `/docs/supabase-mollie-subscriptions.sql` uit voordat Mollie onderhoudsabonnementen operationeel worden gebruikt.
- Voer `/docs/supabase-mollie-subscriptions-sync.sql` uit voordat mandate en webhook-synchronisatie operationeel worden gebruikt.
- Voer `/docs/supabase-subscription-retries.sql` uit voordat retry-opvolging voor mislukte incasso's operationeel wordt gebruikt.

Server-side environment variables voor factuurbetalingen:

- `MOLLIE_API_KEY`
- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_TOKEN`

Deze waarden mogen nooit in frontendcode worden geplaatst.

Server-side environment variables voor Mollie subscriptions:

- `MOLLIE_API_KEY`
- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_TOKEN`

Klanten mogen geen subscriptionmutaties uitvoeren. Subscription-acties blijven admin-only totdat er echte admin-authenticatie met rollen en audit trail is. De klant mag alleen een door de server aangemaakte Mollie mandate checkout URL openen. Webhooks blijven server-side en loggen geen secrets.

Server-side environment variables voor factuur-e-mails:

- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_EMAIL`
- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_TOKEN`

Factuur-e-mails worden alleen via Netlify Functions verstuurd. De adminfunctie vereist `ADMIN_TOKEN`; klanten kunnen geen e-mails triggeren. Factuur-PDF's worden niet als publieke links in e-mails gezet, maar blijven achter het klantportaal en signed URL-flow.

De volledige end-to-end testflow staat in `/docs/BILLING_TEST_PLAN.md`.

### Website Health Monitoring

De huidige health-checks zijn mock/placeholder checks en gebruiken geen externe API's.

Risico:

- Scores zijn nog geen echte PageSpeed-, DNS-, SSL- of uptime-metingen.
- Healthdata is alleen betrouwbaar als de SQL-migratie is uitgevoerd en adminchecks bewust worden gestart.

Aanbevelingen:

- Later echte checks server-side toevoegen met rate limiting.
- Externe API keys alleen als Netlify environment variables opslaan.
- Geen health-mutaties vanuit het klantdashboard toestaan.

### Uploads

Onboarding comprimeert foto-uploads client-side en stuurt ze als bijlage.

Wijzigingsverzoeken gebruiken Supabase Storage:

- bucket: `change-request-files`
- bucket mag private blijven
- uploads lopen alleen via `/.netlify/functions/submit-change-request`
- bestanden openen loopt via `/.netlify/functions/get-change-request-file`
- klantdownloads lopen via `/.netlify/functions/client-change-request-file`
- de downloadfunctie controleert eerst of het bestand aan het wijzigingsverzoek gekoppeld is
- de klantdownloadfunctie controleert eerst de Supabase Auth JWT en `change_requests.auth_user_id`
- downloads gebruiken tijdelijke signed URLs
- toegestane types: JPG, PNG, PDF en DOCX
- limieten: maximaal 5 bestanden, maximaal 10 MB per bestand

Factuur-PDF's gebruiken Supabase Storage:

- bucket: `invoice-pdfs`
- bucket blijft private
- PDF-pad staat in `customer_invoices.pdf_file_path`
- downloads lopen alleen via `/.netlify/functions/invoice-download`
- de downloadfunctie controleert eerst de Supabase Auth JWT en `customer_invoices.customer_auth_user_id`
- admin uploadt PDF's voorlopig handmatig naar Supabase Storage of later via server-side upload
- geen publieke Supabase URL opslaan in `pdf_file_path`

Mollie subscription beheer in Fase 6.3:

- adminacties lopen via `/.netlify/functions/admin-mollie-subscription-action`
- `ADMIN_TOKEN` is verplicht
- `MOLLIE_API_KEY` en `SUPABASE_SERVICE_ROLE_KEY` blijven server-side
- klanten kunnen geen abonnementen pauzeren, hervatten, opzeggen of synchroniseren
- opzeggen wordt server-side bij Mollie uitgevoerd
- lokale pauzeer- en hervatacties schrijven een expliciete melding naar `admin_action_last_error`
- webhook-sync werkt alleen bekende Mollie-statussen door naar de lokale status, zodat onduidelijke events geen handmatige status ongemerkt overschrijven

Mollie subscription retries in Fase 6.4:

- retry-mutaties lopen via `/.netlify/functions/admin-subscription-retry`
- `ADMIN_TOKEN` is verplicht voor adminacties
- `SUPABASE_SERVICE_ROLE_KEY`, `MOLLIE_API_KEY` en `RESEND_API_KEY` blijven server-side
- webhookstatusupdates mogen niet falen door e-mailproblemen
- retry-mails bevatten geen publieke PDF-links of secrets
- klanten zien alleen klantvriendelijke betaalprobleemmeldingen via RLS
- klanten kunnen geen retry-mails triggeren en geen retry-status wijzigen

Business Intelligence dashboard in Fase 6.5:

- metrics lopen via `/.netlify/functions/admin-dashboard-metrics`
- `ADMIN_TOKEN` is verplicht
- `SUPABASE_SERVICE_ROLE_KEY` blijft server-side
- de browser ontvangt alleen samengevatte KPI's, grafiekpunten en beperkte actiepunten
- er worden geen secrets, service role keys of ruwe betaalproviderresponses naar de frontend gestuurd
- het dashboard is nog geen vervanging voor echte admin-auth met rollen en audit trail

Offerte-Supabasevoorbereiding in Fase 12.5:

- `quotes` en `quote_lines` zijn voorbereid met RLS aan en service-role policies voor server-side beheer.
- De frontend gebruikt geen service role key.
- `Quote data mode` start standaard op `local`; `supabase-read` en `hybrid` lezen alleen via de publieke Supabase client.
- Schrijfacties zijn bewust beperkt tot gecontroleerde create/update/archive/reactivate/accept per offerte.
- Bulk-migratie, hard delete en provider switch zijn niet toegevoegd.
- De veilige testofferte gebruikt `SUPABASE-QUOTE-TEST`, `environment: test`, `is_demo: true` en `safeToDelete: true`.

Factuur-Supabasevoorbereiding in Fase 12.6:

- `invoices` en `invoice_lines` zijn voorbereid met RLS aan en service-role policies voor server-side beheer.
- De frontend gebruikt geen service role key.
- `Invoice data mode` start standaard op `local`; `supabase-read` en `hybrid` lezen alleen via de publieke Supabase client.
- Schrijfacties zijn bewust beperkt tot gecontroleerde create/update/archive/reactivate/mark sent/mark paid/mark expired per factuur.
- Bulk-migratie, hard delete, echte Mollie-mutaties en provider switch zijn niet toegevoegd.
- De veilige testfactuur gebruikt `SUPABASE-INVOICE-TEST`, `status: test`, `paymentStatus: test`, `environment: test`, `is_demo: true` en `safeToDelete: true`.
- Factuurkoppelingen naar customer, website, project, quote en subscription worden gevalideerd voordat Supabase-writes toegestaan worden.
- Bestaande demo-betaallinks blijven lokaal/demo; er worden geen live betaalprovidergegevens door de browser geschreven.

Abonnement-Supabasevoorbereiding in Fase 12.7:

- `subscriptions` is voorbereid met RLS aan en service-role policy voor server-side beheer.
- De frontend gebruikt geen service role key.
- `Subscription data mode` start standaard op `local`; `supabase-read` en `hybrid` lezen alleen via de publieke Supabase client.
- Schrijfacties zijn bewust beperkt tot gecontroleerde create/update/pause/cancel/reactivate/archive per abonnement.
- Bulk-migratie, hard delete, echte Mollie subscription-mutaties en provider switch zijn niet toegevoegd.
- De veilige testsubscription gebruikt plan `Supabase Subscription Test`, `status: test`, `priceExVat: 49`, `vatPercentage: 21`, `invoiceFrequency: monthly`, `environment: test`, `is_demo: true` en `safeToDelete: true`.
- Abonnementkoppelingen naar customer, website, project en laatste factuur worden gevalideerd voordat Supabase-writes toegestaan worden.
- Bestaande lokale recurring billing blijft lokaal/demo totdat klantportaaldata, Auth en RLS live hardgemaakt zijn.

Klantportaal live data-readiness in Fase 12.8:

- `clientPortalDataService` filtert data op exacte `customerId` en/of `supabaseCustomerId`.
- Er is geen fuzzy matching op e-mail of bedrijfsnaam toegevoegd om datalekken tussen klanten te voorkomen.
- Bij mismatch tussen lokale en Supabase klant-ID wordt geen klantdata getoond.
- `sanitizeClientPortalData` laat alleen klantveilige velden door.
- Interne notities, adminnotities, metadata, migratielogs, activity logs, sessie/debugvelden, tokens, secrets en betaalprovider-mandate/customerdetails worden niet aan het klantportaal gegeven.
- Supabase service role keys blijven buiten de frontend.
- Klantportaal-writes blijven geblokkeerd.
- Harde route guards, echte loginverplichting en volledige RLS-audit blijven gepland voor Fase 13.

Supabase SQL audit in Fase 12.9:

- Er is geen SQL uitgevoerd.
- `SUPABASE_SQL_AUDIT.md` en `SUPABASE_EXECUTION_PLAN.md` moeten worden gereviewd voordat Fase 13 route guards/RLS hard worden gemaakt.
- `supabase/rls-policies.sql` is nog conceptueel en moet pas worden uitgevoerd wanneer Auth-rollen/JWT-claims getest zijn.
- Oude `customer_*` billing/portal tabellen en nieuwe platformtabellen mogen niet blind naast elkaar naar productie worden uitgerold.

Database consolidation in Fase 13.0:

- Canonical tabellen voor productie zijn `customers`, `websites`, `projects`, `quotes`, `quote_lines`, `invoices`, `invoice_lines` en `subscriptions`.
- `profiles` blijft de Auth/role-brug en wordt niet gebruikt als primaire klantentabel.
- Legacy `customer_websites`, `customer_invoices` en `customer_subscriptions` mogen niet meer worden gebruikt voor nieuwe productie-RLS.
- Auth/RLS hardening is geblokkeerd tot `SUPABASE_CONSOLIDATED_PLAN.md` en `SUPABASE_PATCH_PLAN.md` zijn gereviewd.
- Geen SQL uitvoeren zonder consolidated plan; geen `DROP` of destructieve migraties.

Aanbevelingen:

- limieten blijven handhaven
- allowed MIME types blijven beperken
- geen uitvoerbare bestanden accepteren
- admin-dashboard afschermen voordat bestandsdownloads operationeel worden gebruikt

## Security Headers

Mogelijke uitbreidingen:

- Content-Security-Policy
- Permissions-Policy
- Strict-Transport-Security

CSP vereist zorgvuldige afstemming door externe scripts zoals Google Fonts en Calendly.

## Privacy

De site verwerkt mogelijk:

- naam
- e-mail
- telefoon
- bedrijfsgegevens
- projectinformatie
- uploads
- betaalmetadata

Privacyverklaring moet meegroeien met analytics, CRM, portal en opslagkeuzes.
## Fase 13.1 - Auth/Profile voorbereiding

De nieuwe profile-laag is bewust voorbereid zonder productieblokkades:

- Demo-login blijft localStorage-only.
- Profile-concepts staan lokaal in `maxwebstudioProfiles`.
- Frontend bevat geen service role key en geen secrets.
- Supabase profile-writes zijn alleen via expliciete `profileWrite` context voorbereid en worden niet automatisch vanuit de UI uitgevoerd.
- Hard deletes voor profiles zijn niet beschikbaar; archiveren/disable/reactivate zijn statuswijzigingen.
- Route guards geven alleen een preview van wat straks geblokkeerd zou worden.
- Echte RLS, harde route guards en rolvalidatie volgen in Fase 13.2/13.3.

Belangrijk: deze fase maakt de architectuur klaar, maar is nog geen volledige productiebeveiliging.

## Fase 13.2 - Access control hardening

Access control is uitgebreid met soft route guards en action guards.

Actief:

- access modes `preview`, `soft` en `hard`
- default mode `soft`
- protected routes registry
- role-based navigation in het admin-dashboard
- soft action guards voor gevaarlijke acties zoals data wissen, migratie starten, provider mode wijzigen en technische write-tests
- customer access guard voor het klantportaal
- activity logging voor access warnings, denied decisions, navigation filtering, action guard blocks en customer mismatches

Niet actief:

- geen definitieve RLS SQL uitgevoerd
- geen service role key in frontend
- geen harde blokkade standaard
- geen homepage/SEO/analytics wijziging

Securitygrens:

- Soft route guards voorkomen onbedoelde UI-acties, maar vervangen RLS niet.
- Fase 13.3 moet RLS, API-security en database policies definitief auditen voordat echte klantdata live gebruikt wordt.

## Fase 13.3 - RLS hardening audit

Fase 13.3 heeft security verder uitgewerkt zonder policies live te zetten.

Toegevoegd:

- `/docs/RLS_POLICY_MATRIX.md`: matrix per canonical tabel en rol.
- `/docs/AUTH_CLAIMS_STRATEGY.md`: strategie voor `profiles`, rollen en customer ownership.
- `/docs/supabase-rls-canonical-draft.sql`: SQL-draft met `rollback` aan het einde, dus niet bedoeld als directe live-uitvoering.
- `/docs/SECURITY_RISK_AUDIT.md`: risico-overzicht met mitigaties.
- `/public/src/services/securityReadinessService.js`: read-only readinessinformatie voor Developer Mode.

Productie-readiness:

- RLS policy matrix: gereed.
- Auth claims strategy: gereed.
- RLS SQL draft: voorbereid.
- Security risk audit: gereed.
- RLS live execution: geblokkeerd tot review.
- Frontend route guards: soft actief.
- Database-level security: voorbereid, nog niet live.

Belangrijkste risico's blijven:

- klantdata-cross-access zonder database-RLS
- demo/productie vermenging
- open offerte- en betaallinks zonder tokenized/authenticated toegang
- interne notities en logs die per ongeluk klantzichtbaar worden
- legacy `customer_*` tabellen opnieuw gebruiken

## Fase 13.4 - Supabase testomgeving en RLS dry-run

Fase 13.4 bereidt de testuitvoering voor zonder SQL uit te voeren.

Toegevoegd:

- `/docs/SUPABASE_TEST_ENVIRONMENT.md`
- `/docs/RLS_DRY_RUN_PLAN.md`
- `/docs/RLS_TEST_SCENARIOS.md`
- `/docs/RLS_TEST_DATA_PLAN.md`
- `/docs/RLS_EXPECTED_ACCESS_MATRIX.md`
- `/docs/RLS_PREFLIGHT_CHECKLIST.md`
- `/docs/RLS_TEST_LOG_TEMPLATE.md`

Developer Mode toont nu `RLS testomgeving & dry-run` met:

- testdocument-status
- lokale readiness self-test
- Go/No-Go samenvatting

Status:

- RLS live execution: niet actief.
- Go/No-Go: No-Go totdat testprojectresultaten en preflight checklist handmatig zijn afgerond.
- Geen productie-execution zonder testlog, backup, rollbackplan en expliciete review.

## Fase 13.5 - Deployment bundle security gate

Fase 13.5 centraliseert de productie-uitrol in `/docs/deployment/`.

Security-relevante onderdelen:

- `03_RLS.md`
- `PRODUCTION_CHECKLIST.md`
- `ROLLBACK_PLAN.md`
- `SQL_BUNDLE.md`
- `08_POST_DEPLOY_CHECKS.md`

De deployment validator geeft `NO-GO` zolang kritieke blockers openstaan:

- geen backup
- geen RLS review
- geen testlog
- geen Auth test
- geen klantisolatie
- rollbackplan niet expliciet goedgekeurd
- environment variables niet gecontroleerd

Er zijn geen secrets toegevoegd en er is geen SQL uitgevoerd.

## Fase 13.6 - Deployment blocker readiness

Deployment blockers zijn nu expliciet gemaakt en lokaal bij te houden via Developer Mode.

Securityregels:

- evidence mag geen secrets bevatten
- approvals worden niet automatisch gezet
- approved/rejected vraagt bevestiging
- GO blijft geblokkeerd zolang één blocker pending, in_review of rejected is
- localStorage key: `maxwebstudioDeploymentBlockers`

Nieuwe checklists:

- `DEPLOYMENT_BLOCKERS.md`
- `ENVIRONMENT_VARIABLES_CHECKLIST.md`
- `AUTH_TEST_CHECKLIST.md`
- `CUSTOMER_ISOLATION_CHECKLIST.md`

Er is geen productieomgeving aangepast.

## Fase 14.1 - Test environment security readiness

Fase 14.1 voegt testomgeving-validatie toe zonder runtime security te wijzigen.

Securityregels:

- geen SQL execution vanuit de app
- geen service role key in frontend
- geen secrets in testresultaten
- server-side env vars worden alleen via checklist bevestigd
- Auth/RLS/klantisolatie blijven blockers totdat echte test-evidence is toegevoegd

Nieuwe documenten:

- `TEST_EXECUTION_PLAN.md`
- `TEST_RESULTS.md`

Developer Mode toont readiness, maar voert geen deployment uit.

## Fase 14.2 - Release approval security

Fase 14.2 maakt de deployment blocker-flow strenger.

Securityregels:

- `approved` mag alleen met volledige evidence.
- `approved` vereist reviewer/approver registratie.
- `rejected`, `not_applicable` en reset vereisen een reden.
- approval history bewaart statuswijzigingen en evidence snapshots.
- evidence mag nooit secrets bevatten.
- release decision export bevat alleen samenvattingen en geen geheime waarden.

GO blijft `NO-GO` zolang blockers openstaan, evidence ontbreekt of een blocker rejected/in_review/pending is.

## Fase 14.3 - QA/security testresultaten

Fase 14.3 heeft de lokale releasebasis getest zonder live security te wijzigen.

Uitkomst:

- localStorage/demo-flows: PASS
- klantportaal sanitizing: PASS
- route guard readiness: PASS, soft actief
- deployment/security readiness: PASS als verwachte NO-GO
- Auth/RLS/Storage/Mollie/Resend runtime tests: BLOCKED

Securityconclusie:

- Geen productie geraakt.
- Geen SQL uitgevoerd.
- Geen secrets toegevoegd.
- Release blijft `NO-GO` totdat echte Supabase testomgeving evidence is vastgelegd en approved.

## Fase 14.4 - Supabase testomgeving security gate

Fase 14.4 heeft gecontroleerd of de echte Supabase testomgeving gevalideerd kon worden.

Uitkomst:

- Geen Supabase test environment variables aanwezig.
- Geen Supabase CLI beschikbaar.
- Geen SQL uitgevoerd.
- Geen Auth-testusers aangemaakt.
- Geen RLS policies getest.
- Geen Storage buckets getest.
- Geen productie geraakt.
- Geen secrets gelogd.

Securityconclusie:

- De juiste beslissing blijft `NO-GO / BLOCKED`.
- Auth/RLS/Storage mogen niet live worden gezet totdat een aparte testomgeving met echte Customer A/B isolatie-evidence is gevalideerd.
- De volgende testuitvoering moet expliciet bewijzen dat de gebruikte Supabase variabelen naar een testproject wijzen en niet naar productie.

## Fase 14.4A - Supabase test setup security

Fase 14.4A bereidt de testomgeving voor zonder secrets, SQL of productieaanpassingen.

Securityregels:

- `.env.example` en `.env.local.example` bevatten alleen lege placeholders.
- `SUPABASE_SERVICE_ROLE_KEY` is expliciet setup/server-side only.
- Testproject moet aantoonbaar gescheiden zijn van productie.
- Auth redirects moeten naar lokale/test-URLs wijzen.
- Schema/RLS/Storage tests mogen pas in Fase 14.4B worden uitgevoerd.
- Deployment blockers worden niet automatisch approved.

Status:

- `blocked_pending_supabase_test_setup`
- Geen productie geraakt.
- Geen secrets toegevoegd.

## Fase 15.x - Architectuur en securitygrenzen

De productiearchitectuur en modulegrenzen zijn vastgelegd in:

- `docs/PRODUCTION_ARCHITECTURE.md`
- `docs/MODULE_BOUNDARIES.md`

Securityregels vanaf deze fase:

- Supabase is de toekomstige productiebron voor canonical klant-, website-, project-, offerte-, factuur-, abonnement-, bestands- en klantportaaldata.
- Local/demo blijft toegestaan voor demo's en drafts, maar mag niet worden behandeld als productiebron.
- Legacy `customer_websites`, `customer_invoices` en `customer_subscriptions` mogen niet opnieuw als basis voor nieuwe RLS of klantportaalfeatures worden gebruikt.
- AI Website Wizard mag geen externe AI-provider, API key, databasewrite of automatische publicatie uitvoeren zonder aparte goedgekeurde fase.
- Mollie live payments en Resend live-notificaties blijven geblokkeerd totdat testomgeving, env-vars, rollback en release approval zijn afgerond.

## Fase 22 - Auth/profiles securitygrenzen

Fase 22 bereidt Supabase Auth en profiles voor zonder live activatie.

Securityregels:

- `profiles.auth_user_id` wordt de brug naar `auth.users`.
- `customers.profile_id` en `customers.auth_user_id` bepalen klantownership.
- E-mailadres mag alleen helpen bij migratie/matching en mag niet de enige productie-autorisatie zijn.
- Klanten mogen nooit via losse link of demo-session bij andere klantdata komen.
- `demo_user` blijft strikt demo/local en mag geen productiedata lezen.
- Hard route guards en RLS mogen pas live na testomgeving-evidence voor Auth, profiles en Customer A/B isolation.
- Service role blijft uitsluitend server-side.

Status:

- Auth/profile readiness voorbereid.
- Geen SQL uitgevoerd.
- Geen productiegegevens gewijzigd.
- Geen echte Supabase Auth writes uitgevoerd.

## Fase 23 - Schema/RLS securityplan

Fase 23 legt het productie-RLS-plan vast zonder SQL uit te voeren.

Securityregels:

- Iedere klantgebonden tabel moet via `customer_id` of parent ownership naar `customers` herleidbaar zijn.
- Child tables zoals `quote_lines` en `invoice_lines` erven toegang via parent records.
- `audit_logs` zijn security/admin-only en moeten later append-only via server-side routes worden gevuld.
- `activity_logs` zijn functioneel en mogen niet automatisch als klantzichtbare tijdlijn worden gebruikt.
- `leads` en salesdata blijven intern en zijn niet klantzichtbaar.
- `client_portal_messages` en `client_portal_notifications` vereisen harde Customer A/B isolatie.
- AI-drafts blijven intern totdat review/publicatie expliciet is goedgekeurd.
- AI-context moet persoonsgegevens, betaaldata, provider IDs, storage paths en interne notities minimaliseren of maskeren.

Status:

- Conceptschema en RLS-plan voorbereid.
- Geen SQL uitgevoerd.
- Geen RLS live geactiveerd.
- Geen productiegegevens gewijzigd.

## Fase 24 - Migration drafts securitystatus

Fase 24 maakt SQL-drafts, maar activeert niets.

Securityregels:

- Migration drafts mogen niet rechtstreeks op productie worden uitgevoerd.
- RLS policies moeten eerst handmatig gereviewd worden op recursie en Customer A/B isolation.
- De optionele demo seed is test/demo-only.
- Audit logging foundation mag geen secrets, signed URLs, reset tokens of volledige providerpayloads loggen.
- Legacy `customer_*` tabellen blijven uitgesloten.

Status:

- Draftbestanden aangemaakt.
- Geen SQL uitgevoerd.
- Geen Supabase CLI gebruikt.
- Geen productiegegevens gewijzigd.
