# Supabase Write Readiness Plan

Status: `SPRINT 2B CUSTOMER CONTACT WRITE GEIMPLEMENTEERD / STAGING GEBLOKKEERD / PRODUCTIE WRITE-MODE NO-GO`

Dit document legt vast hoe Max Webstudio gecontroleerd van read-only Supabase/hybrid naar veilige write-mode kan groeien. Het is een planningsdocument: er wordt geen SQL uitgevoerd, geen provider gewijzigd en geen productieproject geraakt.

## Huidige read-only basis

De volgende modules lopen inmiddels via de Supabase/hybrid data-layer met local/demo fallback:

- `leads`
- `customers`
- `websites`
- `projects`
- `quotes`
- `quote_lines`
- `invoices`
- `invoice_lines`
- `subscriptions`
- `files`
- `change_requests`
- `client_portal_messages`
- `client_portal_notifications`
- `crm_tasks`

Writes blijven uitgeschakeld behalve bestaande lokale demo-acties, eerder gebouwde gated test/migratieflows, de staging-gevalideerde Sprint 1 low-risk writes, de Sprint 2A projectstatus-write achter expliciete test-gates en de Sprint 2B customer-contact implementatie die nog op staging bewezen moet worden.

Zie ook `docs/SPRINT_1_LOW_RISK_WRITES_REVIEW.md`.

## Write-principes

- Start met lage-risico records die geen financiële, auth-, rol- of deployment-impact hebben.
- Elke write krijgt expliciete validatie, RLS-check, auditlog en rollback/fallback.
- Frontend mag niet direct gevoelige of high-risk mutaties uitvoeren.
- Server-side functies zijn verplicht zodra secrets, audit-integriteit, betalingen, e-mail of role checks nodig zijn.
- Local/demo fallback blijft bestaan totdat staging en production evidence groen zijn.
- Elke write-mode fase moet afzonderlijk getest worden met Customer A/B isolatie.

## Gefaseerd write-plan

### Fase 35A - Low-risk write MVP

Aanbevolen eerste write-MVP:

1. `crm_tasks` aanmaken
2. Leadnotitie toevoegen aan `leads`
3. `change_requests` aanmaken
4. `client_portal_messages` aanmaken

Waarom deze volgorde:

- Geen factuurbedragen, betalingen, abonnementen, rollen of storage-objecten.
- Mutaties zijn omkeerbaar of archiveerbaar.
- Businessimpact is beperkt tot opvolging, intake en communicatie.
- Sluit direct aan op bestaande local/demo flows.

### Sprint 2 - Medium-risk writes

- `projects` status/fase/voortgang
- `customers` beperkte profiel-/contactupdates
- `websites` status/notitie/monitoringvelden

Deze writes vereisen hardere conflict-afhandeling, audittrail en duidelijk onderscheid tussen klant- en adminvelden.

### Fase 35C - High-risk writes

- `quotes`
- `quote_lines`
- `invoices`
- `invoice_lines`
- `subscriptions`

Deze writes blijven geblokkeerd tot financiële validatie, nummerreeksen, btw-regels, audit en rollback volledig bewezen zijn.

### Fase 35D - Restricted writes

Niet rechtstreeks vanuit frontend:

- rollen/profiles/auth
- betalingen/Mollie
- audit logs
- deployments
- Supabase schema/RLS/config
- files/storage uploads
- AI-acties die productiegegevens wijzigen

Deze mutaties vereisen server-side routes, expliciete approval en extra logging.

## Low-risk write specificaties

Sprint 1 low-risk writes zijn afgerond en staging-gevalideerd:

- `crm_tasks` create;
- `leads.notes` append;
- `change_requests` create;
- `client_portal_messages` create.

Productie-write-mode blijft dicht totdat audit/approval en production governance zijn afgerond.

Sprint 2A medium-risk write is staging-gevalideerd:

- `projects.status`, `projects.phase` en `projects.progress` update.

Sprint 2B medium-risk write is geimplementeerd maar nog niet staging-gevalideerd:

- `customers.name`, `customers.email`, `customers.phone` en `customers.notes` update.

Productie-write-mode blijft ook hiervoor dicht totdat staging evidence, audit/approval en production governance zijn afgerond.

### 1. CRM-taak aanmaken

Tabel: `crm_tasks`

Toegestane rollen:

- `admin`, `super_admin`: alle CRM-taken
- `sales`, `support`: eigen/interne opvolgtaken
- `developer`: read-only, geen create in MVP
- `customer`: geen toegang

Benodigde RLS:

- Huidige draft heeft `crm_tasks_admin_manage` en `crm_tasks_sales_support_manage`.
- Voor MVP moet worden bevestigd of `sales/support` alle taken mogen beheren of alleen toegewezen/eigen taken.
- Aanbevolen aanscherping: voeg `assigned_profile_id = current_profile_id()` of expliciete team-scope toe voordat brede production writes live gaan.

Validatie:

- `title` verplicht.
- `status` binnen toegestane waarden.
- `priority` binnen toegestane waarden.
- gekoppelde `customer_id`, `lead_id`, `project_id` bestaan indien ingevuld.
- geen klantgevoelige vrije tekst in technische metadata.

Audit:

- `crm_task_created`
- metadata: task id, gekoppelde module, actor role, geen secrets.

Rollback/fallback:

- nieuwe taak kan worden gearchiveerd.
- local fallback blijft `maxwebstudioCrmTasks`.

UI-impact:

- CRM Workflow en Leadfinder opvolgtaak-knoppen kunnen later write-mode-aware worden.
- Bij Supabase write-fout: lokale draft bewaren en melding tonen.

Risico: laag tot middel, afhankelijk van scope van sales/support policy.

### 2. Leadnotitie toevoegen

Tabel: `leads`

Aanbevolen model:

- MVP: append-only notitieveld via gecontroleerde update op `notes` of later aparte `lead_notes` tabel.
- Voorkeur voor productie: aparte `lead_notes` of activity log, omdat `notes` overschrijven lastiger te auditen is.

Toegestane rollen:

- `admin`, `super_admin`, `sales`: notities toevoegen.
- `support`, `developer`: read-only tenzij expliciet nodig.
- `customer`: nooit.

Benodigde RLS:

- Huidige draft heeft `leads_admin_sales_manage`.
- Voor notitie-MVP is dit functioneel voldoende voor admin/sales, maar te breed voor alleen notes.
- Aanbevolen: aparte server-side function of beperkte update-policy voor toegestane velden (`notes`, `updated_at`, eventueel `call_status`).

Validatie:

- notitie verplicht, max lengte.
- geen scraping-output of externe API payload opslaan.
- geen persoonlijke gevoelige data tenzij zakelijk relevant en toegestaan.

Audit:

- `lead_note_added`
- metadata: lead id, old/new status niet volledig loggen, alleen samenvatting.

Rollback/fallback:

- append-regel kan lokaal blijven als `pendingSync`.
- productie rollback is nieuwe correctienotitie of gecontroleerde update.

UI-impact:

- Leadfinder detailnotitie kan later remote-write-aware worden.
- Remote leads blijven tot die fase read-only.

Risico: laag, mits append-only of veldbeperkt.

### 3. Change request aanmaken

Tabel: `change_requests`

Toegestane rollen:

- `customer`: eigen wijzigingsverzoek aanmaken.
- `admin`, `support`: namens klant aanmaken/beheren.
- `sales/developer`: read-only of intern afhankelijk van rol.

Benodigde RLS:

- Huidige draft heeft `change_requests_customer_insert` met `auth_user_id = auth.uid()` of `owns_customer(customer_id)`.
- Voor productie moet `customer_id` verplicht gekoppeld zijn of server-side uit sessie worden afgeleid.
- Support update bestaat al als aparte policy.

Validatie:

- titel/omschrijving verplicht.
- customer ownership afdwingen.
- status bij insert altijd `nieuw`.
- geen file upload in deze fase; alleen metadata/tekst.

Audit:

- `change_request_created`
- `change_request_status_changed` later.

Rollback/fallback:

- verzoek kan worden geannuleerd/gearchiveerd.
- local fallback blijft `maxwebstudioChangeRequests`.

UI-impact:

- Klantportaal wijzigingsverzoekformulier kan later eerste echte klantwrite worden.
- Bij fout: lokaal bewaren als concept/pending sync.

Risico: laag tot middel, omdat klantdata wordt aangemaakt. Vereist sterke ownership-test.

### 4. Klantportaalbericht aanmaken

Tabel: `client_portal_messages`

Toegestane rollen:

- `customer`: eigen bericht aanmaken.
- `admin/support`: berichten beheren/beantwoorden.
- `sales/developer`: alleen indien intern beleid dat toestaat.

