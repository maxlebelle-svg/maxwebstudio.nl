# Supabase Schema Draft & RLS Policy Plan

Status: Fase 23 ontwerp/readiness.  
Doel: het toekomstige productie-schema en RLS-beleid concreet voorbereiden voordat er echte Supabase-migraties komen.  
Dit document voert geen SQL uit.

## Scope En Grenzen

Wel:

- Conceptschema per productie- en ondersteunende tabel.
- Ownershipmodel per tabel.
- RLS-aanpak per rol.
- Audit logging en AI/privacy-risico's.
- Migratie- en securitybeslissingen vastleggen.

Niet:

- Geen SQL uitvoeren.
- Geen Supabase schema wijzigen.
- Geen productiegegevens gebruiken.
- Geen API keys, secrets, OpenAI, Mollie of Resend activeren.
- Geen runtime-feature bouwen.

## Rollen

| Rol | Productiedoel | Globale RLS-grens |
|---|---|---|
| `super_admin` | Eigenaar/noodbeheer/releasebeheer | Volledige toegang, streng audit-loggen |
| `admin` | Dagelijks platformbeheer | Alle CRM-data beheren, geen service role in frontend |
| `sales` | Leads, klanten, offertes en opvolging | Salesdata lezen/schrijven, geen developer/payment-admin acties |
| `support` | Klantondersteuning | Klant-, website-, project- en bestandsinzage; beperkte supportupdates |
| `developer` | Technische readiness/debug | Technische reads en testdata; geen betaalmutaties of klantcommunicatie |
| `customer` | Klantportaal | Alleen eigen klantdata via `customer_id`, `profile_id` of `auth_user_id` |
| `demo_user` | Demo/salespresentatie | Alleen demo records, nooit productieklantdata |

## Ownership Helpers

Het latere SQL-plan moet helpers gebruiken die recursie vermijden. De eerdere RLS-recursion test heeft bewezen dat role/profile helpers zorgvuldig moeten zijn.

Voorkeursstrategie:

- `current_profile_id()` via `profiles.auth_user_id = auth.uid()`.
- `current_app_role()` via SECURITY DEFINER of veilige JWT claim fallback, zonder recursieve profile policies.
- `has_app_role(text[])` voor interne rollen.
- `owns_customer(uuid)` via `customers.auth_user_id = auth.uid()` of `customers.profile_id = current_profile_id()`.
- Parent ownership voor child tables:
  - `quote_lines -> quotes.customer_id`
  - `invoice_lines -> invoices.customer_id`
  - messages/notifications/files via `customer_id`.

Geen productie-autorisatie op basis van alleen e-mailadres.

## Conceptschema Per Tabel

### `profiles`

- Doel: brug tussen Supabase Auth, rollen en platformprofiel.
- Primaire velden: `id`, `auth_user_id`, `name`, `email`, `phone`, `role`, `status`, `is_demo`, `environment`, `metadata`.
- Foreign keys: `auth_user_id -> auth.users.id`.
- Statusvelden: `status` (`active`, `pending`, `disabled`, `archived`), `role`.
- Timestamps: `created_at`, `updated_at`, `last_login_at`.
- Soft-delete/archief: `status = archived` en optioneel `archived_at`; geen hard delete als er audit/klantdata bestaat.
- Ownership: eigen profiel via `auth_user_id`; interne rollen beheren.
- Lezen/schrijven:
  - `super_admin/admin`: read/write.
  - `developer`: read technical, geen klantstatusmutaties.
  - `customer`: eigen profiel read, beperkte self-update later.
  - `sales/support/demo_user`: geen directe productieprofile writes.

### `customers`

- Doel: centrale klantbron.
- Primaire velden: `id`, `profile_id`, `auth_user_id`, `name`, `company`, `email`, `phone`, `website`, `package`, `status`, `customer_since`, `portal_status`, `notes`, `is_demo`, `environment`, `metadata`.
- Foreign keys: `profile_id -> profiles.id`, `auth_user_id -> auth.users.id`.
- Statusvelden: `status` (`active`, `onboarding`, `paused`, `archived`), `portal_status`.
- Timestamps: `created_at`, `updated_at`, `archived_at`, `deleted_at`.
- Soft-delete/archief: status/archived_at; geen hard delete vanuit CRM.
- Ownership: `auth_user_id` of `profile_id`.
- Lezen/schrijven:
  - `super_admin/admin`: read/write/archive.
  - `sales`: read/create/update salesvelden.
  - `support/developer`: read.
  - `customer`: eigen klantrecord read, sanitized.
  - `demo_user`: alleen demo customers.

