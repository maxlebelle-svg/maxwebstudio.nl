# Client Portal

Actuele v1-richting:

- Het veilige implementatieplan voor het echte klantportaal staat in `docs/CLIENT_PORTAL_V1_IMPLEMENTATION_PLAN.md`.
- Voor Klantportaal v1 is `public/login.html` + `public/klantportaal.html` de leidende route.
- `public/client-dashboard.html` blijft voorlopig alleen een legacy/auth prototype en technische referentie.
- Nieuwe klantportaalontwikkeling gebruikt de canonical tabellen `profiles`, `customers`, `websites`, `projects`, `quotes`, `invoices`, `subscriptions`, `files`, `change_requests`, `client_portal_messages` en `client_portal_notifications`.
- Legacy tabellen zoals `customer_websites`, `customer_invoices` en `customer_subscriptions` mogen niet opnieuw leidend worden voor nieuwe productiefeatures.
- Echte Supabase Auth, hard route guards en productie-portalactivatie volgen pas na staging Auth-validatie, RLS/customer-isolation evidence en release approval.

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

## Facturatie & Abonnementen

Fase 5.5 voegt een basis toe voor onderhoudsabonnementen en facturen.

Admin CRM:

- module Onderhoud toont abonnementen uit `public.customer_subscriptions`
- module Facturen toont facturen uit `public.customer_invoices`
- adminacties lopen via `/.netlify/functions/admin-billing`
- `ADMIN_TOKEN` is verplicht
- `SUPABASE_SERVICE_ROLE_KEY` blijft alleen server-side

Klantportaal:

- toont huidig onderhoudspakket
- toont maandbedrag, abonnementsstatus en volgende factuurdatum
- toont maximaal 5 laatste facturen
- toont factuurstatus
- toont alleen een downloadknop wanneer `pdf_file_path` gevuld is
- downloadt facturen via `/.netlify/functions/invoice-download`
- gebruikt alleen de bestaande Supabase Auth-sessie en anon key

De benodigde SQL staat in `/docs/supabase-billing.sql`. Klanten mogen via RLS alleen eigen abonnementen en facturen lezen op basis van `customer_auth_user_id = auth.uid()`.

Fase 5.6 voegt private factuur-PDF opslag toe:

- bucket: `invoice-pdfs`
- bucket is private
- SQL en storage-instructies staan in `/docs/supabase-invoice-storage.sql`
- admin uploadt PDF's voorlopig handmatig naar Supabase Storage
- admin vult in de factuur alleen het objectpad in, bijvoorbeeld `2026/klant/factuur-2026-001.pdf`
- klanten krijgen geen directe buckettoegang en kunnen niet vrij door facturen bladeren
- de downloadknop vraagt server-side een signed URL op via `/.netlify/functions/invoice-download`

Fase 5.7 voegt Mollie betaalverzoeken voor losse facturen toe:

- admin maakt een betaalverzoek aan via `/.netlify/functions/admin-mollie-payment`
- de function vereist `ADMIN_TOKEN`
- Mollie API key blijft server-side in `MOLLIE_API_KEY`
- checkout URL en Mollie payment id worden opgeslagen op `customer_invoices`
- `/.netlify/functions/mollie-webhook` haalt de status server-side op bij Mollie en werkt de factuur bij
- het klantportaal toont een knop `Betaal factuur` wanneer de factuur een actieve checkout URL heeft
- klanten kunnen geen Mollie payment aanmaken

Fase 5.8 stabiliseert de billingflow:

- factuurstatussen zijn genormaliseerd naar `draft`, `sent`, `paid`, `expired`, `canceled` en `failed`
- Mollie-statussen blijven `open`, `pending`, `paid`, `failed`, `expired` en `canceled`
- bestaande actieve checkoutlinks worden hergebruikt
- het klantportaal verbergt `Betaal factuur` zodra de factuur betaald, verlopen, geannuleerd of mislukt is
- het end-to-end testplan staat in `/docs/BILLING_TEST_PLAN.md`

Fase 5.9 voegt factuur-e-mailnotificaties toe:

- admin verstuurt factuurmail, betalingsherinnering, betaalbevestiging en verlopenmelding via `/.netlify/functions/admin-invoice-email`
- e-mailtracking staat op `customer_invoices` via `/docs/supabase-invoice-emails.sql`
- de Mollie webhook probeert automatisch een betaalbevestiging te sturen wanneer een factuur `paid` wordt
- e-mails gebruiken Resend via `RESEND_API_KEY`, `FROM_EMAIL`, `ADMIN_EMAIL` en `SITE_URL`
- factuur-PDF's worden niet publiek gelinkt in e-mails; e-mails verwijzen naar het klantportaal
- het klantportaal toont een korte melding dat betaalbevestigingen per e-mail worden verzonden

