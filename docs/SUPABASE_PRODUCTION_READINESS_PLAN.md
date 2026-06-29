# Supabase Production Readiness Plan

Status: Fase 21 architectuur/readiness.  
Doel: vastleggen hoe de huidige local/demo/mock modules later veilig naar Supabase productie migreren.  
Dit document voert geen SQL uit en wijzigt geen productieomgeving.

## Uitgangspunten

- `/public` blijft de live frontend-bron.
- LocalStorage blijft voorlopig de demo- en fallbacklaag.
- Productieontwikkeling volgt de canonical lijn uit `SUPABASE_CANONICAL_SCHEMA.md`.
- Legacy tabellen `customer_websites`, `customer_invoices` en `customer_subscriptions` worden niet meer gebruikt voor nieuwe productiefeatures.
- Service role blijft uitsluitend server-side.
- Klantportaaldata moet altijd gesanitized zijn voordat deze aan klanten wordt getoond.
- AI-, Mollie-, Resend- en Storage-integraties worden pas actief na Auth/RLS, testomgevingvalidatie en expliciete release-approval.

## LocalStorage Inventory

| Module | Huidige keys | Toekomstige Supabase-tabellen | Productie-kritisch |
|---|---|---|---|
| Publieke leads | `maxwebstudioLeads`, `maxwebstudioLeadRequests` | `leads`, later eventueel `customers` | Ja |
| Leadfinder | `maxwebstudioLeadFinderLeads` | `leads`, `crm_tasks`, `activity_logs` | Ja, na sales-live |
| CRM-klanten | `maxwebstudioCrmCustomers`, `maxwebstudioCustomers` | `customers`, `profiles` | Ja |
| Websites | `maxwebstudioManagedSites`, `maxwebstudioWebsites` | `websites` | Ja |
| Projecten | `maxwebstudioProjects` | `projects`, `crm_tasks`, `activity_logs` | Ja |
| Bestanden | `maxwebstudioFiles` | `files`, Supabase Storage metadata | Ja |
| Offertes | `maxwebstudioQuotes` | `quotes`, `quote_lines` | Ja |
| Facturen | `maxwebstudioInvoices` | `invoices`, `invoice_lines` | Ja |
| Abonnementen | `maxwebstudioSubscriptions` | `subscriptions`, `invoices`, `invoice_lines` | Ja |
| CRM Workflow | `maxwebstudioCrmTasks`, `maxwebstudioActivityLog` | `crm_tasks`, `activity_logs` | Ja |
| Wijzigingsverzoeken | `maxwebstudioChangeRequests` | `change_requests`, `files` | Ja |
| Klantportaal berichten | `maxwebstudioClientPortalMessages` | `client_portal_messages` | Ja, na portal-live |
| Klantportaal notificaties | `maxwebstudioClientPortalNotifications` | `client_portal_notifications` | Ja, na portal-live |
| Klantportaal instellingen/test | `maxwebstudioClientPortalSettings`, `maxwebstudioLastClientPortalDataTest` | `settings`, test/evidence logs | Nee |
| Settings | `maxwebstudioSettings` | `settings` | Ja |
| Demo e-mails | `maxwebstudioDemoEmails` | `demo_emails` | Nee |
| Import/migratie logs | `maxwebstudioImportLog`, `maxwebstudioMigrationLog` | `import_logs`, `activity_logs` | Ja voor beheer |
| Backups/readiness | `maxwebstudioLastPreMigrationBackup`, `maxwebstudioLastSupabaseReadOnlyTest`, `maxwebstudioLastSupabaseWriteTest` | deployment evidence, `activity_logs` | Ja voor releaseproces |
| Customer migratie | `maxwebstudioLastCustomerWritePreview`, `maxwebstudioLastCustomerMigrationResult`, `maxwebstudioCustomerDataMode`, `maxwebstudioLastCustomerSourceStatus` | deployment evidence, `customers` | Ja voor migratie |
| Website migratie | `maxwebstudioWebsiteDataMode`, `maxwebstudioLastWebsiteSourceStatus`, `maxwebstudioLastWebsiteMigrationDryRun`, `maxwebstudioLastWebsiteWriteTest` | deployment evidence, `websites` | Ja voor migratie |
| Project migratie | `maxwebstudioProjectDataMode`, `maxwebstudioLastProjectSourceStatus`, `maxwebstudioLastProjectMigrationDryRun`, `maxwebstudioLastProjectWriteTest` | deployment evidence, `projects` | Ja voor migratie |
| Offerte migratie | `maxwebstudioQuoteDataMode`, `maxwebstudioLastQuoteSourceStatus`, `maxwebstudioLastQuoteMigrationDryRun`, `maxwebstudioLastQuoteWriteTest` | deployment evidence, `quotes`, `quote_lines` | Ja voor migratie |
| Factuur migratie | `maxwebstudioInvoiceDataMode`, `maxwebstudioLastInvoiceSourceStatus`, `maxwebstudioLastInvoiceMigrationDryRun`, `maxwebstudioLastInvoiceWriteTest` | deployment evidence, `invoices`, `invoice_lines` | Ja voor migratie |
| Abonnement migratie | `maxwebstudioSubscriptionDataMode`, `maxwebstudioLastSubscriptionSourceStatus`, `maxwebstudioLastSubscriptionMigrationDryRun`, `maxwebstudioLastSubscriptionWriteTest` | deployment evidence, `subscriptions` | Ja voor migratie |
| Auth demo | `maxwebstudioAuthUsers`, `maxwebstudioProfiles`, `maxwebstudioCurrentSession`, `maxwebstudioAccountRequests` | `profiles`, Supabase Auth | Ja |
| Access control | `maxwebstudioAccessControlSettings`, `maxwebstudioLastProfileReadinessTest`, `maxwebstudioLastAccessControlTest` | `profiles`, RLS evidence, `audit_logs` | Ja |
| Deployment blockers | `maxwebstudioDeploymentBlockers` | deployment evidence, `audit_logs` | Ja |
| AI Website Wizard | `maxwebstudioAiWebsiteWizardState` | `ai_drafts` | Later productie-kritisch |
| AI Admin Assistant | `maxwebstudioAiAdminAssistantDrafts` | `ai_assistant_drafts` | Later productie-kritisch |
| Environment/provider config | `maxwebstudioEnvironment`, `maxwebstudioProvider`, `maxwebstudioDataProviderMode`, `maxwebstudioSupabaseConfig`, `maxwebstudioAuthProvider`, `maxwebstudioAuthMode` | Deployment/config evidence, geen klantdomeintabel | Ja voor beheer, niet als klantdata |
| Demo klantreis | `maxwebstudioLastDemoJourneyId` | demo/evidence logs | Nee |

