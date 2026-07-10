# Final P0 Proof Report - 2026-07-10

## 1. Live Deployment

Status: gedeeltelijk bewezen.

- Lokale branch: `main`
- Lokale HEAD: `45b294445fd36faef7c39089c7716b0208c43e16`
- `origin/main`: `45b294445fd36faef7c39089c7716b0208c43e16`
- Live adminrouteguard asset: `200`, `src/admin-route-guard.js?v=20260710-p0-validation`
- Live `create-payment`: `410`, klantvriendelijke melding
- Live `commercial-order` zonder token: `401 Niet geautoriseerd`
- Live `admin-leads` zonder token: `401 Niet geautoriseerd`
- Live `admin-leads` met vervalste bearer: eerder getest als `401 Niet geautoriseerd`

Adminrouteguard:

- Alle 29 `admin-*.html` pagina's zijn live gecontroleerd.
- Alle 29 bevatten live de gedeelde `src/admin-route-guard.js`.
- Alle 29 geven `Cache-Control: no-store,max-age=0,must-revalidate`.
- Browsercheck uitgelogd op `/admin-ai-content-library.html`: redirect naar `/login.html?next=%2Fadmin-ai-content-library.html`, geen console-errors.

Niet uitgevoerd:

- Klantaccount, medewerker, admin, verlopen sessie en navigatie tussen portalen zijn niet getest, omdat er geen testaccounts of tokens zijn meegegeven.

## 2. RLS-resultaten

Status: anonieme lekcheck uitgevoerd; klant A/B tenantisolatie niet bewezen.

Publieke Supabase runtimeconfig:

- `client-auth-config`: `200`
- Supabase URL aanwezig: ja
- Anon key aanwezig: ja
- Auth live flag: ja
- Omgeving: production
- Er zijn geen keys of tokens in dit rapport opgenomen.

Anonieme SELECT-smoke:

| Tabel | Resultaat |
| ----- | --------- |
| `profiles` | `401`, geen rij gelekt |
| `customers` | `401`, geen rij gelekt |
| `websites` | `401`, geen rij gelekt |
| `projects` | `401`, geen rij gelekt |
| `leads` | `401`, geen rij gelekt |
| `customer_invoices` | `200`, 0 rijen |
| `customer_subscriptions` | `200`, 0 rijen |
| `customer_timeline_events` | `200`, 0 rijen |

Niet aanwezig of niet zichtbaar via PostgREST:

- `organizations`
- `organization_members`
- `workspaces`
- `previews`
- `onboarding`
- `files`
- `invoices`
- `payments`
- `subscriptions`
- `timelines`
- `feedback`
- `support`
- `notifications`
- `commercial_orders`
- `appointments`
- `notes`

Conclusie:

- Geen anonieme datalekken gevonden in de geteste tabellen.
- RLS mag nog niet als volledig bewezen worden gemarkeerd, omdat er geen klant A/B-sessies beschikbaar waren voor SELECT/INSERT/UPDATE/DELETE negatieve tests.

## 3. Storage-resultaten

Status: anonieme storage-smoke uitgevoerd; cross-tenant storage niet bewezen.

- Bucketlijst met anon key: `200`, 0 buckets zichtbaar.
- `customer-files`: bucket niet gevonden.
- `website-assets`: bucket niet gevonden.
- `contracts`: bucket niet gevonden.
- `invoices`: bucket niet gevonden.
- `internal-documents`: bucket niet gevonden.

Conclusie:

- Geen anonieme storageblootstelling gevonden.
- Storage tenantveiligheid is niet volledig bewezen, omdat klantbestandsbuckets live niet beschikbaar/zichtbaar waren en er geen klant A/B-bestanden of sessies zijn meegegeven.

## 4. Orderflow

Status: routegrenzen bewezen; end-to-end orderflow niet uitgevoerd.

Bewezen:

- Legacy `create-payment` is live gesloten met `410`.
- `commercial-order` weigert zonder adminsessie met `401`.
- Statische codecontrole bevestigt server-side bedragberekening via catalogus.
- Statische codecontrole bevestigt koppeling naar profile, customer, invoice, terms, Mollie en webhookmetadata.

Niet uitgevoerd:

- Mollie-testbetaling.
- Webhookverwerking tegen echte testpayment.
- Factuurstatuswijziging.
- Klant/account/project/website/onboarding/timeline/e-mail end-to-end.

Reden:

- Er zijn geen veilige admintestaccountgegevens, Mollie-testscenario's of testtenantdata meegegeven.

## 5. Idempotency

Status: statisch deels onderbouwd; niet live bewezen.

Statisch gezien aanwezig:

- `mollie-webhook` zoekt factuur op `mollie_payment_id`.
- Betaalmail gebruikt `paid_email_sent_at` als guard tegen dubbele verzending.
- Timeline-events gebruiken `dedupeKey`.
- Commercial finalization zoekt bestaande profile/customer/website/project voordat wordt ge-upsert.

