# Supabase SQL Audit

Status: Fase 12.9 audit/documentatie.  
Datum: 2026-06-29.  
Belangrijk: voer geen SQL automatisch uit vanuit dit document. Gebruik eerst `SUPABASE_EXECUTION_PLAN.md`.

## Overzicht

Gevonden SQL-bestanden:

- `docs/supabase-billing.sql`
- `docs/supabase-change-requests.sql`
- `docs/supabase-client-portal.sql`
- `docs/supabase-invoice-emails.sql`
- `docs/supabase-invoice-storage.sql`
- `docs/supabase-invoices.sql`
- `docs/supabase-mollie-payments.sql`
- `docs/supabase-mollie-subscription-actions.sql`
- `docs/supabase-mollie-subscriptions-sync.sql`
- `docs/supabase-mollie-subscriptions.sql`
- `docs/supabase-quotes.sql`
- `docs/supabase-subscription-retries.sql`
- `docs/supabase-subscriptions.sql`
- `docs/supabase-website-health.sql`
- `supabase/schema.sql`
- `supabase/rls-policies.sql`
- `supabase/seed-demo.sql`

Audit-tellingen:

- SQL-bestanden: 17
- Unieke tabellen gedetecteerd: 20
- Tabellen die worden gewijzigd via `ALTER TABLE`: 20
- Indexdefinities: 93
- Policies: 58
- Functions: 5
- Triggers: 14

Gedetecteerde tabellen:

- `public.profiles`
- `public.customers`
- `public.leads`
- `public.websites`
- `public.projects`
- `public.files`
- `public.quotes`
- `public.quote_lines`
- `public.invoices`
- `public.invoice_lines`
- `public.subscriptions`
- `public.settings`
- `public.demo_emails`
- `public.activity_logs`
- `public.import_logs`
- `public.change_requests`
- `public.admin_customer_notes`
- `public.customer_websites`
- `public.customer_subscriptions`
- `public.customer_invoices`

## Architectuurbeeld

Er zijn twee database-lijnen ontstaan:

1. Productieplatform-lijn uit `supabase/schema.sql` en `supabase/rls-policies.sql`.
   Deze gebruikt generieke tabellen zoals `customers`, `websites`, `projects`, `quotes`, `invoices` en `subscriptions`.

2. Eerdere klantportaal/billing-lijn uit `docs/supabase-client-portal.sql` en `docs/supabase-billing.sql`.
   Deze gebruikt `profiles`, `customer_websites`, `customer_subscriptions` en `customer_invoices`.

De Fase 12 repositories werken richting de productieplatform-lijn voor:

- `customers`
- `websites`
- `projects`
- `quotes` / `quote_lines`
- `invoices` / `invoice_lines`
- `subscriptions`

De oudere billing/Mollie/e-mail scripts werken nog op `customer_invoices` en `customer_subscriptions`. Dit is de grootste overlap die vóór productie moet worden opgeschoond.

## Per Module

### Customers

Relevante bestanden:

- `supabase/schema.sql`
- `supabase/rls-policies.sql`
- `docs/supabase-client-portal.sql`

Status:

- `supabase/schema.sql` maakt `profiles` en `customers`.
- `docs/supabase-client-portal.sql` maakt ook `profiles`, maar met andere kolomsemantiek (`company`, `website`, `package`) en strengere `auth_user_id not null unique`.
- `rls-policies.sql` verwacht de nieuwe platformtabellen en rollen via `profiles.role`.

Overlap/conflict:

- `profiles` bestaat in beide lijnen.
- `docs/supabase-client-portal.sql` kan botsen met `supabase/schema.sql` wanneer kolommen of constraints afwijken.

Aanbevolen actie:

- Gebruik `supabase/schema.sql` als primaire basis.
- Behandel `docs/supabase-client-portal.sql` als legacy/aanvullend en voer dit niet blind na het nieuwe schema uit.

### Websites

Relevante bestanden:

- `supabase/schema.sql`
- `supabase/rls-policies.sql`
- `docs/supabase-client-portal.sql`
- `docs/supabase-website-health.sql`

Status:

- Nieuwe lijn gebruikt `public.websites`.
- Oudere klantportaal-lijn gebruikt `public.customer_websites`.
- Health monitoring breidt `customer_websites` uit.

