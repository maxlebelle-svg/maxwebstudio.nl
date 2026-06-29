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
- `/docs/supabase-invoice-storage.sql`
- `/docs/supabase-mollie-payments.sql`
- `/docs/supabase-mollie-subscriptions.sql`
- `/docs/supabase-mollie-subscriptions-sync.sql`

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

Factuur-PDF's worden geopend via `/.netlify/functions/invoice-download`. De frontend stuurt de Supabase Auth access token mee als bearer token. De function controleert de JWT via Supabase Auth, controleert server-side of `customer_invoices.customer_auth_user_id` overeenkomt met de ingelogde gebruiker en maakt daarna pas een tijdelijke signed URL voor de private bucket `invoice-pdfs`.

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

Admin beheert factuur-PDF paden via `/.netlify/functions/admin-billing`. Het veld `pdf_file_path` hoort alleen een private Supabase Storage objectpad te bevatten, geen publieke URL. Uploads naar de bucket gebeuren voorlopig handmatig of later via een aparte server-side uploadfunctie.

Admin maakt losse Mollie betaalverzoeken voor facturen via `/.netlify/functions/admin-mollie-payment`. Deze function vereist `ADMIN_TOKEN` en gebruikt `MOLLIE_API_KEY`, `SITE_URL`, `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` alleen server-side. Klanten zien alleen de opgeslagen checkout URL van hun eigen factuur via RLS en kunnen geen payment aanmaken.

`/.netlify/functions/mollie-webhook` ontvangt Mollie statusupdates, haalt de payment status server-side op met `MOLLIE_API_KEY` en werkt alleen een factuur bij wanneer `customer_invoices.mollie_payment_id` overeenkomt.

De stabiele factuurstatussen zijn `draft`, `sent`, `paid`, `expired`, `canceled` en `failed`. De adminfunctie hergebruikt een bestaande actieve checkoutlink wanneer `mollie_checkout_url` en `mollie_payment_id` al aanwezig zijn en de Mollie-status nog niet terminal is.

Factuur-e-mails lopen via `/.netlify/functions/admin-invoice-email` en vereisen `ADMIN_TOKEN`. De function gebruikt `SUPABASE_SERVICE_ROLE_KEY` en `RESEND_API_KEY` alleen server-side. Klanten kunnen geen e-mails triggeren. De Mollie webhook mag na een `paid` status server-side een betaalbevestiging sturen, maar mag de betaalstatus-update niet laten falen als e-mailconfiguratie ontbreekt.

Mollie onderhoudsabonnementen worden geactiveerd via `/.netlify/functions/admin-mollie-subscription`. Deze function vereist `ADMIN_TOKEN` en gebruikt `MOLLIE_API_KEY` plus `SUPABASE_SERVICE_ROLE_KEY` alleen server-side. Klanten kunnen geen Mollie Customer of Subscription aanmaken, pauzeren, hervatten of opzeggen. Het klantportaal leest alleen eigen subscriptiondata via RLS.

Als een klant nog geen geldige mandate heeft, maakt de adminfunction server-side een Mollie betaling met `sequenceType: first`. De klant mag alleen de opgeslagen `mandate_checkout_url` openen via het klantportaal. `/.netlify/functions/mollie-webhook` verwerkt de eerste betaling server-side, maakt daarna de subscription aan en synchroniseert subscriptiondata. Klanten krijgen geen mutatierechten.

Nieuwe CRM-klanten worden gekoppeld aan een Supabase Auth-user wanneer het ingevoerde e-mailadres al bestaat in Supabase Auth. Als er nog geen Auth-user bestaat, kan de admin eerst een uitnodiging versturen vanuit het CRM en daarna het profiel opslaan zodra Supabase de gebruiker beschikbaar maakt.

## Fase 6.3 - Subscription Beheer

Klanten gebruiken nog steeds alleen de Supabase Auth sessie en anon key in de browser. Het klantportaal mag abonnementen uitsluitend lezen via RLS.

Abonnementen pauzeren, hervatten, opzeggen en synchroniseren zijn adminacties. Deze lopen via `/.netlify/functions/admin-mollie-subscription-action` met `ADMIN_TOKEN` en service role server-side.

Er zijn geen klant-selfservice acties voor abonnementbeheer in deze fase.

## Fase 6.4 - Retrydata

Retrydata voor mislukte incasso's staat op `public.customer_subscriptions` en wordt door klanten alleen gelezen via RLS.