### `websites`

- Doel: websitebeheer, operations, health en hostingmetadata.
- Primaire velden: `id`, `customer_id`, `profile_id`, `name`, `domain`, `live_url`, `staging_url`, `github_repo_url`, `github_branch`, `netlify_project_name`, `netlify_site_id`, `status`, `hosting_package`, `care_package`, `ssl_status`, `hosting_status`, `uptime_status`, `dns_status`, `performance_score`, `seo_score`, `mobile_score`, `desktop_score`, `monitor_enabled`, `notes`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `profile_id -> profiles.id`.
- Statusvelden: `status`, `ssl_status`, `hosting_status`, `uptime_status`, `dns_status`.
- Timestamps: `created_at`, `updated_at`, `last_deploy_at`, `last_checked_at`, `last_uptime_check`, `ssl_expires_at`, `archived_at`.
- Soft-delete/archief: `status = archived` of `archived_at`.
- Ownership: via `customer_id`.
- Lezen/schrijven:
  - `super_admin/admin`: read/write/archive.
  - `developer`: technical read/update voor health/opsvelden.
  - `sales/support`: read beperkte velden.
  - `customer`: eigen websitekaart sanitized read.
  - `demo_user`: alleen demo websites.

### `projects`

- Doel: onboarding en projectmanagement.
- Primaire velden: `id`, `customer_id`, `website_id`, `name`, `type`, `status`, `phase`, `progress`, `start_date`, `deadline`, `checklist`, `tasks`, `timeline`, `notes`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `website_id -> websites.id`.
- Statusvelden: `status`, `phase`, `progress`.
- Timestamps: `created_at`, `updated_at`, `last_update_at`, `archived_at`.
- Soft-delete/archief: `status = archived` of `archived_at`.
- Ownership: via `customer_id`.
- Lezen/schrijven:
  - `super_admin/admin`: read/write/archive.
  - `support`: read en beperkte supportstatus updates.
  - `sales/developer`: read.
  - `customer`: eigen projectstatus sanitized read; geen interne checklist/notities.
  - `demo_user`: alleen demo projects.

### `quotes`

- Doel: offertes, status en offerte-naar-factuur flow.
- Primaire velden: `id`, `customer_id`, `website_id`, `project_id`, `quote_number`, `type`, `title`, `status`, `quote_date`, `valid_until`, `subtotal`, `vat`, `total`, `converted_to_invoice_id`, `accepted_at`, `proposal`, `notes`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `website_id -> websites.id`, `project_id -> projects.id`, `converted_to_invoice_id -> invoices.id`.
- Statusvelden: `status` (`draft`, `sent`, `accepted`, `rejected`, `expired`, `archived`).
- Timestamps: `created_at`, `updated_at`, `sent_at`, `accepted_at`, `archived_at`.
- Soft-delete/archief: `archived_at`/`deleted_at`.
- Ownership: via `customer_id`.
- Lezen/schrijven:
  - `super_admin/admin`: all.
  - `sales`: create/update/send/archive binnen salesproces.
  - `support/developer`: read.
  - `customer`: eigen offertes read; acceptatie later via veilige action route.
  - `demo_user`: alleen demo quotes.

### `quote_lines`

- Doel: offerte regels.
- Primaire velden: `id`, `quote_id`, `description`, `quantity`, `unit_price`, `vat_rate`, `line_total`, `position`, `metadata`.
- Foreign keys: `quote_id -> quotes.id`.
- Statusvelden: geen eigen status; erft van quote.
- Timestamps: `created_at`, `updated_at`.
- Soft-delete/archief: bij voorkeur via parent quote; optioneel `deleted_at`.
- Ownership: via parent `quotes.customer_id`.
- Lezen/schrijven: dezelfde parent-grens als `quotes`.