Fase 6.1 voegt Mollie Customers en onderhoudsabonnementen als basis toe:

- admin activeert een Mollie subscription via `/.netlify/functions/admin-mollie-subscription`
- de function maakt indien nodig eerst een Mollie Customer aan
- subscription metadata staat op `customer_subscriptions`
- SQL staat in `/docs/supabase-mollie-subscriptions.sql`
- architectuur en testmodus staan in `/docs/MOLLIE_SUBSCRIPTIONS.md`
- het klantportaal toont status, bedrag en volgende incasso, maar bevat geen beheeracties

Fase 6.2 maakt de subscriptionflow werkend met mandates:

- wanneer nog geen geldige mandate bestaat, maakt admin een eerste Mollie betaling met `sequenceType: first`
- de mandate checkout URL wordt opgeslagen op `customer_subscriptions.mandate_checkout_url`
- het klantportaal toont `Voltooi machtiging` zolang de mandate nog niet geldig is
- na succesvolle eerste betaling maakt de webhook automatisch de Mollie subscription aan
- de webhook synchroniseert subscriptionstatus, mandate status, laatste betaling, volgende incasso en laatste webhook-event
- extra SQL staat in `/docs/supabase-mollie-subscriptions-sync.sql`

Nog niet gebouwd in deze fase:

- automatische retries
- pauzeren, hervatten en opzeggen
- PDF-generatie
- server-side PDF-upload vanuit het admin-dashboard

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

## Fase 6.3 - Abonnementsstatus Klantportaal

Het klantportaal leest onderhoudsabonnementen uit `public.customer_subscriptions` via Supabase RLS en toont alleen klantvriendelijke informatie.

Zichtbaar voor de klant:

- huidig onderhoudspakket
- maandbedrag
- status abonnement
- volgende incasso
- opzegdatum indien beschikbaar
- knop `Voltooi machtiging` wanneer een mandate checkout URL openstaat

Statussen worden klantvriendelijk vertaald:

- `active` -> Actief
- `paused` / `suspended` -> Gepauzeerd
- `canceled` / `cancelled` -> Opgezegd
- open mandate checkout -> Wacht op machtiging

Klanten kunnen in deze fase geen abonnement pauzeren, hervatten of opzeggen. Alle beheeracties lopen via het Admin CRM en server-side Netlify Functions.

## Fase 6.4 - Betaalprobleemmelding

Als een abonnement een open retryprobleem heeft, toont het klantportaal een korte klantvriendelijke melding:

- er is een probleem met de automatische betaling
- controleer de betaalmethode of rond de machtiging opnieuw af
- technische Mollie foutcodes worden niet getoond

Als `mandate_checkout_url` beschikbaar is en de mandate nog niet geldig is, blijft de knop `Voltooi machtiging` zichtbaar.

Klanten kunnen retry-statussen niet aanpassen en kunnen geen retry-mails triggeren.

## Fase 12.5 - Offertes en klantportaal

Offertes blijven zichtbaar via de bestaande demo/offerteflow. De productiebasis wordt voorbereid met `quotes` en `quote_lines`, zodat klantoffertes later veilig uit Supabase gelezen kunnen worden.

Belangrijk:

- lokale demo-offertes blijven werken
- offerte-naar-factuur conversie blijft lokaal/demo intact
- klantportaal toont nog geen nieuwe live Supabase-offertedata via Auth in deze fase
- klantveilige offerteweergave volgt pas na de live klantportaaldata- en Auth-fases

## Fase 12.6 - Facturen en klantportaal

Facturen blijven voor klanten zichtbaar via de bestaande demo-betaalflow en lokale klantportaalweergave. De productiebasis wordt voorbereid met `invoices` en `invoice_lines`, zodat klantfacturen later veilig uit Supabase gelezen kunnen worden.

Belangrijk:

- lokale demo-facturen en `/betalen.html?invoiceId=...` blijven werken
- offerte-naar-factuur conversie blijft lokaal/demo intact
- abonnement-naar-conceptfactuur flow blijft lokaal/demo intact
- klantportaal toont nog geen nieuwe live Supabase-factuurdata via Auth in deze fase
- klantveilige live factuurweergave volgt pas na de live klantportaaldata-, Auth- en RLS-fases
- factuurregels zijn al voorbereid als losse `invoice_lines`, zodat toekomstige klantportaalweergave duidelijke regels en totalen kan tonen

## Fase 12.7 - Abonnementen en klantportaal

Onderhoudsabonnementen blijven voor klanten zichtbaar via de bestaande lokale/demo klantportaalweergave. De productiebasis wordt voorbereid met `subscriptions`, zodat klantabonnementen later veilig uit Supabase gelezen kunnen worden.

Belangrijk:

- lokale demo-abonnementen en recurring billing blijven werken
- MRR/ARR-berekeningen blijven beschikbaar in het Admin CRM
- abonnement-naar-conceptfactuur flow blijft lokaal/demo intact, en wordt voor Supabase-managed abonnementen bewust geblokkeerd wanneer invoice data mode nog `local` is
- klantportaal toont nog geen nieuwe live Supabase-abonnementdata via Auth in deze fase
- klantveilige live abonnementweergave volgt pas na de live klantportaaldata-, Auth- en RLS-fases
- abonnementen zijn al voorbereid met koppelingen naar customer, website, project en laatste factuur

## Fase 12.8 - Live data-readiness en hybrid fallback

Het demo-klantportaal op `/klantportaal.html?customerId=...` gebruikt nu een centrale data-service:

- `public/src/services/clientPortalDataService.js`
- `public/src/services/clientPortalTestService.js`

Ondersteunde modi:

- `demo`
- `local`
- `supabase-read`
- `hybrid`

De instelling kan worden opgeslagen in `maxwebstudioClientPortalSettings`. Zonder expliciete instelling blijft het portaal veilig op local/demo fallback draaien.

Belangrijk gedrag:

- lokale demo-klantreis blijft werken zonder Supabase
- `customerId` blijft werken voor lokale/demo-klanten
- `supabaseCustomerId` wordt ondersteund voor gemigreerde klanten
- bij mismatch tussen lokale en Supabase klant-ID wordt geen andere klantdata getoond
- klantdata wordt eerst gesanitized voordat het portaal rendert
- interne admin-notities, metadata, migratielogs, debugdata, sessiedata en betaalproviderdetails worden niet getoond
- offertes en facturen ondersteunen toekomstige Supabase links via `supabaseQuoteId` en `supabaseInvoiceId`

Het portaal toont nu ook een subtiele bronbadge (`Demo`, `Local`, `Supabase`, `Hybrid`) en een klantvriendelijke melding over de gebruikte databron.

Nog niet live-hardgemaakt:

- echte Supabase Auth route guards
- volledige RLS-audit op klantportaalroutes
- klantportaal writes
- echte bestandsdownloads via klant-auth voor alle lokale file metadata

## Fase 12.9 - SQL audit impact op klantportaal

De SQL-audit bevestigt dat het klantportaal tijdelijk meerdere databronnen moet kunnen lezen, omdat er twee SQL-lijnen bestaan:

- nieuwe platformtabellen: `customers`, `websites`, `projects`, `quotes`, `invoices`, `subscriptions`
- oudere klantportaal/billingtabellen: `customer_websites`, `customer_invoices`, `customer_subscriptions`

Voor nieuwe productieontwikkeling is de aanbevolen richting de platformtabellen. Het klantportaal blijft daarom via de centrale data-service werken met `demo`, `local`, `supabase-read` en `hybrid`, totdat Fase 13 Auth/RLS definitief hardgemaakt is.

## Fase 13.0 - Klantportaal op canonical tabellen

De klantportaalrichting is geconsolideerd naar:

- `customers`
- `websites`
- `projects`
- `quotes`
- `invoices`
- `subscriptions`
- `files`

Legacy tabellen `customer_websites`, `customer_invoices` en `customer_subscriptions` blijven alleen historische context totdat data eventueel gemigreerd is. Het klantportaal mag voor nieuwe live data niet opnieuw afhankelijk worden van deze legacy-tabellen.

Auth/RLS-routeguards blijven geblokkeerd tot het consolidated plan en patch plan zijn gereviewd.
## Fase 13.1 - Profile-koppeling voorbereid

Het klantportaal blijft in deze fase demo/local/hybrid-read gebruiken. Er is nog geen harde loginverplichting.

Wel voorbereid:

- accountaanvragen kunnen naar `profiles` profile-concepts worden vertaald
- profiles kunnen aan lokale klanten en toekomstige Supabase customers worden gekoppeld
- session naar profile mapping is testbaar in Developer Mode
- route guard preview kan tonen welke rol straks toegang zou krijgen

Bewust niet gedaan:

- geen harde klantlogin
- geen blokkade op `/klantportaal.html?customerId=...`
- geen RLS-hardening
- geen klantmutaties vanuit het portaal

## Fase 13.2 - Customer access guard

Het klantportaal gebruikt nu `requireCustomerAccess(customerId, { allowDemo: true })`.

Gedrag:

- demo/local links blijven bruikbaar voor verkoop en testen
- zonder sessie blijft het demoportaal toegankelijk
- bij een duidelijke customer/profile mismatch wordt geen klantdata getoond
- de pagina toont dan een veilige empty state met uitleg
- hard blocking blijft voorbereid maar niet standaard actief

Dit is een browserlaag. Database-hardening via RLS blijft gepland voor Fase 13.3.

## Fase 13.3 - Klantportaal RLS readiness

