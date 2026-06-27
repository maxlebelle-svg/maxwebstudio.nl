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

### Webhook Alleen Logging

`mollie-webhook.js` logt betaalstatus, maar slaat status niet duurzaam op.

Risico:

- geen betrouwbaar orderoverzicht
- onboarding niet stevig gekoppeld aan betaalstatus

Aanbeveling:

- payment records duurzaam opslaan.

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

Risico:

- Zonder correcte RLS kan een anon key te veel data lezen.
- Bestaande wijzigingsverzoeken zonder `auth_user_id` zijn niet zichtbaar voor klanten.
- Websiteomgevingen zonder `customer_auth_user_id` zijn niet zichtbaar voor klanten.
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