### `invoices`

- Doel: facturen, betaalstatus, PDF en payment metadata.
- Primaire velden: `id`, `customer_id`, `website_id`, `project_id`, `source_quote_id`, `subscription_id`, `invoice_number`, `type`, `title`, `status`, `invoice_date`, `due_date`, `paid_at`, `subtotal`, `vat`, `total`, `payment_link`, `pdf_file_path`, `mollie_payment_id`, `mollie_checkout_url`, `mollie_payment_status`, `email_sent_at`, `payment_reminder_sent_at`, `paid_email_sent_at`, `expired_email_sent_at`, `email_last_error`, `notes`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `website_id -> websites.id`, `project_id -> projects.id`, `source_quote_id -> quotes.id`, `subscription_id -> subscriptions.id`.
- Statusvelden: `status` (`draft`, `sent`, `paid`, `expired`, `canceled`, `failed`, `archived`), `mollie_payment_status`.
- Timestamps: `created_at`, `updated_at`, `paid_at`, `archived_at`.
- Soft-delete/archief: `archived_at`/`deleted_at`.
- Ownership: via `customer_id`.
- Lezen/schrijven:
  - `super_admin/admin`: all.
  - `sales/support/developer`: read, geen mark-paid/payment mutaties.
  - `customer`: eigen facturen sanitized read; download/betaal via gecontroleerde endpoint.
  - `demo_user`: alleen demo invoices.

### `invoice_lines`

- Doel: factuurregels.
- Primaire velden: `id`, `invoice_id`, `description`, `quantity`, `unit_price`, `vat_rate`, `line_total`, `position`, `metadata`.
- Foreign keys: `invoice_id -> invoices.id`.
- Statusvelden: geen eigen status; erft van invoice.
- Timestamps: `created_at`, `updated_at`.
- Soft-delete/archief: via parent invoice; optioneel `deleted_at`.
- Ownership: via parent `invoices.customer_id`.
- Lezen/schrijven: dezelfde parent-grens als `invoices`.

### `subscriptions`

- Doel: onderhoudsabonnementen, recurring revenue en latere Mollie subscriptions.
- Primaire velden: `id`, `customer_id`, `website_id`, `project_id`, `plan`, `status`, `billing_cycle`, `price_ex_vat`, `vat_rate`, `total_incl_vat`, `start_date`, `next_invoice_date`, `last_invoice_id`, `last_invoice_date`, `auto_invoice_enabled`, `mollie_customer_id`, `mollie_subscription_id`, `mollie_mandate_id`, `mandate_status`, `mandate_checkout_url`, `retry_status`, `subscription_risk_level`, `internal_notes`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `website_id -> websites.id`, `project_id -> projects.id`, `last_invoice_id -> invoices.id`.
- Statusvelden: `status`, `mandate_status`, `retry_status`, `subscription_risk_level`.
- Timestamps: `created_at`, `updated_at`, `last_payment_at`, `next_payment_at`, `canceled_at`, `paused_at`, `resumed_at`, `archived_at`.
- Soft-delete/archief: `archived_at`; opzegging via `canceled_at`.
- Ownership: via `customer_id`.
- Lezen/schrijven:
  - `super_admin/admin`: all.
  - `sales/support/developer`: read beperkte/sanitized.
  - `customer`: eigen abonnementstatus read; geen beheeracties.
  - `demo_user`: alleen demo subscriptions.

### `files`

- Doel: bestandsmetadata en Storage-koppeling.
- Primaire velden: `id`, `customer_id`, `website_id`, `project_id`, `name`, `file_type`, `category`, `location`, `storage_path`, `status`, `is_client_visible`, `notes`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `website_id -> websites.id`, `project_id -> projects.id`.
- Statusvelden: `status` (`active`, `in_review`, `approved`, `archived`), `is_client_visible`.
- Timestamps: `created_at`, `updated_at`, `archived_at`.
- Soft-delete/archief: `status = archived`.
- Ownership: via `customer_id`.
- Lezen/schrijven:
  - `super_admin/admin`: all.
  - `support/developer`: read/update support/technical metadata.
  - `sales`: read gekoppelde salesbestanden.
  - `customer`: eigen files read alleen als klantveilig/visible; download via signed URL.
  - `demo_user`: demo files.