Benodigde RLS:

- Huidige draft heeft owner insert via `owns_customer(customer_id)`.
- Voor MVP moet voorkomen worden dat klant zelf `sender_type = admin` kan zetten.
- Aanbevolen: server-side route of check constraint/policy die klantinsert beperkt tot `sender_type = customer`.

Validatie:

- subject/body verplicht.
- customer ownership.
- sender type uit sessie bepalen, niet uit formulier vertrouwen.
- status bij klantinsert `open` of `sent`.

Audit:

- `client_portal_message_created`

Rollback/fallback:

- bericht kan worden gearchiveerd.
- local fallback blijft `maxwebstudioClientPortalMessages`.

UI-impact:

- Klantportaal berichtenmodule kan later echte intake/supportberichten opslaan.

Risico: laag tot middel, vooral door sender spoofing en klantisolatie.

## Medium-risk writes

### Customers

Veilig als eerste:

- contactgegevens, status naar `onboarding/paused/active`, notitie alleen intern.

Nog blokkeren:

- `auth_user_id`, `profile_id`, rollen, portal status zonder invite-flow.

Vereist:

- conflict handling tussen local/hybrid en remote records.
- auditlog bij elk veldverschil.
- duidelijke `lastSyncedAt`/source metadata.

### Websites

Veilig als eerste:

- status, notities, `last_checked_at`, monitoring scorevelden.

Nog blokkeren:

- deployment, Netlify IDs, DNS/SSL automatische acties.

### Projects

Veilig als eerste:

- status, fase, voortgang, checklist/taken.

Vereist:

- project timeline/audit consistentie.
- klantportaal mag alleen klantveilige velden zien.

## High-risk writes

Quotes, invoices en subscriptions blijven geblokkeerd tot:

- nummerreeksen server-side en race-condition veilig zijn.
- btw/totalen opnieuw server-side berekend worden.
- betaalstatus nooit client-side beslissend is.
- audit en rollback getest zijn.
- Mollie/Resend flows los gevalideerd zijn.

## Restricted writes

Altijd server-side en approval-based:

- rollen/profiles/auth.
- betalingen en betaalstatussen.
- audit logs.
- deployments.
- database schema/RLS.
- storage uploads en signed URLs.
- AI-mutaties op productiegegevens.

## Required readiness voordat 35A gebouwd mag worden

- Staging RLS test voor de vier low-risk writes.
- Runtime grants bevestigd voor insert/update waar nodig.
- Audit helper of tijdelijke auditstrategie bevestigd.
- UI copy voor fallback/pending state.
- Besluit: direct frontend Supabase client of server-side Netlify function per write.
- Geen productiegegevens.
- Geen production provider switch.

## Aanbevolen eerste implementatiefase

Fase 35A moet beginnen met `crm_tasks` create via een gated write service.

Reden:

- laagste klantimpact.
- geen klantportaalpublieke data.
- geen financiële of auth-risico's.
- sluit aan op Leadfinder opvolgtaken en CRM Workflow.

Daarna:

1. lead note append.
2. change request create.
3. client portal message create.

## Fase 35A - CRM tasks create MVP

Status: `GEIMPLEMENTEERD ALS TEST-GATED MVP`

Toegevoegd:

- `public/src/services/crmTaskWriteService.js`
- `supabaseProvider.createCrmTask()`
- Admin CRM Workflow en Leadfinder opvolgtaak-knoppen gebruiken nu dezelfde write-aware service.

Gate:

- Provider mode moet `supabase-write-test` zijn.
- `maxwebstudioCrmTaskWriteEnabled=true` moet lokaal expliciet zijn gezet.
- Productieomgeving blokkeert de write.
- Payload wordt altijd gemarkeerd als `is_demo=true` en `environment=test`.
- Metadata vereist `createdBy=crm-task-write-mvp` en `safeToArchive=true`.

Fallback:

- Als de gate dichtstaat, Supabase niet beschikbaar is of RLS de insert blokkeert, wordt de taak lokaal opgeslagen in `maxwebstudioCrmTasks`.
- Laatste resultaat wordt vastgelegd in `maxwebstudioLastCrmTaskWriteStatus`.

Beperkingen:

- Alleen `create`.
- Geen update/delete op Supabase CRM-taken.
- Lokale niet-UUID relaties worden niet als foreign key verstuurd; ze worden veilig bewaard in metadata.
- Server-side audit logging is nog niet actief.
- Productie blijft geblokkeerd totdat staging evidence en auditstrategie zijn afgerond.

