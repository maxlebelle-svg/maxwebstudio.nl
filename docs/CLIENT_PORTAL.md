# Client Portal

Dit document beschrijft de richting voor een toekomstig klantportaal. Er is momenteel nog geen volledig klantportaal gebouwd.

## Huidige Bouwstenen

- `/public/wijziging-doorgeven.html`: pagina waarmee bestaande klanten wijzigingsverzoeken kunnen doorgeven.
- `/public/bedankt-wijziging.html`: statische bedankpagina na een wijzigingsverzoek.
- `/public/admin-dashboard.html`: Admin Dashboard v1 als backoffice-preview. De sectie Wijzigingsverzoeken leest echte aanvragen uit Supabase via `/.netlify/functions/list-change-requests` en kan statussen bijwerken via `/.netlify/functions/update-change-request-status`.
- `/public/login.html`: Supabase Auth loginpagina voor klanten.
- `/public/client-dashboard.html`: afgeschermd klantdashboard met echte profieldata, websitegegevens en maximaal 5 recente wijzigingsverzoeken van de ingelogde klant.
- `/public/index.html`: publieke homepage met subtiele Klantportaal-links naar `/login.html` in header, footer en onderhoudssectie.

Admin CRM Fase 5.1 gebruikt `/public/admin-dashboard.html` als centrale backoffice. De pagina bevat sidebarmodules voor dashboard, klanten, websites, wijzigingsverzoeken, bestanden, onderhoud, facturen placeholder, AI placeholder en instellingen placeholder. Wijzigingsverzoeken zijn gekoppeld aan Supabase, kunnen in een detailmodal worden bekeken en kunnen handmatig van status worden gewijzigd.

Via `/.netlify/functions/admin-client-profiles` kan Max Web Studio klanten zoeken, aanmaken en bijwerken. De CRM-basis beheert naam, e-mail, telefoon, bedrijf, website, onderhoudspakket, status en klant-sinds datum. Deze beheeractie gebruikt `ADMIN_TOKEN` in de browser en `SUPABASE_SERVICE_ROLE_KEY` uitsluitend server-side. Nieuwe profielen worden opgeslagen in `public.profiles`; `created_at` fungeert als klant-sinds datum. Nieuwe klanten kunnen direct gekoppeld worden wanneer het e-mailadres al bestaat als Supabase Auth-user.

Wijzigingsverzoeken worden via `/.netlify/functions/submit-change-request` verwerkt, opgeslagen in Supabase en per e-mail naar Max Web Studio gestuurd. De function valideert verplichte velden, ondersteunt een honeypot en maakt een eerste interne classificatie: waarschijnlijk binnen onderhoud, waarschijnlijk offerte nodig of handmatig beoordelen.

Als een klant is ingelogd via Supabase Auth, stuurt `/public/wijziging-doorgeven.html` de access token mee naar de submit-function. De function koppelt het verzoek dan aan `change_requests.auth_user_id`, zodat het zichtbaar wordt in `/public/client-dashboard.html`.

Bestandsuploads voor wijzigingsverzoeken worden server-side opgeslagen in Supabase Storage bucket `change-request-files`. De frontend stuurt bestanden via multipart form-data naar de Netlify Function; de service role key blijft server-side. De toegestane types zijn JPG, PNG, PDF en DOCX, met maximaal 5 bestanden en maximaal 10 MB per bestand.

De Supabase tabel heet `change_requests`. Het SQL-schema staat in `/docs/supabase-change-requests.sql`. Deze tabel is de eerste duurzame databron voor het toekomstige admin dashboard en klantportaal.

De dashboardfunctions gebruiken server-side environment variables `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY`. Bestanden worden in het admin-dashboard geopend via `/.netlify/functions/get-change-request-file`, die eerst controleert of het bestand bij het wijzigingsverzoek hoort en daarna een tijdelijke signed URL maakt. De service role key mag nooit in frontendcode worden geplaatst.

Het klantenportaal gebruikt Supabase Auth met `SUPABASE_ANON_KEY` in de browser. Deze key is publiek bedoeld en moet altijd samen met RLS worden gebruikt. De publieke config wordt opgehaald via `/.netlify/functions/client-auth-config`.

Portaaldata:

- `profiles`: klantprofiel gekoppeld aan `auth.users`
- `customer_websites`: websiteomgevingen gekoppeld aan klantprofielen en Auth-users
- `change_requests.auth_user_id`: koppeling tussen klant en wijzigingsverzoeken

CRM-profielvelden:

- `name`
- `email`
- `phone`
- `company`
- `website`
- `package`
- `status`

RLS zorgt dat klanten alleen hun eigen profiel en eigen wijzigingsverzoeken kunnen lezen. De SQL staat in `/docs/supabase-client-portal.sql`.

Het klantdashboard toont:

- naam
- bedrijf
- websitegegevens uit `customer_websites` wanneer beschikbaar, anders fallback op `profiles.website`
- onderhoudspakket
- klant sinds
- eigen wijzigingsverzoeken met titel, status, categorie en datum
- detailmodal met titel, omschrijving, status, categorie, prioriteit, datum, bestandsdownloads en status-tijdlijn