### `change_requests`

- Doel: wijzigingsverzoeken en uploadmetadata.
- Primaire velden: `id`, `customer_id`, `auth_user_id`, `website_id`, `project_id`, contactvelden, `title`, `description`, `category`, `priority`, `status`, `files`, `source`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `auth_user_id -> auth.users.id`, `website_id -> websites.id`, `project_id -> projects.id`.
- Statusvelden: `status` (`nieuw`, `in_behandeling`, `wacht_op_klant`, `afgerond`, `archived`), `priority`, `category`.
- Timestamps: `created_at`, `updated_at`, `completed_at`, `archived_at`.
- Soft-delete/archief: `archived_at`.
- Ownership: `auth_user_id` en/of `customer_id`.
- Lezen/schrijven:
  - `super_admin/admin`: all.
  - `support`: read/update status.
  - `sales/developer`: read.
  - `customer`: eigen verzoeken read/create; geen statusmutaties. Create/read moet zowel `auth_user_id = auth.uid()` als ownership van `customer_id` afdwingen wanneer `customer_id` aanwezig is.
  - `demo_user`: demo/source demo.

### `leads`

- Doel: publieke aanvragen, Leadfinder prospects en sales pipeline.
- Primaire velden: `id`, `source`, `company`, `name`, `email`, `phone`, `branch`, `region`, `website_url`, `website_status`, `lead_score`, `call_status`, `follow_up_date`, `status`, `converted_customer_id`, `notes`, `metadata`.
- Foreign keys: `converted_customer_id -> customers.id`.
- Statusvelden: `status`, `website_status`, `call_status`, `lead_score`.
- Timestamps: `created_at`, `updated_at`, `converted_at`, `archived_at`.
- Soft-delete/archief: `archived_at`.
- Ownership: intern; geen customer ownership.
- Lezen/schrijven:
  - `super_admin/admin/sales`: read/write.
  - `support/developer`: read beperkt indien nodig.
  - `customer/demo_user`: geen productie-leads.

### `crm_tasks`

- Doel: interne opvolging, taken en sales/support workflow.
- Primaire velden: `id`, `customer_id`, `website_id`, `project_id`, `quote_id`, `invoice_id`, `subscription_id`, `lead_id`, `assigned_profile_id`, `title`, `status`, `priority`, `due_date`, `notes`, `metadata`.
- Foreign keys: optioneel naar `customers`, `websites`, `projects`, `quotes`, `invoices`, `subscriptions`, `leads`, `profiles`.
- Statusvelden: `status`, `priority`.
- Timestamps: `created_at`, `updated_at`, `completed_at`, `archived_at`.
- Soft-delete/archief: `archived_at`.
- Ownership: intern; optioneel assigned profile.
- Lezen/schrijven:
  - `super_admin/admin`: all.
  - `sales`: sales/lead/customer taken.
  - `support`: support/project taken.
  - `developer`: read technical tasks.
  - `customer/demo_user`: geen interne taken.

### `client_portal_messages`

- Doel: klantportaalberichten.
- Primaire velden: `id`, `customer_id`, `profile_id`, `sender_profile_id`, `sender_type`, `subject`, `body`, `status`, `read_at`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `profile_id -> profiles.id`, `sender_profile_id -> profiles.id`.
- Statusvelden: `status` (`open`, `sent`, `read`, `archived`).
- Timestamps: `created_at`, `updated_at`, `read_at`, `archived_at`.
- Soft-delete/archief: `archived_at`.
- Ownership: via `customer_id`.
- Lezen/schrijven:
  - `super_admin/admin/support`: read/write.
  - `customer`: eigen messages read/create.
  - `sales/developer`: geen standaard toegang behalve read na expliciete rolreview.

### `client_portal_notifications`

