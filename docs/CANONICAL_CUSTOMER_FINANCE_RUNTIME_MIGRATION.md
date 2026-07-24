# Canonical customer finance runtime migration

Datum: 24 juli 2026
Werktitel: `CANONICAL_CUSTOMER_FINANCE_RUNTIME_MIGRATION`

## 1. Executive summary

De actieve klantportaal-, admin-, factuur- en betaalstatusruntime is gemigreerd van de ontbrekende legacytabellen `customer_invoices` en `customer_subscriptions` naar de canonieke tabellen `invoices`, `invoice_lines` en `subscriptions`.

Er is geen compatibilitytabel of legacyview gemaakt. Er zijn geen finance-databaseobjecten toegevoegd. De bestaande RLS-policies blijven de database-trust-boundary; klantfinance wordt daarnaast in één server-side viewmodel opgebouwd, waarbij de ingelogde auth-user server-side aan precies één `customers.id` wordt gekoppeld. Clientinput bepaalt nooit `customer_id`, bedragen, statussen of providerstatus.

De eerder bewezen `quality_report`-repair is byte-identiek opgenomen. Productie, staging, testaccounts, e-mails en betalingen zijn niet gewijzigd of aangeroepen.

De schone release is gebaseerd op `5adb120833f9acf277cf1d2df9252ad46d398d95` en staat op branch `release/cp-a-quality-and-canonical-finance`.

## 2. Legacy versus canonical architectuur

| Onderwerp | Legacy contract | Canoniek contract | Besluit |
| --- | --- | --- | --- |
| Facturen | `customer_invoices`, klant via `profile_id`/`customer_auth_user_id`, totaal in `amount` | `invoices`, klant via `customer_id`, regels in `invoice_lines`, bedragen in `subtotal`, `vat`, `total` | Alleen canonieke tabellen gebruiken |
| Abonnementen | `customer_subscriptions`, `package_name`, `monthly_amount`, veel losse provider-operatievelden | `subscriptions`, `plan`, `billing_cycle`, `price_ex_vat`, `vat_rate`, `total_incl_vat` en begrensde provideridentifiers | Alleen `subscriptions`; niet-canonieke operationele velden genamespaced in `metadata.financeOperations` |
| Klantidentiteit | Auth-user direct op iedere financerij | `auth.users → profiles/customers → invoices/subscriptions.customer_id` | Server lost de klant op; client kan de relatie niet kiezen |
| Klantweergave | Directe browserqueries en schemafallbacks | `client-finance-context` bouwt één gesaneerd viewmodel | Geen frontendfilter als beveiliging |
| Historische data | Productie heeft drie legacy-factuurrijen; staging heeft geen legacytabellen | Staging heeft nul `invoices` en nul `subscriptions` | Geen stagingdatamigratie nodig. Productiehistorie blijft onaangeraakt en vereist een afzonderlijk reviewbaar migratieplan vóór productiedeploy |

De afwezigheid van de legacytabellen in staging was geen ontbrekende-table repair. Het was een runtime-/releasedrift ten opzichte van het reeds aanwezige canonieke model.

## 3. Runtime-inventarisatie

