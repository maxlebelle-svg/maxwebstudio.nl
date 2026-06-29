# AI Admin Assistant

Laatste update: 2026-06-29.

## Doel

De AI Admin Assistant bereidt een centrale AI-laag voor binnen het admin-dashboard. De module is bedoeld voor toekomstige ondersteuning bij CRM, Leadfinder, offertes, projecten, SEO, klantcommunicatie en wijzigingsverzoeken.

In deze fase is alles local/demo/mock.

## Beschikbare mock-acties

- Klant samenvatten
- Project samenvatten
- Lead analyseren
- Opvolgadvies maken
- Offerte-intro schrijven
- SEO verbeterpunten maken
- Klantbericht concept maken
- Wijzigingsverzoek samenvatten

## LocalStorage

Nieuwe key:

- `maxwebstudioAiAdminAssistantDrafts`

Deze key bewaart de laatste lokale previewoutputs.

## Lokale databronnen

De assistent leest alleen lokale/demo-data uit:

- `maxwebstudioCrmCustomers`
- `maxwebstudioCustomers`
- `maxwebstudioManagedSites`
- `maxwebstudioWebsites`
- `maxwebstudioProjects`
- `maxwebstudioQuotes`
- `maxwebstudioInvoices`
- `maxwebstudioSubscriptions`
- `maxwebstudioLeadFinderLeads`
- `maxwebstudioCrmTasks`
- `maxwebstudioChangeRequests`

## Readiness blockers

Echte AI-integratie blijft geblokkeerd totdat minimaal geregeld is:

- Auth/RLS
- server-side AI-provideradapter
- secrets/env server-side
- prompt/output logging
- rate limiting
- consent/privacybeleid

## Belangrijke grens

Er worden geen externe calls uitgevoerd.

Niet actief:

- Geen OpenAI API.
- Geen API keys.
- Geen Supabase SQL.
- Geen productiegegevens.
- Geen Mollie/Resend/scraping.
- Geen automatische klantcommunicatie.

## Toekomstige integratie

Latere productie-integratie moet server-side gebeuren, bijvoorbeeld via een Netlify Function:

1. Admin kiest actie en context.
2. Backend valideert rol/permissie.
3. Backend haalt minimale context op.
4. Backend logt promptmetadata.
5. Backend roept AI-provider aan.
6. Output wordt opgeslagen met audit trail.
7. Admin reviewt output voordat iets naar klant gaat.

Frontend mag nooit API keys bevatten.