- Doel: klantvriendelijke notificaties.
- Primaire velden: `id`, `customer_id`, `profile_id`, `type`, `title`, `message`, `entity_type`, `entity_id`, `status`, `read_at`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `profile_id -> profiles.id`.
- Statusvelden: `status` (`unread`, `read`, `archived`), `type`.
- Timestamps: `created_at`, `updated_at`, `read_at`, `archived_at`.
- Soft-delete/archief: `archived_at`.
- Ownership: via `customer_id`.
- Lezen/schrijven:
  - `super_admin/admin/support`: generate/manage.
  - `customer`: eigen notifications read/update read-status.
  - `sales/developer`: geen standaard toegang.

### `ai_drafts`

- Doel: AI Website Wizard intake en conceptoutput.
- Primaire velden: `id`, `customer_id`, `website_id`, `project_id`, `draft_type`, `status`, `input_snapshot`, `output_snapshot`, `provider`, `reviewed_by`, `approved_at`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `website_id -> websites.id`, `project_id -> projects.id`, `reviewed_by -> profiles.id`.
- Statusvelden: `status` (`draft`, `generated`, `reviewed`, `approved`, `archived`), `provider`.
- Timestamps: `created_at`, `updated_at`, `generated_at`, `approved_at`, `archived_at`.
- Soft-delete/archief: `archived_at`.
- Ownership: internal/admin; klantzicht alleen na expliciete publicatie.
- Lezen/schrijven:
  - `super_admin/admin/developer`: read/write.
  - `sales/support`: read waar relevant, geen provider execution.
  - `customer`: geen directe toegang in eerste liveversie.

### `ai_assistant_drafts`

- Doel: AI Admin Assistant concepten voor CRM, sales, offertes, SEO en klantberichten.
- Primaire velden: `id`, `customer_id`, `entity_type`, `entity_id`, `action_type`, `status`, `input_summary`, `output`, `provider`, `reviewed_by`, `metadata`.
- Foreign keys: `customer_id -> customers.id`, `reviewed_by -> profiles.id`.
- Statusvelden: `status` (`draft`, `generated`, `reviewed`, `sent`, `archived`), `action_type`.
- Timestamps: `created_at`, `updated_at`, `reviewed_at`, `sent_at`, `archived_at`.
- Soft-delete/archief: `archived_at`.
- Ownership: internal/admin.
- Lezen/schrijven:
  - `super_admin/admin/developer`: read/write.
  - `sales/support`: read/write voor eigen workflow na review.
  - `customer`: geen directe toegang.

### `audit_logs`

