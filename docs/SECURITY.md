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

### Uploads

Onboarding comprimeert foto-uploads client-side en stuurt ze als bijlage.

Aanbevelingen:

- limieten blijven handhaven
- allowed MIME types blijven beperken
- geen uitvoerbare bestanden accepteren
- bij groei overstappen op veilige uploadopslag

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

