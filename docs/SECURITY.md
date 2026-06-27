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
- RLS op `customer_websites`
- `auth.uid()` als grens tussen klantaccounts
- admin-profielbeheer via `ADMIN_TOKEN` en een server-side Netlify Function
- Admin CRM-bewerkingen voor klantprofielen lopen via `/.netlify/functions/admin-client-profiles`
- CRM-acties zoals uitnodigen, wachtwoord-reset, login koppelen en archiveren vereisen `ADMIN_TOKEN` en gebruiken de service role alleen server-side.
- Admin-only notities staan in `public.admin_customer_notes` met RLS ingeschakeld en zonder klantbeleid. Deze notities mogen niet in het klantdashboard worden getoond.
- Website Operations data staat in `public.customer_websites`; klanten mogen alleen records lezen waar `customer_auth_user_id = auth.uid()`.
- Website Health mutaties lopen via `/.netlify/functions/admin-website-health`, vereisen `ADMIN_TOKEN` en gebruiken de service role alleen server-side.
- Billingdata staat in `public.customer_subscriptions` en `public.customer_invoices`; klanten mogen alleen eigen records lezen waar `customer_auth_user_id = auth.uid()`.
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
- Voer ook de `customer_websites` tabel en RLS-policy uit `/docs/supabase-client-portal.sql` uit voordat het Website Operations Center live wordt gebruikt.
- Voer `/docs/supabase-website-health.sql` uit voordat health monitoring operationeel wordt gebruikt.
- Voer `/docs/supabase-billing.sql` uit voordat facturatie en abonnementen operationeel worden gebruikt.
- Voer `/docs/supabase-invoice-storage.sql` uit voordat factuur-PDF downloads operationeel worden gebruikt.
- Voer `/docs/supabase-mollie-payments.sql` uit voordat Mollie betaalverzoeken voor facturen operationeel worden gebruikt.
- Voer `/docs/supabase-invoice-emails.sql` uit voordat factuur-e-mailnotificaties operationeel worden gebruikt.
- Voer `/docs/supabase-mollie-subscriptions.sql` uit voordat Mollie onderhoudsabonnementen operationeel worden gebruikt.
- Voer `/docs/supabase-mollie-subscriptions-sync.sql` uit voordat mandate en webhook-synchronisatie operationeel worden gebruikt.

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