## Canonical Completeness

De huidige canonical productielijn is grotendeels compleet voor de kern:

- `profiles`
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

Aanvullende tabellen die nodig zijn voordat de nieuwste modules productiewaardig worden:

- `leads`
- `crm_tasks`
- `client_portal_messages`
- `client_portal_notifications`
- `ai_drafts`
- `ai_assistant_drafts`
- `audit_logs`

Bestaande ondersteunende tabellen blijven relevant:

- `settings`
- `demo_emails`
- `activity_logs`
- `import_logs`

## Proposed Table Matrix

### `profiles`

- Doel: Auth-profielen, rollen en user metadata.
- Belangrijkste velden: `id`, `auth_user_id`, `email`, `name`, `phone`, `role`, `status`, `metadata`, timestamps.
- Relaties: `customers.profile_id`, eventueel `audit_logs.actor_profile_id`.
- Ownership/access: gebruiker mag eigen profiel beperkt lezen; admins lezen/beheren alle profielen.
- RLS-risico: role helper mag geen recursie veroorzaken; admin role moet via JWT claim of SECURITY DEFINER helper.
- Migratiebron: `maxwebstudioProfiles`, `maxwebstudioAuthUsers`, account requests.
- Productie-kritisch: ja.

### `customers`

- Doel: centrale klantbron voor CRM en klantportaal.
- Belangrijkste velden: `profile_id`, `auth_user_id`, `name`, `company`, `email`, `phone`, `website`, `package`, `status`, `customer_since`, `portal_status`, `notes`, `metadata`.
- Relaties: parent van websites, projects, quotes, invoices, subscriptions, files, messages en notifications.
- Ownership/access: klant ziet alleen eigen klantrecord; admin beheert alles.
- RLS-risico: e-mailadres mag niet als enige autorisatie dienen; gebruik `auth_user_id`/profile/customer ownership.
- Migratiebron: `maxwebstudioCrmCustomers`, `maxwebstudioCustomers`, geconverteerde Leadfinder leads.
- Productie-kritisch: ja.

### `websites`

