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

## Epic 1 - Digital Account Manager UX Blueprint

Status: `BLUEPRINT COMPLETE / PRODUCT EXPERIENCE / NO CODE`

Epic 1 legt vast hoe het klantportaal moet voelen voor een betalende klant:

- als een persoonlijke digitale accountmanager;
- niet als een technisch beheerpaneel;
- proactief, rustig en gericht op de volgende stap;
- met Max AI als contextuele begeleider door het hele portaal.

North Star:

> Max Webstudio is niet alleen een webbouwer. Het klantportaal moet voelen als een persoonlijke digitale accountmanager die proactief meedenkt, overzicht geeft en ondernemers helpt online te groeien.

Belangrijkste uitgangspunt:

- Een klant mag nooit hoeven nadenken over de status van zijn website.
- Het portaal vertelt wat belangrijk is, wat aandacht nodig heeft en wat de volgende stap is.

Vastgelegde klantgebieden:

- Vandaag / overzicht
- Dashboard
- Mijn Website
- Projectstatus
- Wijzigingsverzoeken
- Berichten
- Facturen/offertes
- Notificaties
- Max AI als laag door het hele portaal

Bewust niet uitgevoerd:

- geen codewijzigingen;
- geen nieuwe dependencies;
- geen backendwijzigingen;
- geen SQL;
- geen OpenAI;
- geen productiegegevens.

Leidend document:

- `docs/EPIC_1_DIGITAL_ACCOUNT_MANAGER_UX_BLUEPRINT.md`

## Epic 1.1 - Portal Shell & Today Overview

Status: `IMPLEMENTED / STAGING-DEMO ONLY`

Het klantportaal heeft nu een eerste productervaring op basis van de Digital Account Manager UX Blueprint:

- compacte portal shell/navigatie;
- `Vandaag / overzicht` als eerste scherm;
- websitegezondheid in begrijpelijke statuskaarten;
- openstaande acties voor wijzigingen, berichten, facturen en notificaties;
- Max AI-tip als contextuele begeleider;
- duidelijke CTA `Wijziging aanvragen`;
- mobile-first layout bovenop de bestaande staging/demo klantportaalflow.

Gebruikte data:

- bestaande demo/localStorage data;
- bestaande Supabase/hybrid read-layer waar veilig beschikbaar;
- bestaande staging auth bridge.

Bewust niet uitgevoerd:

- geen productiegegevens;
- geen SQL;
- geen RLS-wijzigingen;
- geen OpenAI;
- geen nieuwe dependencies;
- geen nieuwe backendfunctionaliteit.

## Epic 1.2 - Mijn Website Page

Status: `IMPLEMENTED / STAGING-DEMO ONLY`

De klantportaalervaring bevat nu een klantvriendelijke pagina/sectie `Mijn Website`:

- website status in gewone taal;
- domein en open-website actie;
- hostingstatus;
- beveiliging uitgelegd als `veilig actief`;
- laatste update;
- backup/demo-placeholder;
- demo-scores voor snelheid en SEO;
- CTA's voor `Open website`, `Wijziging aanvragen` en `Vraag Max om advies`.

De pagina is bedoeld om de klant direct te laten voelen:

> Mijn website is onder controle.

Bewust niet uitgevoerd:

- geen productiegegevens;
- geen SQL;
- geen RLS-wijzigingen;
- geen OpenAI;
- geen nieuwe dependencies;
- geen nieuwe backendfunctionaliteit.

## Epic 1.3 - Wijzigingsverzoeken

Status: `IMPLEMENTED / STAGING-DEMO ONLY`

De klantportaalervaring bevat nu een klantvriendelijke wijzigingsflow:

- keuzehulp voor het type wijziging;
- simpele velden voor titel, omschrijving en prioriteit;
- CTA `Wijziging aanvragen`;
- demo-succesmelding;
- bestaande/open wijzigingsverzoeken als overzichtelijke kaarten;
- bestaande veilige write-fallback blijft behouden.

De pagina is bedoeld om de klant direct te laten voelen:

> Ik kan makkelijk iets laten aanpassen zonder te mailen of bellen.

Bewust niet uitgevoerd:

- geen productiegegevens;
- geen SQL;
- geen RLS-wijzigingen;
- geen uploads;
- geen OpenAI;
- geen nieuwe dependencies;
- geen nieuwe backendfunctionaliteit.

## Epic 1.4 - Berichten

Status: `IMPLEMENTED / STAGING-DEMO ONLY`

De klantportaalervaring bevat nu een menselijke berichtenlaag:

- gespreksthread in plaats van e-mailachtige lijsten;
- duidelijk onderscheid tussen klant en Max Webstudio;
- eenvoudige berichtinvoer met CTA `Bericht sturen`;
- demo-succesmelding;
- Max AI-placeholder voor `Samenvatting / volgende stap`;
- mobiele layout die kort en direct blijft.

De pagina is bedoeld om de klant direct te laten voelen:

> Ik kan kort en direct communiceren met mijn digitale accountmanager.

Bewust niet uitgevoerd:

- geen productiegegevens;
- geen SQL;
- geen RLS-wijzigingen;
- geen e-mailintegratie;
- geen OpenAI;
- geen nieuwe dependencies;
- geen nieuwe backendfunctionaliteit.

## Epic 1.5 - Facturen en Offertes

Status: `IMPLEMENTED / STAGING-DEMO ONLY`

De klantportaalervaring bevat nu een actiegerichte finance-laag:

- gezamenlijke sectie `Facturen & offertes`;
- openstaand, betaald en concept/offerte worden klantvriendelijk uitgelegd;
- statuslabels per item;
- CTA's `Bekijk details`, `Betaal later` en `Akkoord geven`;
- demo-placeholder voor betaal- en akkoordacties;
- Max AI-placeholder voor `Leg deze factuur/offerte uit`;
- mobiele layout als kaarten in plaats van tabellen.

De pagina is bedoeld om de klant direct te laten begrijpen:

> Wat staat open, wat is betaald en waar moet ik iets mee?

Bewust niet uitgevoerd:

- geen productiegegevens;
- geen SQL;
- geen RLS-wijzigingen;
- geen Mollie live;
- geen PDF-generatie;
- geen OpenAI;
- geen nieuwe dependencies;
- geen nieuwe backendfunctionaliteit.

## Epic 1.6 - Notificaties en Actiecentrum

Status: `IMPLEMENTED / STAGING-DEMO ONLY`

De klantportaalervaring bevat nu een actiecentrum:

- notificaties worden gegroepeerd in `Aandacht nodig`, `Recent afgerond` en `Informatief`;
- duidelijke statuslabels per notificatie;
- directe CTA's zoals `Bekijk wijziging`, `Bekijk factuur`, `Open website` en `Bericht sturen`;
- Max AI-placeholder voor `Vat mijn aandachtspunten samen`;
- mobiele layout waarin actiepunten netjes onder elkaar staan.

De pagina is bedoeld om de klant direct te laten begrijpen:

> Moet ik iets doen, of is alles onder controle?

Bewust niet uitgevoerd:

- geen productiegegevens;
- geen SQL;
- geen RLS-wijzigingen;
- geen push- of e-mailnotificaties;
- geen OpenAI;
- geen nieuwe dependencies;
- geen nieuwe backendfunctionaliteit.

## Epic 1.7 - Max AI Begeleidende Laag

Status: `IMPLEMENTED / STAGING-DEMO ONLY`

De klantportaalervaring bevat nu Max AI als contextuele begeleider:

- `Vandaag` toont een proactieve Max-tip op basis van demo-portaaldata;
- `Mijn Website` geeft klantvriendelijk advies over snelheid, SEO en vertrouwen;
- `Wijzigingen` helpt de klant een wijzigingsverzoek duidelijk te formuleren;
- `Berichten` vat de volgende stap samen;
- `Facturen & offertes` legt openstaande acties rustig uit;
- `Notificaties` vat aandachtspunten samen;
- iedere Max-kaart maakt zichtbaar dat dit een demo/placeholder-laag is zonder echte AI-call.

De laag is bedoeld om de klant direct te laten voelen:

> Max kijkt met mij mee en helpt mij de volgende stap kiezen.

Bewust niet uitgevoerd:

- geen productiegegevens;
- geen SQL;
- geen RLS-wijzigingen;
- geen OpenAI;
- geen chatfunctie;
- geen backendwijzigingen;
- geen nieuwe dependencies;
- geen nieuwe backendfunctionaliteit.

## Epic 1.8 - Portal QA & UX Polish

Status: `IMPLEMENTED / STAGING-DEMO ONLY`

Gecontroleerd als samenhangende productervaring:

- loginpagina via lokale Netlify-route;
- foutieve login toont een duidelijke klantvriendelijke foutmelding;
- directe klantportaaltoegang zonder geldige klantcontext toont geen klantdata;
- Vandaag/overzicht, Mijn Website, Wijzigingen, Berichten, Facturen/offertes, Notificaties en Max AI-kaarten;
- mobiele fallback zonder horizontale overflow;
- console-errors;
- zichtbare technische termen voor normale klantweergave.

Kleine polish:

- zonder klantcontext worden portalnavigatie, klantsecties en formulieren verborgen;
- de gebruiker ziet een nette statuskaart `Klantportaal niet geladen`;
- CTA's `Naar login` en `Terug naar website` blijven beschikbaar;
- bronmelding wordt klantvriendelijk `Veilig` in plaats van een lege technische demo-state.

Bewust niet uitgevoerd:

- geen nieuwe features;
- geen backendwijzigingen;
- geen OpenAI;
- geen SQL;
- geen RLS-wijzigingen;
- geen productiegegevens;
- geldige staging-login is niet opnieuw uitgevoerd zonder testwachtwoord in deze sessie.

## Epic 2 - Production Rollout Plan

Status: `PLANNED / NO PRODUCTION CHANGES`

Het productie-uitrolplan voor klantportaal en Digital Account Manager is vastgelegd.

Toegevoegd:

- `docs/EPIC_2_PRODUCTION_ROLLOUT_PLAN.md`

Belangrijkste beslissingen:

- productie bevat uitsluitend echte klanten, echte klantprofielen, echte domeinen, echte websites, echte hostinginformatie, echte abonnementen, echte facturen en echte notificaties;
- productie bevat nooit demo-data, staging-accounts, testklanten, placeholder-content of mock responses;
- productie-auth blijft dicht totdat go/no-go groen is;
- Customer A/B-isolatie, password reset, session restore, logout, audit logging, backups en rollback zijn verplichte releasecriteria;
- iedere nieuwe feature moet direct klantwaarde opleveren of tijd besparen voor Max Webstudio.

Bewust niet uitgevoerd:

- geen code;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdatawijzigingen;
- geen OpenAI;
- geen Mollie/Resend;
- geen runtimewijzigingen.

## Epic 2A.1 - Production Data Layer Inventory

Status: `COMPLETED / INVENTORY ONLY / NO CODE CHANGES`

De productie-datalaag voor het klantportaal is geinventariseerd.

Toegevoegd:

- `docs/EPIC_2A_PRODUCTION_DATA_LAYER_PLAN.md`

Vastgelegd:

- welke demo/localStorage-bronnen nu het klantportaal voeden;
- welke Supabase-tabellen en services straks leidend moeten worden;
- welke velden per portalonderdeel nodig zijn;
- hoe ieder onderdeel afhankelijk is van Supabase Auth, `profiles` en `customer_id`;
- welke RLS/security-aandachtspunten per onderdeel gelden;
- welke implementatievolgorde het minste risico geeft.

Belangrijkste volgorde:

1. Auth user naar profile/customer binding.
2. Klantprofiel read.
3. Mijn Website + Projectstatus read.
4. Wijzigingsverzoeken.
5. Berichten.
6. Facturen, offertes en abonnementen.
7. Notificaties.
8. Bestanden.
9. Max AI placeholders op echte read-data.

Belangrijkste besluit:

- LocalStorage en staging bridge blijven nuttig voor demo, fallback en test, maar mogen in productie niet de bron van waarheid zijn.
- De productieklantcontext moet uit Supabase Auth + `profiles.customer_id` komen.
- URL-parameters en localStorage mogen production customer-context niet bepalen.

Bewust niet uitgevoerd:

- geen code;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen OpenAI;
- geen Mollie/Resend;
- geen runtimewijzigingen.

Volgende aanbevolen stap:

- `Epic 2A.2 - Production Customer Profile Read`

## Epic 2A.2 - Supabase Customer Profile Foundation

Status: `IMPLEMENTED / READ-ONLY FOUNDATION / PRODUCTIE NO-GO`

Het klantportaal probeert nu eerst een productieklare klantcontext te bepalen via Supabase Auth en `profiles`.

Toegevoegd:

- `public/src/services/clientCustomerProfileContextService.js`

Werking:

- de bestaande Supabase Auth-sessie wordt gelezen;
- publieke Supabase browserconfig wordt opgehaald via de bestaande auth-config route;
- `profiles` wordt read-only gelezen op basis van `auth_user_id`;
- de gekoppelde `customers` record wordt read-only gelezen via `profiles.customer_id`;
- `klantportaal.html` gebruikt deze context als die beschikbaar is;
- bij ontbrekend profile/customer of veilige foutstatus blijft de staging/demo bridge actief.

Ondersteunde states:

- `loading`;
- `profile_found`;
- `profile_missing`;
- `error`.

Belangrijkste securitybesluit:

- De frontend ontvangt geen service-role key.
- Productie customer context mag niet uit URL-parameters of localStorage komen.
- RLS moet de echte grens blijven voor `profiles` en `customers`.

Bewust niet uitgevoerd:

- geen volledige portaldata-migratie;
- geen writes;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen redesign;
- geen OpenAI/Mollie.

Volgende aanbevolen stap:

- `Epic 2A.3 - Mijn Website Production Read`

## Epic 2A.3 - Mijn Website Production Data Foundation

Status: `IMPLEMENTED / READ-ONLY FOUNDATION / PRODUCTIE NO-GO`

