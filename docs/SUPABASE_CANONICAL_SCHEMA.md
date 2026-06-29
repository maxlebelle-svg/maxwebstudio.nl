# Supabase Canonical Schema

Status: Fase 13.0 database consolidation.  
Dit document beschrijft de definitieve doelarchitectuur. Het voert geen SQL uit.

## Canonical Datalijn

`profiles -> customers -> websites -> projects -> quotes -> quote_lines -> invoices -> invoice_lines -> subscriptions`

Ondersteunende tabellen:

- `files`
- `settings`
- `demo_emails`
- `activity_logs`
- `import_logs`
- `change_requests`

Aanvullende productietabellen uit Fase 21 readiness:

- `leads`
- `crm_tasks`
- `client_portal_messages`
- `client_portal_notifications`
- `ai_drafts`
- `ai_assistant_drafts`
- `audit_logs`

Legacy tabellen:

- `customer_websites`
- `customer_invoices`
- `customer_subscriptions`

## Tabellen

### `profiles`

Status: canonical.

Doel:

- Auth-profiel en rollenbrug.
- Koppeling naar `auth.users`.

Belangrijkste kolommen:

- `id`
- `auth_user_id`
- `name`
- `email`
- `phone`
- `role`
- `status`
- `is_demo`
- `environment`
- `metadata`
- `created_at`
- `updated_at`

Relaties:

- `auth_user_id` verwijst naar `auth.users(id)`.
- `customers.profile_id` kan naar `profiles.id` verwijzen.

Legacy velden:

- `company`, `website`, `package`, `customer_since` uit `docs/supabase-client-portal.sql` horen niet primair op `profiles`; deze horen in `customers`.

Afhankelijke modules:

- Auth
- Rollen
- RLS
- Admin-login

### `customers`

Status: canonical.

Doel:

- De centrale klantbron.
- Bedrijfsgegevens, contactgegevens, pakket/status en portaalstatus.

Belangrijkste kolommen:

- `id`
- `profile_id`
- `auth_user_id`
- `name`
- `company`
- `email`
- `phone`
- `website`
- `package`
- `status`
- `customer_since`
- `portal_status`
- `notes`
- `is_demo`
- `environment`
- `metadata`
- `created_at`
- `updated_at`

Relaties:

- `profile_id -> profiles.id`
- `auth_user_id -> auth.users.id`
- parent voor websites, projecten, offertes, facturen, abonnementen en bestanden.

Legacy velden:

- Klantvelden uit legacy `profiles` worden hierheen gemapt.

Afhankelijke modules:

- CRM
- klantportaal
- websites
- projecten
- offertes
- facturen
- abonnementen
- bestanden

### `websites`

Status: canonical.

Doel:

- Website Operations Center en klantwebsitegegevens.

Belangrijkste kolommen:

- `id`
- `customer_id`
- `profile_id`
- `name`
- `domain`
- `live_url`
- `staging_url`
- `github_repo_url`
- `github_branch`
- `netlify_project_name`
- `netlify_site_id`
- `status`
- `hosting_package`
- `care_package`
- `ssl_status`
- `last_deploy_at`
- `last_update_at`
- `notes`
- `metadata`

Relaties:

- `customer_id -> customers.id`
- `profile_id -> profiles.id`

Legacy velden opnemen:

- `hosting_status`
- `last_checked_at`
- `uptime_status`
- `ssl_expires_at`
- `performance_score`
- `seo_score`
- `mobile_score`
- `desktop_score`
- `last_uptime_check`
- `dns_status`
- `monitor_enabled`

Afhankelijke modules:

- Website Management
- Website Health
- klantportaal websitekaart
- projecten
- abonnementen

### `projects`

Status: canonical.

Doel:

- Onboarding en projectmanagement.

Belangrijkste kolommen:

- `id`
- `customer_id`
- `website_id`
- `name`
- `type`
- `status`
- `phase`
- `progress`
- `start_date`
- `deadline`
- `checklist`
- `tasks`
- `timeline`
- `notes`
- `metadata`

Relaties:

- `customer_id -> customers.id`
- `website_id -> websites.id`

Legacy velden:

- Geen aparte legacy-projecttabel gevonden.

Afhankelijke modules:

- Projecten
- Onboarding
- klantportaal projectstatus
- offertes/facturen via projectkoppeling

### `quotes`

Status: canonical met pending aanvullende migratievelden.

Doel:

- Offertes en offerte-statussen.

Belangrijkste kolommen:

- `id`
- `customer_id`
- `website_id`
- `project_id`
- `quote_number`
- `type`
- `title`
- `status`
- `quote_date`
- `valid_until`
- `subtotal`
- `vat`
- `total`
- `converted_to_invoice_id`
- `proposal`
- `notes`
- `metadata`

Relaties:

- `customer_id -> customers.id`
- `website_id -> websites.id`
- `project_id -> projects.id`
- `converted_to_invoice_id -> invoices.id`

Legacy/Fase 12 velden opnemen:

- `external_id`
- `customer_external_id`
- `website_external_id`
- `project_external_id`
- `accepted_at`
- `demo_quote_link`
- `deleted_at`
- eventueel `internal_notes` als aparte admin-only kolom of in `notes`

Afhankelijke modules:

- Offertes
- offerte naar factuur
- klantportaal offertes

### `quote_lines`

Status: canonical met pending veldharmonisatie.

Doel:

- Offertregels.

Belangrijkste kolommen:

- `id`
- `quote_id`
- `description`
- `quantity`
- `unit_price`
- `vat_rate`
- `line_total`
- `position`
- `metadata`

Relaties:

- `quote_id -> quotes.id`

Legacy/Fase 12 velden opnemen:

- `external_id`
- eventueel `subtotal`, `vat_amount`, `total` of juist blijven bij `line_total`; keuze nog te bevestigen.

### `invoices`

Status: canonical met pending payment/e-mail migratievelden.

Doel:

- Facturen, betaalstatus en betaal-/PDF-koppeling.

Belangrijkste kolommen:

- `id`
- `customer_id`
- `website_id`
- `project_id`
- `source_quote_id`
- `subscription_id`
- `invoice_number`
- `type`
- `title`
- `status`
- `invoice_date`
- `due_date`
- `paid_at`
- `subtotal`
- `vat`
- `total`
- `payment_link`
- `pdf_file_path`
- `notes`
- `metadata`

Relaties:

- `customer_id -> customers.id`
- `website_id -> websites.id`
- `project_id -> projects.id`
- `source_quote_id -> quotes.id`
- `subscription_id -> subscriptions.id`

Legacy velden opnemen:

- `mollie_payment_id`
- `mollie_checkout_url`
- `mollie_payment_status`
- `mollie_payment_created_at`
- `mollie_payment_expires_at`
- `email_sent_at`
- `payment_reminder_sent_at`
- `paid_email_sent_at`
- `expired_email_sent_at`
- `email_last_error`
- `demo_payment_link`
- `source_quote_number`
- `deleted_at`
- `payment_status` als apart veld of statusmapping; keuze nog te bevestigen.

Afhankelijke modules:

- Facturen
- demo betaalpagina
- Mollie betaalverzoeken
- Resend factuurmails
- klantportaal facturen

### `invoice_lines`

Status: canonical met pending veldharmonisatie.

Doel:

- Factuurregels.

Belangrijkste kolommen:

- `id`
- `invoice_id`
- `description`
- `quantity`
- `unit_price`
- `vat_rate`
- `line_total`
- `position`
- `metadata`

Relaties:

- `invoice_id -> invoices.id`

Legacy/Fase 12 velden opnemen:

- `external_id`
- eventueel `line_subtotal`, `line_vat`, `line_total` als gekozen detailmodel.

### `subscriptions`

Status: canonical met pending Mollie/retry migratievelden.

Doel:

- Onderhoudsabonnementen en recurring revenue.

Belangrijkste kolommen:

- `id`
- `customer_id`
- `website_id`
- `project_id`
- `plan`
- `status`
- `billing_cycle`
- `price_ex_vat`
- `vat_rate`
- `total_incl_vat`
- `start_date`
- `next_invoice_date`
- `last_invoice_id`
- `last_invoice_date`
- `auto_invoice_enabled`
- `metadata`