- Doel: websitebeheer, operations, hosting en health metadata.
- Belangrijkste velden: `customer_id`, `profile_id`, `name`, `domain`, `live_url`, `staging_url`, `github_repo_url`, `netlify_site_id`, `status`, `hosting_package`, `care_package`, `ssl_status`, healthvelden, `notes`, `metadata`.
- Relaties: `customer_id -> customers.id`; projecten, abonnementen en bestanden kunnen naar websites verwijzen.
- Ownership/access: klanten lezen eigen websitekaart; admin beheert en ziet technische velden.
- RLS-risico: GitHub/Netlify metadata en interne notities niet aan klanten tonen.
- Migratiebron: `maxwebstudioManagedSites`, `maxwebstudioWebsites`.
- Productie-kritisch: ja.

### `projects`

- Doel: onboarding, projectmanagement en klantstatus.
- Belangrijkste velden: `customer_id`, `website_id`, `name`, `type`, `status`, `phase`, `progress`, `start_date`, `deadline`, `checklist`, `tasks`, `timeline`, `notes`, `metadata`.
- Relaties: `customer_id`, `website_id`; offertes/facturen kunnen projectkoppeling hebben.
- Ownership/access: klanten zien klantveilige status; admin ziet taken, checklist en interne notities.
- RLS-risico: interne taken/notities/timeline-events mogen niet ongefilterd naar klantportaal.
- Migratiebron: `maxwebstudioProjects`.
- Productie-kritisch: ja.

### `quotes` en `quote_lines`

- Doel: offertes, offerte-regels en offerte-naar-factuur flow.
- Belangrijkste velden: quote metadata, status, bedragen, geldigheid, acceptatievelden; regels met omschrijving, aantal, prijs, btw en positie.
- Relaties: `customer_id`, `website_id`, `project_id`, `converted_to_invoice_id`.
- Ownership/access: klant leest eigen offertes; admin beheert concept, verzenden, accepteren en archiveren.
- RLS-risico: quote_lines moeten altijd via parent quote ownership beschermd worden.
- Migratiebron: `maxwebstudioQuotes`; mogelijke toekomstige `maxwebstudioQuoteLines` compatibiliteit.
- Productie-kritisch: ja.

### `invoices` en `invoice_lines`

- Doel: facturen, factuurregels, betaalstatus, PDF-pad en betaalprovider metadata.
- Belangrijkste velden: klant/project/website/subscription koppelingen, factuurnummer, status, datums, bedragen, Mollie/e-mail/PDF velden.
- Relaties: `customer_id`, `website_id`, `project_id`, `source_quote_id`, `subscription_id`.
- Ownership/access: klant ziet eigen facturen en veilige download/betaallink; admin beheert status en regels.
- RLS-risico: betaalprovider IDs, interne notities en storage paths mogen niet breed uitlekken.
- Migratiebron: `maxwebstudioInvoices`; mogelijke toekomstige `maxwebstudioInvoiceLines` compatibiliteit.
- Productie-kritisch: ja.

### `subscriptions`

- Doel: onderhoudsabonnementen, MRR/ARR en recurring billing.
- Belangrijkste velden: `customer_id`, `website_id`, `project_id`, plan/status/frequentie, bedragen, volgende factuurdatum, laatste factuur, Mollie/mandate/retry velden.
- Relaties: `customer_id`, `website_id`, `project_id`, `last_invoice_id`.
- Ownership/access: klant ziet eigen abonnementstatus; admin beheert billing en retry metadata.
- RLS-risico: retry/foutmetadata en Mollie IDs admin-only houden.
- Migratiebron: `maxwebstudioSubscriptions`.
- Productie-kritisch: ja.

### `files`

- Doel: bestandsmetadata gekoppeld aan klant, website en project.
- Belangrijkste velden: `customer_id`, `website_id`, `project_id`, `name`, `file_type`, `category`, `location`, `storage_path`, `status`, `notes`, `metadata`.
- Relaties: `customers`, `websites`, `projects`; Storage bucket objecten via `storage_path`.
- Ownership/access: klant alleen eigen klantveilige bestanden; admin beheert alles.
- RLS-risico: geen bucket browsing; downloads via signed URLs; interne notities niet tonen.
- Migratiebron: `maxwebstudioFiles`, uploadmetadata uit wijzigingsverzoeken.
- Productie-kritisch: ja.

### `change_requests`

- Doel: wijzigingsverzoeken vanuit publieke site en klantportaal.
- Belangrijkste velden: `customer_id`, `auth_user_id`, contactvelden, titel/omschrijving/categorie/prioriteit/status, file metadata, timestamps.
- Relaties: `customers`, `profiles/auth.users`, eventueel `projects`/`websites`.
- Ownership/access: klant ziet eigen verzoeken; admin beheert status.
- RLS-risico: publieke inzendingen eerst server-side valideren; bestanden alleen via gecontroleerde signed URL.
- Migratiebron: Supabase change request flow en `maxwebstudioChangeRequests`.
- Productie-kritisch: ja.