De databron voor `Mijn Website` en projectstatus is voorbereid op echte Supabase-data.

Toegevoegd:

- `public/src/services/clientWebsiteProjectContextService.js`

Werking:

- gebruikt de bestaande Supabase Auth-sessie;
- gebruikt de customer context uit Epic 2A.2;
- leest `websites` read-only op `customer_id`;
- leest `projects` read-only op `customer_id`;
- normaliseert website/projectvelden naar de bestaande klantportaalvorm;
- valt terug op de bestaande demo/localStorage payload als Supabase-data ontbreekt of niet veilig gelezen kan worden.

Ondersteunde states:

- `loading`;
- `found`;
- `missing`;
- `error`.

Voorbereide velden:

- website naam;
- domein/live URL;
- status;
- hosting/onderhoud;
- SSL/veiligheidsstatus;
- laatste update;
- backupstatus;
- snelheid/SEO-score;
- projectfase/status/voortgang.

Belangrijkste securitybesluit:

- Reads gebruiken de ingelogde Supabase Auth-sessie.
- RLS moet de echte grens blijven voor `websites` en `projects`.
- Hosting, deployment, domein en ownership-writes blijven geblokkeerd.

Bewust niet uitgevoerd:

- geen redesign;
- geen writes;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen OpenAI/Mollie;
- geen nieuwe dependencies.

Volgende aanbevolen stap:

- `Epic 2A.4 - Change Requests Production Read`

## Epic 2A.4 - Wijzigingsverzoeken Production Data Foundation

Status: `IMPLEMENTED / READ-WRITE FOUNDATION / PRODUCTIE NO-GO`

Wijzigingsverzoeken zijn voorbereid op echte Supabase-data.

Toegevoegd:

- `public/src/services/clientChangeRequestContextService.js`

Werking:

- gebruikt de bestaande Supabase Auth-sessie;
- gebruikt de customer context uit Epic 2A.2;
- leest `change_requests` read-only op `customer_id`;
- maakt een nieuw `change_requests` record aan via Supabase als er een veilige customer context bestaat;
- valt terug op de bestaande demo/localStorage flow als Supabase-data of write-permissie ontbreekt.

Ondersteunde states:

- `loading`;
- `found`;
- `missing`;
- `create_success`;
- `create_error`;
- `error`.

Voorbereide velden:

- `customer_id`;
- `auth_user_id`;
- `website_id`;
- `project_id`;
- `category` als technisch veld voor klantvriendelijk type;
- `title`;
- `description`;
- `priority`;
- `status`;
- `created_at`;
- `updated_at`.

Belangrijkste securitybesluit:

- Geen service role naar frontend.
- `customer_id` komt niet uit formulierinput.
- RLS moet lezen en aanmaken beperken tot eigen klantcontext.
- Customers mogen geen status, ownership, archive/delete of adminvelden wijzigen.
- Uploads blijven uitgesloten tot Storage Security productie-uitvoering.

Bewust niet uitgevoerd:

- geen redesign;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen uploads;
- geen OpenAI/Mollie;
- geen nieuwe dependencies.

Volgende aanbevolen stap:

- `Epic 2A.5 - Client Portal Messages Production Data Foundation`

## Epic 2A.5 - Berichten Production Data Foundation

Status: `IMPLEMENTED / READ-WRITE FOUNDATION / PRODUCTIE NO-GO`

Klantportaalberichten zijn voorbereid op echte Supabase-data.

Toegevoegd:

- `public/src/services/clientPortalMessageContextService.js`

Werking:

- gebruikt de bestaande Supabase Auth-sessie;
- gebruikt de customer context uit Epic 2A.2;
- leest `client_portal_messages` read-only op `customer_id`;
- maakt een nieuw `client_portal_messages` record aan via Supabase als er een veilige customer context bestaat;
- valt terug op de bestaande demo/localStorage flow als Supabase-data of write-permissie ontbreekt.

Ondersteunde states:

- `loading`;
- `found`;
- `missing`;
- `send_success`;
- `send_error`;
- `error`.

Voorbereide velden:

- `customer_id`;
- `sender_type`;
- `subject`;
- `body` als klantvriendelijk bericht;
- `status`;
- `read_at`;
- `created_at`;
- `updated_at`.

Belangrijkste securitybesluit:

- Geen service role naar frontend.
- `customer_id` komt niet uit formulierinput.
- `sender_type` wordt vastgezet op `customer` en moet later ook server/RLS-side worden afgedwongen.
- Customers mogen geen admin/support/system afzender spoofen.
- Geen e-mailintegratie in deze stap.

Bewust niet uitgevoerd:

- geen redesign;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen e-mailintegratie;
- geen OpenAI/Mollie;
- geen nieuwe dependencies.

Volgende aanbevolen stap:

- `Epic 2A.6 - Finance Production Read Foundation`

## Epic 2A.6 - Facturen/Offertes Production Data Foundation

Status: `IMPLEMENTED / READ-ONLY FOUNDATION / PRODUCTIE NO-GO`

Facturen, offertes en abonnementen zijn voorbereid op echte Supabase-data zonder live betalingen.

Toegevoegd:

- `public/src/services/clientFinanceContextService.js`

Werking:

- gebruikt de bestaande Supabase Auth-sessie;
- gebruikt de customer context uit Epic 2A.2;
- leest `quotes`, `invoices` en `subscriptions` read-only op `customer_id`;
- normaliseert records naar de bestaande klantportaalvorm;
- werkt de finance-metrics bij als Supabase-data beschikbaar is;
- valt terug op de bestaande demo/localStorage flow als Supabase-data of read-permissie ontbreekt.

Ondersteunde states:

- `loading`;
- `found`;
- `missing`;
- `error`.

Voorbereide velden:

- `customer_id`;
- `type`;
- `title`;
- `description`;
- `amount`;
- `currency`;
- `status`;
- `due_date`;
- `paid_at`;
- `created_at`;
- `updated_at`.

Belangrijkste securitybesluit:

- Geen service role naar frontend.
- Finance reads gebruiken de ingelogde Supabase Auth-sessie.
- RLS moet afdwingen dat klanten alleen eigen `quotes`, `invoices` en `subscriptions` kunnen lezen.
- Betalen, akkoord geven, Mollie, PDF en statuswrites blijven demo/placeholders tot een aparte release.

Bewust niet uitgevoerd:

- geen redesign;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen Mollie live;
- geen PDF-generatie;
- geen OpenAI;
- geen nieuwe dependencies.

Volgende aanbevolen stap:

- `Epic 2A.7 - Notifications Production Read Foundation`

## Epic 2A.7 - Notificaties Production Data Foundation

Status: `IMPLEMENTED / READ-ONLY FOUNDATION / PRODUCTIE NO-GO`

Notificaties en het actiecentrum zijn voorbereid op echte Supabase-data.

Toegevoegd:

- `public/src/services/clientNotificationContextService.js`

Werking:

- gebruikt de bestaande Supabase Auth-sessie;
- gebruikt de customer context uit Epic 2A.2;
- leest `client_portal_notifications` read-only op `customer_id`;
- normaliseert records naar de bestaande klantportaalvorm;
- werkt de notificatie-metrics bij als Supabase-data beschikbaar is;
- valt terug op de bestaande demo/localStorage flow als Supabase-data of read-permissie ontbreekt.

Ondersteunde states:

- `loading`;
- `found`;
- `missing`;
- `error`.

Voorbereide velden:

- `customer_id`;
- `title`;
- `message`;
- `type`;
- `related_type`;
- `related_id`;
- `cta_label`;
- `cta_target`;
- `read_at`;
- `created_at`;
- `updated_at`.

Belangrijkste securitybesluit:

- Geen service role naar frontend.
- Notificatie reads gebruiken de ingelogde Supabase Auth-sessie.
- RLS moet afdwingen dat klanten alleen eigen `client_portal_notifications` kunnen lezen.
- Notificaties mogen geen interne debugdetails, secrets, betaalgegevens of deploymentinformatie bevatten.
- Push, e-mail, realtime updates en markeren-als-gelezen blijven buiten deze stap.

Bewust niet uitgevoerd:

- geen redesign;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen push/e-mailnotificaties;
- geen OpenAI/Mollie;
- geen nieuwe dependencies.

Volgende aanbevolen stap:

- `Epic 2A Review - Production Data Foundation Completion Review`

## Epic 2A.8 - Production Data Layer QA

Status: `PASS / PRODUCTION DATA FOUNDATION COMPLETE / PRODUCTIE NO-GO`

De production-ready klantportaal datalagen zijn samen gecontroleerd zonder nieuwe features of productie-acties.

Gecontroleerd:

- klantprofielcontext;
- Mijn Website/projectcontext;
- wijzigingsverzoeken;
- berichten;
- facturen/offertes/abonnementen;
- notificaties;
- fallback naar demo/localStorage;
- directe toegang zonder sessie;
- service-role/secrets scan;
- klantportaal inline script.

Resultaat:

- alle contextservices geven zonder geldige sessie/customer-context een veilige `missing` of `profile_missing` state;
- geen klantdata wordt opgehaald of getoond zonder sessie/context;
- bestaande staging/demo-flow blijft intact;
- klantportaal-script parseert;
- geen service-role of secrets in de gewijzigde frontendpaden.

Bewust niet uitgevoerd:

- geen redesign;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen RLS-wijzigingen;
- geen nieuwe features;
- geen OpenAI/Mollie.

Conclusie:

- Epic 2A production data foundation is compleet als voorbereiding.
- Productie blijft `NO-GO` tot echte Supabase-tabellen, RLS en production Auth-rollout apart zijn gevalideerd.

Volgende aanbevolen stap:

- `Epic 2B - Supabase Tables & RLS Production Alignment`

## Epic 2B.1 - Supabase Schema and RLS Implementation Plan

Status: `PLAN COMPLETE / SQL PREVIEW ONLY / PRODUCTIE NO-GO`

Het concrete Supabase database- en RLS-plan voor het klantportaal is vastgelegd op basis van de Epic 2A production data foundation.

Toegevoegd:

- `docs/EPIC_2B_SUPABASE_SCHEMA_RLS_PLAN.md`

Scope:

- `profiles`;
- `customers`;
- `websites`;
- `projects`;
- `change_requests`;
- `client_portal_messages`;
- `quotes`;
- `invoices`;
- `subscriptions`;
- `client_portal_notifications`.

Belangrijkste beslissingen:

- `portal_messages` blijft canonical `client_portal_messages`;
- `finance_items` wordt niet als generieke tabel gebruikt; finance blijft gesplitst in `quotes`, `invoices` en `subscriptions`;
- `profiles.auth_user_id = auth.uid()` en `current_customer_id()` vormen de klantcontext;
- iedere klantgebonden tabel gebruikt `customer_id`;
- customers lezen alleen eigen data;
- customers maken alleen beperkte `change_requests` en `client_portal_messages` aan;
- finance, website operations, projectstatus, ownership, roles en notificatie-status blijven write-restricted;
- staging testdata moet herkenbaar blijven via `environment=test` en/of `is_demo=true`.

Bewust niet uitgevoerd:

- geen SQL;
- geen migrations;
- geen Supabase schemawijziging;
- geen productie-auth activatie;
- geen echte klantdata;
- geen runtime codewijzigingen.

Volgende aanbevolen stap:

- `Epic 2B.2 - Draft Customer Portal Schema/RLS Migrations`

## Epic 2B.2 - Create Staging Schema Migration Draft

Status: `DRAFT CREATED / NOT EXECUTED / PRODUCTIE NO-GO`

Er is een uitvoerbare Supabase migration draft gemaakt voor klantportaal schema/RLS alignment. De draft is bedoeld voor staging/test en is nog niet uitgevoerd.

Toegevoegd:

- `supabase/migration-drafts/013_client_portal_schema_rls_alignment.sql`

Inhoud:

- schema alignment voor klantportaalvelden;
- foreign key alignment voor `profiles.customer_id` en `client_portal_messages.auth_user_id`;
- indexes voor customer-scoped reads;
- RLS helper `current_customer_id()`;
- aangescherpte customer read policies;
- create-only policies voor `change_requests` en `client_portal_messages`;
- read-only policies voor `quotes`, `invoices`, `subscriptions` en `client_portal_notifications`;
- minimale grants voor `authenticated`;
- server-side-only afbakening voor `service_role`.

Execution/rollback:

- execution stappen en rollback zijn vastgelegd in `docs/EPIC_2B_SUPABASE_SCHEMA_RLS_PLAN.md`;
- staging apply vereist expliciete approval;
- productie blijft dicht tot staging evidence groen is.

Bewust niet uitgevoerd:

- geen SQL uitgevoerd;
- geen staging apply;
- geen productie-auth activatie;
- geen echte klantdata;
- geen seed/testdata;
- geen runtime codewijzigingen.

Volgende aanbevolen stap:

- `Epic 2B.3 - Staging Migration Apply & RLS Validation`

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
- Historisch werden websitegegevens voorbereid in `public.customer_websites` met klantkoppeling, domein, live/staging URL, GitHub repo, branch, Netlify project, hostingstatus, SSL-status en deploy/check metadata.
- Deze `customer_websites`-lijn is nu legacy. Nieuwe productieontwikkeling moet de canonical `websites`-tabel gebruiken.
- Er is nog geen echte Netlify API-, GitHub API- of deploy-triggerkoppeling; dit zijn in deze fase beheerlinks en operationele metadata.
- Admin CRM Fase 5.4 voegt Website Health Monitoring toe met `/.netlify/functions/admin-website-health`.
- Healthdata stond historisch op `public.customer_websites` via de losse migratie `/docs/supabase-website-health.sql`; nieuwe productie-healthdata moet op canonical `websites` worden geconsolideerd.
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

## Fase 15.1 - AI Website Wizard Intake UI

