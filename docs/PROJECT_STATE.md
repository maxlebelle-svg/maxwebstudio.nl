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

- Admin Dashboard v1 is toegevoegd als statische backoffice-preview op `/public/admin-dashboard.html`.
- De admin-preview gebruikt alleen placeholder-data, bevat `noindex, nofollow` en is niet gelinkt in de hoofdwebsite.
- Er is nog geen login, backend, database of echte koppeling met Mollie, Resend, Netlify Forms/Functions of analytics.
- Wijzigingsverzoeken via `/public/wijziging-doorgeven.html` worden nu via `/.netlify/functions/submit-change-request` opgeslagen in Supabase en naar Max Web Studio gemaild.
- Uploads voor wijzigingsverzoeken worden in deze stap nog niet als bestanden meegestuurd; alleen gekozen bestandsnamen gaan mee in de e-mail.
- Supabase schema-instructies staan in `/docs/supabase-change-requests.sql`.