Niet bewezen:

- dezelfde orderrequest tweemaal;
- dezelfde idempotency key tweemaal;
- dezelfde webhook tweemaal of vijf keer snel achter elkaar;
- fulfillmentretry na gedeeltelijke fout;
- concurrency.

## 6. Tenantmodel

Status: deels statisch aanwezig; live organization/workspace model niet aanwezig of niet zichtbaar.

Canonieke documentatie blijft:

```text
auth.users -> profiles -> customers -> websites/projects/quotes/invoices/subscriptions/files
```

Live observatie:

- `profiles`, `customers`, `websites`, `projects`, `leads` bestaan en blokkeren anonieme SELECT.
- `organizations`, `organization_members` en `workspaces` zijn live niet via PostgREST gevonden.

Conclusie:

- Het huidige live tenantmodel lijkt nog primair customer/profile-gebaseerd.
- Organization/workspace tenantisolatie kan niet bewezen worden zolang deze tabellen niet live beschikbaar zijn of geen testdata/toegang is meegegeven.

## 7. Salespipeline

Status: statisch gecontroleerd; live medewerker A/B niet bewezen.

Bewezen:

- Commit `f9707c20` is aanwezig.
- Migratie bevat assignment-, call-, follow-up-, afspraak-, won/lost-velden en indexes.
- `admin-leads` heeft conflictcheck en kan `409` teruggeven bij lead in behandeling door andere medewerker.
- `admin-leads` syntaxcheck is geslaagd.
- `admin-leads` zonder token is live `401`.

Niet bewezen:

- medewerker A versus medewerker B;
- assignmentmanipulatie;
- gelijktijdige opvolging;
- heropenen verloren lead;
- RLS-policy aansluiting op salesassignment.

## 8. Gevonden Problemen

P0:

- Geen echte klant A/B RLS-negatieve tests uitgevoerd; cross-tenant lezen/schrijven is dus nog niet volledig bewezen.
- Geen end-to-end `commercial-order` testbetaling uitgevoerd; fulfillment is dus nog niet volledig bewezen.
- Live organization/workspace tabellen zijn niet beschikbaar/zichtbaar, terwijl de gevraagde tenantproof daar deels op leunt.

P1:

- Storage tenantveiligheid niet volledig bewezen door ontbrekende buckets/testbestanden.
- Salespipeline niet live getest met meerdere medewerkers.
- Idempotency/concurrency alleen statisch onderbouwd.

P2:

- Statische admin HTML wordt nog geserveerd met HTTP 200; bescherming gebeurt via frontend guard en server-side API guards. Browsercheck toont redirect, maar edge-level blocking bestaat niet.

P3:

- Netlify deploy-ID en deploytijd zijn niet via veilige publieke headers beschikbaar.

## 9. Aangepaste Bestanden En Migraties

Geen productcode of migraties aangepast in deze final proof.

Toegevoegd rapport:

- `/docs/FINAL_P0_PROOF_REPORT_2026-07-10.md`

## 10. Eindoordeel

1. Staat `45b29444` aantoonbaar live?
   - Ja. `origin/main` staat op `45b29444`, live adminpagina's bevatten de guard uit die commit.
2. Zijn alle 29 adminpagina's live beschermd?
   - Ja voor uitgelogde browsercheck en aanwezigheid van gedeelde guard op 29/29 pagina's. Niet bewezen voor klant/medewerker/adminrollen zonder testaccounts.
3. Is cross-tenant lezen geblokkeerd?
   - Alleen anonieme SELECT is getest en gaf geen lek. Klant A/B niet bewezen.
4. Is cross-tenant schrijven geblokkeerd?
   - Niet bewezen zonder klant A/B-testaccounts en veilige testrecords.
5. Is storage tenantveilig?
   - Niet volledig bewezen. Anon ziet geen buckets, maar cross-tenant bestandstests konden niet.
6. Is `commercial-order` end-to-end werkend?
   - Niet bewezen. Route is beschermd; volledige Mollie-testflow is niet uitgevoerd.
7. Zijn dubbele fulfillmentrecords uitgesloten?
   - Niet volledig bewezen. Statisch deels onderbouwd, maar live idempotency/concurrency ontbreekt.
8. Worden bestaande klanten correct hergebruikt?
   - Statisch deels onderbouwd via lookups/upserts; niet live bewezen.
9. Is de salespipeline veilig voor meerdere medewerkers?
   - Statisch deels onderbouwd via conflictcheck; niet live bewezen.
10. Kan Max Webstudio nu veilig echte klanten verwerken?
   - Nog niet als volledig P0-bewezen platform. Eerst testaccounts maken, RLS A/B-tenanttests uitvoeren, storage testen en een volledige Mollie-testorder afronden.