Status: gebouwd als lokale admin/developer intake-UI. Er zijn geen AI-calls, databasewijzigingen, SQL, nieuwe dependencies of productieaanpassingen gedaan.

Bijgewerkt:

- `public/admin-dashboard.html`
- `public/styles.css`
- `public/src/services/aiWebsiteWizardService.js`
- `docs/AI_WEBSITE_WIZARD.md`

Resultaat:

- Admin-module **AI Wizard** toegevoegd aan de platformnavigatie.
- Intakeformulier met bedrijfsnaam, branche, doelgroep, diensten, onderscheidend vermogen, stijl, kleuren, bestaande website, contactgegevens, pagina's, CTA en notities.
- Verplichte intakevalidatie voor de basisvelden.
- Conceptopslag in `maxwebstudioAiWebsiteWizardState`.
- Stapnavigatie en voortgang op basis van de bestaande 15-stappen workflow.
- Read-only samenvatting/preview van de verzamelde input.
- Reset/clear draft functionaliteit met bevestiging.
- Developer Mode debugkaart toont alleen interne wizardmetadata wanneer Developer Mode aan staat.

Nog niet actief:

- OpenAI-calls.
- AI-contentgeneratie.
- Logo-generatie.
- Website scaffold/build.
- Supabase opslag voor wizard-state.
- Publicatie-automatisering.

## Demo Portfolio Engine

Status: voorbereid als schaalbare demo-sites infrastructuur. Er is geen inhoudelijke demo-site gebouwd en er zijn geen backend-, database- of AI-koppelingen toegevoegd.

Toegevoegd:

- `public/src/config/demoSites.js`
- `public/src/components/demoPortfolioEngine.js`
- `public/demo-sites/bouwbedrijf-demo/.gitkeep`

Bijgewerkt:

- `public/index.html`
- `public/styles.css`

Resultaat:

- Centrale registry voor officiele demo-websites.
- Demo-sites kunnen later per branche worden toegevoegd met `id`, naam, branche, omschrijving, status, accentkleur, thumbnails, demo-URL, tags en CTA-label.
- Homepage portfolio-sectie heeft een aparte registry-gedreven demo-engine naast de bestaande live demo-carousel.
- Luxe desktop- en mobiele placeholder previews zijn voorbereid zonder echte screenshots of externe assets.
- Eerste geplande demo: `bouwbedrijf-demo`.

Nog niet actief:

- Geen inhoudelijke demo-site.
- Geen echte screenshots/thumbnails.
- Geen database.
- Geen Supabase.
- Geen AI-generatie.
- Geen backend.

## Bouwbedrijf Demo Site

Status: eerste officiele demo-site gebouwd en actief gekoppeld aan de Demo Portfolio Engine.

Toegevoegd:

- `public/demo-sites/bouwbedrijf-demo/index.html`
- `public/demo-sites/bouwbedrijf-demo/styles.css`
- `public/demo-sites/bouwbedrijf-demo/script.js`

Bijgewerkt:

- `public/src/config/demoSites.js`
- `public/src/components/demoPortfolioEngine.js`
- `public/styles.css`

Resultaat:

- `bouwbedrijf-demo` staat in de registry op `live`.
- Demo URL is `/demo-sites/bouwbedrijf-demo/`.
- Portfolio-engine toont nu een actieve knop `Bekijk live demo`.
- Demo-site is een zelfstandige premium one-page bouwbedrijfsite voor Bouwbedrijf Van Dijk & Partners.
- Formulier verwerkt lokaal met nette succesmelding; geen backend of database.

Nog niet actief:

- Geen echte klantdata.
- Geen offertebackend.
- Geen Supabase.
- Geen AI-generatie.

## Premium Demo Portfolio Showcase

Status: demo-engine opgewaardeerd naar een commerciele premium showcase-carousel zonder nieuwe demo-sites te bouwen.

Bijgewerkt:

- `public/index.html`
- `public/styles.css`
- `public/src/config/demoSites.js`
- `public/src/components/demoPortfolioEngine.js`

Resultaat:

- Demo's worden nu gepresenteerd als hoogwaardige agency-cases met desktop- en mobiele mockups.
- De registry bevat showcase-data zoals SEO-score, performance, responsive, conversie, doelgroep, pagina-aantal, doorlooptijd, highlights en CTA-labels.
- `bouwbedrijf-demo` blijft de eerste live demo en gebruikt realistische scores: SEO 98, Performance 96, Responsive 100 en Conversie 97.
- De portfolio-sectie heeft een sterkere introductie met trust stats en duidelijke CTA's: `Bekijk live demo` en `Vraag deze website aan`.
- De officiele demo-weergave is nu een horizontale carousel met pijlen, dots, swipe/trackpad scroll en keyboard arrows.
- De registry is voorbereid op 20 branches, waaronder restaurant, sportschool, advocaat, autobedrijf, kapsalon, tandarts, elektricien, loodgieter, hovenier, makelaar en meer.
- De oude dubbele hardcoded demo-carousel is van de homepage verwijderd.
- De aanvraag-CTA verwijst naar de bestaande aanvraagsectie en gebruikt geen nieuwe backend.

Nog niet actief:

- Geen nieuwe demo-site.
- Geen database.
- Geen Supabase.
- Geen AI-generatie.

Volgende geplande demo:

- `restaurant-demo`.

## Fase 15.x - Architectuur & Productie-roadmap

Status: vastgelegd als documentatiefase. Er is geen codefunctionaliteit gewijzigd, geen productieomgeving aangepast en geen SQL uitgevoerd.

Toegevoegd:

- `docs/PRODUCTION_ARCHITECTURE.md`
- `docs/MODULE_BOUNDARIES.md`

Resultaat:

- De canonical productielijn is opnieuw bevestigd: `profiles -> customers -> websites -> projects -> quotes -> quote_lines -> invoices -> invoice_lines -> subscriptions`, aangevuld met `files` en `change_requests`.
- Demo/local blijft toegestaan voor salesdemo's, lokale CRM-demo's, AI Wizard drafts en release-readiness, maar is geen productiebron.
- Supabase wordt de leidende productiedatalaag voor klanten, websites, projecten, offertes, facturen, abonnementen, bestandenmetadata, wijzigingsverzoeken en klantportaaldata.
- Legacy `customer_websites`, `customer_invoices` en `customer_subscriptions` mogen niet meer als basis voor nieuwe productiefeatures worden gebruikt.
- AI Website Wizard blijft voorlopig local/intake/readiness zonder OpenAI-calls, databasewrites of automatische websitegeneratie.

Volgende logische stap:

- Public website live/source consistency en QA afronden, daarna de Supabase testomgeving en canonical CRM-datalijn verder hardmaken.

## Fase 16 - Klantportaal afronden

Status: klantportaal demo/local/hybrid verder afgerond zonder productie-aanpassingen, SQL of nieuwe externe koppelingen.

Bijgewerkt:

- `public/klantportaal.html`
- `public/styles.css`
- `public/src/config/storageKeys.js`
- `public/src/services/clientPortalDataService.js`
- `docs/CLIENT_PORTAL.md`

Resultaat:

- Het klantportaal toont nu naast klantgegevens, offertes, facturen, abonnementen, projecten, websites en bestanden ook wijzigingsverzoeken, berichten en notificaties.
- Projecten tonen klantvriendelijke voortgang met progressbar en tijdlijn.
- Notificaties worden deels afgeleid uit open facturen, lopende projecten en open wijzigingsverzoeken.
- Nieuwe localStorage keys zijn voorbereid: `maxwebstudioChangeRequests`, `maxwebstudioClientPortalMessages` en `maxwebstudioClientPortalNotifications`.
- De data-service blijft sanitizen en filtert op klantkoppeling/e-mailadres zonder interne admin-notities te tonen.
- Supabase-readiness is zichtbaar per module in het klantportaal, zonder writes of productie-acties.

Nog niet actief:

- Geen echte realtime berichten.
- Geen klantportaal writes.
- Geen live Supabase Auth/RLS hardening.
- Geen nieuwe backend of API keys.

## Fase 17 - CRM Completion & Internal Workflow Readiness

Status: interne CRM-workflow afgerond als local/demo readiness-laag zonder productie-aanpassingen, SQL of externe koppelingen.

Bijgewerkt:

- `public/admin-dashboard.html`
- `public/styles.css`
- `public/src/config/storageKeys.js`
- `public/src/services/crmWorkflowService.js`
- `docs/CRM_WORKFLOW.md`

Resultaat:

- Het admin-dashboard bevat nu een sectie `Workflow` voor interne opvolgacties.
- Opvolgacties kunnen lokaal worden aangemaakt, gekoppeld, gefilterd, afgerond, gearchiveerd en verwijderd.
- Taken kunnen optioneel worden gekoppeld aan klanten, websites, projecten, offertes, facturen en abonnementen.
- De workflow toont KPI's voor open taken, hoge prioriteit, achterstallige taken en komende deadlines.
- De CRM-sectie toont de canonical productielijn en markeert `crm_tasks` als local/demo voorbereiding.
- Nieuwe localStorage key: `maxwebstudioCrmTasks`.

Bewust nog demo/local/mock:

- Geen live Supabase writes.
- Geen productie activity/taken tabel.
- Geen Resend-, Mollie- of OpenAI-acties.
- Geen nieuwe API keys.
- Geen legacy `customer_*` productiefeatures.

## Fase 18 - Leadfinder Foundation & Sales Pipeline Readiness

Status: Leadfinder-basis afgerond als local/demo sales-pipeline zonder scraping, externe API's, Supabase SQL of productiegegevens.

Bijgewerkt:

- `public/admin-dashboard.html`
- `public/styles.css`
- `public/src/config/storageKeys.js`
- `public/src/services/leadFinderService.js`
- `docs/LEADFINDER.md`

Resultaat:

- Het admin-dashboard bevat nu een sectie `Leadfinder`.
- Prospects kunnen lokaal worden geregistreerd met bedrijfsnaam, branche, regio, contactgegevens, website-status, leadscore, belstatus, opvolgdatum, bron en notities.
- Leadfinder heeft filters op zoekterm, website-status, belstatus, branche, regio en minimale score.
- Demo-leads worden lokaal voorbereid als de Leadfinder nog leeg is.
- Leads kunnen notities en belstatusupdates krijgen.
- Leads kunnen een opvolgtaak aanmaken in de CRM Workflow via `maxwebstudioCrmTasks`.
- Leads kunnen lokaal worden geconverteerd naar CRM-klantrecords in `maxwebstudioCrmCustomers` en fallback `maxwebstudioCustomers`.
- Nieuwe localStorage key: `maxwebstudioLeadFinderLeads`.

Bewust nog demo/local/mock:

- Geen scraping of Google Maps API.
- Geen externe leadbronnen.
- Geen live Supabase writes.
- Geen productiegegevens.
- Geen OpenAI-calls of automatische leadscore.
- Geen Resend/Mollie acties.

## Fase 19 - AI Website Wizard Intake & Draft Engine Readiness

Status: AI Website Wizard uitgebreid tot lokale intake- en conceptgenerator zonder OpenAI-calls, API keys, SQL of productiegegevens.

Bijgewerkt:

- `public/admin-dashboard.html`
- `public/styles.css`
- `public/src/services/aiWebsiteWizardService.js`
- `docs/AI_WEBSITE_WIZARD.md`

Resultaat:

- Intakeflow ondersteunt nu extra velden voor regio, tone of voice, concurrenten, SEO zoekwoorden en klantdoel.
- Wizardconcepten kunnen gekoppeld worden aan lokale/demo klanten, websites en projecten.
- De lokale template/mock-generator maakt demo-draft-output voor homepage structuur, hero tekst, dienstenblokken, over-ons tekst, FAQ's, CTA's, SEO titel/meta description en projectbrief.
- Draft-output wordt opgeslagen in `metadata.draftOutput` binnen `maxwebstudioAiWebsiteWizardState`.
- Developer Mode toont of draft-output aanwezig is en welke generator gebruikt is.

Bewust nog demo/local/mock:

- Geen OpenAI API.
- Geen echte AI-content provider.
- Geen logo-generatie.
- Geen websitebuilder/scaffold.
- Geen Supabase writes.
- Geen nieuwe API keys of dependencies.

## Fase 20 - AI Admin Assistant Readiness

Status: centrale AI Admin Assistant voorbereid als local/demo/mock laag zonder OpenAI-calls, API keys, SQL, productiegegevens of externe services.

Bijgewerkt:

- `public/admin-dashboard.html`
- `public/styles.css`
- `public/src/config/storageKeys.js`
- `public/src/services/aiAdminAssistantService.js`
- `docs/AI_ADMIN_ASSISTANT.md`

Resultaat:

- Het admin-dashboard bevat nu een sectie `AI Assistent`.
- Mock/template-acties zijn beschikbaar voor klant samenvatten, project samenvatten, lead analyseren, opvolgadvies, offerte-intro, SEO verbeterpunten, klantbericht en wijzigingsverzoek samenvatten.
- Output-preview wordt lokaal gegenereerd via `local_template_mock`.
- Readiness/blokkades zijn zichtbaar voor Auth/RLS, server-side adapter, secrets/env, logging, rate limiting en consent/privacy.
- Nieuwe localStorage key: `maxwebstudioAiAdminAssistantDrafts`.

Bewust nog demo/local/mock:

- Geen OpenAI API.
- Geen AI-provideradapter.
- Geen API keys of secrets.
- Geen productiegegevens.
- Geen automatische klantcommunicatie.
- Geen externe services.

## Fase 21 - Supabase Production Readiness Plan

Status: afgerond als architectuur- en migratieplanning zonder SQL, productieaanpassingen, API keys of externe calls.

Toegevoegd:

- `docs/SUPABASE_PRODUCTION_READINESS_PLAN.md`

Resultaat:

- Alle huidige localStorage keys en local/demo modules zijn geinventariseerd.
- Elke module is gemapt naar toekomstige Supabase-tabellen.
- De canonical productielijn is opnieuw bevestigd: `profiles`, `customers`, `websites`, `projects`, `quotes`, `quote_lines`, `invoices`, `invoice_lines`, `subscriptions`, `files` en `change_requests`.
- Aanvullende productietabellen zijn vastgelegd voor `leads`, `crm_tasks`, `client_portal_messages`, `client_portal_notifications`, `ai_drafts`, `ai_assistant_drafts` en `audit_logs`.
- Per tabel is doel, kernvelden, relaties, ownership/access, RLS-risico, migratiebron en productie-kritikaliteit beschreven.
- De migratievolgorde is vastgelegd van Auth/profiles tot RLS/security/audit.

Bewust niet uitgevoerd:

- Geen SQL uitgevoerd.
- Geen Supabase schema aangepast.
- Geen productiegegevens gewijzigd.
- Geen API keys toegevoegd.
- Geen OpenAI-, Mollie- of Resend-calls.
- Geen runtimefunctionaliteit gewijzigd.

## Fase 22 - Supabase Auth & Profiles Foundation

Status: afgerond als voorbereiding op echte Supabase Auth/profiles zonder SQL, productiegegevens, secrets of live Auth-writes.

Toegevoegd/bijgewerkt:

- `public/src/services/authReadinessService.js`
- `public/admin-dashboard.html`
- `docs/AUTH_PROFILES_FOUNDATION.md`
- `docs/AUTH.md`

Resultaat:

- Auth/profiles readiness is centraal beschikbaar als service.
- Developer Mode toont een `Auth & Profiles foundation` kaart met providerstatus, profile-aantallen, demo-loginstatus, pagina-toegang en blockers.
- Rollen zijn bevestigd: `super_admin`, `admin`, `sales`, `support`, `developer`, `customer` en `demo_user`.
- Productiekoppeling is vastgelegd als `auth.users -> profiles -> customers`.
- Pagina-toegang is vastgelegd voor login, admin-dashboard, klantportaal, Leadfinder/sales en Developer Mode.

Bewust nog niet live:

- Geen Supabase SQL uitgevoerd.
- Geen production Auth-user writes.
- Geen hard route guards standaard aangezet.
- Geen RLS live geactiveerd.
- Geen service role of secrets in frontend.

## Fase 23 - Supabase Schema Draft & RLS Policy Plan

Status: afgerond als schema/RLS-ontwerpfase zonder SQL, productieaanpassingen, secrets of runtimefeatures.

Toegevoegd/bijgewerkt:

- `docs/SUPABASE_RLS_POLICY_PLAN.md`
- `docs/RLS_POLICY_MATRIX.md`
- `docs/SECURITY.md`

Resultaat:

- Conceptschema beschreven voor `profiles`, `customers`, `websites`, `projects`, `quotes`, `quote_lines`, `invoices`, `invoice_lines`, `subscriptions`, `files`, `change_requests`, `leads`, `crm_tasks`, `client_portal_messages`, `client_portal_notifications`, `ai_drafts`, `ai_assistant_drafts` en `audit_logs`.
- Per tabel zijn primaire velden, foreign keys, statusvelden, timestamps, soft-delete/archivering, ownership en roltoegang vastgelegd.
- RLS-aanpak per rol is vastgelegd voor `super_admin`, `admin`, `sales`, `support`, `developer`, `customer` en `demo_user`.
- Klantisolatie, audit logging en AI/privacy-risico's zijn expliciet beschreven.

Bewust nog niet uitgevoerd:

- Geen SQL uitgevoerd.
- Geen Supabase schema aangepast.
- Geen productiegegevens gewijzigd.
- Geen RLS live geactiveerd.
- Geen externe integraties of API keys toegevoegd.

## Fase 24 - Supabase Migration Scripts Draft

Status: afgerond als migration draft/readinessfase zonder SQL-uitvoering, Supabase CLI, productiegegevens of runtimewijzigingen.

Aangemaakt/bijgewerkt:

- `supabase/migration-drafts/README.md`
- `supabase/migration-drafts/001_schema_tables.sql`
- `supabase/migration-drafts/002_indexes.sql`
- `supabase/migration-drafts/003_rls_enablement.sql`
- `supabase/migration-drafts/004_rls_policies.sql`
- `supabase/migration-drafts/005_audit_logging_foundation.sql`
- `supabase/migration-drafts/006_seed_demo_data_optional.sql`
- `docs/SUPABASE_MIGRATION_DRAFT_REVIEW_CHECKLIST.md`
- `docs/deployment/SQL_BUNDLE.md`

Resultaat:

- Concept-migraties staan klaar als reviewbundel.
- Schema/tables, indexes, RLS enablement, RLS policies, audit foundation en optionele demo seed zijn gescheiden.
- Elk SQL-bestand bevat waarschuwingen: `DRAFT ONLY`, `DO NOT RUN WITHOUT EXPLICIT APPROVAL` en `REVIEW RLS BEFORE PRODUCTION`.
- Reviewstappen voor schema, RLS, backup, staging/testproject, rollback en approval zijn vastgelegd.

Bewust niet uitgevoerd:

- Geen SQL uitgevoerd.
- Geen Supabase CLI gebruikt.
- Geen schema of productiegegevens aangepast.
- Geen API keys of externe services toegevoegd.

## Fase 25 - Staging/Test Supabase Execution Plan

Status: afgerond als staging/test uitvoeringsplan zonder SQL, Supabase CLI, productiegegevens, secrets of runtimewijzigingen.

Aangemaakt/bijgewerkt:

- `docs/SUPABASE_STAGING_EXECUTION_PLAN.md`
- `docs/deployment/STAGING_EXECUTION_CHECKLIST.md`
- `docs/deployment/SQL_BUNDLE.md`
- `docs/deployment/ROLLBACK_PLAN.md`
- `docs/deployment/TEST_RESULTS.md`

Resultaat:

- Uitvoeringsvolgorde voor migration drafts is vastgelegd.
- Validaties per stap zijn beschreven: tabellen, indexes, RLS enablement, policies, audit logging en optionele demo seed.
- Testscenario's zijn vastgelegd voor admin, klantisolatie, demo_user, Leadfinder, AI-drafts en audit logs.
- Rollback voor staging/test is beschreven.
- Evidence- en Go/No-Go voorwaarden zijn vastgelegd.

Bewust niet uitgevoerd:

- Geen SQL uitgevoerd.
- Geen Supabase CLI gebruikt.
- Geen test- of productieproject aangepast.
- Geen API keys of secrets toegevoegd.

## Fase 26 - Staging Execution Readiness UI

Status: afgerond als Developer Mode/readinessfase zonder SQL, Supabase CLI, productiegegevens, secrets of externe services.

Aangemaakt/bijgewerkt:

- `public/src/services/stagingReadinessService.js`
- `public/admin-dashboard.html`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/SUPABASE_STAGING_EXECUTION_PLAN.md`

Resultaat:

- Developer Mode toont nu een Supabase Staging Readiness-kaart.
- De kaart toont migration drafts, staging checklist, rollbackplan, testresultatenbestand, approvalstatus, blockers en GO/NO-GO.
- De readiness-service gebruikt bestaande deployment blockers en bekende documentatie/draftpaden als lokale readiness-bron.
- De status blijft NO-GO zolang approvals, evidence of echte staging execution ontbreken.

Bewust niet uitgevoerd:

- Geen SQL uitgevoerd.
- Geen Supabase CLI gebruikt.
- Geen Supabase calls gedaan.
- Geen test- of productieproject aangepast.
- Geen API keys of secrets toegevoegd.

## Fase 27 - Master Roadmap v2.0 & Max AI Experience Architecture

Status: afgerond als strategische architectuurfase zonder codewijziging in runtime, SQL, OpenAI, Supabase wijzigingen, API keys of productieacties.

Aangemaakt/bijgewerkt:

- `docs/MASTER_ROADMAP_V2.md`
- `docs/MAX_AI_ARCHITECTURE.md`
- `docs/MAX_AI_USER_JOURNEY.md`
- `docs/MAX_AI_MODULE_MAP.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/AI_OPERATING_SYSTEM.md`
- `docs/SECURITY.md`

Kernbesluit:

- Max AI wordt niet behandeld als losse chatbot, maar als centrale Experience Layer over website, aanvraagflow, AI Website Wizard, CRM, Leadfinder, projecten, offertes, facturen, klantportaal, wijzigingsverzoeken en toekomstige websitegenerator.
- Max AI mag in MVP vooral begeleiden, samenvatten en concepten maken.
- Kritieke acties zoals factuurbedragen, betaalstatussen, gebruikers/rollen, Supabase schema, RLS, deployment en productiegegevens blijven buiten directe AI-writes.
- Echte AI-providerintegratie blijft geblokkeerd tot Auth/RLS, Customer A/B isolation, server-side AI adapter, logging, rate limiting, masking en consent zijn bewezen.

MVP/V2/V3:

- MVP: veilige intake, AI Website Wizard, CRM/klantportaal aansluiting, Supabase foundation en conceptoutput.
- V2: OpenAI via server-side adapter, SEO AI, CRM AI, Lead AI, Project AI en klantcommunicatieconcepten.
- V3: websitegenerator, logo-generator, voice AI, AI sales agent, marketing AI en support AI.

Bewust niet uitgevoerd:

- Geen runtimecode aangepast.
- Geen SQL uitgevoerd.
- Geen OpenAI-calls gedaan.
- Geen Supabase omgeving gewijzigd.
- Geen API keys of secrets toegevoegd.

## Fase 27.1 - Max AI Brand Guidelines

Status: afgerond als merk- en productrichtlijn zonder code, UI, afbeelding, OpenAI, Supabase wijzigingen, API keys of runtimeaanpassingen.

Aangemaakt/bijgewerkt:

- `docs/MAX_AI_BRAND_GUIDELINES.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/AI_OPERATING_SYSTEM.md`
- `docs/MAX_AI_ARCHITECTURE.md`

Resultaat:

- Max AI is vastgelegd als officiële digitale medewerker van Max Webstudio.
- Persoonlijkheid, tone of voice, rol, veiligheidsgrenzen en verschijningsvorm zijn beschreven.
- De mascotte wordt pas in Fase 33 technisch geïntroduceerd als onderdeel van de Max AI Experience MVP.
- Max AI verschijnt niet op loginpagina's, juridische pagina's, foutpagina's, betaalflows of security/deployment approval schermen.

Bewust niet uitgevoerd:

- Geen UI toegevoegd.
- Geen afbeelding of mascottebestand toegevoegd.
- Geen OpenAI-calls.
- Geen codewijzigingen in runtime.
- Geen API keys of secrets toegevoegd.

## Fase 27.2 - Max AI Persona & Interaction Model

Status: afgerond als laatste strategische productdocumentatiefase voor de productiebouw.

Aangemaakt/bijgewerkt:

- `docs/MAX_AI_PERSONA.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`
- `docs/AI_OPERATING_SYSTEM.md`
- `docs/MAX_AI_ARCHITECTURE.md`
- `docs/MAX_AI_BRAND_GUIDELINES.md`

Resultaat:

- Max AI is vastgelegd als digitale webdesigner en digitale collega van Max Webstudio.
- De drie rollen zijn gedefinieerd: Adviseur voor bezoekers, Projectmanager voor klanten en Collega voor interne gebruikers.
- Het interaction model is vastgelegd: begrijpen, verduidelijken, adviseren en voorbereiden.
- De productbelofte is vastgelegd: "Ik help je van het eerste idee tot de livegang van je website."
- Fase 28 wordt de volgende stap: Supabase Staging Execution.

Bewust niet uitgevoerd:

- Geen code.
- Geen UI.
- Geen afbeelding.
- Geen OpenAI.
- Geen SQL.
- Geen Supabase wijzigingen.
- Geen API keys of secrets.

## Fase 28 - Supabase Staging Execution

Status: gestart en veilig geblokkeerd als `BLOCKED_PRE_EXECUTION`.

Aangemaakt/bijgewerkt:

- `docs/deployment/TEST_RESULTS.md`
- `docs/deployment/DEPLOYMENT_BLOCKERS.md`
- `docs/deployment/RELEASE_DECISION_2026-06-29-28.md`
- `docs/deployment/RELEASE_DECISION_2026-06-29-28.json`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`

Resultaat:

- `.env.local` bestaat en is uitgesloten via `.gitignore`.
- `APP_ENV=test` en `APP_ENVIRONMENT=test`.
- Supabase testconfiguratie is aanwezig zonder waarden te tonen.
- Supabase CLI ontbreekt.
- Er is geen test-only database connection string aanwezig.
- Daarom is er geen veilige geautomatiseerde route om de migration drafts uit te voeren.

Bewust niet uitgevoerd:

- Geen SQL uitgevoerd.
- Geen Supabase CLI uitgevoerd.
- Geen staging database gewijzigd.
- Geen productie geraakt.
- Geen echte klantdata gebruikt.
- Geen API keys of secrets vastgelegd.

## Fase 28.1 - Development Environment & Staging Readiness

Status: afgerond als release-engineering readinessfase. Huidige environment status: `NOT_READY`.

Aangemaakt/bijgewerkt:

- `docs/DEVELOPMENT_STAGING_READINESS.md`
- `docs/deployment/DEVELOPMENT_STAGING_READY_CHECKLIST.md`
- `docs/deployment/DEPLOYMENT_BLOCKERS.md`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`

Resultaat:

- Tooling is geinventariseerd.
- `.env.local` bevat testflags en Supabase testconfig zonder waarden te tonen.
- `psql`, Node, npm en Git zijn aanwezig.
- Supabase CLI ontbreekt.
- Netlify CLI ontbreekt.
- Een test-only database connection string ontbreekt.
- Voorkeursroute is vastgelegd: Supabase CLI.
- Fallback is vastgelegd: psql met test-only database connection string.
- SQL Editor is beschreven als handmatige derde route met extra evidenceplicht.

Conclusie:

- Fase 28 mag nog niet opnieuw worden uitgevoerd.
- Eerst Supabase CLI installeren/configureren of een test-only database connection string toevoegen.

Bewust niet uitgevoerd:

- Geen SQL uitgevoerd.
- Geen Supabase CLI uitgevoerd.
- Geen staging writes.
- Geen productie geraakt.
- Geen secrets getoond of gelogd.

## Fase 28.1 Hercontrole - Supabase CLI

Status: hercontrole uitgevoerd. Environment is `READY_FOR_STAGING_EXECUTION`.

Resultaat:

- Supabase CLI is geinstalleerd.
- Versie bevestigd: `2.108.0`.
- De binary staat op `/opt/homebrew/bin/supabase`.
- De CLI wordt in Codex gebruikt via absoluut pad.
- CLI login/link is succesvol afgerond.
- Gelinkt project is `maxwebstudio-test`.
- Project ref matcht de test `SUPABASE_URL`.
- Lokale linkmetadata staat in `supabase/.temp/` en is toegevoegd aan `.gitignore`.
- `.env.local` blijft genegeerd door Git.
- `APP_ENV=test` en `APP_ENVIRONMENT=test`.
- Supabase testconfig is aanwezig zonder waarden te tonen.
- Er zijn geen productie-indicatoren aangetroffen in de gecontroleerde env-context.

Resterende aandachtspunten:

- Gebruik `/opt/homebrew/bin/supabase` als expliciet CLI-pad.
- Voer SQL alleen uit volgens de migration-volgorde en documenteer per stap.

Bewust niet uitgevoerd:

- Geen SQL.
- Geen migrations.
- Geen Supabase writes.
- Geen productieproject.

## Fase 28 - Supabase Staging Execution Rerun

Status: uitgevoerd tot eerste kritieke fout. Release blijft `NO-GO / BLOCKED`.

Aangemaakt/bijgewerkt:

- `docs/deployment/TEST_RESULTS.md`
- `docs/deployment/DEPLOYMENT_BLOCKERS.md`
- `docs/deployment/RELEASE_DECISION_2026-06-29-28-rerun.md`
- `docs/deployment/RELEASE_DECISION_2026-06-29-28-rerun.json`
- `docs/PROJECT_STATE.md`
- `docs/ROADMAP.md`

Resultaat:

- `001_schema_tables.sql` is uitgevoerd op staging/test en geslaagd.
- `002_indexes.sql` faalde op `lead_score`.
- `003_rls_enablement.sql`, `004_rls_policies.sql`, `005_audit_logging_foundation.sql` en optionele demo seed zijn niet uitgevoerd.

Oorzaak:

- Staging bevat een oudere `public.leads` tabel zonder `lead_score`.
- De schema draft gebruikt `create table if not exists` en patcht bestaande schema drift niet.

Bewust niet uitgevoerd:

- Geen verdere migrations na de fout.
- Geen RLS/customer isolation test op driftend schema.
- Geen productieaanpassing.
- Geen echte klantdata gebruikt.

Volgende stap:

- Geen schema-drift patch maken.
- Gebruik `docs/deployment/STAGING_RESET_PLAN.md`.
- Reset staging of maak een nieuwe schone testbranch na expliciete approval.
- Herhaal daarna Fase 28 vanaf `001_schema_tables.sql`.

## Fase 28 - Staging Reset Plan

Status: `READY_FOR_MANUAL_APPROVAL`

Er is een resetplan toegevoegd voor de Supabase staging/testdatabase.

Besluit:

- De schema drift in staging wordt niet opgelost met een compatibiliteitspatch.
- Staging moet de canonical architectuur schoon bewijzen.
- Testdata mag pas verwijderd worden na expliciete approval.

Document:

- `docs/deployment/STAGING_RESET_PLAN.md`

## Fase 28 - Staging Execution After Reset

Status: `NO-GO / BLOCKED`

Uitgevoerd:

- Staging `public` schema reset op `maxwebstudio-test`.
- Migration drafts `001` t/m `006` succesvol uitgevoerd.
- Structurele validatie uitgevoerd.

Resultaat:

- Schema drift rond `public.leads.lead_score` is opgelost.
- 22 tabellen aanwezig.
- 85 indexes aanwezig.
- 22 tabellen met RLS enabled.
- 70 policies aanwezig.
- Demo seed aanwezig.

Blocker:

- Customer A/B isolation is nog niet bewezen.
- Test als `authenticated` faalde op ontbrekende tabelrechten: `permission denied for table customers`.

Volgende stap:

- Maak en review een minimale runtime role grants patch/migration.
- Voer die alleen op staging uit na expliciete approval.
- Herhaal Customer A/B isolation en demo isolation.

## Fase 28.2 - Runtime Role Grants Patch

Status: `STAGING VALIDATED / PRODUCTION NO-GO`

Patch:

- `supabase/migration-drafts/007_runtime_role_grants.sql`

Doel:

- Runtime roles minimale grants geven zodat RLS policies kunnen worden geevalueerd.
- `anon` krijgt geen klantdatatabelrechten.
- `authenticated` krijgt SQL-operaties die door RLS beperkt blijven.
- `service_role` blijft server-side.
- Audit helper blijft service-role-only.

Uitgevoerd:

- `007_runtime_role_grants.sql` op uitsluitend `maxwebstudio-test`.
- Customer A/B isolation opnieuw getest.
- Demo user isolation getest.
- Interne basisrollen getest.

Resultaat:

- Runtime grants blocker is opgelost.
- Customer A ziet alleen eigen customer/site.
- Customer B ziet alleen eigen customer/site.
- Demo user ziet alleen demo data.
- Customer ziet geen Leadfinder-data of audit logs.
- Directe audit insert door customer blijft geblokkeerd.

Besluit:

- Fase 28 staging database foundation: `GO`.
- Productie/live release: blijft `NO-GO`.

## Fase 29 - Supabase Data Layer MVP

Status: `AFGEROND`

Doel:

- Eerste applicatielaag aansluiten op Supabase reads voor `customers`, `websites` en `projects`.
- Bestaande localStorage/demo fallback behouden.
- Geen productieproject, echte klantdata of brede writes.

Toegevoegd:

- `public/src/services/supabaseDataLayerService.js`

MVP-grenzen:

- Read-only/hybrid data layer.
- Writes blijven buiten scope behalve bestaande gated test/migratieflows.
- Productie blijft `NO-GO` tot releaseapproval.
- Supabase staging foundation blijft `GO`; productie blijft bewust onaangeraakt.

## Fase 30 - Klantportaal Supabase Read MVP

Status: `AFGEROND`

Doel:

- Het klantportaal gecontroleerd laten lezen via de Fase 29 Supabase Data Layer MVP.
- Alleen `customers`, `websites` en `projects` via de nieuwe read-laag laten lopen.
- Local/demo fallback behouden voor veilige portaalwerking.

Toegevoegd/aangepast:

- `public/src/services/clientPortalDataService.js` gebruikt `supabaseDataLayerService` voor de drie MVP-modules.
- `public/klantportaal.html` toont de data-layer status in de readinesskaart.

MVP-grenzen:

- Read-only.
- Geen productieproject of echte klantdata.
- Offertes, facturen, abonnementen, bestanden, berichten en notificaties blijven op bestaande local/hybrid routes.
- Writes blijven uitgeschakeld.

## Fase 31 - CRM/Admin Supabase Read MVP

Status: `AFGEROND`

Doel:

- Admin-dashboard/CRM gecontroleerd laten lezen via dezelfde Supabase Data Layer MVP als het klantportaal.
- `customers`, `websites` en `projects` read-only via `supabaseDataLayerService`.
- Bestaande local/demo fallback behouden.

Toegevoegd/aangepast:

- `public/admin-dashboard.html` gebruikt de Supabase Data Layer MVP voor CRM customers, websites en projects.
- Developer Mode toont de data-layer status, write-status en fallbackstatus.
- Customer hybrid merge test gebruikt dezelfde data-layer route.

MVP-grenzen:

- Geen productieproject of echte klantdata.
- Geen writes toegevoegd.
- Offertes, facturen, abonnementen, bestanden en workflow blijven op bestaande routes.
- Productie blijft `NO-GO` tot expliciete releaseapproval.

## Fase 32 - Finance Data Layer MVP

Status: `AFGEROND`

Doel:

- De Supabase Data Layer MVP read-only uitbreiden met finance modules.
- Offertes, offertregels, facturen, factuurregels en abonnementen via dezelfde hybrid/local fallback benaderen.
- Klantportaal en admin read-only aansluiten waar veilig.

Toegevoegd/aangepast:

- `public/src/services/supabaseDataLayerService.js` ondersteunt `quotes`, `quote_lines`, `invoices`, `invoice_lines` en `subscriptions`.
- `public/src/services/clientPortalDataService.js` leest offertes, facturen en abonnementen via de data-layer.
- `public/admin-dashboard.html` leest offertes, facturen en abonnementen via de data-layer en toont bronstatus.

MVP-grenzen:

- Read-only.
- Geen Mollie live payments.
- Geen Resend of OpenAI.
- Geen productieproject of echte klantdata.
- Quote/invoice lines worden gelezen als veilige afgeleide read-view uit offerte/factuur records.

## Fase 33 - Operations Data Layer MVP

Status: `AFGEROND`

Doel:

- De Supabase Data Layer MVP read-only uitbreiden met operationele modules.
- Bestanden, wijzigingsverzoeken, klantportaalberichten, klantportaalnotificaties en CRM-taken via dezelfde hybrid/local fallback benaderen.
- Klantportaal en admin read-only aansluiten waar veilig.

Toegevoegd/aangepast:

- `public/src/services/supabaseDataLayerService.js` ondersteunt `files`, `change_requests`, `client_portal_messages`, `client_portal_notifications` en `crm_tasks`.
- `public/src/services/clientPortalDataService.js` leest bestanden, wijzigingsverzoeken, berichten en notificaties via de data-layer.
- `public/admin-dashboard.html` leest bestandsmetadata via de data-layer en toont operations-readiness in Developer Mode.
- `public/src/providers/supabaseProvider.js` staat read-only reads toe voor de operationele tabellen.

MVP-grenzen:

- Read-only.
- Geen Supabase Storage uploads.
- Geen production writes of echte klantdata.
- CRM workflow-acties blijven local/demo tot aparte write-mode fase.
- Change request status-updates via bestaande endpoint blijven buiten deze read-layer migratie.

## Fase 34 - Leadfinder Data Layer MVP

Status: `AFGEROND`

Doel:

- Leadfinder read-only aansluiten op de Supabase/hybrid data-layer.
- Lokale/demo fallback behouden.
- Geen scraping, externe API's, Google Maps API of writes toevoegen.

Toegevoegd/aangepast:

- `public/src/services/supabaseDataLayerService.js` ondersteunt `leads` als read-only module.
- `public/src/providers/supabaseProvider.js` staat read-only reads toe voor `public.leads`.
- `public/admin-dashboard.html` leest Leadfinder-prospects via de data-layer en toont bron/fallback in Developer Mode.

MVP-grenzen:

- Read-only voor Supabase/hybrid leads.
- Lokale Leadfinder-acties blijven local/demo.
- Remote/hybrid leads kunnen bekeken worden en gebruikt worden voor lokale opvolgtaken.
- Converteren, notities wijzigen en verwijderen blijven beperkt tot lokale leads tot een aparte write-mode fase.

## Fase 35 - Supabase Write Readiness Plan

Status: `AFGEROND`

Doel:

- Gecontroleerde Supabase write-mode voorbereiden zonder writes te activeren.
- Vastleggen welke mutaties veilig als eerste MVP mogen komen.
- Risico's, RLS-behoeften, audit, rollback/fallback en UI-impact per write benoemen.

Toegevoegd:

- `docs/SUPABASE_WRITE_READINESS_PLAN.md`

Aanbevolen eerste write-MVP:

1. `crm_tasks` aanmaken.
2. Leadnotitie toevoegen.
3. `change_requests` aanmaken.
4. `client_portal_messages` aanmaken.

Bewust nog geblokkeerd:

- Facturen, betalingen, abonnementen, rollen, storage/files, deployments en AI-mutaties.
- Geen SQL uitgevoerd.
- Geen provider writes geactiveerd.
- Geen productieproject of echte klantdata geraakt.

## Fase 35A - Low-risk Supabase Write MVP: CRM Tasks

Status: `AFGEROND`

Doel:

- Eerste low-risk Supabase write-MVP toevoegen voor alleen `crm_tasks` aanmaken.
- Bestaande local/demo CRM Workflow en Leadfinder-opvolging behouden.
- Geen algemene write-mode, update/delete, productieproject of echte klantdata.

Toegevoegd/aangepast:

- `public/src/services/crmTaskWriteService.js` valideert CRM-taken en orkestreert Supabase write + local fallback.
- `public/src/providers/supabaseProvider.js` ondersteunt alleen `createCrmTask()` met testmetadata.
- `public/admin-dashboard.html` gebruikt de write-aware service in CRM Workflow en Leadfinder-opvolgtaken.
- Developer Mode toont de CRM task write-gate en laatste write/fallback status.
- `public/src/config/storageKeys.js` registreert de write-gate en laatste statuskeys.

Write-gate:

- Provider mode moet `supabase-write-test` zijn.
- Lokale vlag `maxwebstudioCrmTaskWriteEnabled=true` moet expliciet aan staan.
- Productieomgeving blokkeert de write.
- Payload wordt altijd als `is_demo=true`, `environment=test` en `crm-task-write-mvp` metadata verstuurd.

Fallback:

- Als de gate dichtstaat of Supabase/RLS faalt, wordt de taak lokaal opgeslagen in `maxwebstudioCrmTasks`.
- Laatste resultaat staat in `maxwebstudioLastCrmTaskWriteStatus`.

Bewust nog geblokkeerd:

- Supabase update/delete voor CRM-taken.
- Leadnotities, wijzigingsverzoeken en klantportaalberichten.
- Facturen, betalingen, abonnementen, rollen, storage en AI-mutaties.
- Server-side audit logging en productie-write-mode.

## Fase 35A.1 - CRM Task Staging Write Validation

Status: `AFGEROND`

Doel:

- De bestaande Fase 35A CRM task write MVP valideren op Supabase staging/test.
- Geen nieuwe write-features toevoegen.
- Fallback, RLS en testdata-markering bewijzen.

Evidence:

- Run: `phase-35a1-1782774691838`
- Staging write: `PASS`
- Fallback gate-off: `PASS`
- RLS anonymous/no-profile blokkade: `PASS`
- Sales role write + readback: `PASS`

Resultaat:

- Eén test CRM-taak is via de bestaande write-service aangemaakt in `public.crm_tasks`.
- Testdata blijft gemarkeerd als `is_demo=true`, `environment=test`, `safeToArchive=true`.
- Gate uit blijft lokaal fallbacken naar `maxwebstudioCrmTasks`.

Bewust nog geblokkeerd:

- Productie-write-mode.
- Supabase update/delete voor CRM-taken.
- Server-side audit logging.
- Leadnotities, wijzigingsverzoeken en klantportaalberichten.

## Fase 35B - Low-risk Supabase Write MVP: Lead Notes

Status: `AFGEROND / STAGING GEVALIDEERD`

Doel:

- Tweede low-risk write-MVP toevoegen voor leadnotities.
- Alleen notitie append op bestaande leads.
- Geen brede lead-update, delete, scraping of externe API.

Toegevoegd/aangepast:

- `public/src/services/leadNoteWriteService.js` valideert en appendt leadnotities met local fallback.
- `public/src/providers/supabaseProvider.js` ondersteunt `appendLeadNote()` met veldbeperking.
- `public/admin-dashboard.html` laat remote/hybrid Leadfinder-records notities opslaan via de write-aware service.
- `public/src/config/storageKeys.js` registreert de write-gate en laatste statuskeys.

Write-gate:

- Provider mode moet `supabase-write-test` zijn.
- Lokale vlag `maxwebstudioLeadNoteWriteEnabled=true` moet expliciet aan staan.
- Productieomgeving blokkeert de write.
- Supabase runtime-config moet aanwezig zijn.

Fallback:

- Gate uit of Supabase/RLS-fout: notitie wordt lokaal appended in `maxwebstudioLeadFinderLeads`.
- Lokale leads behouden de bestaande belstatus-update.
- Laatste resultaat staat in `maxwebstudioLastLeadNoteWriteStatus`.

Validatie:

- Lokale fallback-test: `PASS`.
- DNS/root cause-check: `PASS`; de eerdere `ENOTFOUND` was tijdelijk en niet meer reproduceerbaar.
- Staging write: `PASS` met run `phase-35b1-rerun-1782775482334`.
- RLS: interne rol kon notitie toevoegen; customer/no-profile kregen 0 rows; anonymous kreeg 401.
- Allowed-fields check: alleen `notes`, `updated_at` en veilige metadata wijzigden.
- Testdata is synthetisch gemarkeerd met `environment=test`, `is_demo=false` en `metadata.safeToArchive=true`.
- Een eerste demo-record test is bewust niet gebruikt voor isolatiebewijs, omdat demo-records via demo-read policies zichtbaar kunnen zijn.

Bewust nog geblokkeerd:

- Productie-write-mode.
- Lead delete of volledige lead-update.
- Server-side audit logging.
- Change requests en klantportaalberichten als writes.

## Fase 35C - Low-risk Supabase Write MVP: Change Requests

Status: `AFGEROND / STAGING GEVALIDEERD`

Doel:

- Klanten kunnen vanuit het klantportaal een nieuw wijzigingsverzoek aanmaken.
- Alleen create, geen update/delete/statuswijziging.
- Local/demo fallback blijft actief.

Toegevoegd/aangepast:

- `public/src/services/changeRequestWriteService.js` valideert en bewaart wijzigingsverzoeken met local fallback.
- `public/src/providers/supabaseProvider.js` ondersteunt `createChangeRequest()` met customer-sessiecontrole.
- `public/klantportaal.html` bevat een compacte kaart voor nieuwe wijzigingsverzoeken.
- `public/admin-dashboard.html` toont de nieuwe gate/status in Developer Mode.
- `public/src/config/storageKeys.js` registreert `maxwebstudioChangeRequestWriteEnabled` en `maxwebstudioLastChangeRequestWriteStatus`.
- `supabase/migration-drafts/008_change_request_customer_ownership.sql` scherpt staging-RLS voor customer ownership aan.

Write-gate:

- Provider mode moet `supabase-write-test` zijn.
- Lokale vlag `maxwebstudioChangeRequestWriteEnabled=true` moet expliciet aan staan.
- Productieomgeving blokkeert de write.
- Geldige Supabase customer-sessie is nodig voor remote write.

Validatie:

- Lokale fallback-test: `PASS`.
- Eerste stagingrun vond een RLS-spoofingrisico waarbij eigen `auth_user_id` met ander `customer_id` gecombineerd kon worden.
- Patch `008_change_request_customer_ownership.sql` is uitsluitend op staging uitgevoerd.
- Herhaalde stagingrun: `PASS` met run `phase-35c-rerun-1782798584503`.
- Eigen customer insert: HTTP 201.
- Customer spoofing met/zonder `auth_user_id`: HTTP 403.
- Anonymous insert: HTTP 401.
- Customer read isolation: eigen rows 1, andere rows 0.

Bewust nog geblokkeerd:

- Productie-write-mode.
- Change request update/delete/statuswijziging.
- Server-side audit logging.
- Client portal messages als laatste low-risk Sprint 1 write.

## Fase 35D - Low-risk Supabase Write MVP: Client Portal Messages

Status: `AFGEROND / STAGING GEVALIDEERD`

Doel:

- Klanten kunnen vanuit het klantportaal een nieuw bericht sturen.
- Alleen create, geen update/delete/sender spoofing.
- Local/demo fallback blijft actief.

Toegevoegd/aangepast:

- `public/src/services/clientPortalMessageWriteService.js` valideert en bewaart klantportaalberichten met local fallback.
- `public/src/providers/supabaseProvider.js` ondersteunt `createClientPortalMessage()` met customer-sessie en profilecontrole.
- `public/klantportaal.html` bevat een compacte kaart voor nieuw bericht.
- `public/admin-dashboard.html` toont de nieuwe gate/status in Developer Mode.
- `public/src/config/storageKeys.js` registreert `maxwebstudioClientPortalMessageWriteEnabled` en `maxwebstudioLastClientPortalMessageWriteStatus`.
- `supabase/migration-drafts/009_client_portal_message_customer_ownership.sql` scherpt staging-RLS voor sender/customer ownership aan.

Write-gate:

- Provider mode moet `supabase-write-test` zijn.
- Lokale vlag `maxwebstudioClientPortalMessageWriteEnabled=true` moet expliciet aan staan.
- Productieomgeving blokkeert de write.
- Geldige Supabase customer-sessie en actief customer profile zijn nodig voor remote write.

Validatie:

- Lokale fallback-test: `PASS`.
- Patch `009_client_portal_message_customer_ownership.sql` is uitsluitend op staging uitgevoerd.
- Stagingrun: `PASS` met run `phase-35d-1782800213876`.
- Eigen customer insert: HTTP 201.
- Sender spoofing, customer spoofing, sender profile spoofing en no-profile: HTTP 403.
- Anonymous insert: HTTP 401.
- Customer read isolation: eigen rows 1, andere rows 0.

Sprint 1 low-risk writes:

- CRM Tasks: `PASS`.
- Lead Notes: `PASS`.
- Change Requests: `PASS`.
- Client Portal Messages: `PASS`.

Bewust nog geblokkeerd:

- Productie-write-mode.
- Client portal message update/delete.
- Server-side audit logging.
- Medium-risk writes tot na Sprint Review.

## Sprint 1 Review - Low-risk Writes Completion

Status: `AFGEROND`

Sprint 1 low-risk writes:

- CRM Tasks: `PASS`.
- Lead Notes: `PASS`.
- Change Requests: `PASS`.
- Client Portal Messages: `PASS`.

Nieuw reviewdocument:

- `docs/SPRINT_1_LOW_RISK_WRITES_REVIEW.md`

Conclusie:

- Alle Sprint 1 writes zijn gated, hebben local/demo fallback en zijn op staging gevalideerd.
- RLS/spoofing checks zijn uitgevoerd.
- Productie-write-mode blijft bewust dicht.
- Server-side audit logging en production approvals blijven open blockers.
- Sprint 2 mag pas starten na medium-risk write-governance.

## Sprint 2A - Project Status Write MVP

Status: `AFGEROND / STAGING GEVALIDEERD / PRODUCTIE DICHT`

Toegevoegd:

- `public/src/services/projectStatusWriteService.js`
- `maxwebstudioProjectStatusWriteEnabled`
- `maxwebstudioLastProjectStatusWriteStatus`
- `supabase/migration-drafts/010_project_status_update_grants.sql`

Werking:

- Supabase-projecten kunnen via de admin alleen `status`, `phase` en `progress` bijwerken.
- Brede projectupdates, project create/delete/archive en ownership/customer fields blijven dicht.
- Local/demo fallback blijft actief wanneer provider/gate niet op `supabase-write-test` staat.
- Admin UI houdt Supabase-projecten beperkt tot status/fase in Sprint 2A.

Staging evidence:

- Patch `010` uitgevoerd op `maxwebstudio-test`.
- PASS-run: `phase-35-2a-1782801332755`.
- Support update PASS.
- Customer/no-profile/anonymous writes geblokkeerd of 0 rijen gewijzigd.
- Customer/extra-field spoofing geblokkeerd.
- Klantportaal-read ziet bijgewerkte projectstatus via RLS/readlaag.

Bewust nog geblokkeerd:

- Productie-write-mode.
- Server-side audit logging.
- Project create/delete/archive.
- Customer/website/finance writes.

## Sprint 2B - Customer Contact Write MVP

Status: `GEIMPLEMENTEERD / STAGING GEVALIDEERD / PRODUCTIE DICHT`

Toegevoegd:

- `public/src/services/customerContactWriteService.js`
- `maxwebstudioCustomerContactWriteEnabled`
- `maxwebstudioLastCustomerContactWriteStatus`
- `supabase/migration-drafts/011_customer_contact_update_grants.sql`

Werking:

- Supabase-klanten kunnen via de admin alleen contactvelden voorbereiden: naam, e-mail, telefoon en notities.
- Bedrijf, website, pakket, status, portal/login, ownership, auth/profile en finance blijven dicht.
- Local/demo fallback blijft actief wanneer provider/gate niet op `supabase-write-test` staat.
- Admin UI houdt Supabase-klanten beperkt tot contactvelden in Sprint 2B.

Evidence:

- Local fallback: `PASS`.
- Syntaxchecks: `PASS`.
- Patch `011` uitgevoerd op staging `maxwebstudio-test`.
- Staging patch/validatie: `PASS` met run `sprint-2b-1782814316233`.
- Interne sales-role update: `PASS`.
- Customer/no-profile/anonymous blokkade: `PASS`.
- Spoofing van status/auth/company: `PASS`.
- Readback: `PASS`.

Bewust nog geblokkeerd:

- Productie-write-mode.
- Patch `011` naar productie zonder release approval.
- Server-side audit logging.
- Customer create/delete/archive, ownership, rollen, status, finance en abonnementen.

## Sprint 2C - Website Operational Write MVP

Status: `GEIMPLEMENTEERD / STAGING GEVALIDEERD / PRODUCTIE DICHT`

Toegevoegd:

- `public/src/services/websiteOperationalWriteService.js`
- `maxwebstudioWebsiteOperationalWriteEnabled`
- `maxwebstudioLastWebsiteOperationalWriteStatus`
- `supabase/migration-drafts/012_website_operational_update_grants.sql`

Werking:

- Supabase-websites kunnen via de admin alleen operationele velden aanpassen: status, onderhoudspakket en notities.
- Domein, URL's, GitHub, Netlify, klantkoppeling, ownership, hosting/deployment configuratie en finance blijven dicht.
- Local/demo fallback blijft actief wanneer provider/gate niet op `supabase-write-test` staat.
- Admin UI houdt Supabase-websites beperkt tot operationele velden in Sprint 2C.

Evidence:

- Local fallback: `PASS`.
- Syntaxchecks: `PASS`.
- Patch `012` uitgevoerd op staging `maxwebstudio-test`.
- Staging patch/validatie: `PASS` met run `sprint-2c-1782814909471`.
- Interne developer-role update: `PASS`.
- Customer/no-profile/anonymous blokkade: `PASS`.
- Spoofing van customer/domain/Netlify: `PASS`.
- Customer portal readback: `PASS`.

Bewust nog geblokkeerd:

- Productie-write-mode.
- Patch `012` naar productie zonder release approval.
- Server-side audit logging.
- Website create/delete/archive, customer/project/ownership, domein, deployment, hostingconfiguratie, billing en storage.
- Sprint 2 Review moet nog worden uitgevoerd.

## Sprint 2 Review - Operationele Workflow Writes

Status: `AFGEROND / STAGING GEVALIDEERD / PRODUCTIE DICHT`

Vastgelegd in:

- `docs/SPRINT_2_OPERATIONAL_WORKFLOW_WRITES_REVIEW.md`

Eindstatus:

- 2A Project Status Updates: `PASS`.
- 2B Customer Contact Updates: `PASS`.
- 2C Website Operational Updates: `PASS`.
- Sprint completion: `100%`.

Productiebeleid:

- Productie-write-mode blijft `NO-GO`.
- Patches `010`, `011` en `012` vereisen production release approval.
- Server-side audit logging, monitoring, backups en production governance blijven de belangrijkste vervolgstappen.

Advies:

- Volgende sprint: `Production Readiness Sprint`.
- Nog niet starten met finance, storage uploads, payments of AI-writes voordat de production readiness-basis verder is afgerond.

## Sprint 3 - Trust Infrastructure

Status: `COMPLETE / TRUST INFRASTRUCTURE READY / PRODUCTIE NO-GO`

Leidend document:

- `docs/SPRINT_3_PRODUCTION_READINESS_PLAN.md`

Doel:

- De laatste infrastructuurvoorwaarden afronden voordat production writes en Max AI Experience veilig kunnen worden vrijgegeven.

Sprint 3 backlog:

- server-side audit logging;
- Storage security;
- monitoring en observability;
- backups en restore evidence;
- release governance;
- environment hardening;
- Sprint 3 Review.

Productstatus:

- Platform Foundation is afgerond.
- Trust Infrastructure is afgerond als foundation.
- Platform Experience kan starten met Sprint 4.
- Productie-write-mode blijft `NO-GO`.
- Sprint 4 Experience Layer start zonder OpenAI/productie-acties.

## Sprint 3A - Audit & Observability Foundation

Status: `FOUNDATION READY / GEEN PRODUCTIE`

Toegevoegd:

- `docs/SPRINT_3A_AUDIT_OBSERVABILITY_FOUNDATION.md`
- `public/src/services/auditObservabilityService.js`
- Developer Mode-kaart `Audit & Observability Foundation`
- localStorage keys `maxwebstudioAuditObservabilityEvents` en `maxwebstudioLastAuditObservabilityStatus`

Werking:

- Auditwaardige acties uit Sprint 1 en Sprint 2 zijn geinventariseerd.
- Een standaard audit event model is vastgelegd.
- Gevoelige velden worden lokaal geredacteerd voordat evidence wordt opgeslagen.
- Observability events zoals write success/failure, RLS denied, fallback activated, gate blocked en validation failed zijn voorbereid.

Bewust nog geblokkeerd:

- productie-audittrail;
- server-side writes naar `audit_logs`;
- externe monitoring;
- Storage;
- OpenAI/Mollie/Resend;
- production writes.

## Sprint 3B - Storage Security Foundation

Status: `FOUNDATION READY / GEEN UPLOADS / GEEN SQL`

Toegevoegd:

- `docs/SPRINT_3B_STORAGE_SECURITY_FOUNDATION.md`
- `public/src/services/storageSecurityReadinessService.js`
- Developer Mode-kaart `Storage Security Foundation`

Werking:

- Canonical bucketstrategie is vastgelegd voor customer files, website assets, contracts, invoices, AI assets, demo assets en internal documents.
- Rollenmatrix voor upload/download is voorbereid.
- Bestandsbeleid, signed URL-regels en Max AI-bestandsgrenzen zijn vastgelegd.
- Historische buckets `change-request-files` en `invoice-pdfs` blijven context/legacy totdat een expliciete migratiefase volgt.

Bewust nog geblokkeerd:

- echte uploads/downloads;
- Supabase Storage bucketmigraties;
- signed URL endpoints;
- file isolation staging tests;
- productie-storage;
- AI-bestandsanalyse met echte klantdata.

## Sprint 3C - Release Governance Foundation

Status: `FOUNDATION READY / GEEN DEPLOYMENT / GEEN PRODUCTIE`

Toegevoegd:

- `docs/SPRINT_3C_RELEASE_GOVERNANCE_FOUNDATION.md`
- `public/src/services/releaseGovernanceReadinessService.js`
- Developer Mode-kaart `Release Governance Foundation`

Werking:

- Release rollen zijn vastgelegd: developer, admin, release approver, support en production operator.
- Releaseflow is vastgelegd als Development -> Staging -> Evidence -> Approval -> Production.
- Verplichte evidence, automatische NO-GO voorwaarden en rollback governance zijn expliciet gemaakt.
- Max AI-regels zijn vastgelegd: Max mag releaseblokkades uitleggen, maar nooit releases goedkeuren, starten of rollback uitvoeren.

Bewust nog geblokkeerd:

- deployment automation;
- productieknoppen;
- production write-mode;
- rollback execution;
- OpenAI/Storage/Mollie/Resend.

## Sprint 3D - Monitoring & Backups Foundation

Status: `FOUNDATION READY / GEEN EXTERNE MONITORING / GEEN PRODUCTIE`

Toegevoegd:

- `docs/SPRINT_3D_MONITORING_BACKUPS_FOUNDATION.md`
- `public/src/services/monitoringBackupReadinessService.js`
- Developer Mode-kaart `Monitoring & Backups Foundation`

Werking:

- Monitoringevents zijn vastgelegd voor applicatiefouten, write failures, RLS/security denials, fallback activaties, release failures, storage failures en toekomstige AI failures.
- Alertingregels bepalen welke events production automatisch `NO-GO` houden.
- Backupstrategie is vastgelegd voor database, storage, config/evidence en local/demo export.
- Restoreprocedures zijn vastgelegd voor staging en production.
- Max AI-regels zijn vastgelegd: Max mag storingen uitleggen, maar nooit rollback of restore uitvoeren.

Bewust nog geblokkeerd:

- externe monitoringdienst;
- echte alert routing;
- backup/restore automation;
- production monitoring;
- AI herstelacties.

## Sprint 3 Review - Trust Infrastructure

Status: `COMPLETE`

Vastgelegd in:

- `docs/SPRINT_3_TRUST_INFRASTRUCTURE_REVIEW.md`

Eindstatus:

- 3A Audit Foundation: `COMPLETE`.
- 3B Storage Security Foundation: `COMPLETE`.
- 3C Release Governance Foundation: `COMPLETE`.
- 3D Monitoring & Backups Foundation: `COMPLETE`.
- Sprint 3 Completion: `100%`.
- Trust Infrastructure: `COMPLETE as foundation`.

Productiestatus:

- Productie blijft `NO-GO`.
- Production writes, Storage uploads, OpenAI, Mollie, Resend en automatisering blijven geblokkeerd tot aparte release approval.

Volgende sprint:

- Sprint 4 - Experience Layer.

## Max Webstudio Platform Manifest v1.0

Status: `ACTIVE / EXPERIENCE LAYER STARTED`

Toegevoegd:

- `docs/MAX_WEBSTUDIO_PLATFORM_MANIFEST.md`
- publieke Max-introductie op `/public/index.html`
- vaste Max AI helper op de homepage met minimize/launcher-gedrag via `maxwebstudioMaxAiHelperDismissed`

Productregel:

> Technologie is niet ons product. De ervaring met Max is ons product.

Experience Rule:

- bezoekers, klanten en interne gebruikers moeten uiteindelijk niet voelen welke module zij gebruiken;
- de ervaring moet voelen alsof zij met Max samenwerken.

Sprint 4A:

- Max wordt voor het eerst zichtbaar als vaste begeleider op de publieke website;
- de grote homepage-introductiesectie is verwijderd, zodat de homepage weer primair draait om websites, portfolio, pakketten, vertrouwen en conversie;
- rechts op de pagina staat een compacte helper die naar de aanvraag leidt;
- de helper is minimaliseerbaar en onthoudt die keuze lokaal via `maxwebstudioMaxAiHelperDismissed`;
- bij minimaliseren blijft een compact Max-knopje zichtbaar waarmee de helper teruggehaald kan worden;
- op mobiel klapt de helper compact in zodat hij bestaande sticky contactknoppen niet blokkeert;
- `public/assets/max-ai-character.png` is ingericht als eerste premium character asset;
- `public/assets/max-ai-mascot.svg` blijft alleen fallback/placeholder;
- de floating helper gebruikt de centrale `max-ai-character` structuur, zodat latere WebP/animated assets centraal vervangbaar zijn;
- CTA's blijven naar bestaande veilige flows gaan;
- er is geen chat, OpenAI, backend, wizard, databasewijziging of automatisering toegevoegd.

Sprint 4A.1:

- Max blijft terugroepbaar via een compacte launcher;
- sluiten en `Later` minimaliseren de helper in plaats van hem definitief te verbergen;
- de launcher opent dezelfde character-led helper opnieuw;
- de helper heeft nu een `data-max-state` structuur voor character animation states;
- ondersteunde states zijn `idle`, `wave`, `thumbs-up`, `thinking`, `celebrate`, `look`, `blink` en `error-safe`;
- `window.maxWebstudioMaxAi` exposeert veilige demo/test helpers voor state-wissels en `celebrateMaxAi`-gedrag;
- de huidige animaties zijn CSS-only en gebruiken transforms op `public/assets/max-ai-character.png`;
- `celebrate` toont alleen een lichte CSS-confetti en speech bubble, zonder echte aankooplogica;
- echte arm-, oog- en hoofdanimatie vereist later aparte animated assets zoals WebM, animated WebP, Lottie of Rive;
- er is geen chat, backend, analytics of nieuwe AI-functionaliteit toegevoegd.

## Klantportaal v1 - Auth & Portal Implementation Plan

Status: `PLAN ONLY / GEEN AUTH ACTIVATIE / GEEN SQL / GEEN RUNTIME WIJZIGINGEN`

Toegevoegd:

- `docs/CLIENT_PORTAL_V1_IMPLEMENTATION_PLAN.md`

Belangrijkste besluiten:

- `public/login.html` + `public/klantportaal.html` wordt de leidende v1-route voor echte klantlogin.
- `public/client-dashboard.html` blijft voorlopig legacy/auth prototype en technische referentie.
- Nieuwe klantportaalontwikkeling gebruikt de canonical datalijn `auth.users -> profiles -> customers -> canonical modules`.
- Legacy tabellen `customer_websites`, `customer_invoices` en `customer_subscriptions` worden niet opnieuw leidend voor productiefeatures.
- Production Auth blijft uit totdat staging Auth-validatie, RLS/customer-isolation evidence en release approval groen zijn.

Volgende veilige uitvoerende stap:

- `Klantportaal v1A - Staging Auth Validation`

Bewust niet uitgevoerd:

- geen codewijzigingen;
- geen Supabase Auth activatie;
- geen SQL;
- geen database writes;
- geen productieconfiguratie.

## Klantportaal v1.1 - Auth readiness foundation

Status: `CODE READINESS / AUTH NOG UIT / GEEN SQL`

Toegevoegd:

- `public/src/services/clientAuthReadinessService.js`

Werking:

- De canonical route `public/login.html` en `public/klantportaal.html` gebruikt nu een veilige Auth-readiness check.
- De check detecteert alleen browserveilige Supabase config via runtime config of `/.netlify/functions/client-auth-config`.
- Normale bezoekers blijven op een nette `Binnenkort beschikbaar`/demo-status zolang Auth niet live is.
- Developer Mode mag technische Auth-readiness tonen zonder secret values.
- Het echte loginformulier blijft verborgen voor normale bezoekers zolang production Auth niet actief is.

Bewust niet uitgevoerd:

- geen Supabase Auth activatie;
- geen SQL;
- geen RLS-wijzigingen;
- geen database writes;
- geen productieklantdata.

## Klantportaal v1.2 - Staging Auth wiring plan

Status: `PLAN ONLY / GEEN AUTH ACTIVATIE / GEEN SQL / GEEN KLANTDATA`

Toegevoegd:

- `docs/CLIENT_PORTAL_STAGING_AUTH_WIRING_PLAN.md`

Vastgelegd:

- benodigde browserveilige Supabase env vars;
- server-side-only secretregels;
- veilige opslaglocaties buiten de repo;
- staging testaccounts voor Customer A/B, admin, support en no-profile;
- login/logout flow;
- password reset flow;
- RLS en spoofing checklist;
- pagina's die achter login komen;
- rollback en evidence-eisen.

Bewust niet uitgevoerd:

- geen Supabase Auth activatie;
- geen SQL;
- geen RLS-wijzigingen;
- geen echte klantdata;
- geen runtime feature change.

## Klantportaal v1A - Staging Auth Readiness Validation

Status: `PARTIAL PASS / AUTH NOG NIET LIVE / PRODUCTIE NO-GO`

Gecontroleerd:

- `.env.local` bevat de benodigde staging/testkeys zonder waarden te tonen.
- `.env.local` blijft genegeerd door Git.
- `APP_ENV` en `APP_ENVIRONMENT` staan op `test`.
- `/.netlify/functions/client-auth-config` geeft alleen publieke Supabase browserconfig terug en geen service role.
- `clientAuthReadinessService` rapporteert `ready_for_staging_auth`, maar houdt `authLive=false`.
- `public/login.html` en `public/klantportaal.html` blijven op veilige fallback/readiness zolang Auth niet live is.

Kleine fix:

- `public/src/services/clientAuthReadinessService.js` had een oude interne statusverwijzing; deze is hersteld tijdens de validatie.

Nog geblokkeerd:

- echte staging login/logout met testaccount;
- password reset met staging resetmail;
- Customer A/B Auth-isolatie via echte sessies.

Bewust niet uitgevoerd:

- geen Supabase Auth activatie;
- geen SQL;
- geen RLS-wijzigingen;
- geen productie-auth;
- geen echte klantdata.

## Klantportaal v1B - Staging Login/Logout Test

Status: `PARTIAL PASS / GELDIGE LOGIN NOG BLOCKED / PRODUCTIE NO-GO`

Gecontroleerd:

- Staging Auth endpoint is bereikbaar via de publieke Supabase config.
- Dummy/verkeerde login wordt correct geblokkeerd met een Auth-fout.
- Normale bezoekers blijven op de veilige fallback zolang Auth niet live is.
- Er zijn geen testaccountcredentials in `.env.local`, dus geldige login/logout is bewust niet uitgevoerd.

Nog geblokkeerd:

- geldig staging testaccount voor Customer A;
- geldig staging testaccount voor Customer B;
- logout met echte sessie;
- password reset met staging-mail;
- Customer A/B Auth-isolatie met echte sessies.

Bewust niet uitgevoerd:

- geen Supabase Auth activatie;
- geen SQL;
- geen RLS-wijzigingen;
- geen productie-auth;
- geen echte klantdata.

## Klantportaal Auth Config Debug

Status: `DIAGNOSE COMPLETE / AUTH NOG UIT`

Bevinding:

- `.env.local` bevat de benodigde publieke Supabase keys en server-side service role key zonder waarden te tonen.
- `functions/client-auth-config.js` geeft bij directe function-test alleen publieke browserconfig terug en geen service role.
- De loginpagina kan `.env.local` niet direct lezen; een statische localhost/file-server geeft die waarden niet automatisch door aan de browser.
- In deze sessie waren `/.netlify/functions/client-auth-config` en `/api/client-auth-config` via localhost niet bereikbaar.
- `authLive=false` en `supabaseAuthActive=false` blokkeren de echte login bewust, ook als publieke config aanwezig is.

Conclusie:

- `Binnenkort beschikbaar` is verwacht gedrag zolang Auth niet expliciet live/staging-wired is.
- Voor de volgende echte test moet lokaal via Netlify Dev/functions of veilige runtime-config worden gedraaid.
- `SUPABASE_SERVICE_ROLE_KEY` blijft server-side only.

## Klantportaal v1C - Enable staging auth UI locally

Status: `IMPLEMENTED / PRODUCTIE NO-GO`

Werking:

- `CLIENT_PORTAL_AUTH_LIVE=true` is toegevoegd als staging/local feature flag.
- De echte login UI mag alleen openen wanneer publieke Supabase config veilig beschikbaar is en de omgeving `test`/`staging` is.
- `functions/client-auth-config.js` geeft alleen publieke config, environment labels en de Auth UI flag terug.
- `SUPABASE_SERVICE_ROLE_KEY` blijft server-side only.
- `supabaseAuthProvider` ondersteunt nu staging login, logout, sessieherstel en password reset via Supabase Auth REST.

Nog niet bewezen:

- geldige login met staging testaccount;
- logout met echte sessie;
- session restore na refresh;
- password resetmail;
- Customer A/B Auth-isolatie.

## Epic 2B.3 - Production Schema Deployment Readiness

Status: `PREFLIGHT PREPARED / PRODUCTION EXECUTION NO-GO`

Productieomgeving:

- Supabase project: `maxwebstudio`
- Project ref: `yxxahurphdbblkuxoeje`
- Database host: `db.yxxahurphdbblkuxoeje.supabase.co`

Staging/testomgeving:

- Supabase project: `maxwebstudio-test`
- Project ref: `xlxpuuycigeqhgxqtzni`
- Database host: `db.xlxpuuycigeqhgxqtzni.supabase.co`

Vastgelegd:

- productie mag niet automatisch via de lokale staging-link worden geraakt;
- demo seed migration `006_seed_demo_data_optional.sql` mag niet op productie;
- klantportaal schema/RLS execution krijgt een eigen approvalmoment;
- service-role blijft server-side only;
- productie-auth blijft dicht totdat schema/RLS groen is.

Nog geblokkeerd:

- read-only productie database-inspectie van huidige tabellen;
- harde bevestiging dat er geen echte klantdata of demo/staging-data in productie staat;
- controle dat Netlify production env vars naar `maxwebstudio` wijzen en gescheiden zijn van test;
- backup/snapshot en rollback-approval vóór execution.

Leidend document:

- `docs/EPIC_2B_PRODUCTION_SCHEMA_DEPLOYMENT_READINESS.md`

## Epic 2B.4 - Production Database Preflight Inspection

Status: `PARTIAL PASS / DB READ BLOCKED / PRODUCTION EXECUTION NO-GO`

Uitgevoerd:

- Supabase projectmetadata read-only opgehaald.
- Productie bevestigd als `maxwebstudio`.
- Productie ref bevestigd als `yxxahurphdbblkuxoeje`.
- Staging/test bevestigd als `maxwebstudio-test`.
- Staging/test ref bevestigd als `xlxpuuycigeqhgxqtzni`.
- Lokale CLI-link gecontroleerd via `supabase/.temp/project-ref` en `linked-project.json`.

Bevinding:

- De lokale CLI is niet per ongeluk op productie gelinkt.
- De lokale CLI staat nog op `maxwebstudio-test`.
- `.env.local` wijst naar test/staging.
- Productie is niet aangepast.

Nog geblokkeerd:

- bestaande productie-tabellen uitlezen;
- bestaande productie-policies/RLS uitlezen;
- productie datacounts uitlezen;
- hard bevestigen dat er geen echte klantdata bestaat;
- hard bevestigen dat migration `013` geen conflict heeft met bestaande productie-objecten.

Waarom:

- Er is geen productie database connection string aanwezig in de lokale omgeving.
- Productie is bewust niet tijdelijk gelinkt om accidental writes te voorkomen.

Conclusie:

- Productie schema/RLS execution blijft `NO-GO`.
- Volgende veilige stap is een expliciete production read-only SQL-inspectie met een tijdelijke DB connection string of handmatige Supabase SQL Editor output.

## Epic 2B.5 - Production Read-only SQL Inspection

Status: `READ COMPLETED / CONDITIONAL GO FULL ORDER / DIRECT 013 NO-GO`

Doel:

- productie-tabellen, kolommen, RLS policies en row counts read-only inspecteren;
- bepalen of migration `013_client_portal_schema_rls_alignment.sql` veilig toepasbaar is;
- hard bevestigen of productie leeg genoeg is voor schema/RLS execution.

Bevinding:

- Er is geen productie database connection string aanwezig in `.env.local`.
- Er is geen `DATABASE_URL`, `SUPABASE_DB_URL` of `POSTGRES_URL` voor productie gevonden.
- De lokale Supabase CLI-link staat nog veilig op `maxwebstudio-test`.
- Productie is niet tijdelijk gelinkt.
- Er is geen SQL uitgevoerd.
- De production read-only SQL output is handmatig aangeleverd.
- `profiles` bestaat met 1 rij.
- `change_requests` bestaat met 2 rijen.
- `customers`, `websites`, `projects`, `client_portal_messages`, `quotes`, `invoices`, `subscriptions` en `client_portal_notifications` ontbreken.

Gedocumenteerd:

- handmatige read-only SQL voor tabellen;
- handmatige read-only SQL voor kolommen;
- handmatige read-only SQL voor RLS status;
- handmatige read-only SQL voor policy namen;
- handmatige read-only SQL voor veilige row counts;
- handmatige read-only SQL voor helper functions;
- conflictcriteria voor migration `013`.

Conclusie:

- Productie is `CONDITIONAL GO` voor volledige migration-volgorde.
- Direct alleen migration `013_client_portal_schema_rls_alignment.sql` uitvoeren blijft `NO-GO`.
- Vóór execution moeten backup/snapshot, bestaande recordbeoordeling, env-scheiding en rollback approval groen zijn.
- Productie-auth blijft dicht totdat schema/RLS en customer-isolation checks groen zijn.

## Epic 2B.6 - Production Migration Runbook

Status: `RUNBOOK READY / NO SQL EXECUTED / PRODUCTION AUTH CLOSED`

Toegevoegd:

- `docs/EPIC_2B_PRODUCTION_MIGRATION_RUNBOOK.md`

Vastgelegd:

- preflight checklist;
- backup/snapshot stap;
- exacte migration-volgorde;
- welke bestanden wel en niet op productie mogen draaien;
- controle na elke stap;
- rollback per stap;
- post-migration validatie;
- RLS/customer-isolation testplan;
- criteria voor wanneer productie-auth open mag;
- release approval checklist.

Belangrijkste besluit:

- productie krijgt alleen een conditional GO voor de volledige migration-volgorde;
- direct alleen `013` blijft NO-GO;
- `006_seed_demo_data_optional.sql` is uitgesloten;
- `010` t/m `012` blijven apart goed te keuren voor operational/admin write rollout;
- productie-auth blijft dicht tot schema, RLS en customer-isolation volledig groen zijn.

## Epic 2B.7 - Production Existing Tables Alignment Patch

Status: `DRAFT CREATED / NO SQL EXECUTED / PRODUCTION AUTH CLOSED`

Toegevoegd:

- `supabase/migration-drafts/000_production_existing_tables_alignment.sql`

Waarom:

- productie bevat al oudere tabellen `profiles` en `change_requests`;
- `001_schema_tables.sql` gebruikt `create table if not exists`;
- daardoor zou `001` bestaande tabellen niet aanvullen met ontbrekende canonical kolommen;
- latere migrations zouden kunnen falen op ontbrekende kolommen zoals `profiles.role`, `profiles.status` of `change_requests.customer_id`.

Patchgedrag:

- voegt alleen ontbrekende kolommen toe;
- zet veilige defaults;
- laat bestaande data intact;
- forceert geen NOT NULL constraints op bestaande records;
- voert geen demo seed uit;
- opent productie-auth niet.

Nieuwe execution-volgorde:

- eerst `000_production_existing_tables_alignment.sql`;
- daarna `001_client_portal_baseline.sql`;
- direct `001_schema_tables.sql` of direct `013` blijft NO-GO.

## Epic 2B.8 - Minimal Client Portal Production Baseline

Status: `PRODUCTION EXECUTED / VALIDATED GREEN / PRODUCTION AUTH CLOSED`

Toegevoegd:

- `supabase/migration-drafts/001_client_portal_baseline.sql`

Waarom:

- `001_schema_tables.sql` is te breed voor de eerste klantportaal-livegang;
- de eerste productie-uitrol heeft alleen klantportaal-basistabellen nodig;
- CRM, Leadfinder, finance, AI, files, settings en logs worden later apart uitgerold.

Bevat alleen:

- `customers`;
- `websites`;
- `projects`;
- verdere veilige alignment van bestaande `change_requests`;
- `client_portal_messages`;
- `client_portal_notifications`;
- `set_updated_at` helper/triggers voor deze beperkte scope.

Bewust niet meegenomen:

- leads;
- crm_tasks;
- quotes/invoices/subscriptions;
- files;
- ai_drafts/ai_assistant_drafts;
- settings;
- demo_emails;
- activity_logs/import_logs/audit_logs.

## Epic 2B.9 - Minimal Client Portal Indexes, RLS & Grants Drafts

Status: `PRODUCTION EXECUTED / VALIDATED GREEN / PRODUCTION AUTH CLOSED`

Toegevoegd:

- `supabase/migration-drafts/002_client_portal_indexes.sql`
- `supabase/migration-drafts/003_client_portal_rls_enablement.sql`
- `supabase/migration-drafts/004_client_portal_rls_policies_and_grants.sql`

Waarom:

- `000` en `001_client_portal_baseline.sql` zijn uitgevoerd en groen gevalideerd op productie;
- de bestaande brede `002_indexes.sql`, `003_rls_enablement.sql`, `004_rls_policies.sql` en `007_runtime_role_grants.sql` zijn te breed voor de eerste klantportaal-livegang;
- de nieuwe drafts beperken indexes, RLS, policies en grants tot de minimale klantportaal-tabellen.

Scope:

- `profiles`;
- `customers`;
- `websites`;
- `projects`;
- `change_requests`;
- `client_portal_messages`;
- `client_portal_notifications`.

Bewust niet meegenomen:

- finance;
- CRM;
- AI;
- demo seed;
- files/storage;
- brede platformtabellen.

Belangrijk:

- productie-auth blijft dicht;
- legacy policies moeten eerst worden opgeschoond voordat productie-auth open mag.

## Epic 2B.10 - Client Portal Legacy Policy Cleanup

Status: `PRODUCTION EXECUTED / VALIDATED GREEN / PRODUCTION AUTH CLOSED`

Toegevoegd:

- `supabase/migration-drafts/005_client_portal_legacy_policy_cleanup.sql`

Waarom:

- productie-validatie na `004` liet oudere policies zien naast de nieuwe minimale RLS policies;
- `"Clients can update own profile"` kan ongewenst profielupdates toestaan als productie-auth live gaat;
- cleanup voorkomt policy-ruis en houdt de canonical klantisolatie leidend.

Scope:

- verwijdert alleen `"Clients can read own profile"`;
- verwijdert alleen `"Clients can update own profile"`;
- verwijdert alleen `"Clients can read own change requests"`.

Belangrijk:

- geen tabellen wijzigen;
- geen data wijzigen;
- geen grants wijzigen;
- geen brede platformtabellen;
- productie-auth blijft dicht tot cleanup en RLS/customer-isolation groen zijn.

## Epic 2B.11 - Production Client Portal Baseline Checkpoint

Status: `BASELINE COMPLETE / PRODUCTION AUTH CLOSED`

Uitgevoerd op productie `maxwebstudio`:

- `000_production_existing_tables_alignment.sql`: PASS;
- `001_client_portal_baseline.sql`: PASS;
- `002_client_portal_indexes.sql`: PASS;
- `003_client_portal_rls_enablement.sql`: PASS;
- `004_client_portal_rls_policies_and_grants.sql`: PASS;
- `005_client_portal_legacy_policy_cleanup.sql`: PASS.

Bevestigd:

- minimale klantportaal-tabellen bestaan;
- row counts zijn gecontroleerd;
- triggers bestaan;
- indexes bestaan;
- geen brede platform-indexes aangemaakt;
- RLS staat aan op alle 7 klantportaal-tabellen;
- policies zijn aangemaakt;
- legacy policies zijn verwijderd.

Veiligheidsstatus:

- schema is compleet voor de minimale klantportaal-baseline;
- `anon` heeft geen directe klantdata-toegang volgens de minimale grants;
- `authenticated` heeft alleen minimale toegang voor lezen en klantveilige creates;
- `service_role` blijft backend-only;
- geen demo seed;
- geen finance/CRM/AI/brede platformtabellen;
- productie-auth blijft dicht.

Open vóór productie-auth:

- RLS/customer-isolation test met echte productiecontext;
- frontend production auth env/config review;
- eerste echte customer/profile koppeling;
- logout/session restore/password reset live-check;
- release approval.