| Bestand/route | Huidige bron vóór | Gebruik | Canonieke bron | Wijziging | Risico |
| --- | --- | --- | --- | --- | --- |
| `public/src/services/clientFinanceContextService.js` | Directe browserquery naar beide legacytabellen | Klantportaalfinance | Server-side finance endpoint | Alleen bearer doorgeven; gesaneerd viewmodel ontvangen | Laag; geen klant-ID uit client |
| `functions/client-finance-context.js` | Nieuw | Gecombineerd klantviewmodel | `quotes`, `invoices`, `subscriptions` | Auth-user en customer server-side oplossen; reads met het klant-JWT door RLS; rijen dubbel op customer filteren | Hoog beveiligingsbelang, gericht getest |
| `public/client-dashboard.html` | Directe legacyqueries met schemafallback | Oud klantdashboard | Server-side finance endpoint | Legacyqueries en stille tabelmissing-fallback verwijderd | Laag |
| `functions/admin-billing.js` | Beide legacytabellen | Adminoverzicht en beheer | `invoices`, `invoice_lines`, `subscriptions` | Canonieke velden, customerrelatie en regels gebruiken | Middel; admin-ACL blijft actief |
| `functions/admin-dashboard-metrics.js` | Legacy invoice/subscription reads | Tellers, MRR en omzet | Canonieke tabellen | Bedrag- en cyclusvelden gecorrigeerd | Middel |
| `functions/admin-supabase-data.js` | Legacy invoice mapping | Admin klanten-/moduledata | Canonieke tabellen | Selects en mappers aangepast | Laag |
| `functions/invoice-download.js` | Factuur met `customer_auth_user_id` | Private PDF-download | `invoices.customer_id → customers/profile auth_user_id` | Server-side ownershipcontrole vóór signed URL | Hoog, IDOR-testcontract |
| `functions/admin-invoice-email.js` | Legacy invoice en profile-ID | Admin mailactie | Canonieke invoice/customer/profile-relatie | Alleen contract aangepast; geen mail verstuurd | Middel |
| `functions/admin-mollie-payment.js` | Legacy invoice | Admin betaalverzoek | `invoices` | `amount → total`; providerflow verder ongewijzigd | Hoog; geen call in deze opdracht |
| `functions/admin-mollie-subscription*.js` | Legacy subscription | Providerbeheer | `subscriptions` | Canonieke velden plus begrensde operationele metadata | Hoog; geen call in deze opdracht |
| `functions/admin-subscription-retry.js` | Legacy subscription | Retrybeheer | `subscriptions` | Customer/profile server-side oplossen; operationele metadata gebruiken | Hoog; geen mail/providercall uitgevoerd |
| `functions/commercial-order.js` | Legacy invoice write | Orderfactuur | `invoices` | Customer-ID, subtotal, btw en total canoniek opslaan | Hoog; geen betaalcall uitgevoerd |
| `functions/mollie-webhook.js` | Beide legacytabellen | Providerstatus en portalafhandeling | Canonieke finance-tabellen | Canonieke lookups/patches; niet-canonieke operatiestatus in metadata | Hoog; syntaxis en contracttests, geen live call |
| `functions/order-status.js` | Legacy invoice | Publieke minimale orderstatus | `invoices → customers → profiles` | Geen gevoelige financevelden aan response toegevoegd | Middel |
| `public/src/providers/supabaseProvider.js` | Legacy invoiceprovider | Gecontroleerde adminwrites | `invoices` en `invoice_lines` | Canonieke records en aparte regels | Middel |
| `public/src/repositories/InvoiceRepository.js` | Legacy invoice read | Adminrepository | `invoices` en `invoice_lines` | Canonieke relations en totalen mappen | Laag |
| Modellen en readinessservices | Legacy tabelnamen | Metadata/diagnostiek | Canonieke modellen | Actieve modellen bijgewerkt; historische security-uitsluitingsmarker bewust behouden | Laag |

Classificatie:

- Actieve runtime: alle hierboven genoemde Functions, klantservices, provider en repository; gemigreerd.
- Actieve tests: nieuwe financecontract- en IDOR-tests; canoniek.
- Legacy maar nog bereikbaar: geen legacy financequery of fallback meer.
- Documentatie en historische SQL: blijven als lineagebewijs onaangeraakt.
- Migratiehistorie: onaangeraakt.
- Dead code: niet verwijderd zonder afzonderlijk bereikbaarheidsonderzoek.

Referentietelling in `functions`, `public/src` en `public/client-dashboard.html`:

- `customer_invoices` vóór: 52 tekstuele runtimereferenties; na: 0 uitvoerbare referenties en 1 bewuste security-uitsluitingsmarker.
- `customer_subscriptions` vóór: 23 tekstuele runtimereferenties; na: 0 uitvoerbare referenties en dezelfde 1 bewuste security-uitsluitingsmarker.

## 4. Canoniek financecontract

### `invoices`

- Primary key: `id uuid`.
- Relaties: `customer_id`, `website_id`, `project_id`, `source_quote_id`, `subscription_id`.
- Identiteit: `invoice_number`, `type`, `title`.
- Status: `draft`, `sent`, `paid`, `expired`, `canceled`, `failed`, `archived`.
- Datums: `invoice_date`, `due_date`, `paid_at`, `created_at`, `updated_at`, `archived_at`, `deleted_at`.
- Bedragen: `subtotal`, `vat`, `total`; runtimevaluta is EUR.
- Provider/document: `payment_link`, `pdf_file_path`, Mollie-paymentvelden en mailstatusvelden.
- Regels: `invoice_lines.invoice_id` met quantity, unit price, vat rate, line total en position.
- Indexen op customer, nummer, project, status/due, subscription en Mollie payment.
- Triggers: `set_invoices_updated_at`.
- RLS: admin manage; owner, staff en demo read.

`invoices` is de enige bron van waarheid voor losse facturen. `invoice_lines` is de bron voor factuurregels. Notes mogen context bevatten, maar vervangen de regelrecords niet.

### `subscriptions`