De klantportaalbeveiliging is nu op database-niveau ontworpen, maar nog niet live uitgevoerd.

Belangrijk voor het klantportaal:

- Klanten mogen alleen eigen `customers` data lezen.
- `websites`, `projects`, `quotes`, `invoices`, `subscriptions` en `files` erven klanttoegang via `customer_id`.
- `change_requests` blijft gekoppeld via `auth_user_id` totdat deze later eventueel aan `customers.id` wordt gekoppeld.
- `quote_lines` en `invoice_lines` erven toegang via hun parent-record.
- Interne notities, activity logs, import logs, adminmetadata en technische debugvelden blijven buiten de klantpayload.
- Demo-klantportaaldata moet gescheiden blijven via `is_demo` en `environment = 'demo'`.

Nieuwe documenten:

- `/docs/RLS_POLICY_MATRIX.md`
- `/docs/AUTH_CLAIMS_STRATEGY.md`
- `/docs/SECURITY_RISK_AUDIT.md`
- `/docs/supabase-rls-canonical-draft.sql`

Status: klantportaal route guard is soft actief; database-level RLS is voorbereid maar nog niet live.

## Fase 13.4 - Klantportaal in RLS dry-run

Het klantportaal moet in het Supabase testproject expliciet worden getest met:

- Customer A ziet alleen Customer A.
- Customer B ziet alleen Customer B.
- Customer A ziet geen Customer B data.
- Demo-user ziet alleen demo-records.
- Anonymous ziet geen klantdata.
- Klantportaal mismatch toont geen data.

De testdocumenten staan in:

- `/docs/RLS_TEST_SCENARIOS.md`
- `/docs/RLS_TEST_DATA_PLAN.md`
- `/docs/RLS_EXPECTED_ACCESS_MATRIX.md`
- `/docs/RLS_TEST_LOG_TEMPLATE.md`

Totdat deze tests slagen blijft live klantportaal-RLS No-Go.

## Fase 13.5 - Klantportaal in deployment bundle

Het klantportaal is onderdeel van de production checklist:

- klant A/B isolatie
- demo-isolatie
- anonymous block
- offertes/facturen/abonnementen klantveilig zichtbaar
- storage downloads veilig via signed URLs

De deployment validator blijft `NO-GO` totdat klantisolatie en klantportaaltests handmatig zijn vastgelegd.

## Fase 13.6 - Klantportaal isolatieblocker

De blocker `customer_isolation_test_completed` borgt dat klantportaaldata pas live mag wanneer isolatie bewezen is.

Benodigde evidence:

- Customer A ziet alleen A
- Customer B ziet alleen B
- demo-user ziet alleen demo
- anonymous ziet geen klantdata
- klantportaal mismatch toont geen andere klantdata

De checklist staat in `/docs/deployment/CUSTOMER_ISOLATION_CHECKLIST.md`.

## Fase 14.1 - Klantportaal testomgeving

Het klantportaal is onderdeel van de test execution planning.

Te valideren:

- Customer A ziet alleen A
- Customer B ziet alleen B
- anonymous ziet geen klantdata
- demo-user krijgt geen productiedata
- offertes, facturen, projecten, websites, bestanden en abonnementen blijven klantveilig

Resultaten horen in `/docs/deployment/TEST_RESULTS.md`. De blocker `customer_isolation_test_completed` blijft open totdat deze tests echt zijn uitgevoerd.

## Fase 16 - Klantportaal afronden

Het demo/local klantportaal op `/klantportaal.html?customerId=...` is uitgebreid naar een completer klantdashboard.

Toegevoegd aan het portaal:

- extra KPI's voor wijzigingsverzoeken, berichten en notificaties
- notificatieblok met afgeleide updates uit open facturen, lopende projecten en open wijzigingsverzoeken
- wijzigingsverzoekenoverzicht
- berichtenblok
- projectvoortgang met progressbar en klantvriendelijke tijdlijn
- Supabase/data-readiness blok met databronnen per module

Nieuwe localStorage keys:

- `maxwebstudioChangeRequests`
- `maxwebstudioClientPortalMessages`
- `maxwebstudioClientPortalNotifications`

Belangrijk:

- Er zijn geen klantportaal-writes toegevoegd.
- Berichten en notificaties blijven local/demo of afgeleid uit bestaande klantdata.
- De service `clientPortalDataService` sanitizet klantportaaldata en toont geen interne notities.
- Supabase blijft voorbereid via `demo`, `local`, `supabase-read` en `hybrid`, maar live Auth/RLS blijft vereist voordat echte klantdata breed gebruikt mag worden.

Nog niet live:

- geen echte klantberichten via backend
- geen realtime notificaties
- geen klantportaal writes
- geen harde productie-routeguard
- geen live Supabase Storage downloads voor alle lokale file metadata
