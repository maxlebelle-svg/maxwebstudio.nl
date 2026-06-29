# Supabase Legacy Mapping

Status: Fase 13.0 database consolidation.  
Doel: vastleggen hoe de oude `customer_*` lijn wordt gemapt naar de canonical platformlijn.  
Belangrijk: dit document voert geen SQL uit en bevat geen destructieve migraties.

## Canonical Richting

De definitieve datalijn voor productie wordt:

`profiles -> customers -> websites -> projects -> quotes -> invoices -> subscriptions`

Waarbij:

- `profiles` alleen Auth/rollen/profielbasis draagt.
- `customers` de zakelijke klantbron wordt.
- `websites`, `projects`, `quotes`, `invoices` en `subscriptions` de operationele modules vormen.
- Oude `customer_websites`, `customer_invoices` en `customer_subscriptions` worden legacy totdat hun nuttige velden zijn overgenomen.

## Legacy Tabel: `customer_websites`

Bronnen:

- `docs/supabase-client-portal.sql`
- `docs/supabase-website-health.sql`

Canonical doel:

- `public.websites`

### Overlap Met `websites`

| Legacy veld | Canonical veld | Opmerking |
|---|---|---|
| `id` | `id` | Alleen behouden wanneer data migreert. |
| `profile_id` | `profile_id` of via `customer_id` | Canonical websites hangen primair aan `customers.customer_id`. |
| `name` | `name` | Directe overlap. |
| `domain` | `domain` | Directe overlap. |
| `live_url` | `live_url` | Directe overlap. |
| `staging_url` | `staging_url` | Directe overlap. |
| `netlify_project_name` | `netlify_project_name` | Directe overlap. |
| `netlify_site_id` | `netlify_site_id` | Directe overlap. |
| `github_repo_url` | `github_repo_url` | Directe overlap. |
| `github_branch` | `github_branch` | Directe overlap. |
| `status` | `status` | Waarden harmoniseren: `live/active/online`. |
| `ssl_status` | `ssl_status` | Directe overlap. |
| `last_deploy_at` | `last_deploy_at` | Directe overlap. |
| `notes` | `notes` | Admin-only; niet tonen in klantportaal. |
| `created_at` | `created_at` | Directe overlap. |
| `updated_at` | `updated_at` | Directe overlap. |

### Ontbreekt In `websites` En Moet Mee

| Legacy veld | Aanbevolen canonical veld | Reden |
|---|---|---|
| `customer_auth_user_id` | Niet op `websites`; afleiden via `customers.auth_user_id` | Voorkomt dubbele Auth-koppeling per website. |
| `hosting_status` | `hosting_status` toevoegen aan `websites` | Nodig voor Website Operations en klantstatus. |
| `last_checked_at` | `last_checked_at` toevoegen aan `websites` | Nodig voor health monitoring. |
| `uptime_status` | `uptime_status` toevoegen aan `websites` | Komt uit website health. |
| `ssl_expires_at` | `ssl_expires_at` toevoegen aan `websites` | Komt uit website health. |
| `performance_score` | `performance_score` toevoegen aan `websites` | Komt uit website health. |
| `seo_score` | `seo_score` toevoegen aan `websites` | Komt uit website health. |
| `mobile_score` | `mobile_score` toevoegen aan `websites` | Komt uit website health. |
| `desktop_score` | `desktop_score` toevoegen aan `websites` | Komt uit website health. |
| `last_uptime_check` | `last_uptime_check` toevoegen aan `websites` | Komt uit website health. |
| `dns_status` | `dns_status` toevoegen aan `websites` | Komt uit website health. |
| `monitor_enabled` | `monitor_enabled` toevoegen aan `websites` | Komt uit website health. |

### Legacy Blijft

- Directe `customer_auth_user_id` op website-records.
- RLS die website-eigenaarschap direct op `customer_websites.customer_auth_user_id` checkt.

### Aanbevolen Migratiepad

1. Maak in `websites` ontbrekende health/hostingkolommen via veilige `ADD COLUMN IF NOT EXISTS`.
2. Koppel legacy `profile_id` naar canonical `customers.profile_id`.
3. Migreer records naar `websites.customer_id`.
4. Laat klanttoegang via `customers.auth_user_id` of `customers.profile_id` lopen.
5. Markeer `customer_websites` als legacy/readonly.

## Legacy Tabel: `customer_invoices`

Bronnen:

- `docs/supabase-billing.sql`
- `docs/supabase-mollie-payments.sql`
- `docs/supabase-invoice-emails.sql`
- `docs/supabase-invoice-storage.sql`

Canonical doel:

- `public.invoices`

### Overlap Met `invoices`

| Legacy veld | Canonical veld | Opmerking |
|---|---|---|
| `id` | `id` | Alleen behouden wanneer data migreert. |
| `profile_id` | via `customers.profile_id` -> `invoices.customer_id` | Canonical facturen hangen aan `customers`. |
| `invoice_number` | `invoice_number` | Directe overlap. |
| `title` | `title` | Directe overlap. |
| `amount` | `total` | Legacy gebruikt enkel bedrag; canonical splitst subtotal/vat/total. |
| `status` | `status` | Harmoniseren naar `draft/sent/paid/expired/canceled/failed`. |
| `due_date` | `due_date` | Directe overlap. |
| `paid_at` | `paid_at` | Directe overlap. |
| `pdf_file_path` | `pdf_file_path` | Directe overlap. |
| `mollie_payment_id` | `mollie_payment_id` toevoegen of behouden op `invoices` | Nodig voor Mollie payment webhook. |
| `notes` | `notes` of `internal_notes` | Admin-only; niet tonen aan klant. |
| `created_at` | `created_at` | Directe overlap. |
| `updated_at` | `updated_at` | Directe overlap. |

### Payment/Billing Velden Die Mee Moeten

| Legacy veld | Aanbevolen canonical veld | Bron |
|---|---|---|
| `mollie_checkout_url` | `mollie_checkout_url` op `invoices` | Mollie betaalverzoeken. |
| `mollie_payment_status` | `mollie_payment_status` op `invoices` | Mollie webhook/status. |
| `mollie_payment_created_at` | `mollie_payment_created_at` op `invoices` | Mollie metadata. |
| `mollie_payment_expires_at` | `mollie_payment_expires_at` op `invoices` | Mollie metadata. |
| `email_sent_at` | `email_sent_at` op `invoices` | Resend factuurmail. |
| `payment_reminder_sent_at` | `payment_reminder_sent_at` op `invoices` | Resend herinnering. |
| `paid_email_sent_at` | `paid_email_sent_at` op `invoices` | Resend betaalbevestiging. |
| `expired_email_sent_at` | `expired_email_sent_at` op `invoices` | Resend verlopenmelding. |
| `email_last_error` | `email_last_error` op `invoices` | E-mail foutdiagnose. |
| `customer_auth_user_id` | Niet op `invoices`; afleiden via `customers.auth_user_id` | Voorkomt dubbele Auth-link. |

### Legacy Blijft

- `customer_auth_user_id` direct op facturen.
- `amount` als enige bedragveld.
- RLS die direct op `customer_invoices.customer_auth_user_id` leunt.

### Aanbevolen Migratiepad

1. Voeg Mollie/e-mailvelden veilig toe aan `invoices`.
2. Zet `customer_invoices.profile_id` om naar `customers.id`.
3. Map `amount` naar `total`; bereken later `subtotal` en `vat` wanneer regels ontbreken.
4. Migreer `pdf_file_path` naar `invoices.pdf_file_path`.
5. Update `invoice-download.js`, Mollie webhook en e-mailfunctions naar `invoices`.
6. Markeer `customer_invoices` als legacy/readonly.

## Legacy Tabel: `customer_subscriptions`

Bronnen:

- `docs/supabase-billing.sql`
- `docs/supabase-mollie-subscriptions.sql`
- `docs/supabase-mollie-subscriptions-sync.sql`
- `docs/supabase-mollie-subscription-actions.sql`
- `docs/supabase-subscription-retries.sql`

Canonical doel:

- `public.subscriptions`

### Overlap Met `subscriptions`