### `leads`

- Doel: publieke aanvragen, sales prospects en Leadfinder pipeline.
- Belangrijkste velden: `source`, `company`, `name`, `email`, `phone`, `branch`, `region`, `website_url`, `website_status`, `lead_score`, `call_status`, `follow_up_date`, `notes`, `converted_customer_id`, `metadata`.
- Relaties: optioneel `converted_customer_id -> customers.id`; opvolging via `crm_tasks`.
- Ownership/access: admin/sales-only; niet zichtbaar voor klanten.
- RLS-risico: PII en koude acquisitiegegevens strikt admin/sales-only.
- Migratiebron: `maxwebstudioLeads`, `maxwebstudioLeadRequests`, `maxwebstudioLeadFinderLeads`.
- Productie-kritisch: ja voor sales, niet voor eerste klantportaal-live.

### `crm_tasks`

- Doel: interne opvolging, belacties, klanttaken en projectacties.
- Belangrijkste velden: `customer_id`, `website_id`, `project_id`, `quote_id`, `invoice_id`, `subscription_id`, `lead_id`, `title`, `status`, `priority`, `due_date`, `assigned_to`, `notes`, `metadata`.
- Relaties: alle CRM-kernrecords en leads.
- Ownership/access: intern/admin; later rolgebaseerd voor sales/support.
- RLS-risico: taken bevatten interne context en mogen niet naar klantportaal.
- Migratiebron: `maxwebstudioCrmTasks`.
- Productie-kritisch: ja voor interne workflow.

### `activity_logs`

- Doel: functionele tijdlijn voor CRM, klant, project en migratie-events.
- Belangrijkste velden: `entity_type`, `entity_id`, `customer_id`, `actor_profile_id`, `event_type`, `summary`, `metadata`, timestamps.
- Relaties: polymorf via entity type/id; optioneel customer/profile.
- Ownership/access: admin-only of klantveilige subset via view/service.
- RLS-risico: activity logs kunnen interne beslissingen bevatten; niet direct als klantbron gebruiken.
- Migratiebron: `maxwebstudioActivityLog`, `maxwebstudioImportLog`, `maxwebstudioMigrationLog`.
- Productie-kritisch: ja.

### `client_portal_messages`

- Doel: klantportaalberichten tussen klant en Max Webstudio.
- Belangrijkste velden: `customer_id`, `profile_id`, `sender_type`, `subject`, `body`, `status`, `read_at`, `metadata`.
- Relaties: `customers`, `profiles`.
- Ownership/access: klant leest eigen berichten; admin/support leest gekoppelde klanten.
- RLS-risico: berichtinhoud bevat klantdata; cross-customer isolation verplicht.
- Migratiebron: `maxwebstudioClientPortalMessages`.
- Productie-kritisch: ja na portal messaging live.

### `client_portal_notifications`

- Doel: klantvriendelijke notificaties over projecten, facturen, offertes en wijzigingen.
- Belangrijkste velden: `customer_id`, `profile_id`, `type`, `title`, `message`, `entity_type`, `entity_id`, `status`, `read_at`, `metadata`.
- Relaties: `customers`, `profiles`, optionele entity-koppeling.
- Ownership/access: klant ziet alleen eigen notificaties; admin kan genereren/beheren.
- RLS-risico: notificaties mogen geen interne metadata lekken.
- Migratiebron: `maxwebstudioClientPortalNotifications` en afgeleide lokale notificaties.
- Productie-kritisch: ja na portal-live.

### `ai_drafts`

- Doel: AI Website Wizard intakes en gegenereerde concepten.
- Belangrijkste velden: `customer_id`, `website_id`, `project_id`, `draft_type`, `input_snapshot`, `output_snapshot`, `status`, `provider`, `reviewed_by`, `metadata`.
- Relaties: klanten, websites, projecten.
- Ownership/access: admin-only tijdens draft; klantzicht pas via expliciete publicatie/review.
- RLS-risico: prompts kunnen bedrijfsgevoelige informatie bevatten; consent, logging en retentiebeleid nodig.
- Migratiebron: `maxwebstudioAiWebsiteWizardState`.
- Productie-kritisch: later, niet voor eerste live CRM.

### `ai_assistant_drafts`