Overlap/conflict:

- Twee website-tabellen bestaan naast elkaar: `websites` en `customer_websites`.
- Healthvelden staan op `customer_websites`, terwijl Fase 12.3 richting `websites` migreerde.

Aanbevolen actie:

- Kies voor productie `public.websites`.
- Migreer of herdefinieer healthvelden later naar `websites` voordat Fase 13/16 live gaat.
- Voer `docs/supabase-website-health.sql` niet uit op een nieuw platformschema zonder bewuste keuze voor `customer_websites`.

### Projects

Relevante bestanden:

- `supabase/schema.sql`
- `supabase/rls-policies.sql`

Status:

- Projecten zijn alleen in de nieuwe platformlijn duidelijk aanwezig als `public.projects`.

Overlap/conflict:

- Geen grote dubbele projecttabel gevonden.

Aanbevolen actie:

- `projects` blijft onderdeel van het basisplatform.

### Quotes

Relevante bestanden:

- `supabase/schema.sql`
- `docs/supabase-quotes.sql`
- `supabase/rls-policies.sql`

Status:

- Beide scripts maken `quotes` en `quote_lines`.
- `docs/supabase-quotes.sql` bevat uitgebreidere migratievelden zoals `external_id`, `customer_external_id`, `website_external_id`, `project_external_id`, `accepted_at`, `internal_notes`, `demo_quote_link`, `deleted_at`.
- `supabase/schema.sql` bevat eenvoudiger velden zoals `subtotal`, `vat`, `total`.

Overlap/conflict:

- Dubbele `CREATE TABLE IF NOT EXISTS public.quotes`.
- Verschillende kolomnamen voor bedragen: `vat`/`total` versus `vat_amount`/`total_amount`.
- `converted_to_invoice_id` is in `schema.sql` uuid/FK, in `docs/supabase-quotes.sql` text.

Aanbevolen actie:

- Gebruik `supabase/schema.sql` als basis, maar neem de Fase 12.5 migratiekolommen expliciet over in een toekomstige geconsolideerde migratie.
- Voer `docs/supabase-quotes.sql` alleen uit na schema-review, omdat kolomtypes/semantiek kunnen afwijken.

### Invoices

Relevante bestanden:

- `supabase/schema.sql`
- `docs/supabase-invoices.sql`
- `docs/supabase-billing.sql`
- `docs/supabase-mollie-payments.sql`
- `docs/supabase-invoice-emails.sql`
- `docs/supabase-invoice-storage.sql`
- `supabase/rls-policies.sql`

Status:

- Nieuwe platformlijn gebruikt `invoices` en `invoice_lines`.
- Oudere billinglijn gebruikt `customer_invoices`.
- Mollie, e-mailtracking en invoice storage scripts richten zich op `customer_invoices`.

Overlap/conflict:

- Twee factuurtabellen: `invoices` en `customer_invoices`.
- Bedragvelden verschillen: `subtotal`/`vat`/`total` versus `subtotal_amount`/`vat_amount`/`total_amount` versus `amount`.
- Mollie/e-mailvelden staan op `customer_invoices`, niet op `invoices`.

Aanbevolen actie:

- Kies `public.invoices` als productie-entiteit.
- Plan een latere migratie om Mollie/e-mail/pdf velden naar `invoices` te brengen of maak een bewust compatibility-pad.
- Voer `docs/supabase-billing.sql`, `docs/supabase-mollie-payments.sql` en `docs/supabase-invoice-emails.sql` niet blind uit naast het nieuwe platformschema.

### Subscriptions

Relevante bestanden:

- `supabase/schema.sql`
- `docs/supabase-subscriptions.sql`
- `docs/supabase-billing.sql`
- `docs/supabase-mollie-subscriptions.sql`
- `docs/supabase-mollie-subscriptions-sync.sql`
- `docs/supabase-mollie-subscription-actions.sql`
- `docs/supabase-subscription-retries.sql`
- `supabase/rls-policies.sql`

Status:

- Nieuwe platformlijn gebruikt `subscriptions`.
- Oudere billinglijn gebruikt `customer_subscriptions`.
- Mollie/retry/action scripts richten zich grotendeels op `customer_subscriptions`.