| Legacy veld | Canonical veld | Opmerking |
|---|---|---|
| `id` | `id` | Alleen behouden wanneer data migreert. |
| `profile_id` | via `customers.profile_id` -> `subscriptions.customer_id` | Canonical abonnementen hangen aan `customers`. |
| `package_name` | `plan` | Harmoniseren naar `plan`. |
| `billing_cycle` | `billing_cycle` | Directe overlap met `schema.sql`. |
| `monthly_amount` | `price_ex_vat` of `total_incl_vat` | Valideren of bedrag ex/incl btw is. |
| `status` | `status` | Harmoniseren: `active/paused/canceled/draft`. |
| `start_date` | `start_date` | Directe overlap. |
| `next_invoice_date` | `next_invoice_date` | Directe overlap. |
| `mollie_customer_id` | `mollie_customer_id` toevoegen of behouden op `subscriptions` | Nodig voor Mollie. |
| `mollie_subscription_id` | `mollie_subscription_id` toevoegen of behouden op `subscriptions` | Nodig voor Mollie. |
| `notes` | `internal_notes` | Admin-only. |
| `created_at` | `created_at` | Directe overlap. |
| `updated_at` | `updated_at` | Directe overlap. |

### Mollie/Recurring Velden Die Mee Moeten

| Legacy veld | Aanbevolen canonical veld |
|---|---|
| `mollie_subscription_status` | `mollie_subscription_status` |
| `mollie_mandate_id` | `mollie_mandate_id` |
| `last_payment_at` | `last_payment_at` |
| `next_payment_at` | `next_payment_at` |
| `canceled_at` | `canceled_at` |
| `paused_at` | `paused_at` |
| `mandate_status` | `mandate_status` |
| `mandate_reference` | `mandate_reference` |
| `mandate_checkout_url` | `mandate_checkout_url` |
| `mandate_payment_id` | `mandate_payment_id` |
| `mandate_payment_status` | `mandate_payment_status` |
| `subscription_synced_at` | `subscription_synced_at` |
| `webhook_last_event` | `webhook_last_event` |
| `webhook_last_received_at` | `webhook_last_received_at` |
| `admin_action_last_type` | `admin_action_last_type` |
| `admin_action_last_at` | `admin_action_last_at` |
| `admin_action_last_error` | `admin_action_last_error` |
| `cancellation_reason` | `cancellation_reason` |
| `cancellation_requested_at` | `cancellation_requested_at` |
| `resumed_at` | `resumed_at` |
| `last_failed_payment_at` | `last_failed_payment_at` |
| `last_failed_payment_id` | `last_failed_payment_id` |
| `failed_payment_count` | `failed_payment_count` |
| `retry_status` | `retry_status` |
| `retry_next_action_at` | `retry_next_action_at` |
| `retry_last_email_sent_at` | `retry_last_email_sent_at` |
| `retry_last_admin_note` | `retry_last_admin_note` |
| `subscription_risk_level` | `subscription_risk_level` |
| `subscription_last_error` | `subscription_last_error` |

### Legacy Blijft

- `customer_auth_user_id` direct op abonnementen.
- `monthly_amount` zonder expliciete ex/incl-btw semantiek.
- RLS die direct op `customer_subscriptions.customer_auth_user_id` leunt.

### Aanbevolen Migratiepad

1. Voeg Mollie/retry/adminactievelden veilig toe aan `subscriptions`.
2. Map `profile_id` naar canonical `customers.id`.
3. Map `package_name` naar `plan`.
4. Normaliseer bedragen en frequenties.
5. Update Mollie subscription functions naar `subscriptions`.
6. Markeer `customer_subscriptions` als legacy/readonly.

## Afhankelijkheden Van Legacy Scripts

| Script | Legacy target | Toekomstige target |
|---|---|---|
| `docs/supabase-client-portal.sql` | `profiles`, `customer_websites` | `profiles`, `customers`, `websites` |
| `docs/supabase-billing.sql` | `customer_invoices`, `customer_subscriptions` | `invoices`, `subscriptions` |
| `docs/supabase-website-health.sql` | `customer_websites` | `websites` |
| `docs/supabase-mollie-payments.sql` | `customer_invoices` | `invoices` |
| `docs/supabase-invoice-emails.sql` | `customer_invoices` | `invoices` |
| `docs/supabase-mollie-subscriptions.sql` | `customer_subscriptions` | `subscriptions` |
| `docs/supabase-mollie-subscriptions-sync.sql` | `customer_subscriptions` | `subscriptions` |
| `docs/supabase-mollie-subscription-actions.sql` | `customer_subscriptions` | `subscriptions` |
| `docs/supabase-subscription-retries.sql` | `customer_subscriptions` | `subscriptions` |

## Besluit

Nieuwe featureontwikkeling mag niet meer op `customer_websites`, `customer_invoices` of `customer_subscriptions` worden gebaseerd. Deze tabellen zijn legacy totdat een bewuste migratie of compatibilitylaag nodig blijkt.
