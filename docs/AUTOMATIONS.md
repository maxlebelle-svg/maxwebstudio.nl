# Automations

Dit document beschrijft bestaande en mogelijke automatisering.

## Huidige Automatisering

### Mollie Checkout

De betaalpagina stuurt een aanvraag naar:

- `/.netlify/functions/create-payment`

De backend maakt een Mollie betaling aan en stuurt de bezoeker naar Mollie checkout.

### Mollie Webhook

Mollie stuurt statusupdates naar:

- `/.netlify/functions/mollie-webhook`

Huidige status:

- webhook leest betaalstatus uit
- webhook logt status
- webhook slaat nog geen duurzame orderstatus op

### Onboarding Intake

De onboarding-wizard stuurt data naar:

- `/.netlify/functions/submit-onboarding`

Daarna:

- intake wordt tijdelijk opgeslagen
- adminmail wordt verstuurd via Resend
- klantbevestiging wordt verstuurd via Resend

### Wijzigingsverzoeken

De pagina `/public/wijziging-doorgeven.html` stuurt wijzigingsverzoeken naar:

- `/.netlify/functions/submit-change-request`

Daarna:

- verplichte velden worden server-side gevalideerd
- een honeypot veld kan spam stil afvangen
- Max Web Studio ontvangt een e-mail via Resend
- de klant ontvangt een bevestigingsmail wanneer Resend goed geconfigureerd is
- bestandsnamen worden meegestuurd, maar bestanden zelf nog niet

Echte uploadopslag moet later apart worden gekoppeld via Netlify Forms, Netlify Blobs, Supabase Storage of externe storage.

### Calendly

Calendly wordt lazy geladen op klik.

Doel:

- gratis kennismakingsgesprek plannen

## Mogelijke Toekomstige Automatisering

- betaling aanmaken
- orderstatus opslaan
- intake koppelen aan payment ID
- klantmap of projectrecord maken
- automatische bevestigingsmail
- automatische reminder bij incomplete intake
- offerte genereren op basis van upsells
- taak aanmaken voor Max
- factuur- of betaallink voor restbedrag
- onderhoudsabonnement activeren
- klantportaal-account aanmaken
- wijzigingsverzoeken opslaan in admin dashboard of klantendatabase
- uploadopslag koppelen aan wijzigingsverzoeken

## Regels Voor Automatisering

- Geen automatisering toevoegen zonder akkoord.
- Geen klantdata naar nieuwe externe tools sturen zonder akkoord.
- Geen betaal- of abonnementsautomatisering activeren zonder testplan.
- Automatisering moet uitlegbaar, herstelbaar en controleerbaar zijn.

## Prioriteit

Eerste logische automatisering:

1. payment record duurzaam opslaan
2. intake koppelen aan payment record
3. admin overzicht verbeteren
4. follow-up e-mails automatiseren