## Fase 35B - Lead notes append MVP

Status: `GEIMPLEMENTEERD / STAGING GEVALIDEERD`

Toegevoegd:

- `public/src/services/leadNoteWriteService.js`
- `supabaseProvider.appendLeadNote()`
- Leadfinder detailnotities gebruiken nu dezelfde write-aware service.

Gate:

- Provider mode moet `supabase-write-test` zijn.
- `maxwebstudioLeadNoteWriteEnabled=true` moet lokaal expliciet zijn gezet.
- Productieomgeving blokkeert de write.
- Supabase runtime-config moet aanwezig zijn.

Write-scope:

- Alleen bestaande `leads` records.
- Alleen veldbeperkte update van `notes`, `updated_at` en veilige metadata.
- Geen lead delete.
- Geen volledige lead overwrite.
- Geen status/score/contactveld update op Supabase.

Fallback:

- Als de gate dichtstaat of Supabase/RLS faalt, wordt de notitie lokaal appended in `maxwebstudioLeadFinderLeads`.
- Lokale leads behouden de bestaande belstatus-update vanuit de Leadfinder UI.
- Remote/hybrid leads krijgen lokaal een mirror/fallback wanneer remote niet beschikbaar is.
- Laatste resultaat wordt vastgelegd in `maxwebstudioLastLeadNoteWriteStatus`.

Stagingstatus:

- Lokale fallback-test: `PASS`.
- DNS/root cause-check: `PASS`; de eerdere `ENOTFOUND` was tijdelijk en is opgelost.
- Staging write-test: `PASS` met run `phase-35b1-rerun-1782775482334`.
- RLS-test: interne rol kon notitie toevoegen; customer/no-profile kregen 0 rows; anonymous kreeg 401.
- Allowed-fields check: alleen `notes`, `updated_at` en veilige metadata zijn gewijzigd.
- Testdata bleef bewust staan als synthetische stagingdata met `environment=test`, `is_demo=false` en `metadata.safeToArchive=true`.
- Een eerste `is_demo=true` lead is niet gebruikt als isolatiebewijs, omdat demo-read policies demo-records bewust zichtbaar kunnen maken.

Beperkingen:

- Server-side audit logging is nog niet actief.
- Fijnmazigere lead-note-only RLS blijft later wenselijk; huidige stagingpolicy gebruikt `leads_admin_sales_manage`.
- Productie blijft geblokkeerd totdat audit/approval en production write-governance afgerond zijn.

## Open blockers

- RLS policies voor `crm_tasks` en `leads` zijn functioneel, maar nog te breed voor bredere production write-mode.
- Audit logging is voorbereid, maar server-side auditstrategie moet gekozen worden.
- `crm_tasks`, leadnotities en wijzigingsverzoeken hebben nu dedicated low-risk write services.
- Conflict handling en pending-sync UX moeten per module worden ontworpen.
- Productie blijft `NO-GO` voor writes totdat production approvals, auditstrategie en write-governance expliciet zijn afgerond.

## Fase 35C - Change requests create MVP

Status: `GEIMPLEMENTEERD / STAGING GEVALIDEERD`

Toegevoegd:

- `public/src/services/changeRequestWriteService.js`
- `supabaseProvider.createChangeRequest()`
- Klantportaalformulier voor een nieuw wijzigingsverzoek.
- Developer Mode-status voor `maxwebstudioChangeRequestWriteEnabled` en `maxwebstudioLastChangeRequestWriteStatus`.
- RLS-patch `supabase/migration-drafts/008_change_request_customer_ownership.sql`.

Gate:

- Provider mode moet `supabase-write-test` zijn.
- `maxwebstudioChangeRequestWriteEnabled=true` moet lokaal expliciet zijn gezet.
- Productieomgeving blokkeert de write.
- Supabase runtime-config en een geldige customer-sessie zijn vereist.

Write-scope:

- Alleen `change_requests` create.
- Alleen status `nieuw`.
- Geen update/delete.
- Geen statuswijziging door customer.
- `auth_user_id` wordt door de provider vergrendeld op de actuele Supabase user.

Fallback:

- Als de gate dichtstaat, Supabase/Auth ontbreekt of RLS de insert blokkeert, wordt het verzoek lokaal opgeslagen in `maxwebstudioChangeRequests`.
- Laatste resultaat wordt vastgelegd in `maxwebstudioLastChangeRequestWriteStatus`.

