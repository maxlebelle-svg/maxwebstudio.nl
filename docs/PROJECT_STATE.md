# Project State

Laatste analyse: 2026-06-26.

## Project

Deze repository bevat de officiele broncode van `maxwebstudio.nl`.

De website positioneert Max Web Studio als premium webstudio voor ondernemers in Nederland, met focus op professionele websites, hosting, onderhoud, SEO, conversie en betaalflows.

## Technische Stack

- Static HTML
- CSS
- Vanilla JavaScript
- Netlify hosting
- Netlify Functions
- Mollie Payments API
- Resend e-mail API
- Google Fonts
- Calendly widget

Er is momenteel geen build framework zoals React, Next, Astro of Vite.

## Live Structuur

Netlify gebruikt:

- publish directory: `/public`
- functions directory: `/functions`

Belangrijk:

- `/public` is leidend voor de live website.
- Root-bestanden kunnen duplicaten of oudere versies bevatten.
- Nieuwe live frontend-wijzigingen horen primair in `/public`.

## Belangrijkste Pagina's

- `/public/index.html`
- `/public/betalen.html`
- `/public/bedankt.html`
- `/public/onboarding.html`
- `/public/betaling-geannuleerd.html`
- `/public/wijziging-doorgeven.html`
- `/public/bedankt-wijziging.html`
- `/public/admin-dashboard.html`
- `/public/login.html`
- `/public/client-dashboard.html`
- `/public/waarom-max-webstudio.html`
- `/public/werkwijze.html`
- `/public/over-max-webstudio.html`
- `/public/veelgestelde-vragen.html`
- `/public/hosting-onderhoud-voorwaarden.html`
- `/public/algemene-voorwaarden.html`
- `/public/privacyverklaring.html`
- `/public/cookiebeleid.html`
- `/public/disclaimer.html`

## Belangrijkste Functions

- `create-payment.js`: maakt Mollie-betaling aan.
- `mollie-webhook.js`: ontvangt Mollie statusupdates.
- `submit-onboarding.js`: verwerkt projectintake.
- `submit-change-request.js`: verwerkt wijzigingsverzoeken, slaat ze op in Supabase en verstuurt e-mail via Resend.
- `email.js`: verstuurt e-mail via Resend.
- `intake-storage.js`: slaat intakes tijdelijk op in `/tmp`.
- `admin-intakes.js`: leest intakes uit met admin token.
- `mollie-products.js`: centrale server-side prijsdefinities.
- `client-auth-config.js`: geeft publieke Supabase Auth-config terug voor het klantenportaal.
- `client-change-request-file.js`: maakt klantveilige tijdelijke signed URLs voor eigen wijzigingsverzoekbestanden.
- `admin-client-profiles.js`: beheert CRM-klantprofielen server-side met `ADMIN_TOKEN` en Supabase service role.
- `admin-website-health.js`: beheert website healthdata server-side met `ADMIN_TOKEN` en mock-checks als basis voor latere monitoring.
- `admin-billing.js`: beheert abonnementen en facturen server-side met `ADMIN_TOKEN` en Supabase service role.

## Sterke Punten

- Duidelijke premium positionering.
- Sterke conversie-CTA's: Calendly, WhatsApp, bellen en Mollie.
- Server-side prijscontrole voor betalingen.
- Uitgebreide onboarding-wizard.
- Basis security headers via Netlify.
- Alle live HTML-pagina's hebben title, meta description en H1.
- Heldere visuele stijl met consistente kleuren en typografie.

## Zwakke Punten

- Root en `/public` bevatten dubbele bestanden.
- CSS is groot en niet opgesplitst.
- Veel inline JavaScript in HTML-pagina's.
- Homepageformulier gebruikt interne demo-opslag in plaats van een externe mailclient.
- Geen sitemap of robots.txt.
- Geen canonical tags en beperkte structured data.
- Webhook logt betaalstatus maar slaat geen duurzame status op.
- Intake-opslag in `/tmp` is niet geschikt als permanente productieopslag.

## Huidige Risico's

- Live wijzigingen kunnen per ongeluk in root gebeuren in plaats van `/public`.
- Intakegegevens kunnen verdwijnen door tijdelijke serverless opslag.
- Betalingen zijn niet gekoppeld aan duurzame orderstatus.
- Mobiele navigatie verdwijnt onder 980px zonder alternatief menu.
- Grote afbeeldingen kunnen performance drukken.

## Nieuwe Bouwstenen

