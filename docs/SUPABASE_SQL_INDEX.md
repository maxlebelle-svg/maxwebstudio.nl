# Supabase SQL Index

Compacte index van alle gevonden SQL-bestanden in Fase 12.9.

| Bestand | Module | Doel | Maakt tabellen | Wijzigt tabellen | Policies | Veilig/idempotent | Status | Aanbevolen actie |
|---|---|---|---|---|---|---|---|---|
| `supabase/schema.sql` | Basisplatform | Centrale schemafundering | Ja: 15 kern/tabellen | Ja: FK constraints | Nee | Grotendeels ja | Primair | Gebruik als basis in testomgeving |
| `supabase/rls-policies.sql` | Security/Auth | Concept RLS en rolfunctions | Nee | Ja: RLS aan | Ja: breed | Deels | Review nodig | Pas na Auth/JWT-review uitvoeren |
| `supabase/seed-demo.sql` | Demo data | Demo records seeden | Nee | Nee | Nee | Deels | Afhankelijk | Alleen na `supabase/schema.sql` |
| `docs/supabase-change-requests.sql` | Wijzigingsverzoeken | Tabel en uploadbucket | Ja: `change_requests` | Ja | Nee | Ja | Losstaand | Kan apart blijven voor wijzigingsformulier |
| `docs/supabase-client-portal.sql` | Legacy klantportaal | Profiles, notes, customer websites | Ja | Ja | Ja | Deels | Overlap | Niet blind uitvoeren naast nieuw schema |
| `docs/supabase-billing.sql` | Legacy billing | Customer invoices/subscriptions | Ja | Ja | Ja | Deels | Overlap | Eerst consolideren met `invoices/subscriptions` |
| `docs/supabase-website-health.sql` | Website health | Healthvelden | Nee | `customer_websites` | Nee | Ja | Legacy-target | Herzien richting `websites` |
| `docs/supabase-quotes.sql` | Offertes | Quote migratiebasis | Ja: `quotes`, `quote_lines` | Ja | Service role | Deels | Overlap | Kolommen overnemen in geconsolideerde migratie |
| `docs/supabase-invoices.sql` | Facturen | Invoice migratiebasis | Ja: `invoices`, `invoice_lines` | Ja | Service role | Deels | Overlap | Kolommen vergelijken met `schema.sql` |
| `docs/supabase-subscriptions.sql` | Abonnementen | Subscription migratiebasis | Ja: `subscriptions` | Ja | Service role | Deels | Overlap | Veldnamen harmoniseren |
| `docs/supabase-invoice-storage.sql` | Storage | Private invoice PDF bucket | Nee | Storage bucket | Nee | Ja | Bruikbaar | Later koppelen aan definitieve factuurtabel |
| `docs/supabase-mollie-payments.sql` | Mollie facturen | Payment metadata | Nee | `customer_invoices` | Nee | Ja | Legacy-target | Verplaatsen naar `invoices` of legacy markeren |
| `docs/supabase-invoice-emails.sql` | Resend/e-mail | E-mailtracking | Nee | `customer_invoices` | Nee | Ja | Legacy-target | Verplaatsen naar `invoices` of legacy markeren |
| `docs/supabase-mollie-subscriptions.sql` | Mollie subscriptions | Mollie subscription metadata | Nee | `customer_subscriptions` | Nee | Ja | Legacy-target | Verplaatsen naar `subscriptions` |
| `docs/supabase-mollie-subscriptions-sync.sql` | Mollie sync | Mandate/webhook syncvelden | Nee | `customer_subscriptions` | Nee | Ja | Legacy-target | Verplaatsen naar `subscriptions` |
| `docs/supabase-mollie-subscription-actions.sql` | Mollie actions | Adminactievelden | Nee | `customer_subscriptions` | Nee | Ja | Legacy-target | Verplaatsen naar `subscriptions` |
| `docs/supabase-subscription-retries.sql` | Retries | Retry/riskvelden | Nee | `customer_subscriptions` | Nee | Ja | Legacy-target | Verplaatsen naar `subscriptions` |

## Samenvatting

- Primair fundament: `supabase/schema.sql`
- Security vervolg: `supabase/rls-policies.sql`, pas na Auth-review
- Demo: `supabase/seed-demo.sql`, alleen na schema
- Los bruikbaar: `docs/supabase-change-requests.sql`, storage buckets
- Niet blind uitvoeren: alle scripts die `customer_invoices`, `customer_subscriptions` of `customer_websites` uitbreiden