- Primary key: `id uuid`.
- Relaties: `customer_id`, `website_id`, `project_id`, `last_invoice_id`.
- Contract: `plan`, `status`, `billing_cycle`, `price_ex_vat`, `vat_rate`, `total_incl_vat`.
- Lifecycle: `start_date`, `next_invoice_date`, `last_invoice_date`, `last_payment_at`, `next_payment_at`, `canceled_at`, `paused_at`, `resumed_at`.
- Provider: begrensde Mollie customer/subscription/mandate-identifiers en mandate status/url.
- Operations: `retry_status`, `subscription_risk_level`, `internal_notes`.
- Overige niet-canonieke legacy-operatievelden: alleen server-side in `metadata.financeOperations`; nooit rauw in het klantviewmodel.
- Indexen op customer, website, status, risk en next invoice.
- Triggers: `set_subscriptions_updated_at`.
- RLS: admin manage; owner, staff en demo read.

`subscriptions` is de bron van waarheid voor hosting- en onderhoudsabonnementen. `invoices.subscription_id` en `subscriptions.last_invoice_id` leggen de koppeling vast. `total_incl_vat` is het bedrag per ingestelde billing cycle; kwartaal- en jaarbedragen worden voor MRR gedeeld door respectievelijk 3 en 12 en niet opnieuw vermenigvuldigd wanneer Mollie dezelfde cyclus gebruikt.

### Statusweergave

- Openstaand: `draft` of `sent`.
- Betaald: `paid` of een gevulde `paid_at` waar relevant.
- Verlopen: expliciet `expired`, of server-side een gepasseerde `due_date` bij een open status.
- Geannuleerd/gecrediteerd: publiek genormaliseerd naar `canceled`; het schema ondersteunt geen afzonderlijke creditnotastatus.
- Abonnement actief: iedere niet-terminale status; terminal is `canceled`, `expired` of `archived`.

## 5. Autorisatie en RLS

De klantfinanceflow is:

`Bearer session → Auth user lookup → customers/auth_user_id of profiles-koppeling → server-selected customer_id → authenticated reads onder RLS met customer_id-filter → tweede in-memory ownerfilter → gesaneerd viewmodel`.

Bewijsbare eigenschappen:

- De endpoint accepteert geen bruikbare `customer_id` uit query/body.
- Factuur- en subscriptionrijen van een andere klant worden ook na een foutieve backendresultset verwijderd.
- Factuurdownload controleert invoice → customer → auth-user vóór een signed URL.
- Adminhandlers gebruiken de bestaande `verifyAdmin`-controle voordat service-roledata wordt gelezen of gewijzigd.
- De service role staat alleen in serverfuncties en wordt in deze endpoint uitsluitend gebruikt om de auth-user/customerrelatie op te lossen; financerijen worden met het klant-JWT onder RLS gelezen.
- Klantfrontend schrijft niet naar finance-tabellen.
- Bedragen, btw en providerstatus komen uit databasevelden; het klantviewmodel toont geen ruwe metadata of checkout-URL.
- Bestaande staging-RLS is read-only gecontroleerd en niet gewijzigd.

IDOR-contracttests voor invoice- en subscriptionisolatie slagen.

## 6. Gewijzigde runtimepaden

Het server-side viewmodel bevat:

- `customerId`, open/overdue counts, outstanding amount, EUR, latest invoice, active subscriptions, next billing date en payment state;
- invoices met identifiers, relaties, status, datums, subtotal, btw, total en alleen booleans voor payment/download availability;
- subscriptions met plan, status, billing interval, amount en lifecycledata;
- quotes met canonieke totalen en status.

Klantportaal en het oudere clientdashboard consumeren dezelfde endpoint. Adminoverzicht, metrics, downloads, mailvoorbereiding, providerhandlers, orderstatus en repositories lezen dezelfde canonieke tabellen.

Empty state is een geldige toestand. Backendfouten leveren een duidelijke veilige errorstate en vallen niet terug op mockdata of een ontbrekende legacytabel.

## 7. Legacyverwijdering

- Compatibilityview gemaakt: nee.
- Compatibilitytabel gemaakt: nee.
- Nieuwe databaseobjecten voor finance: nee.
- Historische SQL of bestaande migrations herschreven: nee.
- Legacy documentatie verwijderd: nee; zij blijft lineagebewijs.
- Bewuste marker in `securityReadinessService`: behouden om de uitgesloten legacytabellen te blijven bewaken.

Staging heeft nul canonieke finance-rijen en geen legacytabellen. Productiehistorie is niet gemigreerd. Vóór een productiedeploy is een afzonderlijke, read-only geïnventariseerde datamigratie nodig voor de drie bestaande legacyfacturen, inclusief klant-ID-, totalen-, status- en providerreferentiemapping.

