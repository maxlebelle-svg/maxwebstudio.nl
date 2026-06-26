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
- Homepageformulier gebruikt `mailto:` in plaats van backend-submit.
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