- Admin Dashboard v1 is toegevoegd als backoffice-preview op `/public/admin-dashboard.html`.
- De admin-preview bevat `noindex, nofollow` en is niet gelinkt in de hoofdwebsite.
- De sectie Wijzigingsverzoeken haalt echte data op uit Supabase via `/.netlify/functions/list-change-requests`.
- `/functions/list-change-requests.js` leest maximaal 100 records uit `public.change_requests`, gesorteerd op `created_at desc`.
- Het dashboard toont wijzigingsverzoeken in een beheertabel met filters voor status, prioriteit en categorie.
- Wijzigingsverzoeken kunnen op dezelfde pagina worden bekeken in een detailmodal.
- `/functions/update-change-request-status.js` wijzigt de status van een wijzigingsverzoek via een server-side Supabase PATCH.
- Toegestane statussen zijn `nieuw`, `in_behandeling`, `wacht_op_klant` en `afgerond`.
- `/functions/get-change-request-file.js` maakt tijdelijke signed URLs voor bestanden die bij een wijzigingsverzoek horen.
- Er is nog geen login, audit trail, echte klantentabel, Mollie-dashboardkoppeling of analytics.
- Wijzigingsverzoeken via `/public/wijziging-doorgeven.html` worden via `/.netlify/functions/submit-change-request` opgeslagen in Supabase en naar Max Web Studio gemaild.
- Bestanden bij wijzigingsverzoeken worden server-side opgeslagen in Supabase Storage bucket `change-request-files`.
- Toegestane uploadtypes zijn JPG, PNG, PDF en DOCX, met maximaal 5 bestanden en maximaal 10 MB per bestand.
- Supabase schema-instructies staan in `/docs/supabase-change-requests.sql`.
- Klantenportaal Fase 4.1 is toegevoegd met Supabase Auth via `/public/login.html` en `/public/client-dashboard.html`.
- Client-side Auth gebruikt alleen `SUPABASE_ANON_KEY`; service role blijft server-side.
- Portaal-SQL met `profiles`, `change_requests.auth_user_id` en RLS staat in `/docs/supabase-client-portal.sql`.
- Auth-documentatie staat in `/docs/AUTH.md`.
- Klantenportaal Fase 4.2 toont echte profieldata uit `profiles` en maximaal 5 recente wijzigingsverzoeken van de ingelogde klant.
- Het klantdashboard toont geen interne classificatie en staat geen statuswijzigingen toe.
- Het admin-dashboard kan klantprofielen beheren via `/.netlify/functions/admin-client-profiles`.
- `/functions/admin-client-profiles.js` gebruikt `ADMIN_TOKEN`, `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` server-side om `profiles` te laden, Auth-users op te halen en profielen op te slaan.
- Bij het opslaan van een profiel kan de function bestaande wijzigingsverzoeken op exact e-mailadres koppelen aan `change_requests.auth_user_id`, zodat het klantenportaal deze direct toont.
- De service role key wordt niet naar frontendcode gestuurd; de browser gebruikt alleen een admin bearer token richting de Netlify Function.
- Klantenportaal Fase 4.3 voegt klantveilige bestandsdownloads en een status-tijdlijn toe aan de aanvraagdetailmodal.
- `/functions/client-change-request-file.js` gebruikt de Supabase Auth JWT van de ingelogde klant, controleert server-side dat het wijzigingsverzoek bij `auth.uid()` hoort en maakt daarna pas een tijdelijke signed URL voor Supabase Storage.
- `/public/client-dashboard.html` telt open wijzigingsverzoeken op basis van maximaal 100 eigen aanvragen, toont maximaal 5 recente aanvragen en toont in de modal bestanden plus de klantvriendelijke statusflow.
- De publieke homepage bevat een subtiele Klantportaal-link naar `/login.html` in de header, footer en onderhoudssectie.
- Admin CRM Fase 5.1 vervangt de admin-preview door een CRM-basis met sidebarmodules, KPI's, klantenoverzicht, klantdetailpaneel, nieuwe-klantmodal, websites, bestanden, onderhoud en placeholders voor facturen, AI en instellingen.
- Het CRM gebruikt `/.netlify/functions/admin-client-profiles` met `ADMIN_TOKEN`; service role blijft uitsluitend server-side.
- `profiles` is voorbereid op CRM-velden `email`, `phone` en `status` via `/docs/supabase-client-portal.sql`. De function valt terug op de oudere kolommen als deze SQL nog niet is uitgevoerd.
- Admin CRM Fase 5.2 breidt klantbeheer uit met aanmaken, bewerken, archiveren, statusbeheer (`actief`, `onboarding`, `pauze`, `gearchiveerd`), klant-sinds beheer, auth-status, login koppelen, Supabase uitnodigingen en wachtwoord-reset acties.
- Admin-only klantnotities staan bewust in `public.admin_customer_notes` en niet zichtbaar in `profiles` voor het klantportaal.
- `/functions/admin-client-profiles.js` blijft de enige CRM-route voor deze adminacties en vereist altijd `ADMIN_TOKEN`.
- Admin CRM Fase 5.3 voegt een Website Operations Center toe aan de module Websites.
- Websitegegevens worden beheerd in `public.customer_websites` met klantkoppeling, domein, live/staging URL, GitHub repo, branch, Netlify project, hostingstatus, SSL-status en deploy/check metadata.
- Het klantenportaal leest `customer_websites` via Supabase RLS en valt terug op `profiles.website` als er nog geen website-record bestaat.
- Er is nog geen echte Netlify API-, GitHub API- of deploy-triggerkoppeling; dit zijn in deze fase beheerlinks en operationele metadata.
- Admin CRM Fase 5.4 voegt Website Health Monitoring toe met `/.netlify/functions/admin-website-health`.
- Healthdata staat op `public.customer_websites` via de losse migratie `/docs/supabase-website-health.sql`.
- De health-function gebruikt nu mock-checks voor uptime, DNS, SSL en scores; er zijn nog geen externe API-koppelingen.
- Het klantdashboard toont alleen klantvriendelijke statussen zoals website online, SSL actief en laatste controle.
- Admin CRM Fase 5.5 voegt Facturatie & Abonnementen Basis toe met `public.customer_subscriptions` en `public.customer_invoices`.
- De SQL voor deze billing-tabellen en RLS staat in `/docs/supabase-billing.sql`.
- De Admin CRM-modules Onderhoud en Facturen tonen echte Supabase-data en kunnen abonnementen/facturen aanmaken, bewerken en statussen aanpassen via `/.netlify/functions/admin-billing`.
- Het klantdashboard leest eigen abonnementen en facturen via Supabase RLS en toont alleen klantvriendelijke velden.
- Er is nog geen echte Mollie API-koppeling, automatische incasso, PDF-generatie of e-mailherinnering.
- Fase 5.6 voegt veilige factuur-PDF downloads toe via private Supabase Storage bucket `invoice-pdfs`.
- De storage SQL en instructies staan in `/docs/supabase-invoice-storage.sql`.
- `/functions/invoice-download.js` controleert de Supabase Auth JWT, verifieert dat de factuur bij de ingelogde klant hoort en geeft daarna pas een tijdelijke signed URL terug.
- Admins beheren voorlopig alleen `customer_invoices.pdf_file_path`; echte PDF-upload gebeurt handmatig in Supabase Storage of later via een server-side uploadfunctie.
- Fase 5.7 voegt Mollie betaalverzoeken voor losse facturen toe via `/.netlify/functions/admin-mollie-payment`.
- De database-uitbreiding voor Mollie betaalmetadata staat in `/docs/supabase-mollie-payments.sql`.
- `mollie-webhook.js` werkt facturen bij wanneer een Mollie payment id overeenkomt met `customer_invoices.mollie_payment_id`.
- Het klantdashboard toont een knop `Betaal factuur` wanneer `mollie_checkout_url` bestaat en de factuur nog niet betaald, geannuleerd, verlopen of mislukt is.
- Er zijn nog geen Mollie subscriptions, automatische incasso, PDF-generatie of e-mailherinneringen.
- Fase 5.8 stabiliseert de end-to-end billingflow en normaliseert factuurstatussen naar `draft`, `sent`, `paid`, `expired`, `canceled` en `failed`.
- Actieve Mollie checkoutlinks worden hergebruikt in plaats van stil opnieuw aangemaakt.
- Het testplan voor de volledige billingflow staat in `/docs/BILLING_TEST_PLAN.md`.
- Fase 5.9 voegt factuur-e-mailnotificaties toe via `/.netlify/functions/admin-invoice-email`.
- De database-uitbreiding voor e-mailtracking staat in `/docs/supabase-invoice-emails.sql`.
- Admins kunnen vanuit de facturenmodule handmatig een factuurmail, betalingsherinnering, betaalbevestiging of verlopenmelding versturen.
- `mollie-webhook.js` probeert bij een succesvolle betaling automatisch een betaalbevestiging te sturen, zonder de factuurstatus-update te blokkeren wanneer e-mailconfiguratie ontbreekt.
- Factuurmails gebruiken Resend via `RESEND_API_KEY` en verwijzen voor PDF's naar het klantportaal in plaats van publieke PDF-links.
- Fase 6.1 voegt de basis toe voor Mollie Customers en onderhoudsabonnementen via `/.netlify/functions/admin-mollie-subscription`.
- De database-uitbreiding voor subscription metadata staat in `/docs/supabase-mollie-subscriptions.sql`.
- De Admin CRM-module Onderhoud kan een Mollie Customer en Subscription activeren en toont customer id, subscription id, Mollie-status, laatste betaling en volgende betaling.
- Het klantdashboard toont subscriptionstatus en volgende incasso wanneer deze data beschikbaar is.
- Webhook synchronisatie, pauzeren, hervatten, opzeggen en retries zijn bewust nog niet gebouwd.
- Fase 6.2 voegt mandate-onboarding en subscription webhook-synchronisatie toe.
- Als een Mollie Customer nog geen geldige mandate heeft, maakt `admin-mollie-subscription.js` eerst een `sequenceType: first` betaling aan en slaat de mandate checkout URL op.
- `mollie-webhook.js` herkent mandatebetalingen, maakt na succesvolle eerste betaling automatisch de subscription aan en synchroniseert subscriptionstatus, mandate status, laatste betaling en volgende incasso.
- De SQL voor syncvelden staat in `/docs/supabase-mollie-subscriptions-sync.sql`.
- Fase 6.3 voegt beheeracties voor onderhoudsabonnementen toe via `/.netlify/functions/admin-mollie-subscription-action`.
- De aanvullende SQL voor adminacties staat in `/docs/supabase-mollie-subscription-actions.sql`.
- Admins kunnen abonnementen pauzeren, hervatten, opzeggen en synchroniseren vanuit de Onderhoud-module.
- Opzeggen loopt server-side via Mollie en werkt daarna de lokale subscriptionstatus bij.
- Pauzeren en hervatten zijn in deze fase lokale CRM-acties met een expliciete melding in `admin_action_last_error`, zodat beheer ziet dat Mollie geen directe pauzeer-/hervatactie is uitgevoerd.
- Het klantdashboard toont abonnementen klantvriendelijk als actief, gepauzeerd, opgezegd of wacht op machtiging.
- Fase 6.4 voegt opvolging van mislukte incasso's toe met retryvelden in `public.customer_subscriptions`.
- De SQL voor retryvelden staat in `/docs/supabase-subscription-retries.sql`.
- `mollie-webhook.js` zet bij mislukte, verlopen, geannuleerde of chargeback subscription payments retrystatussen, risiconiveaus en laatste-foutmetadata.
- `/.netlify/functions/admin-subscription-retry` beheert retry-acties zoals markeren als opgelost, retry-mail versturen, adminnotitie opslaan en synchroniseren.
- Het admin-dashboard toont mislukte betalingen, retry status, risiconiveau, volgende actie, laatste retry-mail en adminnotities in de Onderhoud-module.
- Het klantdashboard toont bij betaalproblemen alleen een klantvriendelijke melding en eventueel de bestaande mandate checkout-knop.
- Fase 6.5 voegt een Business Intelligence dashboard toe aan de bovenkant van het Admin CRM.
- `/.netlify/functions/admin-dashboard-metrics` berekent KPI's server-side met `ADMIN_TOKEN` en Supabase service role.
- Het dashboard toont MRR, ARR, actieve klanten, websites, actieve abonnementen, hoog risico, factuur-KPI's, mandate-wachtrij, retrydruk en open wijzigingsverzoeken.
- Eenvoudige SVG-grafieken tonen omzet per maand, abonnementengroei, factuurstatusverdeling en abonnementstatusverdeling zonder externe chart library.
- Documentatie voor KPI-definities staat in `/docs/BUSINESS_DASHBOARD.md`.
- Fase 12.5 bereidt offerte-migratie naar Supabase voor met tabellen `quotes` en `quote_lines`.
- De SQL-basis voor offertes staat in `/docs/supabase-quotes.sql`.
- Het Admin CRM heeft nu een `Quote data mode` met `local`, `supabase-read` en `hybrid`; standaard blijft veilig `local`.
- Offertes kunnen in Developer Mode worden geanalyseerd via dry-run, mapping preview, ontbrekende koppelingen, ongeldige regels, duplicaten, read-test en een veilige testofferte-write.
- Gecontroleerde offerte-acties zijn voorbereid voor create, update, archive, reactivate en accept; er is geen hard delete of bulk-write toegevoegd.
- Bestaande lokale offerteflow en offerte-naar-factuur conversie blijven intact.
- Fase 12.6 bereidt factuur-migratie naar Supabase voor met tabellen `invoices` en `invoice_lines`.
- De SQL-basis voor facturen staat in `/docs/supabase-invoices.sql`.
- Het Admin CRM heeft nu een `Invoice data mode` met `local`, `supabase-read` en `hybrid`; standaard blijft veilig `local`.
- Facturen kunnen in Developer Mode worden geanalyseerd via dry-run, mapping preview, ontbrekende koppelingen, ongeldige regels, duplicaten, read-test en een veilige testfactuur-write.
- Gecontroleerde factuuracties zijn voorbereid voor create, update, archive, reactivate, mark sent, mark paid en mark expired; er is geen hard delete, bulk-write of provider switch toegevoegd.
- Factuurregels worden voorbereid als aparte `invoice_lines`, zodat bedragen, btw en regels later niet als losse JSON in één factuurrecord hoeven te blijven.
- Bestaande lokale factuurflow, demo-betaalpagina, offerte-naar-factuur conversie en abonnement-naar-conceptfactuur flow blijven intact.
- Fase 12.7 bereidt abonnement-migratie naar Supabase voor met tabel `subscriptions`.
- De SQL-basis voor abonnementen staat in `/docs/supabase-subscriptions.sql`.
- Het Admin CRM heeft nu een `Subscription data mode` met `local`, `supabase-read` en `hybrid`; standaard blijft veilig `local`.
- Abonnementen kunnen in Developer Mode worden geanalyseerd via dry-run, mapping preview, ontbrekende koppelingen, duplicaten, MRR-impact, read-test en een veilige testabonnement-write.
- Gecontroleerde abonnementacties zijn voorbereid voor create, update, pause, cancel, reactivate en archive; er is geen hard delete, bulk-write, provider switch of echte Mollie subscription-mutatie toegevoegd.
- Abonnementkoppelingen naar customer, website, project en laatste factuur worden gevalideerd voordat Supabase-writes toegestaan worden.
- Bestaande lokale recurring billing, MRR/ARR-berekening en abonnement-naar-conceptfactuur flow blijven intact.
- Fase 12.8 bereidt het klantportaal voor op live data via `public/src/services/clientPortalDataService.js`.
- `/public/klantportaal.html` gebruikt nu een centrale klantportaal-dataservice met modi `demo`, `local`, `supabase-read` en `hybrid`.
- Het portaal kan klanten vinden via lokale `customerId`, via `supabaseCustomerId`, of via een gecombineerde link zonder tokens.
- Klantportaaldata wordt strikt gesanitized voordat deze wordt getoond; interne notities, adminmetadata, migratielogs, debugvelden, sessiedata en betaalproviderdetails worden niet naar de klantweergave doorgelaten.
- Developer Mode bevat nu `Klantportaal live data readiness`, tests voor geselecteerde/demo/hybrid klantportaaldata, een sanitized payload preview en een reset naar demo/local.
- Offerte- en betaallinks blijven lokaal werken en ondersteunen aanvullend `supabaseQuoteId` en `supabaseInvoiceId` voor toekomstige live data.
- Klantportaal live data staat op voorbereid; Supabase read/hybrid is voorbereid/actief, writes blijven geblokkeerd en harde auth/route guards volgen in Fase 13.
- Fase 12.9 voert een Supabase SQL/architectuur-audit uit zonder SQL uit te voeren.
- Nieuwe auditdocumenten: `/docs/SUPABASE_SQL_AUDIT.md`, `/docs/SUPABASE_EXECUTION_PLAN.md` en `/docs/SUPABASE_SQL_INDEX.md`.
- De audit constateert dat er twee SQL-lijnen bestaan: de nieuwe platformlijn (`customers`, `websites`, `projects`, `quotes`, `invoices`, `subscriptions`) en oudere klantportaal/billingtabellen (`customer_websites`, `customer_invoices`, `customer_subscriptions`).
- Fase 13 mag pas starten nadat de SQL-audit is gereviewd en de definitieve productiearchitectuur is bevestigd.
- Fase 13.0 consolideert de database-architectuur op papier vóór Auth/RLS hardening.
- Canonical productielijn: `profiles -> customers -> websites -> projects -> quotes -> quote_lines -> invoices -> invoice_lines -> subscriptions`.
- Legacy lijn: `customer_websites`, `customer_invoices` en `customer_subscriptions`; nieuwe ontwikkeling mag hier niet meer op worden gebaseerd.
- Nieuwe consolidatiedocumenten: `/docs/SUPABASE_LEGACY_MAPPING.md`, `/docs/SUPABASE_CANONICAL_SCHEMA.md`, `/docs/SUPABASE_CONSOLIDATED_PLAN.md` en `/docs/SUPABASE_PATCH_PLAN.md`.
- Fase 13.1 Auth/RLS blijft geblokkeerd totdat het consolidated plan is gereviewd.
## Fase 13.1 - Supabase Auth & Profiles Foundation