## 8. Quality-reportrepair

Pad:

`supabase/migrations/20260724130000_repair_preview_quality_report_schema_drift.sql`

SHA-256:

`8acaf3f1f3678f71411155b61d9111d4a559cf8ffc6ab36b19b2e47860bfab71`

Validatie:

- timestamp uniek en na bridge/CP-A;
- forward-only en transactioneel;
- exact `quality_report jsonb null`, zonder default;
- bestaande previewrow bleef intact;
- tweede uitvoering veilig;
- incompatibele bestaande `text`-kolom faalde vóór wijziging en bleef intact;
- geen index of constraint nodig voor een nullable rapportpayload;
- geen grants, RLS of data-backfill;
- correct vóór hervatte CP-A.1 toepasbaar.

De migration is inhoudelijk niet gewijzigd ten opzichte van de bewezen repair.

## 9. Testresultaten

| Testgroep | Resultaat |
| --- | --- |
| Financecontract en IDOR | 19/19 |
| Gecombineerde finance-, quality-, CP-A- en previewtests | 37/37 |
| Quality-repaircontract | 4/4 |
| JavaScript-syntaxcontrole alle gewijzigde/nieuwe modules | Geslaagd |
| PostgreSQL compile, rijbehoud, herhaling en incompatibel fail-closed | Geslaagd |
| Volledige suite op release | 283/293 |
| Schone basis `5adb120…` | 260/270 |
| Bestaande failures | 10/10 identiek, uitsluitend bekende Website Factory governance/idempotencytests |
| Nieuwe failures | 0 |
| Secret scan gewijzigde files | Geen treffers |
| Legacy uitvoerbare financequeries | 0 |

De suitegroei is exact 23 tests: 19 finance/adaptertests en 4 quality-repairtests. Daarom blijven pass/fail-verhoudingen rechtstreeks vergelijkbaar met de verplichte basiscommit.

Er zijn tijdens tests geen e-mails, betalingen of providercalls uitgevoerd.

## 10. Nieuwe release-identiteit

- Basiscommit: `5adb120833f9acf277cf1d2df9252ad46d398d95`.
- Branch: `release/cp-a-quality-and-canonical-finance`.
- Releasecommit: de commit die dit rapport en het release-manifest bevat; exact te verifiëren met `git rev-parse HEAD` en in de handoff gerapporteerd.
- Scope: canonical finance runtime, tests/documentatie en de bestaande quality repair.
- Uitgesloten: overige featurewijzigingen uit de oorspronkelijke brede werkmap, bestaande migrations, productie-/stagingconfig, fixtures, accounts en credentials.
- Branch gepusht: nee.
- PR gemaakt: nee.

## 11. Staginghervattingsplan

Nog niet uitgevoerd:

1. Releasebranch pushen.
2. PR openen tegen `codex/rc1-clean-migration-lineage`.
3. Checks controleren; stoppen bij nieuwe mismatch.
4. Targetbranch uitsluitend fast-forwarden.
5. Alleen de `quality_report`-repair op staging toepassen.
6. Staging deployen.
7. De bestaande drie authaccounts en twee klantketens hergebruiken; zij zijn veilig herbruikbaar omdat identity/customerrelaties niet zijn gewijzigd. Geen nieuwe credentials maken.
8. Previewrender opnieuw testen.
9. Approvaltests uitvoeren.
10. Admin-klanten-/financeoverzicht testen, inclusief geldige empty state.
11. Finance-isolatie met klant A en B testen. Voeg alleen herkenbare staging-financerijen toe wanneer een niet-lege isolatietest nodig is; geen nieuwe authaccounts.
12. Volledige CP-A.1 afronden.
13. Regressies uitvoeren.

## 12. Resterende risico's

1. Productie bevat drie legacyfactuurrijen. Een productiedeploy van deze runtime mag pas na een aparte productiedatamigratiereview; deze release migreert die data bewust niet.
2. De canonieke tabellen zijn in staging leeg. Live acceptatie moet zowel empty state als tijdelijk aangemaakte, fictieve staging-financerijen testen.
3. Legacy provider-operatievelden zonder eigen canonieke kolom staan genamespaced in `metadata.financeOperations`. Een toekomstige schemareview kan bewezen veelgebruikte velden promoveren, maar is geen vereiste voor deze release.
4. De 10 bestaande Website Factory-testfailures zijn ongewijzigd en staan los van finance en CP-A.

PASS_CANONICAL_CUSTOMER_FINANCE_RELEASE_READY
