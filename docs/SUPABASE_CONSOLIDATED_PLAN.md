# Supabase Consolidated Plan

Status: Fase 13.0 database consolidation.  
Doel: één duidelijke database-architectuur vastzetten vóór Auth/RLS hardening.  
Geen SQL uitvoeren vanuit dit document.

## Besluit

De canonical productiearchitectuur wordt:

`profiles -> customers -> websites -> projects -> quotes -> quote_lines -> invoices -> invoice_lines -> subscriptions`

Ondersteunend:

- `files`
- `settings`
- `demo_emails`
- `activity_logs`
- `import_logs`
- `change_requests`

Legacy:

- `customer_websites`
- `customer_invoices`
- `customer_subscriptions`

## Uitvoeren Als Basis

Alleen na review en bij voorkeur in een Supabase testomgeving:

1. `supabase/schema.sql`

Waarom:

- breedste en meest consistente platformbasis
- sluit aan bij Fase 12 repositories
- voorkomt verdere groei van `customer_*` tabellen

## Eerst Consolideren Voor Uitvoeren

Deze bestanden bevatten nuttige velden, maar overlappen met het canonical schema:

- `docs/supabase-quotes.sql`
- `docs/supabase-invoices.sql`
- `docs/supabase-subscriptions.sql`

Actie:

- Neem alleen ontbrekende kolommen over via een latere veilige patch.
- Harmoniseer bedragvelden, statuswaarden en FK-types.
- Voer de bestanden niet als geheel uit naast `supabase/schema.sql`.

## Niet Blind Uitvoeren

Legacy/customer-target scripts:

- `docs/supabase-client-portal.sql`
- `docs/supabase-billing.sql`
- `docs/supabase-website-health.sql`
- `docs/supabase-mollie-payments.sql`
- `docs/supabase-invoice-emails.sql`
- `docs/supabase-mollie-subscriptions.sql`
- `docs/supabase-mollie-subscriptions-sync.sql`
- `docs/supabase-mollie-subscription-actions.sql`
- `docs/supabase-subscription-retries.sql`

Reden:

- deze scripts werken op `customer_websites`, `customer_invoices` en `customer_subscriptions`
- de canonical lijn gebruikt `websites`, `invoices` en `subscriptions`
- blind uitvoeren maakt opnieuw twee waarheden

## Later Pas Uitvoeren

Pas na canonical patch review:

- Mollie payment fields
- Mollie subscription fields
- Resend/e-mailtracking
- Supabase Storage policies/downloadkoppelingen
- client portal policies
- RLS hardening
- seed/demo data

## Aanbevolen Volgorde

1. Review `SUPABASE_SQL_AUDIT.md`.
2. Review `SUPABASE_LEGACY_MAPPING.md`.
3. Bevestig canonical schema uit `SUPABASE_CANONICAL_SCHEMA.md`.
4. Voer in testomgeving `supabase/schema.sql` uit.
5. Controleer tabellen, FKs, indexen, triggers.
6. Maak veilige patch voor ontbrekende legacyvelden op canonical tabellen.
7. Voeg indexen toe voor nieuwe patchvelden.
8. Test repository read voor customers/websites/projects/quotes/invoices/subscriptions.
9. Test klantportaal `supabase-read` en `hybrid` met sanitized payload.
10. Voer optioneel demo seed uit nadat schema/kolommen kloppen.
11. Pas daarna read-only policies toe.
12. Pas daarna Fase 13 Auth/RLS hardening toe.
13. Pas daarna Mollie/Resend/Storage integraties aan op canonical tabellen.

## Concrete Consolidatiebeslissingen

### Websites

- Productietabel: `websites`
- Overnemen uit legacy:
  - health/monitoringvelden
  - hostingstatus
  - last checked metadata
- Niet overnemen:
  - directe `customer_auth_user_id` op websitetabel als primaire autorisatie

### Invoices

- Productietabel: `invoices`
- Overnemen uit legacy:
  - Mollie payment fields
  - e-mailtracking
  - PDF-pad
  - deleted/status metadata
- Niet overnemen:
  - `amount` als enige bedragmodel
  - directe `customer_auth_user_id` op factuur als primaire autorisatie

### Subscriptions

- Productietabel: `subscriptions`
- Overnemen uit legacy:
  - Mollie Customer/Subscription/Mandate fields
  - mandate checkout
  - webhook sync fields
  - admin action fields
  - retry/risk fields
  - recurring invoice sequence/log fields
- Niet overnemen:
  - directe `customer_auth_user_id` op abonnement als primaire autorisatie
  - onduidelijke `monthly_amount` zonder btw-semantiek

## Blokkades Tot Review

Geblokkeerd tot consolidatie-review:

- Fase 13.1 Supabase Auth hardening
- Fase 13.2 RLS/route guards hard maken
- live klantportaal met echte klantdata
- Mollie live betalingen op Supabase
- Mollie abonnementen op Supabase
- Resend factuur/offertemails op Supabase records
- Supabase Storage downloads gekoppeld aan facturen/bestanden

## Niet Doen

- Geen `DROP`.
- Geen data delete.
- Geen provider switch.
- Geen SQL uitvoeren vanuit Codex.
- Geen oude `customer_*` scripts alsnog uitvoeren om “snel verder” te gaan.
- Geen Auth/RLS hardening voordat canonical schema gereviewd is.