Status: afgerond als voorbereiding.

Toegevoegd:

- canonical `Profile` model voor `profiles`
- `ProfileRepository` met localStorage profile-concepts en Supabase read/write mapping
- `authProfileService` voor session/profile mapping, account request voorbereiding en customer/profile links
- Supabase provider ondersteuning voor `profiles`
- permissions-prioriteit: profile role -> session role -> demo fallback
- route guard readiness/uitleg zonder harde blokkade
- loginpagina bereidt accountaanvragen als profile-concept voor
- Developer Mode toont Profiles readiness en testacties

Nog niet actief:

- echte Supabase Auth-login voor klanten/admin
- harde route guards
- RLS hardening
- Supabase uitnodigingsmails

## Fase 13.2 - Route Guards & Access Control Hardening

Status: afgerond als soft access-control laag.

Toegevoegd:

- `protectedRoutes.js` met route registry
- access modes `preview`, `soft`, `hard`
- `routeGuardService` met auth/role/permission/customer guards
- `accessControlTestService` met self-tests en readiness summary
- role-based navigation in het admin-dashboard
- soft action guards voor gevaarlijke acties
- customer access guard in `klantportaal.html`
- activity logging voor access decisions
- Developer Mode Access Control readiness kaart en testknoppen

Nog niet actief:

- harde route guards standaard
- definitieve RLS policies
- echte productie-admin-login

Default blijft `soft`, zodat demo-login en bestaande klantflows blijven werken.

## Fase 13.3 - RLS Policy Hardening & Security Audit

Status: afgerond als securityplan en readinesslaag. Er is geen SQL uitgevoerd.

Toegevoegd:

- `/docs/RLS_POLICY_MATRIX.md`
- `/docs/AUTH_CLAIMS_STRATEGY.md`
- `/docs/SECURITY_RISK_AUDIT.md`
- `/docs/supabase-rls-canonical-draft.sql`
- `/public/src/services/securityReadinessService.js`

Bijgewerkt:

- `accessControlTestService` bevat nu extra securitytests voor customer ownership, demo-only toegang, sales/support/developer beperkingen, anonymous waarschuwing en klantportaal-mismatch.
- Developer Mode toont nu `Security & RLS readiness` met knoppen voor checklist, self-test, bekende risico's en RLS coverage summary.

Readiness-status:

- RLS policy matrix: gereed.
- Auth claims strategy: gereed.
- RLS SQL draft: voorbereid.
- Security risk audit: gereed.
- RLS live execution: geblokkeerd tot review.
- Frontend route guards: soft actief.
- Database-level security: voorbereid, nog niet live.