- Doel: security-, compliance- en release-audit.
- Primaire velden: `id`, `actor_profile_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `result`, `ip_hash`, `user_agent_hash`, `metadata`, `created_at`.
- Foreign keys: `actor_profile_id -> profiles.id`.
- Statusvelden: `result` (`success`, `failed`, `blocked`, `approved`, `rejected`).
- Timestamps: `created_at`; geen updatepad.
- Soft-delete/archief: niet normaal verwijderen; retentiebeleid later bepalen.
- Ownership: security/admin-only.
- Lezen/schrijven:
  - `super_admin/admin`: read.
  - server-side functions: insert.
  - `developer`: read technical subset indien nodig.
  - `sales/support/customer/demo_user`: geen toegang.

## RLS Policy Plan Per Rol

### `super_admin`

- Volledige toegang tot alle tabellen.
- Alle mutaties worden in `audit_logs` gelogd.
- Gebruik beperken tot eigenaar/noodbeheer.

### `admin`

- Beheert klanten, websites, projecten, offertes, facturen, abonnementen, bestanden, wijzigingsverzoeken, leads, taken en klantportaalcommunicatie.
- Geen service role in browser.
- Gevoelige acties zoals mark-paid, export, migratie, invite en delete/archive loggen.

### `sales`

- Lezen/schrijven op `leads`, salesvelden op `customers`, `quotes` en relevante `crm_tasks`.
- Beperkte read op invoices/subscriptions voor context.
- Geen developer tools, settings, storage policies, RLS, mark-paid of subscription billing acties.

### `support`

- Read op klanten, websites, projecten, bestanden, wijzigingsverzoeken en beperkte factuurcontext.
- Beperkte update op supportstatussen/taken/messages.
- Geen verkoopbedragen wijzigen, geen betaalstatussen muteren, geen migraties.

### `developer`

- Read op technische readiness, schema/debug, testdata en healthmetadata.
- Geen klantcommunicatie versturen, geen betaalmutaties, geen productie-migratie zonder approval.
- AI-drafts technisch inspecteren zonder klantzicht/publicatie.

### `customer`

- Alleen eigen records:
  - eigen `customers`
  - eigen `websites`
  - eigen `projects`
  - eigen `quotes`/`quote_lines`
  - eigen `invoices`/`invoice_lines`
  - eigen `subscriptions`
  - eigen klantveilige `files`
  - eigen `change_requests`
  - eigen `client_portal_messages`
  - eigen `client_portal_notifications`
- Geen interne notities, retrydata, provider IDs, audit logs, CRM tasks of AI drafts.

### `demo_user`

- Alleen records met `is_demo = true` of `environment = 'demo'`.
- Geen productiedata, geen echte klantrecords, geen betaalmutaties.

## Klantisolatie

Voor alle klantgebonden tabellen geldt:

- Records moeten een `customer_id` hebben waar dat logisch is.
- `customer` rol leest alleen wanneer `owns_customer(customer_id)` true is.
- Child records erven ownership via parent table.
- Cross-customer access moet in Supabase testomgeving bewezen worden met Customer A/B.
- App-laag sanitizing blijft verplicht, maar RLS is de harde grens.

## Audit Logging Plan

Loggen als security/audit-event:

- login/logout failures en role mismatch.
- profile role/status wijzigingen.
- customer create/update/archive/reactivate.
- quote send/accept/archive.
- invoice send/mark-paid/mark-expired/archive.
- subscription activate/pause/cancel/reactivate/retry.
- file signed-url requests voor gevoelige bestanden.
- change_request statuswijzigingen.
- exports/imports/backups/restores.
- deployment blocker approvals/rejections.
- production provider switches.
- AI provider calls wanneer later actief.

Niet onnodig loggen:

- volledige berichtinhoud.
- volledige AI prompt/output als die persoonsgegevens of bedrijfsgevoelige info bevat.
- betaalprovider secrets/tokens.
- Storage signed URLs.
- ruwe wachtwoorden of reset tokens.
- volledige IP/user-agent; gebruik hash of minimale metadata.

## AI Data En Privacy Plan

AI-data blijft voorlopig local/mock. Voor productie:

- Alleen noodzakelijke klantcontext naar AI-provider.
- Maskeren waar mogelijk:
  - prive telefoonnummers.
  - persoonlijke e-mailadressen tenzij nodig voor taak.
  - betaalgegevens, Mollie IDs, factuur-PDF paths.
  - interne notities die niet nodig zijn voor output.
- Klanttoestemming/privacyvoorwaarden moeten expliciet beschrijven wanneer AI gebruikt kan worden.
- AI-output blijft `draft` totdat een medewerker reviewt.
- Automatisch verzenden/publiceren is niet toegestaan in eerste AI-livefase.
- AI provider calls moeten server-side verlopen met rate limiting en audit/event logging.

## Open Beslissingen Voor Latere SQL-Fase

- Exacte enum/check constraints per statusveld.
- JSONB versus genormaliseerde tabellen voor project checklist/taken/timeline.
- Of `activity_logs` en `audit_logs` fysiek strikt gescheiden blijven of via aparte views worden aangeboden.
- Tokenized publieke offerte/betaallinks versus Auth-only klantportaal.
- Retentiebeleid voor audit logs, AI drafts en leaddata.
- Storage bucketnamen en policies voor `files`, factuur-PDFs en wijzigingsverzoekuploads.

## Release Gate

Dit plan mag pas naar SQL worden vertaald wanneer:

1. Fase 23 plan is gereviewd.
2. Canonical schema patch is goedgekeurd.
3. Supabase testomgeving beschikbaar is.
4. Auth/users/profiles testdata klaarstaat.
5. Customer A/B isolation testplan is herbevestigd.
6. Rollback en backup evidence klaar zijn.
