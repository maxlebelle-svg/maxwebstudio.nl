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
- `public.change_requests.auth_user_id`

SQL staat in:

- `/docs/supabase-client-portal.sql`

Wanneer een ingelogde klant een wijziging indient via `/public/wijziging-doorgeven.html`, stuurt de frontend de Supabase access token mee. `submit-change-request.js` valideert die token server-side en vult `auth_user_id` op het nieuwe wijzigingsverzoek.

## RLS

Klanten mogen alleen hun eigen gegevens lezen:

- `profiles.auth_user_id = auth.uid()`
- `change_requests.auth_user_id = auth.uid()`

Admin- en automationflows blijven via server-side service role lopen.

## Dashboard Data

`/public/client-dashboard.html` leest na login:

- profieldata uit `profiles`
- maximaal 5 recente wijzigingsverzoeken uit `change_requests`

De frontend gebruikt alleen de Supabase anon key en vertrouwt op RLS. Klanten kunnen geen status wijzigen en zien geen interne classificatie.

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
- bedrijfsnaam, website en onderhoudspakket beheren
- bestaande wijzigingsverzoeken op exact e-mailadres aan `auth_user_id` koppelen

Na opslaan leest het klantenportaal de nieuwe profielgegevens direct via de bestaande Supabase Auth-sessie en RLS.

## Beperkingen

- Er is nog geen self-service registratie.
- Profielen moeten voorlopig door Max Web Studio via het admin-dashboard worden aangemaakt of bijgewerkt.
- Bestaande wijzigingsverzoeken zonder overeenkomend e-mailadres moeten nog handmatig of via migratie aan `auth_user_id` gekoppeld worden.
- Er is nog geen audit trail voor klantacties.