Belangrijk: `change_requests` is meegenomen als canonical-supporting tabel via `auth_user_id`. Legacy `customer_websites`, `customer_invoices` en `customer_subscriptions` worden niet gebruikt voor nieuwe productie-RLS.

## Fase 13.4 - Supabase Test Environment & RLS Dry Run Plan

Status: afgerond als testplan/readinesslaag. Er is geen SQL uitgevoerd.

Toegevoegd:

- `/docs/SUPABASE_TEST_ENVIRONMENT.md`
- `/docs/RLS_DRY_RUN_PLAN.md`
- `/docs/RLS_TEST_SCENARIOS.md`
- `/docs/RLS_TEST_DATA_PLAN.md`
- `/docs/RLS_EXPECTED_ACCESS_MATRIX.md`
- `/docs/RLS_PREFLIGHT_CHECKLIST.md`
- `/docs/RLS_TEST_LOG_TEMPLATE.md`

Bijgewerkt:

- `securityReadinessService` bevat nu RLS testomgeving, dry-run status, scenario coverage, preflight status en Go/No-Go summary.
- `accessControlTestService` bevat extra simulaties voor A/B isolatie, demo-isolatie, anonymous block, role navigation, dangerous actions en klantportaal-mismatch.
- Developer Mode toont nu `RLS testomgeving & dry-run` met lokale readiness knoppen.

