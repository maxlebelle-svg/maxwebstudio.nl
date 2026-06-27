# Auth

Dit document beschrijft de authenticatiebasis voor het Max Web Studio klantenportaal.

## Huidige Implementatie

- `/public/login.html`: loginpagina met Supabase Auth.
- `/public/client-dashboard.html`: afgeschermd klantdashboard.
- `/.netlify/functions/client-auth-config`: geeft alleen publieke Supabase browserconfig terug.

## Supabase Auth

De frontend gebruikt Supabase Auth met:

- e-mail
- wachtwoord
- wachtwoord-reset via Supabase

Na succesvol inloggen gaat de gebruiker naar:

- `/client-dashboard.html`

Niet ingelogde bezoekers van het dashboard worden teruggestuurd naar:

- `/login.html`

## Environment Variables

Netlify heeft nodig:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

De anon key is bedoeld voor browsergebruik en werkt samen met RLS.

Nooit in frontend gebruiken:

- `SUPABASE_SERVICE_ROLE_KEY`

Die blijft alleen server-side beschikbaar voor Netlify Functions.

## Database

Het portaal gebruikt:

- `public.profiles`
- `public.customer_websites`
- `public.customer_subscriptions`
- `public.customer_invoices`
- `public.change_requests.auth_user_id`

SQL staat in:

- `/docs/supabase-client-portal.sql`
- `/docs/supabase-billing.sql`

Wanneer een ingelogde klant een wijziging indient via `/public/wijziging-doorgeven.html`, stuurt de frontend de Supabase access token mee. `submit-change-request.js` valideert die token server-side en vult `auth_user_id` op het nieuwe wijzigingsverzoek.

## RLS

Klanten mogen alleen hun eigen gegevens lezen:

- `profiles.auth_user_id = auth.uid()`
- `customer_websites.customer_auth_user_id = auth.uid()`
- `customer_subscriptions.customer_auth_user_id = auth.uid()`
- `customer_invoices.customer_auth_user_id = auth.uid()`
- `change_requests.auth_user_id = auth.uid()`

Admin- en automationflows blijven via server-side service role lopen.

## Dashboard Data

`/public/client-dashboard.html` leest na login:

- profieldata uit `profiles`
- wijzigingsverzoeken uit `change_requests`
- maximaal 5 recente wijzigingsverzoeken in de tabel
- eigen websiteomgevingen uit `customer_websites`
- eigen abonnementen uit `customer_subscriptions`
- eigen facturen uit `customer_invoices`

De frontend gebruikt alleen de Supabase anon key en vertrouwt op RLS. Klanten kunnen geen status wijzigen en zien geen interne classificatie.

Bestanden bij eigen wijzigingsverzoeken worden geopend via `/.netlify/functions/client-change-request-file`. De frontend stuurt de Supabase Auth access token mee als bearer token. De function controleert de JWT via Supabase Auth, controleert server-side of `change_requests.auth_user_id` overeenkomt met de ingelogde gebruiker en maakt daarna pas een tijdelijke Supabase Storage signed URL.

## Admin Profielbeheer

`/public/admin-dashboard.html` bevat een interne beheerfunctie voor klantprofielen.

De beheerfunctie gebruikt:

- `/.netlify/functions/admin-client-profiles`
- `ADMIN_TOKEN` als bearer token vanuit het dashboard
- `SUPABASE_SERVICE_ROLE_KEY` alleen server-side in de Netlify Function

De adminfunctie kan:

- Supabase Auth-users ophalen
- bestaande klantkandidaten uit `change_requests` tonen
- `profiles` aanmaken of bijwerken
- naam, e-mail, telefoon, bedrijfsnaam, website, onderhoudspakket, klant-sinds en status beheren
- klantstatussen beheren: `actief`, `onboarding`, `pauze`, `gearchiveerd`
- bestaande wijzigingsverzoeken op exact e-mailadres aan `auth_user_id` koppelen
- controleren of een Auth-user op e-mailadres bestaat
- een bestaande Auth-user koppelen via de knop `Login koppelen`
- een Supabase Auth-uitnodiging versturen
- een Supabase Auth-wachtwoord reset versturen
- admin-only notities opslaan in `public.admin_customer_notes`
- websiteomgevingen beheren in `public.customer_websites`
- website healthdata beheren via `/.netlify/functions/admin-website-health`
- abonnementen en facturen beheren via `/.netlify/functions/admin-billing`

Na opslaan leest het klantenportaal de nieuwe profielgegevens direct via de bestaande Supabase Auth-sessie en RLS.

Websiteomgevingen die via het admin-dashboard aan een profiel worden gekoppeld, krijgen ook `customer_auth_user_id`. Daardoor kan de klant de eigen websitegegevens direct lezen via RLS zonder service role key in de browser.

Healthdata blijft onderdeel van `customer_websites`. Admin-mutaties lopen via `ADMIN_TOKEN` en service role server-side. Klanten lezen alleen hun eigen website- en healthstatus via RLS en krijgen geen admincontrols.

Abonnementen en facturen staan in `public.customer_subscriptions` en `public.customer_invoices`. Admin-mutaties lopen via `ADMIN_TOKEN` en service role server-side. Klanten lezen alleen eigen billingdata via RLS en krijgen geen adminacties.

Nieuwe CRM-klanten worden gekoppeld aan een Supabase Auth-user wanneer het ingevoerde e-mailadres al bestaat in Supabase Auth. Als er nog geen Auth-user bestaat, kan de admin eerst een uitnodiging versturen vanuit het CRM en daarna het profiel opslaan zodra Supabase de gebruiker beschikbaar maakt.

## Beperkingen

- Er is nog geen self-service registratie.
- Profielen moeten voorlopig door Max Web Studio via het admin-dashboard worden aangemaakt of bijgewerkt.
- Bestaande wijzigingsverzoeken zonder overeenkomend e-mailadres moeten nog handmatig of via migratie aan `auth_user_id` gekoppeld worden.
- Er is nog geen audit trail voor klantacties.