Admin retry-acties lopen via `/.netlify/functions/admin-subscription-retry` met `ADMIN_TOKEN` en service role server-side.

Klanten kunnen geen retry-status wijzigen, geen retry-mail triggeren en geen technische Mollie foutdata muteren.

## Beperkingen

- Er is nog geen self-service registratie.
- Profielen moeten voorlopig door Max Web Studio via het admin-dashboard worden aangemaakt of bijgewerkt.
- Bestaande wijzigingsverzoeken zonder overeenkomend e-mailadres moeten nog handmatig of via migratie aan `auth_user_id` gekoppeld worden.
- Er is nog geen audit trail voor klantacties.
## Fase 12.5 - Offertes

Offertebeheer in het Admin CRM gebruikt in deze fase nog geen nieuwe auth-flow. De Supabase-voorbereiding voor `quotes` en `quote_lines` blijft achter de bestaande adminomgeving en Developer Mode.

Klanttoegang tot live offertes wordt pas hard gemaakt wanneer Supabase Auth, route guards en RLS voor het klantportaal volledig actief zijn.

## Fase 12.6 - Facturen

Factuurbeheer in het Admin CRM gebruikt in deze fase nog geen nieuwe auth-flow. De Supabase-voorbereiding voor `invoices` en `invoice_lines` blijft achter de bestaande adminomgeving en Developer Mode.

Klanttoegang tot live facturen wordt pas hard gemaakt wanneer Supabase Auth, route guards en RLS voor het klantportaal volledig actief zijn.

De bestaande demo-betaalpagina blijft werken op localStorage-data. Live factuurdata uit Supabase mag later pas klantzichtbaar worden wanneer de ingelogde gebruiker via RLS alleen eigen facturen en factuurregels kan lezen.

## Fase 12.7 - Abonnementen

Abonnementbeheer in het Admin CRM gebruikt in deze fase nog geen nieuwe auth-flow. De Supabase-voorbereiding voor `subscriptions` blijft achter de bestaande adminomgeving en Developer Mode.

Klanttoegang tot live abonnementen wordt pas hard gemaakt wanneer Supabase Auth, route guards en RLS voor het klantportaal volledig actief zijn.

De bestaande demo-klantportaalweergave blijft werken op localStorage-data. Live subscriptiondata uit Supabase mag later pas klantzichtbaar worden wanneer de ingelogde gebruiker via RLS alleen eigen abonnementen kan lezen.

## Fase 12.8 - Klantportaal read zonder harde auth

Het klantportaal kan nu data lezen via `demo`, `local`, `supabase-read` en `hybrid`, maar dit is nog geen vervanging voor echte productie-auth.

Status:

- demo/local toegang via link blijft actief
- Supabase/hybrid read is voorbereid voor gemigreerde klantdata
- links bevatten alleen klant-ID's en geen tokens
- writes blijven geblokkeerd
- klantportaaldata wordt gesanitized voordat deze zichtbaar wordt
- harde Supabase Auth route guards, rollen en RLS-audit volgen in Fase 13

Tot Fase 13 mag het klantportaal niet als volledig beveiligde productie-login worden behandeld.

## Fase 12.9 - SQL audit voor Auth/RLS

Voor Fase 13 is een SQL audit uitgevoerd en gedocumenteerd in:

- `/docs/SUPABASE_SQL_AUDIT.md`
- `/docs/SUPABASE_EXECUTION_PLAN.md`
- `/docs/SUPABASE_SQL_INDEX.md`

Conclusie voor Auth:

- `supabase/rls-policies.sql` bevat conceptrollen en policies, maar is nog niet productie-hard.
- `profiles` moet primair de Auth/role-brug blijven.
- klantdata hoort in `customers`, niet verspreid over een tweede `profiles`-semantiek.
- Fase 13 start pas na review van de SQL audit.

## Fase 13.0 - Database consolidation voor Auth

Auth/RLS wordt pas hardgemaakt nadat de database op één canonical lijn is bevestigd:

## Fase 13.1 - Profiles foundation

De Auth/Profile foundation is voorbereid op de canonical lijn:

- `profiles` is de rollen- en Supabase Auth-brug.
- `customers` blijft de centrale klantbron.
- demo-login blijft actief en gebruikt lokale browserdata.
- accountaanvragen uit `maxwebstudioAccountRequests` kunnen lokaal naar profile-concepts worden voorbereid.
- profile-concepts worden opgeslagen in `maxwebstudioProfiles`.
- een profile kan alvast gekoppeld worden aan een lokale `customerId` en toekomstige `supabaseCustomerId`.
- permissions geven voorrang aan de huidige profile-rol wanneer er een profile aan de sessie gekoppeld is.
- route guards geven alleen readiness/uitleg; er wordt nog niet hard geblokkeerd.

Status:

- Profiles canonical model: gereed.
- Profile repository: voorbereid.
- Auth user naar profile mapping: voorbereid.
- Account request naar profile: voorbereid.
- Customer/profile link: voorbereid.
- Supabase Auth live: nog niet actief.
- Hard route guards: Fase 13.2.
- RLS hardening: Fase 13.2/13.3.

Niet gewijzigd:

- Er is geen echte Supabase uitnodiging verstuurd.
- Er is geen hard route-blocking geactiveerd.
- Er is geen service role key in de frontend geplaatst.
- Legacy `customer_*` tabellen zijn niet opnieuw gebruikt voor nieuwe auth.

## Fase 13.2 - Route Guards & Access Control

Access control is nu production-ready voorbereid met drie modes:

- `preview`: alleen uitleg/waarschuwingen, geen blokkade.
- `soft`: standaardmodus; waarschuwingen, role-based navigation en veilige action guards, zonder demo-flow hard te breken.
- `hard`: voorbereid voor testscenario's; kan beschermde routes redirecten/blokkeren wanneer expliciet gekozen.

Beschermde routes staan centraal in:

- `/public/src/config/protectedRoutes.js`

Belangrijkste routes:

- `admin-dashboard`: admin/super_admin/developer/sales/support met acties per rol beperkt.
- `klantportaal`: customer/admin/super_admin/demo_user met customer access guard.
- `demo-klantreis`: demo/admin/super_admin/developer/sales.
- `login`: publiek.
- `offerte` en `betalen`: publiek/demo-safe zolang de lokale demo-flow nodig is.

Het admin-dashboard toont de huidige sessie/profile/rol, access mode en waarschuwingen. Developer Mode heeft een Access Control readiness kaart en self-tests.

Customer access:

- Demo-links blijven bereikbaar.
- Zonder sessie blijft lokale demo-toegang mogelijk.
- Als een ingelogde customer/profile duidelijk bij een andere klant hoort, toont het klantportaal geen data van die andere klant.
- In hard mode kan later worden geblokkeerd/geredirect.

RLS blijft voor Fase 13.3:

- Route guards beschermen de browserervaring.
- RLS moet daarna de databasegrens definitief hard maken.

- `profiles` = Auth/rollen/profielbasis
- `customers` = zakelijke klantbron
- `websites`, `projects`, `quotes`, `invoices`, `subscriptions` = klantmodules

Legacy `customer_websites`, `customer_invoices` en `customer_subscriptions` worden niet de basis voor nieuwe Auth/RLS policies. Bestaande historische documentatie over deze tabellen blijft context, maar nieuwe productiebeveiliging moet op de canonical tabellen worden ontworpen.

## Fase 13.3 - RLS Policy Hardening & Security Audit

Auth/RLS is verder uitgewerkt als ontwerp, zonder live SQL uit te voeren.

Nieuwe documenten:

- `/docs/RLS_POLICY_MATRIX.md`
- `/docs/AUTH_CLAIMS_STRATEGY.md`
- `/docs/supabase-rls-canonical-draft.sql`
- `/docs/SECURITY_RISK_AUDIT.md`

Strategie:

- `profiles` blijft de brug tussen Supabase Auth, rollen en omgeving.
- `customers.auth_user_id` en `customers.profile_id` bepalen klantownership.
- Child-tabellen erven toegang via `customer_id`, `quote_id` of `invoice_id`.
- Demo-toegang blijft gescheiden via `is_demo` en `environment = 'demo'`.
- Custom JWT-claims zijn bewust nog niet de eerste stap; tabelgebaseerde checks via `profiles` zijn beter controleerbaar.

Status:

- RLS policy matrix: gereed.
- Auth claims strategy: gereed.
- RLS SQL draft: voorbereid.
- RLS live execution: geblokkeerd tot review.
- Frontend route guards: soft actief.
- Database-level security: voorbereid, nog niet live.
