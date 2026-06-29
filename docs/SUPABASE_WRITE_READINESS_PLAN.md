# Supabase Write Readiness Plan

Status: `FASE 35A MVP - CRM_TASKS CREATE TEST-GATED`

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

Writes blijven uitgeschakeld behalve bestaande lokale demo-acties, eerder gebouwde gated test/migratieflows en Fase 35A `crm_tasks` create-only achter een expliciete test-gate.

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

### Fase 35B - Medium-risk writes

- `customers` beperkte profiel-/contactupdates
- `websites` status/notitie/monitoringvelden
- `projects` status/fase/voortgang

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
- `crm_tasks` en leadnotities hebben nu dedicated low-risk write services.
- Conflict handling en pending-sync UX moeten per module worden ontworpen.
- Productie blijft `NO-GO` voor writes totdat staging evidence is toegevoegd.
