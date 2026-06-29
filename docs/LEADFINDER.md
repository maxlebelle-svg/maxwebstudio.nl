# Leadfinder Foundation

Laatste update: 2026-06-29.

## Doel

De Leadfinder is een lokale/demo sales-pipeline voor Max Webstudio. Hiermee kunnen potentiële klanten handmatig worden geregistreerd, beoordeeld, gebeld, opgevolgd en veilig worden omgezet naar lokale CRM-klanten.

Deze fase bouwt geen scraping, Google Maps API, Supabase writes, OpenAI-calls of externe koppelingen.

## LocalStorage

Nieuwe key:

- `maxwebstudioLeadFinderLeads`

De data is bedoeld als demo/local voorbereiding en kan later worden gemigreerd naar een canonical productiebron.

## Leadvelden

Per lead wordt opgeslagen:

- `id`
- `companyName`
- `industry`
- `region`
- `phone`
- `email`
- `websiteUrl`
- `websiteStatus`
- `leadScore`
- `callStatus`
- `followUpDate`
- `notes`
- `source`
- `convertedCustomerId`
- `createdAt`
- `updatedAt`

## Website-statussen

- `geen_website`
- `verouderd`
- `traag`
- `niet_mobielvriendelijk`
- `geen_ssl`
- `onbekend`

## Belstatussen

- `nieuw`
- `te_bellen`
- `gebeld`
- `voicemail`
- `interesse`
- `opvolgen`
- `geen_interesse`
- `geconverteerd`

## CRM Workflow koppeling

Een Leadfinder-record kan een opvolgtaak aanmaken in de CRM Workflow.

De workflowtaak gebruikt:

- `type: lead`
- `leadId`
- prioriteit `hoog` bij leadscore 80+
- notities met branche, regio en website-status

## Conversie naar CRM-klant

Een Leadfinder-record kan lokaal worden geconverteerd naar een CRM-klant.

Bij conversie:

- er wordt een klantrecord geschreven naar `maxwebstudioCrmCustomers`
- dezelfde klant wordt ook gespiegeld naar `maxwebstudioCustomers` voor demo/klantportaal-fallback
- de Leadfinder-lead krijgt `convertedCustomerId`
- de belstatus wordt `geconverteerd`
- er wordt een opvolgtaak voorbereid voor intake/kwalificatie

## Productievoorbereiding

Voor productie kan deze module later worden aangesloten op:

- `leads`
- `customers`
- `crm_tasks`
- `activity_log`
- eventueel externe leadbronnen

Leadfinder blijft voorlopig handmatig/local.

## Niet actief

- Geen scraping.
- Geen Google Maps API.
- Geen externe dataproviders.
- Geen Supabase SQL.
- Geen productiegegevens.
- Geen OpenAI-calls.
- Geen automatische e-mails.
- Geen live verkoopautomatisering.
