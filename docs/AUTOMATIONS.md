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
- het wijzigingsverzoek wordt opgeslagen in Supabase tabel `change_requests`
- bestanden worden opgeslagen in Supabase Storage bucket `change-request-files`
- Max Web Studio ontvangt een e-mail via Resend
- de klant ontvangt een bevestigingsmail wanneer Resend goed geconfigureerd is
- bestandsmetadata wordt gekoppeld aan het wijzigingsverzoek in `file_names`

Als e-mail een warning geeft, blijft het wijzigingsverzoek opgeslagen. Als Supabase-opslag faalt, stopt de flow met een nette foutmelding en worden er geen e-mails verstuurd.

Uploads zijn beperkt tot JPG, PNG, PDF en DOCX. Er mogen maximaal 5 bestanden worden meegestuurd en maximaal 10 MB per bestand.

### Admin Dashboard Wijzigingsverzoeken

Het admin dashboard haalt wijzigingsverzoeken op via:

- `/.netlify/functions/list-change-requests`

Daarna:

- de function leest maximaal 100 records uit Supabase tabel `change_requests`
- resultaten worden gesorteerd op `created_at desc`
- de frontend toont loading, empty en error states
- de dashboardkaarten voor actieve klanten en open wijzigingsverzoeken worden berekend op basis van de opgehaalde data
- filters voor status, prioriteit en categorie werken alleen in de frontend
- elk wijzigingsverzoek kan op dezelfde pagina worden bekeken in een detailmodal

Statusupdates lopen via:

- `/.netlify/functions/update-change-request-status`

Deze function:

- accepteert alleen `PATCH`
- verwacht `id` en `status`
- staat alleen `nieuw`, `in_behandeling`, `wacht_op_klant` en `afgerond` toe
- gebruikt server-side Supabase environment variables
- geeft een nette JSON-response terug

Er is nog geen login, audit trail, notificatie na statuswijziging of automatische taakverwerking gekoppeld.

Bestanden openen loopt via:

- `/.netlify/functions/get-change-request-file`

Deze function:

- accepteert alleen `GET`
- verwacht een `changeRequestId` plus `fileIndex` of `storagePath`
- controleert dat het bestand bij het bestaande wijzigingsverzoek hoort
- maakt een tijdelijke Supabase Storage signed URL
- lekt geen Supabase service role key naar de frontend

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