Relaties:

- `customer_id -> customers.id`
- `website_id -> websites.id`
- `project_id -> projects.id`
- `last_invoice_id -> invoices.id`

Legacy velden opnemen:

- `mollie_customer_id`
- `mollie_subscription_id`
- `mollie_subscription_status`
- `mollie_mandate_id`
- `last_payment_at`
- `next_payment_at`
- `canceled_at`
- `paused_at`
- `mandate_status`
- `mandate_reference`
- `mandate_checkout_url`
- `mandate_payment_id`
- `mandate_payment_status`
- `subscription_synced_at`
- `webhook_last_event`
- `webhook_last_received_at`
- `admin_action_last_type`
- `admin_action_last_at`
- `admin_action_last_error`
- `cancellation_reason`
- `cancellation_requested_at`
- `resumed_at`
- retry/riskvelden uit `docs/supabase-subscription-retries.sql`
- `subscription_invoice_sequence`
- `next_auto_invoice_run`
- `invoice_generation_log`
- `internal_notes`
- `deleted_at`

Afhankelijke modules:

- Onderhoud
- recurring billing
- dashboard MRR/ARR
- Mollie Subscriptions
- klantportaal abonnementen

### `files`

Status: canonical.

Doel:

- Bestandsmetadata en klant/project/websitekoppeling.

Belangrijkste kolommen:

- `id`
- `customer_id`
- `website_id`
- `project_id`
- `name`
- `file_type`
- `category`
- `location`
- `storage_path`
- `status`
- `notes`
- `metadata`

Relaties:

- `customer_id -> customers.id`
- `website_id -> websites.id`
- `project_id -> projects.id`

Legacy velden:

- Geen aparte legacy-bestandstabel gevonden.

### `settings`

Status: canonical.

Doel:

- Workspace-instellingen zoals factuurprefix, betaaltermijn en btw.

Belangrijkste kolommen:

- `workspace_key`
- `company_name`
- `email`
- `phone`
- `invoice_prefix`
- `quote_prefix`
- `default_vat_rate`
- `payment_term_days`
- `metadata`

### `demo_emails`

Status: canonical demo/support.

Doel:

- Demo-mailbox voor verkoop/demo en klantreis-testen.

### `activity_logs`

Status: canonical.

Doel:

- Audit trail voor acties, migratie en toekomstige security-events.

### `import_logs`

Status: canonical.

Doel:

- JSON backup/import/restore logs.

### `change_requests`

Status: canonical-supporting, los van CRM-kern.

Doel:

- Publieke wijzigingsverzoeken en uploads.

Relatie:

- Later koppelen aan `customers.id` en/of `auth_user_id`.

## Statusmatrix

| Tabel | Status |
|---|---|
| `profiles` | canonical |
| `customers` | canonical |
| `websites` | canonical, mist legacy healthvelden |
| `projects` | canonical |
| `quotes` | canonical, pending aanvullende migratievelden |
| `quote_lines` | canonical, pending veldharmonisatie |
| `invoices` | canonical, pending payment/e-mail velden |
| `invoice_lines` | canonical, pending veldharmonisatie |
| `subscriptions` | canonical, pending Mollie/retry velden |
| `files` | canonical |
| `settings` | canonical |
| `demo_emails` | canonical demo |
| `activity_logs` | canonical |
| `import_logs` | canonical |
| `change_requests` | canonical-supporting |
| `leads` | Fase 21 aanvullend |
| `crm_tasks` | Fase 21 aanvullend |
| `client_portal_messages` | Fase 21 aanvullend |
| `client_portal_notifications` | Fase 21 aanvullend |
| `ai_drafts` | Fase 21 aanvullend |
| `ai_assistant_drafts` | Fase 21 aanvullend |
| `audit_logs` | Fase 21 aanvullend |
| `customer_websites` | legacy |
| `customer_invoices` | legacy |
| `customer_subscriptions` | legacy |