Stagingstatus:

- Lokale fallback-test: `PASS`.
- Eerste stagingrun vond een RLS-spoofingrisico: customer kon eigen `auth_user_id` combineren met een ander `customer_id`.
- Patch `008_change_request_customer_ownership.sql` is uitsluitend op staging uitgevoerd.
- Herhaalde staging write/RLS-test: `PASS` met run `phase-35c-rerun-1782798584503`.
- Eigen customer insert: HTTP 201.
- Spoofing met/zonder `auth_user_id`: HTTP 403.
- Anonymous insert: HTTP 401.
- Customer read isolation: eigen rows 1, andere rows 0.

Beperkingen:

- Server-side audit logging is nog niet actief.
- Productie blijft geblokkeerd totdat patch `008`, audit/approval en production write-governance expliciet zijn goedgekeurd.
- Client portal messages zijn de resterende low-risk write in Sprint 1.

## Fase 35D - Client portal messages create MVP

Status: `GEIMPLEMENTEERD / STAGING GEVALIDEERD`

Toegevoegd:

- `public/src/services/clientPortalMessageWriteService.js`
- `supabaseProvider.createClientPortalMessage()`
- Klantportaalformulier voor nieuw bericht.
- Developer Mode-status voor `maxwebstudioClientPortalMessageWriteEnabled` en `maxwebstudioLastClientPortalMessageWriteStatus`.
- RLS-patch `supabase/migration-drafts/009_client_portal_message_customer_ownership.sql`.

Gate:

- Provider mode moet `supabase-write-test` zijn.
- `maxwebstudioClientPortalMessageWriteEnabled=true` moet lokaal expliciet zijn gezet.
- Productieomgeving blokkeert de write.
- Supabase runtime-config en een geldig actief customer profile zijn vereist.

Write-scope:

- Alleen `client_portal_messages` create.
- Alleen `sender_type=customer`.
- Alleen status `open`.
- Geen update/delete.
- `sender_profile_id` wordt door de provider vergrendeld op het actuele profile.

Fallback:

- Als de gate dichtstaat, Supabase/Auth ontbreekt of RLS de insert blokkeert, wordt het bericht lokaal opgeslagen in `maxwebstudioClientPortalMessages`.
- Laatste resultaat wordt vastgelegd in `maxwebstudioLastClientPortalMessageWriteStatus`.

Stagingstatus:

- Lokale fallback-test: `PASS`.
- Patch `009_client_portal_message_customer_ownership.sql` is uitsluitend op staging uitgevoerd.
- Staging write/RLS-test: `PASS` met run `phase-35d-1782800213876`.
- Eigen customer insert: HTTP 201.
- Sender spoofing, customer spoofing, sender profile spoofing en no-profile: HTTP 403.
- Anonymous insert: HTTP 401.
- Customer read isolation: eigen rows 1, andere rows 0.

Sprint 1 resultaat:

- `crm_tasks` create: gevalideerd.
- `leads.notes` append: gevalideerd.
- `change_requests` create: gevalideerd.
- `client_portal_messages` create: gevalideerd.

Beperkingen:

- Server-side audit logging is nog niet actief.
- Productie blijft geblokkeerd totdat patches `008`/`009`, audit/approval en production write-governance expliciet zijn goedgekeurd.

## Sprint 2A - Project status update MVP

Status: `GEIMPLEMENTEERD / STAGING GEVALIDEERD`

Toegevoegd:

- `public/src/services/projectStatusWriteService.js`
- `supabaseProvider.updateProjectStatus()`
- Developer Mode-status voor `maxwebstudioProjectStatusWriteEnabled` en `maxwebstudioLastProjectStatusWriteStatus`.
- RLS/grants-patch `supabase/migration-drafts/010_project_status_update_grants.sql`.

Gate:

- Provider mode moet `supabase-write-test` zijn.
- `maxwebstudioProjectStatusWriteEnabled=true` moet lokaal expliciet zijn gezet.
- Productieomgeving blokkeert de write.
- Supabase runtime-config en bevoegde interne rol zijn vereist.

Write-scope:

- Alleen `projects` update.
- Alleen `status`, `phase`, `progress`, `updated_at` en veilige metadata.
- Geen create/delete/archive.
- Geen `customer_id`, `website_id`, notes, checklist, tasks, timeline, ownership, finance, files of AI-velden.