Overlap/conflict:

- Twee abonnementstabellen: `subscriptions` en `customer_subscriptions`.
- Frequentievelden verschillen: `billing_cycle` in `schema.sql`, `invoice_frequency` in `docs/supabase-subscriptions.sql`.
- BTW-velden verschillen: `vat_rate` in `schema.sql`, `vat_percentage` in `docs/supabase-subscriptions.sql`.
- Seed-demo gebruikt `billing_cycle` en `vat_rate`; dit past bij `schema.sql`, niet volledig bij `docs/supabase-subscriptions.sql`.

Aanbevolen actie:

- Kies `public.subscriptions` als productie-entiteit.
- Convergeer op één set veldnamen vóór Mollie Subscriptions live gaan.
- Voer de oudere `customer_subscriptions` Mollie/retry scripts niet blind uit naast de nieuwe `subscriptions`-lijn.

### Client Portal

Relevante bestanden:

- `docs/supabase-client-portal.sql`
- `supabase/rls-policies.sql`
- `docs/supabase-billing.sql`
- `docs/supabase-invoice-storage.sql`

Status:

- Fase 12.8 heeft het klantportaal voorbereid op `demo`, `local`, `supabase-read` en `hybrid`.
- Harde Auth/RLS-routeguards volgen in Fase 13.

Overlap/conflict:

- Oude klantportaal-RLS werkt op `profiles`, `change_requests`, `customer_websites`, `customer_subscriptions`, `customer_invoices`.
- Nieuwe RLS werkt op `customers`, `websites`, `projects`, `quotes`, `invoices`, `subscriptions`.

Aanbevolen actie:

- Fase 13 moet kiezen voor de nieuwe platformtabellen als klantportaalbron.
- Oude `customer_*` tabellen alleen behouden als legacy/compatibility als ze al live data bevatten.

### Payments/Mollie

Relevante bestanden:

- `docs/supabase-mollie-payments.sql`
- `docs/supabase-mollie-subscriptions.sql`
- `docs/supabase-mollie-subscriptions-sync.sql`
- `docs/supabase-mollie-subscription-actions.sql`
- `docs/supabase-subscription-retries.sql`

Status:

- Scripts zijn idempotent via `ADD COLUMN IF NOT EXISTS` en indexen.
- Scripts richten zich op `customer_invoices` en `customer_subscriptions`.

Overlap/conflict:

- Niet geconsolideerd met de nieuwe `invoices` en `subscriptions`.

Aanbevolen actie:

- Niet uitvoeren op nieuw platform totdat factuur/abonnement-entiteit is gekozen.

### Emails/Resend

Relevante bestanden:

- `docs/supabase-invoice-emails.sql`

Status:

- Voegt e-mailtracking toe aan `customer_invoices`.

Overlap/conflict:

- Nieuwe platformfacturen gebruiken `invoices`; e-mailtracking staat daar nog niet op.

Aanbevolen actie:

- Eerst beslissen of tracking naar `invoices` verhuist.

### Storage/files

Relevante bestanden:

- `docs/supabase-change-requests.sql`
- `docs/supabase-invoice-storage.sql`
- `supabase/schema.sql`

Status:

- `change-request-files` bucket wordt aangemaakt in `docs/supabase-change-requests.sql`.
- `invoice-pdfs` bucket wordt aangemaakt in `docs/supabase-invoice-storage.sql`.
- Bestandsmetadata bestaat in `public.files`.

Overlap/conflict:

- Invoice-PDF pad staat in oude `customer_invoices`.
- Nieuwe `invoices` bevat ook `pdf_file_path` in `schema.sql`.

Aanbevolen actie:

- Storage buckets kunnen apart blijven, maar downloadfunctions moeten uiteindelijk naar `invoices` wijzen.

### Activity logs en import logs

Relevante bestanden:

- `supabase/schema.sql`
- `supabase/rls-policies.sql`
- `supabase/seed-demo.sql`

Status:

- Tabellen `activity_logs` en `import_logs` staan in het platformschema.
- RLS bevat admin/developer read policies.

Overlap/conflict:

- Geen dubbele docs-lijn gevonden.

Aanbevolen actie:

- Behouden in platformschema.

### Auth/profiles

Relevante bestanden:

- `supabase/schema.sql`
- `docs/supabase-client-portal.sql`
- `supabase/rls-policies.sql`

Status:

- `profiles` is de rol/Auth-brug in het platformschema.
- `docs/supabase-client-portal.sql` gebruikt `profiles` ook als klantprofiel.

Overlap/conflict:

- Verschillende semantiek voor `profiles`.
- `rls-policies.sql` verwacht rollen via `profiles.role`.

Aanbevolen actie:

- Houd `profiles` klein als Auth/role-profiel.
- Houd klantdata in `customers`.

## Risico's

### Hoog

- Twee parallelle architecturen: `customers/websites/invoices/subscriptions` versus `profiles/customer_websites/customer_invoices/customer_subscriptions`.
- Dubbele `quotes`, `invoices` en `subscriptions` definities met afwijkende kolomnamen.
- Mollie/e-mail/retry scripts richten zich op oude `customer_*` tabellen terwijl Fase 12 repositories richting nieuwe platformtabellen werken.
- `supabase/seed-demo.sql` kan falen als het wordt uitgevoerd na de losse Fase 12 subscriptions/invoices schema's in plaats van het centrale `supabase/schema.sql`.
- `supabase/rls-policies.sql` moet niet worden uitgevoerd voordat rollen/JWT-claims en platformschema gecontroleerd zijn.

### Middel

- `docs/supabase-client-portal.sql` maakt/altert `profiles` anders dan `supabase/schema.sql`.
- `converted_to_invoice_id` verschilt tussen uuid/FK en text.
- Factuurbedragvelden verschillen tussen `total`, `total_amount` en `amount`.
- Abonnementsfrequentie/BTW-velden verschillen tussen `billing_cycle`/`vat_rate` en `invoice_frequency`/`vat_percentage`.
- Storage/download-documentatie wijst deels naar oude tabellen.

### Laag

- Veel scripts zijn technisch idempotent door `IF NOT EXISTS`.
- `DROP POLICY IF EXISTS` en `DROP TRIGGER IF EXISTS` zijn niet datadestructief, maar wijzigen wel security/triggergedrag.
- Storage bucket scripts gebruiken `on conflict do update`; veilig, maar wel beleidsmatig bewust uitvoeren.

## Aanbevolen Uitvoervolgorde

1. Review dit auditrapport.
2. Kies één productie-architectuur: aanbevolen is `supabase/schema.sql` als basis.
3. Pas eerst eventuele schema-conflicten aan in een latere consolidatiefase.
4. Voer in een lege testomgeving alleen `supabase/schema.sql` uit.
5. Voer daarna pas `supabase/rls-policies.sql` uit wanneer Auth-rollen/JWT-claims zijn voorbereid.
6. Voer `supabase/seed-demo.sql` alleen uit na succesvolle schema- en RLS-test.
7. Voeg daarna gecontroleerd aanvullende Fase 12-kolommen toe voor quotes, invoices en subscriptions.
8. Migreer oude `customer_*` billing/Mollie/e-mail scripts pas nadat besloten is of die tabellen blijven bestaan.
9. Storage buckets kunnen apart worden voorbereid, maar downloadfunctions moeten naar de gekozen factuurtabel wijzen.
10. Start Fase 13 pas na review van dit plan.

## Niet Uitvoeren Tot Gecontroleerd

- `docs/supabase-client-portal.sql`
- `docs/supabase-billing.sql`
- `docs/supabase-mollie-payments.sql`
- `docs/supabase-mollie-subscriptions.sql`
- `docs/supabase-mollie-subscriptions-sync.sql`
- `docs/supabase-mollie-subscription-actions.sql`
- `docs/supabase-subscription-retries.sql`
- `docs/supabase-invoice-emails.sql`
- `docs/supabase-website-health.sql`
- `docs/supabase-quotes.sql`
- `docs/supabase-invoices.sql`
- `docs/supabase-subscriptions.sql`

Deze bestanden zijn waardevol als bron, maar overlappen met de centrale platformarchitectuur en moeten eerst worden geconsolideerd.