Status:

- RLS live status: niet actief.
- Go/No-Go: No-Go tot handmatige Supabase testresultaten zijn vastgelegd.
- Geen productie-execution zonder volledige preflight checklist.

## Fase 13.5 - Supabase Deployment Bundle & Production Readiness

Status: afgerond als deploymentproces. Er is geen SQL uitgevoerd en er is geen productieomgeving aangepast.

Toegevoegd:

- `/docs/deployment/README.md`
- `/docs/deployment/01_SCHEMA.md`
- `/docs/deployment/02_AUTH.md`
- `/docs/deployment/03_RLS.md`
- `/docs/deployment/04_STORAGE.md`
- `/docs/deployment/05_FUNCTIONS.md`
- `/docs/deployment/06_MOLLIE.md`
- `/docs/deployment/07_RESEND.md`
- `/docs/deployment/08_POST_DEPLOY_CHECKS.md`
- `/docs/deployment/09_ROLLBACK.md`
- `/docs/deployment/SQL_BUNDLE.md`
- `/docs/deployment/PRODUCTION_CHECKLIST.md`
- `/docs/deployment/ROLLBACK_PLAN.md`
- `/public/src/services/deploymentReadinessService.js`

Developer Mode toont nu `Production Deployment` met module-statussen, checklist, blockers, rollbackreferentie en SQL bundle-referentie.

Go/No-Go status blijft `NO-GO` zolang blockers openstaan zoals ontbrekende backup, RLS review, testlog, Auth test, klantisolatie en env-var controle.

## Fase 13.6 - Resolve Deployment Blockers Readiness

Status: afgerond als blocker-readiness systeem. Er is geen SQL uitgevoerd en er is geen productieomgeving aangepast.

Toegevoegd:

- `/public/src/services/deploymentBlockerService.js`
- localStorage key `maxwebstudioDeploymentBlockers`
- `/docs/deployment/DEPLOYMENT_BLOCKERS.md`
- `/docs/deployment/ENVIRONMENT_VARIABLES_CHECKLIST.md`
- `/docs/deployment/AUTH_TEST_CHECKLIST.md`
- `/docs/deployment/CUSTOMER_ISOLATION_CHECKLIST.md`

Bijgewerkt:

- `deploymentReadinessService` gebruikt nu de handmatige blockerstatussen voor GO/NO-GO.
- Developer Mode toont per deployment blocker status, evidence, notities en acties.
- `PRODUCTION_CHECKLIST.md`, `README.md` en `ROLLBACK_PLAN.md` verwijzen naar blocker approvals.

Belangrijk:

- Alle blockers starten als `pending`.
- Codex zet niets automatisch op approved.
- GO kan pas wanneer elke blocker `approved` of `not_applicable` is.

## Fase 14.1 - Supabase Test Environment Execution

Status: voorbereid als testomgeving-readiness laag. Er is geen SQL uitgevoerd en er is geen productieomgeving aangepast.

Toegevoegd:

- `/public/src/services/testEnvironmentService.js`
- `/docs/deployment/TEST_EXECUTION_PLAN.md`
- `/docs/deployment/TEST_RESULTS.md`

Bijgewerkt:

- `deploymentReadinessService` bevat nu een deployment bundle validator voor docs, schema, patchplan, rollbackplan, Auth, RLS en checklist.
- Developer Mode toont `Test Environment` en `Production Validation`.
- Blockers worden gekoppeld aan readiness/evidence, maar nooit automatisch approved.

Belangrijk:

- SQL execution order wordt alleen logisch gevalideerd.
- Testresultaten blijven `NOT TESTED` totdat een echte Supabase testomgeving is gebruikt.
- GO/NO-GO blijft `NO-GO` zolang backup, Auth, RLS, klantisolatie, rollback en env-var evidence ontbreken.

## Fase 14.2 - Deployment Blockers Evidence & Manual Approval Flow

Status: afgerond als release-control laag. Er is geen SQL uitgevoerd en er is geen productieomgeving aangepast.

Toegevoegd:

- `/public/src/services/releaseDecisionService.js`

Bijgewerkt:

- `deploymentBlockerService` heeft blocker-specifieke evidencevelden, validatie en approval history.
- Developer Mode toont verplichte evidencevelden, missing evidence, reason/approver velden en approval history.
- Release decision kan als JSON worden geëxporteerd of als Markdown worden getoond.
- `TEST_RESULTS.md` bevat nu aparte secties voor RLS, Auth, klantisolatie, klantportaal, Mollie, Resend, Storage, Functions en post-deploy checks.

Belangrijk:

- `approved` vereist volledige evidence.
- `approved` vereist reviewer/approver registratie.
- `rejected`, `not_applicable` en reset vereisen een reden.
- Codex keurt niets automatisch goed.
- GO blijft `NO-GO` zolang evidence/approval ontbreekt.

## Fase 14.3 - Complete Test Execution

Status: afgerond als lokale QA/release-testfase. Er is geen SQL uitgevoerd en er is geen productieomgeving aangepast.

Uitgevoerd:

- lokale rooktest op CRM/klanten, websites, projecten, offertes, facturen en abonnementen
- klantportaal sanitized payload test
- route guard readiness test
- security readiness test
- deployment readiness test
- blocker approval guard test
- release decision JSON/Markdown export test
- syntaxcheck van 24 Netlify Functions

Resultaten:

- lokale rooktest: 20 PASS / 0 FAIL
- function syntaxcheck: PASS
- testresultaten vastgelegd in `/docs/deployment/TEST_RESULTS.md`
- releasebesluit vastgelegd in `/docs/deployment/RELEASE_DECISION_2026-06-29.md` en `.json`

Belangrijk:

- Status blijft `NO-GO`.
- Supabase schema, Auth, RLS, Storage, Mollie, Resend en runtime function tests blijven `BLOCKED` totdat ze in een echte testomgeving zijn uitgevoerd.

## Fase 14.4 - Supabase Test Environment Validation

Status: uitgevoerd als veilige testomgeving-gate, maar geblokkeerd door ontbrekende testconfiguratie. Er is geen SQL uitgevoerd en er is geen productieomgeving aangepast.

Gecontroleerd:

- aanwezigheid van Supabase test environment variables zonder waarden te tonen
- beschikbaarheid van Supabase CLI en Netlify CLI
- Node.js beschikbaarheid voor lokale syntaxchecks
- releasebesluit voor Fase 14.4

Resultaat:

- `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` en `SUPABASE_TEST_SERVICE_ROLE_KEY` zijn niet aanwezig in de shell.
- Fallback `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY` zijn ook niet aanwezig.
- Supabase CLI is niet beschikbaar.
- Netlify CLI is niet beschikbaar.
- Schema execution, Auth-testgebruikers, RLS, klantisolatie en Storage zijn bewust niet uitgevoerd.

Output:

- `/docs/deployment/TEST_RESULTS.md` bevat nu Fase 14.4 testomgeving-resultaten.
- `/docs/deployment/RELEASE_DECISION_2026-06-29-14-4.md`
- `/docs/deployment/RELEASE_DECISION_2026-06-29-14-4.json`

Belangrijk:

- Status blijft `NO-GO / BLOCKED`.
- De volgende stap is een apart Supabase testproject met test-env-vars configureren en daarna Fase 14.4 opnieuw uitvoeren met echte evidence.

## Fase 14.4A - Supabase Test Setup

Status: voorbereid als testsetupfase. Er is geen SQL uitgevoerd, geen productieomgeving aangepast en geen testproject gekoppeld vanuit Codex.

Toegevoegd/bijgewerkt:

- `/docs/deployment/SUPABASE_TEST_SETUP.md`
- `.env.example`
- `.env.local.example`
- `/docs/deployment/ENVIRONMENT_VARIABLES_CHECKLIST.md`
- `/docs/deployment/DEPLOYMENT_BLOCKERS.md`
- `/docs/deployment/TEST_RESULTS.md`
- `/docs/SUPABASE_TEST_ENVIRONMENT.md`
- `/supabase/setup-guide.md`

Doel:

- exact vastleggen welke Supabase testvariabelen nodig zijn
- veilig checklisten hoe een apart testproject wordt aangemaakt
- documenteren hoe schema/Auth/RLS/Storage straks getest worden
- Fase 14.4B voorbereiden zonder productie of echte klantdata te raken

Belangrijk:

- Status blijft `blocked_pending_supabase_test_setup`.
- `.env` templates bevatten alleen namen en lege waarden.
- De service role key blijft server-side/setup-only en mag nooit naar frontend of documentatie met waarde.

## Fase 14.4B rerun - Supabase testomgeving na grants

Status: uitgevoerd op het Supabase testproject. Productie is niet aangepast en er is geen echte klantdata gebruikt.

Resultaten:

- `supabase/service-role-grants.sql` is door de gebruiker succesvol uitgevoerd op het testproject.
- De eerdere `403 permission denied` op `public.profiles` is opgelost.
- Service role kan profiles en canonical testrecords plaatsen.
- Auth Admin API kan testgebruikers aanmaken.
- Customer A/B login werkt.
- Storage blijft PASS voor private bucket, upload, signed URL en public-blocking.

Nieuwe blocker:

- RLS-selects geven `500 stack depth limit exceeded`.
- Customer isolation is daardoor nog niet bewezen.
- Waarschijnlijke oorzaak is RLS-recursie rond `current_app_role()` en policies die `public.profiles` raadplegen.

Status blijft:

- `NO-GO / BLOCKED`

## Fase 14.4B final rerun - Supabase testomgeving na RLS recursion patch

Status: uitgevoerd op het Supabase testproject. Productie is niet aangepast en er is geen echte klantdata gebruikt.

Resultaten:

- `supabase/rls-recursion-patch.sql` is door de gebruiker succesvol uitgevoerd op het testproject.
- De eerdere `403 permission denied` op `public.profiles` blijft opgelost.
- De eerdere `500 stack depth limit exceeded` is verdwenen.
- Auth testusers Customer A/B konden worden aangemaakt en inloggen.
- Canonical testrecords konden worden geplaatst.
- Customer A ziet uitsluitend eigen records.
- Customer B ziet uitsluitend eigen records.
- Cross-customer reads geven 0 rijen.
- Anonymous reads geven 0 rijen.
- Storage blijft PASS voor private bucket, upload, signed URL en public-blocking.

Evidence:

- Run: `phase-14-4b-final-1782737698429`
- Zie `docs/deployment/TEST_RESULTS.md`.
- Zie `docs/deployment/RELEASE_DECISION_2026-06-29-14-4b-final.md`.

Status blijft:

- `NO-GO / AWAITING MANUAL APPROVAL`

Reden:

- De technische Supabase testvalidatie is geslaagd.
- Handmatige approvals, backup-evidence, env-var bevestiging, rollback approval en storage review ontbreken nog.

## Fase 14.5 - Release Candidate Approval Pack

Status: voorbereid als release-governance fase. Productie is niet aangepast, er is geen productie-SQL uitgevoerd, er is geen echte klantdata gebruikt en er zijn geen nieuwe features gebouwd.

Toegevoegd:

- `docs/deployment/RELEASE_CANDIDATE_CHECKLIST.md`
- `docs/deployment/RELEASE_DECISION_2026-06-29-14-5.md`
- `docs/deployment/RELEASE_DECISION_2026-06-29-14-5.json`

Bijgewerkt:

- `docs/deployment/TEST_RESULTS.md`
- `docs/deployment/DEPLOYMENT_BLOCKERS.md`

Resultaat:

- Alle resterende NO-GO punten zijn vertaald naar concrete approval/evidence-items.
- Backup-evidence, env-var bevestiging, Auth/RLS/customer-isolation approvals, rollback approval en storage review zijn expliciet gemaakt.
- Mollie, Resend en runtime function readiness staan als pending of bewust later `not_applicable` te maken.

Status blijft:

- `NO-GO / AWAITING MANUAL APPROVAL`

## Fase 15.0 - AI Website Wizard Foundation

Status: voorbereid als modulaire foundation. Er is geen productie aangepast, geen SQL uitgevoerd, geen nieuwe dependency toegevoegd en geen AI-provider gekoppeld.

Toegevoegd:

- `docs/AI_WEBSITE_WIZARD.md`
- `public/src/config/aiWebsiteWizardWorkflow.js`
- `public/src/models/AIWebsiteWizardState.js`
- `public/src/services/aiWebsiteWizardService.js`

Bijgewerkt:

- `public/src/config/storageKeys.js`
- `public/admin-dashboard.html`
- `docs/AI_OPERATING_SYSTEM.md`

Resultaat:

- Centrale AI Website Wizard workflow met 5 fases en 15 stappen.
- State model met lokale sleutel `maxwebstudioAiWebsiteWizardState`.
- Placeholder service voor architecture/readiness, draft-state en progress.
- Developer Mode toont de AI Website Wizard foundation read-only.

Nog niet actief:

- OpenAI-calls.
- Logo-generatie.
- AI-contentgeneratie.
- Website scaffold/build.
- Database-uitbreiding.
- Nieuwe API keys.
