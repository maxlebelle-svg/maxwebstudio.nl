# Supabase Patch Plan

Status: Fase 13.0 planning.  
Doel: veilige incrementele patches beschrijven die later nodig zijn na schema-review.  
Geen SQL uitvoeren.

## Veilige Patronen

Toegestaan in toekomstige patches:

- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE OR REPLACE FUNCTION` alleen na review
- nieuwe policies met expliciete naam en review

Niet toegestaan zonder aparte review:

- `DROP`
- `TRUNCATE`
- `DELETE FROM`
- destructieve typewijzigingen
- bestaande policies overschrijven zonder review
- provider switch

## Patch 1 - Website Health Naar `websites`

Doel:

- Legacy healthvelden uit `customer_websites` verplaatsen naar canonical `websites`.

Betrokken tabel:

- `websites`

Kolommen:

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

Afhankelijkheden:

- `supabase/schema.sql`

Risico:

- Laag tot middel. Nieuwe kolommen zijn additief.

Testmethode:

- WebsiteRepository read in `supabase-read`.
- Admin Website Health kaart toont waarden.
- Klantportaal toont alleen klantvriendelijke status.

## Patch 2 - Quote Migratievelden

Doel:

- Fase 12 offertevelden veilig toevoegen aan canonical `quotes` en `quote_lines`.

Betrokken tabellen:

- `quotes`
- `quote_lines`

Kolommen:

- `external_id`
- `customer_external_id`
- `website_external_id`
- `project_external_id`
- `accepted_at`
- `demo_quote_link`
- `deleted_at`
- `external_id` op `quote_lines`

Afhankelijkheden:

- `customers`
- `websites`
- `projects`
- `quotes`
- `quote_lines`

Risico:

- Middel door bestaande overlap in bedragvelden en `converted_to_invoice_id` typeverschil.

Testmethode:

- Quote dry-run.
- Quote mapping preview.
- Quote read in `supabase-read`.
- Veilige testofferte write.

## Patch 3 - Invoice Migratievelden

Doel:

- Fase 12 factuurvelden en legacy billingvelden toevoegen aan canonical `invoices`.

Betrokken tabellen:

- `invoices`
- `invoice_lines`

Kolommen:

- `external_id`
- `quote_id` of bevestigde mapping naar `source_quote_id`
- `payment_status`
- `demo_payment_link`
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
- `source_quote_number`
- `deleted_at`
- `external_id` op `invoice_lines`
- eventueel `line_subtotal` en `line_vat` als gekozen regelmodel

Afhankelijkheden:

- `customers`
- `websites`
- `projects`
- `quotes`
- `subscriptions`
- `invoices`
- `invoice_lines`

Risico:

- Middel tot hoog door payment/e-mail/webhook-afhankelijkheden.

Testmethode:

- Invoice dry-run.
- Invoice read in `supabase-read`.
- Testfactuur write.
- Demo betaalpagina blijft lokaal werken.
- Geen webhook naar verkeerde tabel.

## Patch 4 - Subscription Mollie/Retry Velden

Doel:

- Legacy Mollie, mandate, admin action en retryvelden toevoegen aan canonical `subscriptions`.

Betrokken tabel:

- `subscriptions`

Kolommen:

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
- `last_failed_payment_at`
- `last_failed_payment_id`
- `failed_payment_count`
- `retry_status`
- `retry_next_action_at`
- `retry_last_email_sent_at`
- `retry_last_admin_note`
- `subscription_risk_level`
- `subscription_last_error`
- `subscription_invoice_sequence`
- `next_auto_invoice_run`
- `invoice_generation_log`
- `internal_notes`
- `deleted_at`

Afhankelijkheden:

- `customers`
- `websites`
- `projects`
- `invoices`
- `subscriptions`

Risico:

- Hoog door Mollie lifecycle en recurring billing.

Testmethode:

- Subscription dry-run.
- MRR impact preview.
- Subscription read in `supabase-read`.
- Veilige testsubscription write.
- Geen Mollie live mutaties tot aparte fase.

## Patch 5 - Storage En Files Alignment

Doel:

- Storage buckets behouden, maar koppelingen richten op canonical tabellen.

Betrokken onderdelen:

- `invoice-pdfs` bucket
- `change-request-files` bucket
- `files`
- `invoices.pdf_file_path`

Afhankelijkheden:

- definitieve invoice/file structuur
- Auth/RLS ontwerp

Risico:

- Middel door private downloadrechten.

Testmethode:

- Signed URL function test.
- Customer mag alleen eigen bestand/factuur downloaden.
- Geen publieke bucket browsing.

## Patch 6 - RLS Read-Only Baseline

Doel:

- Read-only klanttoegang op canonical tabellen voorbereiden.

Betrokken tabellen:

- `customers`
- `websites`
- `projects`
- `quotes`
- `quote_lines`
- `invoices`
- `invoice_lines`
- `subscriptions`
- `files`

Afhankelijkheden:

- Fase 13.1 Auth
- rollen/JWT-claims
- `profiles.role`

Risico:

- Hoog. Foute RLS kan data lekken of alles blokkeren.

Testmethode:

- anon leest niets
- customer A ziet alleen A
- customer B ziet alleen B
- admin/service role blijft server-side werken
- route guards getest

## Patch 7 - Legacy Readonly Markering

Doel:

- Vastleggen dat `customer_websites`, `customer_invoices`, `customer_subscriptions` niet meer voor nieuwe ontwikkeling worden gebruikt.

Betrokken tabellen:

- legacy `customer_*` tabellen indien ze al bestaan

Afhankelijkheden:

- Bevestiging of er live data in legacy tabellen staat.

Risico:

- Middel. Kan bestaande functions raken wanneer die nog legacy tabellen gebruiken.

Testmethode:

- Zoek alle references in functions/docs/frontend.
- Update functions eerst naar canonical tabellen.
- Pas daarna legacy readonly/archiefbeleid toe.
