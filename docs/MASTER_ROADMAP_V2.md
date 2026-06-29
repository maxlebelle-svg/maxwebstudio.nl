# Master Roadmap v2.0

Status: strategische architectuurfase.  
Fase: 27.  
Doel: Max Webstudio verder bouwen als AI-first webbureau, niet als losse verzameling features.

Deze roadmap voert geen code, SQL, API-calls of productieacties uit.

## Kernbesluit

Max AI is geen chatbot en geen los onderdeel.

Max AI wordt de centrale Experience Layer over:

- publieke website;
- aanvraagflow;
- demo-sites;
- AI Website Wizard;
- CRM;
- Leadfinder;
- projecten;
- offertes;
- facturen;
- abonnementen;
- bestanden;
- klantportaal;
- wijzigingsverzoeken;
- klantcommunicatie;
- toekomstige websitegenerator.

Alle nieuwe productontwikkeling moet vanaf nu beantwoorden:

1. Welke rol speelt Max AI in deze flow?
2. Welke data mag Max AI lezen?
3. Welke acties mag Max AI voorstellen?
4. Welke acties blijven menselijk of server-side gecontroleerd?
5. Welke data moet gemaskeerd, gelogd of uitgesloten worden?

## Productvisie

Max Webstudio wordt een AI-first webbureau waarin de klantreis grotendeels begeleid wordt door Max AI:

1. Bezoeker ontdekt Max Webstudio.
2. Max AI helpt de bezoeker richting de juiste website-aanvraag.
3. De AI Website Wizard verzamelt intake, stijl, doelen, pagina's en SEO-input.
4. CRM maakt van de aanvraag een opvolgbare lead.
5. Max AI helpt intern met samenvattingen, offertes, taken en contentconcepten.
6. Projecten, bestanden, facturen en wijzigingen worden zichtbaar in het klantportaal.
7. Max AI helpt klanten met projectstatus, wijzigingsverzoeken en uitleg.
8. Latere versies genereren websites, logo's, SEO en marketingmateriaal.

## Faseringsbesluit

### Fase 27 - Max AI Experience Architecture

Status: deze documentatiefase.

Output:

- Master Roadmap v2.0.
- Max AI architectuur.
- Max AI user journey.
- Max AI module map.
- Security- en AI Operating System-updates.

Nog niet:

- geen OpenAI;
- geen SQL;
- geen Supabase wijziging;
- geen runtime feature;
- geen API keys.

### Fase 28 - Supabase Staging Execution

Doel: bewijzen dat het canonical schema, RLS, Auth/profiles en klantisolatie in een testomgeving werken.

Belangrijk:

- alleen test/staging;
- geen productie;
- Customer A/B isolation verplicht;
- evidence invullen;
- release blockers bijwerken.

### Fase 29 - Supabase Read Layer MVP

Doel: gecontroleerd lezen vanuit Supabase met local/demo fallback.

Start met:

- profiles;
- customers;
- websites;
- projects.

Nog niet:

- geen volledige migratie ineens;
- geen brede writes;
- geen AI op echte klantdata zonder toestemming.

### Fase 30 - Klantportaal Live Data MVP

Doel: klantportaal leest echte klantveilige data via Auth/RLS.

MVP:

- klantprofiel;
- websites;
- projecten;
- offertes;
- facturen;
- bestanden;
- wijzigingsverzoeken.

### Fase 31 - CRM Supabase Controlled Write

Doel: CRM stap voor stap live maken.

Volgorde:

1. customers;
2. websites;
3. projects;
4. quotes;
5. invoices;
6. subscriptions;
7. files;
8. change_requests.

### Fase 32 - Max AI Public Intake MVP

Doel: eerste zichtbare Max AI-ervaring voor bezoekers zonder OpenAI.

MVP:

- begeleide aanvraagflow;
- pakketadvies op basis van regels/templates;
- intake samenvatting;
- output naar AI Website Wizard draft;
- lead naar CRM local/demo of veilige Supabase write wanneer beschikbaar.

### Fase 33 - Server-side AI Adapter

Doel: veilige technische laag voor echte AI-calls.

Vereist:

- server-side only;
- env secrets;
- rate limiting;
- audit logging;
- prompt templates;
- privacy masking;
- consent;
- fallbackgedrag.

### Fase 34 - OpenAI MVP

Doel: kleine gecontroleerde AI-functionaliteiten.

Eerste AI-acties:

- aanvraag samenvatten;
- projectbrief genereren;
- homepage structuur voorstellen;
- SEO titel/meta maken;
- klantbericht concept maken.

Nog niet:

- geen automatische factuurwijzigingen;
- geen Mollie-acties;
- geen productie-deploy-acties;
- geen automatische publicatie.

### Fase 35 - Max AI v2

Doel: AI breder toepassen in interne workflows.

Onderdelen:

- CRM AI;
- Leadfinder AI;
- Project AI;
- SEO AI;
- offerteondersteuning;
- klantcommunicatie-concepten.

### Fase 36 - Max AI v3

Doel: geavanceerde automatisering.

Onderdelen:

- websitegenerator;
- logo-generator;
- voice AI;
- AI sales agent;
- automatische opvolging;
- marketing AI;
- support AI.

## MVP Scope

MVP betekent niet "alles met AI".

MVP betekent:

- publieke website verkoopt duidelijk;
- CRM en klantportaal gebruiken betrouwbare data;
- Supabase/Auth/RLS zijn bewezen;
- AI Website Wizard kan intake en conceptoutput maken;
- Max AI kan veilig begeleiden en samenvatten;
- mens blijft eindverantwoordelijk voor offertes, facturen, betalingen en livegang.

## Niet Te Vroeg Bouwen

Niet bouwen voordat de juiste foundation klaar is:

- echte OpenAI-calls met klantdata;
- AI die facturen, betalingen, rollen of deployment wijzigt;
- AI die productiegegevens schrijft zonder review;
- AI websitegenerator;
- Mollie-acties via AI;
- Resend-mails via AI zonder review;
- scraping/leadfinder AI zonder privacy- en bronbeleid;
- klantportaal AI zonder Auth/RLS evidence.

## Productielijn

De leidende datalijn blijft:

`profiles -> customers -> websites -> projects -> quotes -> quote_lines -> invoices -> invoice_lines -> subscriptions -> files -> change_requests`

Aanvullende AI- en operationele tabellen:

- leads;
- crm_tasks;
- activity_log;
- client_portal_messages;
- client_portal_notifications;
- ai_drafts;
- ai_assistant_drafts;
- audit_logs.

Legacy `customer_*` tabellen worden niet opnieuw gebruikt voor nieuwe productiefeatures.

## Go/No-Go Voor AI Live

Max AI mag pas echte AI-providerdata verwerken wanneer:

- Auth/profiles werken;
- RLS is getest;
- Customer A/B isolation bewezen is;
- server-side AI adapter bestaat;
- secrets niet in frontend staan;
- privacy/consent vastligt;
- audit logging actief is;
- prompt templates gereviewd zijn;
- rate limiting/fallbacks aanwezig zijn.

