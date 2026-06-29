# Test Execution Plan

Doel: de deployment bundle gecontroleerd valideren in een Supabase testomgeving voordat productie wordt aangepast.

Er wordt in dit document geen SQL uitgevoerd. Dit is de volgorde voor handmatige testuitvoering en registratie in `TEST_RESULTS.md`.

## Uitgangspunten

- Testomgeving is gescheiden van productie.
- Production data wordt niet gebruikt zonder expliciete backup en toestemming.
- Service role keys worden nooit in frontend of documentatie geplaatst.
- Elke dag eindigt met een korte PASS/FAIL/BLOCKED/NOT TESTED registratie.
- Deployment blijft NO-GO totdat alle blockers approved of not_applicable zijn.

## Dag 1 - Schema

Doel: canonical schema in de testomgeving controleren.

Controle:

- `supabase/schema.sql` is de bron.
- Canonical tabellen zijn aanwezig: `customers`, `websites`, `projects`, `quotes`, `invoices`, `subscriptions`, `profiles`.
- Legacy `customer_*` tabellen worden niet als nieuwe bron gebruikt.
- Geen productieomgeving geraakt.

Resultaat vastleggen in `TEST_RESULTS.md`.

## Dag 2 - Auth

Doel: Supabase Auth en profiles foundation testen.

Controle:

- Testgebruikers kunnen inloggen.
- Rollen worden correct gekoppeld.
- Profile/customer link werkt.
- Route guards blokkeren ongeldige toegang.

Resultaat koppelen aan blocker `auth_test_completed`.

## Dag 3 - RLS

Doel: Row Level Security droog en daarna praktisch testen.

Controle:

- Admin ziet toegestane testdata.
- Customer A ziet alleen Customer A.
- Customer B ziet alleen Customer B.
- Anonymous ziet geen klantdata.
- Demo-user krijgt geen productiedata.

Resultaat koppelen aan blockers `rls_test_log_completed` en `customer_isolation_test_completed`.

## Dag 4 - Storage

Doel: private buckets en signed URL-flow testen.

Controle:

- Buckets zijn private.
- Klanten kunnen alleen eigen bestanden openen.
- Admin kan bestanden beheren via server-side flow.
- Geen bucket browsing voor klanten.

## Dag 5 - Functions

Doel: Netlify Functions testen met test-env-vars.

Controle:

- Functions geven altijd JSON terug waar verwacht.
- Service role blijft server-side.
- Admin endpoints vereisen admin-beveiliging.
- Geen secrets in browser of logs.

## Dag 6 - Mollie

Doel: Mollie testmodus en webhook-flow valideren.

Controle:

- Testbetaling kan worden aangemaakt.
- Checkout URL wordt opgeslagen.
- Webhook werkt factuurstatus bij.
- Foutstatussen worden correct verwerkt.

## Dag 7 - Resend

Doel: Resend testmails valideren.

Controle:

- Interne lead/factuurmail komt aan.
- Klantbevestiging komt aan.
- From/reply-to zijn correct.
- Geen secrets in frontend.

## Dag 8 - Customer Tests

Doel: volledige klantreis in testomgeving valideren.

Controle:

- Klantdata zichtbaar in CRM.
- Klantportaal toont alleen klantveilige data.
- Offerte en factuur links werken.
- Projecten, websites, bestanden en abonnementen tonen correcte testdata.

## Dag 9 - Go/No-Go

Doel: formele releasebeslissing voorbereiden.

Controle:

- Backup bevestigd.
- Testresultaten ingevuld.
- Blockers approved of not_applicable.
- Rollbackplan goedgekeurd.
- Environment variables checklist ingevuld zonder secretwaarden.
- Geen legacy architectuurrisico open.

Uitkomst: GO of NO-GO vastleggen in `TEST_RESULTS.md`.
