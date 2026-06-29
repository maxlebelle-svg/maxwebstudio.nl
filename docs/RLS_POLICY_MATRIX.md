# RLS Policy Matrix

Status: gereed als ontwerpdocument, nog niet live uitgevoerd.

Fase 23 aanvulling: het uitgebreidere schema- en RLS-plan staat in `SUPABASE_RLS_POLICY_PLAN.md`. Dat document voegt de nieuwere tabellen `leads`, `crm_tasks`, `client_portal_messages`, `client_portal_notifications`, `ai_drafts`, `ai_assistant_drafts` en `audit_logs` toe aan het productiebeleid.

Deze matrix hoort bij de geconsolideerde Supabase-architectuur:

`profiles -> customers -> websites -> projects -> quotes -> quote_lines -> invoices -> invoice_lines -> subscriptions`

Ondersteunende tabellen: `files`, `change_requests`, `settings`, `demo_emails`, `activity_logs`, `import_logs`.

Aanvullende Fase 21/23-tabellen: `leads`, `crm_tasks`, `client_portal_messages`, `client_portal_notifications`, `ai_drafts`, `ai_assistant_drafts`, `audit_logs`.

Legacy tabellen zoals `customer_websites`, `customer_invoices` en `customer_subscriptions` zijn geen basis meer voor nieuwe RLS.

## Rollen

- `super_admin`: volledige platformtoegang.
- `admin`: beheert klanten, sales, projecten, facturen, abonnementen en instellingen.
- `sales`: werkt met leads, klanten, offertes en beperkte factuurinzage.
- `support`: leest klant-, website-, project- en bestandsinformatie voor ondersteuning.
- `developer`: ziet technische tooling en testdata, maar geen betaalmutaties.
- `customer`: ziet alleen eigen klantdata.
- `demo_user`: ziet alleen demo-data.
- `anonymous`: geen directe toegang tot klantdata.

## Ownership regels

- Een klantrecord is eigendom van een gebruiker wanneer `customers.auth_user_id = auth.uid()`.
- Als fallback mag eigenaarschap via `customers.profile_id -> profiles.auth_user_id` worden herleid.
- Tabellen met `customer_id` erven klanttoegang via `customers.id`.
- `quote_lines` erft toegang via `quotes.id`.
- `invoice_lines` erft toegang via `invoices.id`.
- Demo-toegang mag alleen records tonen met `is_demo = true` of `environment = 'demo'`.

## Matrix per tabel

| Tabel | Super Admin | Admin | Sales | Support | Developer | Customer | Demo User | Anonymous |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `profiles` | select/insert/update/delete | select/update | geen directe toegang | geen directe toegang | select technical | eigen profiel select | demo-profielen select | geen |
| `customers` | alles | select/insert/update/archive | select/create/update salesvelden | select | select technical | eigen klant select | demo-klanten select | geen |
| `websites` | alles | select/insert/update/archive | select beperkt | select | select/update technical | eigen websites select | demo-websites select | geen |
| `projects` | alles | select/insert/update/archive | select gekoppeld aan salesklant | select/update supportvelden | select | eigen projecten select, klantveilige velden | demo-projecten select | geen |
| `quotes` | alles | select/insert/update/send/archive | select/insert/update/send | select | select technical | eigen offertes select | demo-offertes select | publieke demo-link alleen via app-laag |
| `quote_lines` | alles | via parent quote | via parent quote | select via parent quote | select via parent quote | select via eigen quote | demo-regels select | geen |
| `invoices` | alles | select/insert/update/send/mark_paid/archive | select | select | select technical | eigen facturen select | demo-facturen select | publieke demo-link alleen via app-laag |
| `invoice_lines` | alles | via parent invoice | select via parent invoice | select via parent invoice | select via parent invoice | select via eigen invoice | demo-regels select | geen |
| `subscriptions` | alles | select/insert/update/invoice/archive | select beperkt | select | select technical | eigen abonnementen select | demo-abonnementen select | geen |
| `files` | alles | select/insert/update/archive | select gekoppelde klant/offertebestanden | select gekoppelde klant/projectbestanden | select technical | eigen klantveilige bestanden select | demo-bestanden select | geen |
| `change_requests` | alles | select/update/status | select gekoppeld aan lead/klant | select gekoppeld aan support | select technical | eigen wijzigingsverzoeken select via `auth_user_id` | demo/source demo select | geen |
| `settings` | alles | select/update | geen | geen | select technical | geen | geen | geen |
| `demo_emails` | alles | select/insert/update/delete | select/insert voor demo | geen | select | geen | demo-only select indien nodig | geen |
| `activity_logs` | alles | select | geen standaard toegang | geen standaard toegang | select technical | geen | geen | geen |
| `import_logs` | alles | select | geen | geen | select technical | geen | geen | geen |
| `leads` | alles | select/insert/update/archive | select/insert/update | select beperkt | select technical | geen | demo-leads select | geen |
| `crm_tasks` | alles | select/insert/update/archive | eigen sales/opvolgtaken | supporttaken | select technical | geen | demo-taken select | geen |
| `client_portal_messages` | alles | select/insert/update | geen standaard toegang | select/insert/update gekoppeld aan support | geen standaard toegang | eigen berichten select/insert | demo-berichten select | geen |
| `client_portal_notifications` | alles | select/insert/update | geen standaard toegang | select/update gekoppeld aan support | geen standaard toegang | eigen notificaties select/update read-status | demo-notificaties select | geen |
| `ai_drafts` | alles | select/insert/update/archive | select beperkt | select beperkt | select/insert/update technical | geen standaard toegang | demo-drafts select | geen |
| `ai_assistant_drafts` | alles | select/insert/update/archive | salesconcepten | supportconcepten | select/insert/update technical | geen | demo-drafts select | geen |
| `audit_logs` | select/insert server-side | select | geen | geen | select technical subset | geen | geen | geen |

## Mutatiegrenzen

- Klanten mogen in productie geen status, interne classificatie, betaalstatus of adminnotities wijzigen.
- `sales` mag geen Developer Tools, migratie-acties of instellingen zien.
- `support` mag geen migratie-tools en geen betaalmutaties uitvoeren.
- `developer` mag technische checks uitvoeren, maar geen facturen betaald zetten of abonnementen factureren.
- `anonymous` mag alleen publieke marketingpagina's en expliciet publieke demo/offerte/betaalweergaves zien. Dit blijft app-laag tot echte tokenized links bestaan.

## Productie-readiness

- RLS policy matrix: gereed.
- Auth claims strategy: gereed.
- RLS SQL draft: voorbereid.
- Security risk audit: gereed.
- RLS live execution: geblokkeerd tot review.
- Frontend route guards: soft actief.
- Database-level security: voorbereid, nog niet live.
