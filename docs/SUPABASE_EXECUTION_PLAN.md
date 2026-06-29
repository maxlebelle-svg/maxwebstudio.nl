# Supabase Execution Plan

Status: Fase 12.9 concept-uitvoervolgorde.  
Voer niets automatisch uit. Gebruik dit als checklist in een aparte Supabase testomgeving.

## Hoofdadvies

Gebruik `supabase/schema.sql` als primaire databasebasis voor het productieplatform.

Reden:

- het bevat de breedste set kernmodules in één consistente architectuur
- het gebruikt `customers`, `websites`, `projects`, `quotes`, `invoices`, `subscriptions`
- het sluit het best aan bij Fase 12 repositories en data modes
- het voorkomt dat `customer_invoices`, `customer_subscriptions` en `customer_websites` naast de nieuwe tabellen blijven groeien

## Veilige Volgorde Voor Testomgeving

1. Maak een nieuwe Supabase testomgeving of resetbare branch.
2. Voer `supabase/schema.sql` uit.
3. Controleer:
   - alle tabellen bestaan
   - triggers bestaan
   - foreign keys voor quote/invoice/subscription werken
   - indexen bestaan
4. Controleer de kolomnamen tegen de repositories:
   - `CustomerRepository`
   - `WebsiteRepository`
   - `ProjectRepository`
   - `QuoteRepository`
   - `InvoiceRepository`
   - `SubscriptionRepository`
5. Voer `supabase/rls-policies.sql` pas uit wanneer Auth-rollen/JWT-claims zijn voorbereid.
6. Controleer RLS:
   - admin kan lezen/schrijven via service role
   - anon kan niet zomaar klantdata lezen
   - customer policies werken alleen met correcte `auth.uid()`
7. Voer `supabase/seed-demo.sql` alleen uit nadat stap 2-6 werken.
8. Test Developer Mode read:
   - customers
   - websites
   - projects
   - quotes
   - invoices
   - subscriptions
9. Test klantportaal hybrid/supabase-read op sanitized payload.
10. Pas daarna pas aanvullende scripts aan of voer ze uit.

## Bestanden Die Veilig Lijken Maar Alleen In Context

### Primaire basis

- `supabase/schema.sql`
  - Lijkt idempotent door `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION` en trigger-hercreatie.
  - Let op: `DROP TRIGGER IF EXISTS` wijzigt triggergedrag, maar verwijdert geen data.

### RLS

- `supabase/rls-policies.sql`
  - Bevat `CREATE OR REPLACE FUNCTION` en `DROP POLICY IF EXISTS`.
  - Niet uitvoeren voordat rollen, JWT-claims en `profiles.role` zijn gecontroleerd.

### Demo seed

- `supabase/seed-demo.sql`
  - Alleen uitvoeren na `supabase/schema.sql`.
  - Kan falen als schema afwijkt door losse Fase 12 SQL-bestanden.

### Storage buckets

- `docs/supabase-change-requests.sql`
  - Bevat tabel `change_requests` en bucket `change-request-files`.
  - Veilig/idempotent voor wijzigingsverzoeken, maar staat los van het nieuwe CRM-platform.

- `docs/supabase-invoice-storage.sql`
  - Maakt private bucket `invoice-pdfs`.
  - Kan nuttig blijven, maar downloadfunctions moeten naar de gekozen factuurtabel wijzen.

## Bestanden Die Eerst Aangepast Moeten Worden

- `docs/supabase-client-portal.sql`
  - Overlapt met `profiles` en `customer_websites`.

- `docs/supabase-billing.sql`
  - Maakt `customer_subscriptions` en `customer_invoices`, parallel aan `subscriptions` en `invoices`.

- `docs/supabase-quotes.sql`
  - Overlapt met `supabase/schema.sql` voor `quotes` en `quote_lines`.
  - Bevat nuttige Fase 12-migratievelden, maar kolomnamen verschillen deels.

- `docs/supabase-invoices.sql`
  - Overlapt met `supabase/schema.sql` voor `invoices` en `invoice_lines`.
  - Bevat nuttige Fase 12-migratievelden, maar bedragvelden verschillen deels.

- `docs/supabase-subscriptions.sql`
  - Overlapt met `supabase/schema.sql` voor `subscriptions`.
  - Frequentie- en BTW-velden verschillen deels.

- `docs/supabase-website-health.sql`
  - Breidt `customer_websites` uit, niet `websites`.

- `docs/supabase-mollie-payments.sql`
  - Breidt `customer_invoices` uit, niet `invoices`.

- `docs/supabase-invoice-emails.sql`
  - Breidt `customer_invoices` uit, niet `invoices`.

- `docs/supabase-mollie-subscriptions.sql`
- `docs/supabase-mollie-subscriptions-sync.sql`
- `docs/supabase-mollie-subscription-actions.sql`
- `docs/supabase-subscription-retries.sql`
  - Breiden `customer_subscriptions` uit, niet `subscriptions`.

## Aanbevolen Consolidatie Voor Fase 13

Voordat Fase 13 Auth/RLS hard wordt:

1. Bepaal definitief dat `customers`, `websites`, `projects`, `quotes`, `quote_lines`, `invoices`, `invoice_lines` en `subscriptions` de productie-entiteiten zijn.
2. Maak later één nieuwe geconsolideerde migratie voor extra kolommen uit de Fase 12 docs.
3. Verplaats Mollie/e-mail/retry velden van de oude `customer_*` scripts naar `invoices` en `subscriptions`, of markeer de oude tabellen expliciet als legacy.
4. Update storage/download documentatie naar de gekozen factuurentiteit.
5. Test RLS met echte rollen voordat klantportaal live wordt.

## Checks Na Elke Stap

Na schema:

- bestaat elke tabel?
- zijn foreign keys valide?
- zijn `created_at` en `updated_at` aanwezig?
- werken triggers zonder errors?

Na RLS:

- service role werkt server-side
- anon heeft geen brede toegang
- authenticated customer ziet alleen eigen data
- admin role ziet beheerdata

Na seed:

- demo customer zichtbaar
- demo website/project/offerte/factuur/abonnement zichtbaar
- seed gebruikt kolommen die daadwerkelijk bestaan

Na repository read:

- `local` mode werkt
- `supabase-read` mode werkt
- `hybrid` mode valt veilig terug
- klantportaal sanitized payload bevat geen interne velden

## Blokkers Voor Productie

- Parallelle oude `customer_*` billing/portal tabellen zijn nog niet geconsolideerd.
- RLS policies zijn conceptueel, maar niet getest met echte Auth/JWT-rollen.
- Mollie/e-mail/retry scripts staan nog op oude billingtabellen.
- Storage downloadfunctions moeten worden herzien zodra de definitieve factuurtabel gekozen is.