Het klantdashboard toont geen interne classificatie en bevat geen statusbeheer.

Bestanden in het klantdashboard worden niet rechtstreeks uit Supabase Storage gelinkt. De frontend vraagt met de Supabase Auth access token een tijdelijke link op via `/.netlify/functions/client-change-request-file`. Deze function valideert de klant-JWT, controleert dat het wijzigingsverzoek bij dezelfde `auth_user_id` hoort en maakt daarna pas een signed URL.

De klantvriendelijke status-tijdlijn gebruikt de bestaande `change_requests.status` waarde:

- Nieuw
- In behandeling
- Wachten op klant
- Afgerond

Wanneer een profiel via het admin-dashboard wordt opgeslagen, worden bestaande wijzigingsverzoeken met hetzelfde e-mailadres gekoppeld aan `change_requests.auth_user_id` als ze nog niet gekoppeld waren. Daardoor ziet de klant na login direct de bijbehorende wijzigingsverzoeken via RLS.

## Admin CRM Beheer

Het admin-dashboard is de centrale plek voor klantbeheer. Max Web Studio kan daar:

- klanten aanmaken en bewerken
- klantstatus beheren: `actief`, `onboarding`, `pauze`, `gearchiveerd`
- telefoon, e-mail, bedrijf, website, onderhoudspakket en klant-sinds beheren
- klanten archiveren met bevestiging
- Supabase Auth-status controleren
- een bestaande Supabase Auth-user koppelen op e-mailadres
- een wachtwoord-reset versturen
- een uitnodiging versturen via Supabase Auth

Admin-only notities worden opgeslagen in `public.admin_customer_notes`. Deze staan niet in de klantleesbare `profiles`-data en mogen niet in het klantdashboard worden getoond.

## Website Operations Center

Admin CRM Fase 5.3 maakt de module Websites operationeel. Max Web Studio kan per klant websiteomgevingen beheren met:

- websitetitel
- domein
- live URL
- staging URL
- GitHub repo en branch
- Netlify projectnaam en site ID
- websitestatus
- hostingstatus
- SSL-status
- laatste deploy
- laatste check
- interne notities

Klanten lezen alleen eigen websiteomgevingen via RLS op `customer_websites.customer_auth_user_id = auth.uid()`. Het klantdashboard bevat geen adminacties en toont geen service role data.

## Website Health Monitoring

Admin CRM Fase 5.4 voegt een professioneel health-overzicht toe binnen de module Websites. De beheerder ziet per website:

- online/offline/unknown
- SSL-status en vervaldatum
- DNS-status
- performance-, SEO-, mobile- en desktopscore
- hostingstatus
- laatste deploy
- laatste uptime-check
- monitoring aan/uit

De Netlify Function `/.netlify/functions/admin-website-health` vereist `ADMIN_TOKEN` en gebruikt `SUPABASE_SERVICE_ROLE_KEY` alleen server-side. De huidige controles zijn mock/placeholder checks als basis voor latere Netlify, GitHub, PageSpeed, SSL, DNS en uptime-integraties.

Het klantdashboard toont alleen klantvriendelijke healthinformatie: website online, SSL actief en laatste controle. Klanten krijgen geen health-controls of adminacties.

## Doel

Een klantportaal moet Max Web Studio schaalbaar maken door klanten, betalingen, intake, projectstatus en onderhoud op een centrale plek te beheren.

## Mogelijke Functionaliteiten

Voor klanten:

- projectstatus bekijken
- intake aanvullen
- bestanden uploaden
- facturen en betalingen bekijken
- supportverzoeken indienen
- onderhoudspakket bekijken
- wijzigingsverzoeken indienen

Voor Max:

- klantoverzicht
- projectoverzicht
- betaalstatus
- intakegegevens
- upsells en offerte-uitbreidingen
- taken en deadlines
- onderhoudsplanning
- supportbeheer

## Mogelijke Fases

### Fase 1 - Admin Overzicht

- betaalrecords tonen
- intakes tonen
- status handmatig beheren
- eenvoudige beveiliging

### Fase 2 - Klant Login

- klant kan eigen project bekijken
- intake en bestanden beheren
- basisnotificaties

Status: eerste versie actief met login en dashboard. Intake, bestanden beheren vanuit klantzijde en notificaties volgen later.

### Fase 3 - Automatisering

- automatisch project aanmaken na betaling
- automatische reminders
- restbetaling genereren
- onderhoudsabonnement activeren

## Technische Keuzes

Nog niet gekozen.

Mogelijke opties:

- Supabase
- Netlify Blobs plus eenvoudige auth
- custom Node backend
- externe CRM/tooling

Geen portaal bouwen zonder aparte technische planning en akkoord.

## Security Eisen

Een klantportaal vereist:

- veilige authenticatie
- autorisatie per klant
- duurzame opslag
- audit trail
- bescherming van uploads
- rate limiting
- duidelijke privacy-afspraken

## Relatie Met Huidige Site

Huidige aanknopingspunten:

- Mollie payment ID
- onboarding intake
- admin-intakes endpoint
- Resend e-mailbevestiging
- onderhoudspakketten

Deze moeten eerst betrouwbaarder gekoppeld worden voordat een klantportaal logisch is.