Databasebeperking:

- Patch `010_project_status_update_grants.sql` trekt brede `authenticated` update terug.
- Daarna krijgt `authenticated` alleen column-level update op `status`, `phase`, `progress`, `updated_at` en `metadata`.
- RLS blijft bepalen welke rollen de rij mogen wijzigen.

Fallback:

- Als de gate dichtstaat, Supabase/Auth ontbreekt of RLS de update blokkeert, wordt de projectstatus lokaal opgeslagen in `maxwebstudioProjects`.
- Laatste resultaat wordt vastgelegd in `maxwebstudioLastProjectStatusWriteStatus`.

Stagingstatus:

- Lokale fallback-test: `PASS`.
- Patch `010_project_status_update_grants.sql` is uitsluitend op staging uitgevoerd.
- Staging write/RLS-test: `PASS` met run `phase-35-2a-1782801332755`.
- Support update: HTTP 200.
- Customer/no-profile update: 0 gewijzigde rijen.
- Anonymous update: HTTP 401.
- `customer_id` spoofing en extra `notes` veld: HTTP 403.
- Customer portal readback: bijgewerkte projectstatus zichtbaar via RLS/readlaag.

Beperkingen:

- Server-side audit logging is nog niet actief.
- Productie blijft geblokkeerd totdat patch `010`, audit/approval en production write-governance expliciet zijn goedgekeurd.
- Sprint 2B is de volgende medium-risk write, maar telt pas als afgerond na staging/RLS evidence.

## Sprint 2B - Customer contact update MVP

Status: `GEIMPLEMENTEERD / STAGING GEBLOKKEERD`

Toegevoegd:

- `public/src/services/customerContactWriteService.js`
- `supabaseProvider.updateCustomerContact()`
- Developer Mode-status voor `maxwebstudioCustomerContactWriteEnabled` en `maxwebstudioLastCustomerContactWriteStatus`.
- RLS/grants-patch `supabase/migration-drafts/011_customer_contact_update_grants.sql`.

Gate:

- Provider mode moet `supabase-write-test` zijn.
- `maxwebstudioCustomerContactWriteEnabled=true` moet lokaal expliciet zijn gezet.
- Productieomgeving blokkeert de write.
- Supabase runtime-config en een bevoegde interne rol zijn vereist.

Write-scope:

- Alleen `customers` update.
- Alleen `name`, `email`, `phone`, `notes`, `updated_at` en veilige metadata.
- Geen create/delete/archive.
- Geen `auth_user_id`, `profile_id`, `customer_id`, ownership, rollen, status, facturatie, abonnementen of klantportaalrechten.
- `contact_preference` en `internal_notes` zijn niet meegenomen omdat deze velden niet in het canonical schema aanwezig zijn.

Databasebeperking:

- Patch `011_customer_contact_update_grants.sql` trekt brede `authenticated` update terug.
- Daarna krijgt `authenticated` alleen column-level update op `name`, `email`, `phone`, `notes`, `updated_at` en `metadata`.
- RLS blijft bepalen welke rollen de rij mogen wijzigen.

Fallback:

- Als de gate dichtstaat, Supabase/Auth ontbreekt of RLS de update blokkeert, worden de contactvelden lokaal opgeslagen in `maxwebstudioCustomers`.
- Laatste resultaat wordt vastgelegd in `maxwebstudioLastCustomerContactWriteStatus`.

Stagingstatus:

- Lokale fallback-test: `PASS`.
- Patch `011_customer_contact_update_grants.sql` is voorbereid, maar nog niet uitgevoerd.
- Staging patch/write/RLS-test: `BLOCKED`.
- Blokkade: de Supabase CLI sessie mist een access token en de test-only poolerverbinding mist het databasewachtwoord.

Nog te bewijzen:

- Bevoegde interne rol kan contactvelden updaten.
- Customer/no-profile/anonymous worden geblokkeerd volgens policy.
- Spoofing van ownership, rollen, status en extra velden wordt geblokkeerd of genegeerd.
- Readback toont uitsluitend de toegestane contactmutatie.

Beperkingen:

- Server-side audit logging is nog niet actief.
- Productie blijft geblokkeerd totdat patch `011`, staging evidence, audit/approval en production write-governance expliciet zijn goedgekeurd.
- Sprint 2 completion blijft `33%` totdat 2B en 2C volledig staging-bewezen zijn.