- Doel: AI Admin Assistant conceptoutput voor CRM, sales, offertes, SEO en klantberichten.
- Belangrijkste velden: `entity_type`, `entity_id`, `customer_id`, `action_type`, `input_summary`, `output`, `status`, `provider`, `reviewed_by`, `metadata`.
- Relaties: optioneel naar klant/project/lead/quote/invoice/change_request.
- Ownership/access: admin-only; klantcommunicatie nooit automatisch verzenden zonder review.
- RLS-risico: kan interne analyse of klantdata bevatten; geen klantportaal exposure.
- Migratiebron: `maxwebstudioAiAdminAssistantDrafts`.
- Productie-kritisch: later.

### `audit_logs`

- Doel: security/audit trail voor logins, adminacties, exports, approvals, deployment en gevoelige mutaties.
- Belangrijkste velden: `actor_profile_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `ip_hash`, `user_agent`, `result`, `metadata`, timestamps.
- Relaties: `profiles`, optionele entity-koppeling.
- Ownership/access: admin/security-only, append-only via server-side route.
- RLS-risico: mag niet door normale client-mutaties aanpasbaar zijn.
- Migratiebron: deployment blockers/evidence, access control logs, toekomstige server events.
- Productie-kritisch: ja voor live security.

## Gefaseerd Migratieplan

### 1. Auth/profiles

- Bevestig Supabase Auth project en testgebruikers.
- Voer alleen gereviewd schema uit in testomgeving.
- Migreer demo profiles/account requests naar `profiles` waar nodig.
- Valideer roles, route guards, JWT claims en profile ownership.

### 2. Customers/websites/projects

- Migreer klanten als eerste bedrijfsbron.
- Koppel websites en projecten uitsluitend via canonical `customer_id`.
- Test klantportaal read-only payloads en admin read/write per module.
- Valideer dat legacy `customer_websites` niet terugkomt in nieuwe features.

### 3. Quotes/invoices/subscriptions

- Migreer offertes en regels.
- Migreer facturen en regels.
- Migreer abonnementen inclusief recurring billing metadata.
- Activeer geen Mollie/Resend live totdat bedragen, statussen en RLS bewezen zijn.

### 4. Files/change_requests/messages/notifications

- Koppel wijzigingsverzoeken aan customers/auth users.
- Migreer file metadata en richt private Storage buckets in.
- Activeer berichten/notificaties alleen met klantisolatie en sanitized payloads.

### 5. Leads/crm_tasks/activity_log

- Migreer lead requests en Leadfinder prospects naar `leads`.
- Migreer opvolgtaken naar `crm_tasks`.
- Zet activity timeline als interne bron naast audit logs.

### 6. AI draft/history tabellen

- Migreer AI Website Wizard en AI Admin Assistant drafts pas na privacybesluit.
- Voeg server-side AI-provideradapter, rate limiting, consent en logging toe voordat echte AI-calls toegestaan zijn.
- Publiceer AI-output nooit direct naar klanten zonder reviewstatus.

### 7. RLS/security/audit

- Voer RLS pas uit na testomgevingvalidatie per module.
- Test Customer A/B isolation voor klanten, offertes, facturen, projecten, bestanden, berichten en notificaties.
- Gebruik `audit_logs` voor gevoelige acties en deployment evidence.
- Productie blijft No-Go tot backup, rollback, env vars, Auth/RLS en klantisolatie goedgekeurd zijn.

## Belangrijkste RLS/Security Aandachtspunten

- Geen productie-autorisatie op basis van alleen e-mailadres.
- Geen directe klanttoegang tot interne notities, retrydata, provider IDs, debugvelden of deployment evidence.
- Geen brede Storage bucket browse; altijd private buckets en signed URL endpoints.
- Geen service role of API keys in frontend.
- AI-input/output bevat mogelijk vertrouwelijke klantdata; server-side adapter, consent en retentiebeleid zijn verplicht.
- Leadfinder bevat PII en acquisitiedata; alleen admin/sales toegang.
- `activity_logs` zijn functionele timelines; `audit_logs` zijn security/approval logs en moeten strenger beschermd worden.
- Legacy `customer_*` tabellen blijven uitgesloten van nieuwe productiefeatures.
- RLS helperfuncties moeten recursievrij blijven en in testomgeving bewezen zijn.

## Expliciet Niet Uitgevoerd

- Geen SQL uitgevoerd.
- Geen Supabase schema aangepast.
- Geen productiegegevens gelezen of gewijzigd.
- Geen API keys toegevoegd.
- Geen provider switch gedaan.
- Geen OpenAI-, Mollie- of Resend-call toegevoegd.
- Geen runtimefunctionaliteit gewijzigd.

