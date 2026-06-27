# Mollie Subscriptions

Dit document beschrijft de basisarchitectuur voor Mollie Customers en onderhoudsabonnementen binnen Max Web Studio.

## Status

Fase 6.1 legt de fundering. Admin kan vanuit het CRM een Mollie Customer en Mollie Subscription aanmaken voor een bestaand onderhoudsabonnement.

Nog niet gebouwd:

- webhook synchronisatie voor subscription payments
- pauzeren
- hervatten
- opzeggen
- automatische retries
- automatische factuurgeneratie
- automatische incasso-communicatie

## Architectuur

Browser:

- `/public/admin-dashboard.html`
- toont subscriptions uit `public.customer_subscriptions`
- stuurt adminacties naar Netlify Functions met `ADMIN_TOKEN`
- bevat geen Mollie API key
- bevat geen Supabase service role key

Server:

- `/.netlify/functions/admin-mollie-subscription`
- vereist `ADMIN_TOKEN`
- gebruikt `MOLLIE_API_KEY` server-side
- gebruikt `SUPABASE_SERVICE_ROLE_KEY` server-side
- maakt Mollie Customers en Subscriptions aan
- slaat Mollie IDs en statusmetadata terug op in Supabase

Database:

- `public.customer_subscriptions`
- uitbreiding staat in `/docs/supabase-mollie-subscriptions.sql`

Klantportaal:

- `/public/client-dashboard.html`
- leest eigen abonnementen via Supabase Auth en RLS
- toont bedrag, status en volgende incasso
- bevat geen beheeracties

## Flow

1. Admin maakt of selecteert een klantprofiel in het CRM.
2. Admin maakt een onderhoudsabonnement aan in de module Onderhoud.
3. Admin klikt `Activeer abonnement`.
4. De Netlify Function controleert `ADMIN_TOKEN`.
5. De function leest het abonnement en klantprofiel uit Supabase.
6. Als `mollie_customer_id` ontbreekt, maakt de function een Mollie Customer aan.
7. De function maakt een Mollie Subscription aan voor deze customer.
8. De function slaat terug op:
   - `mollie_customer_id`
   - `mollie_subscription_id`
   - `mollie_subscription_status`
   - `mollie_mandate_id` indien beschikbaar
   - `next_payment_at` indien beschikbaar
9. Admin ziet de Mollie metadata in het CRM.
10. De klant ziet de abonnementstatus en volgende incasso in het klantportaal.

## Mollie Velden

`customer_subscriptions` gebruikt:

- `mollie_customer_id`
- `mollie_subscription_id`
- `mollie_subscription_status`
- `mollie_mandate_id`
- `last_payment_at`
- `next_payment_at`
- `canceled_at`
- `paused_at`

## Billing Cycles

Mapping naar Mollie:

- `monthly` -> `1 month`, bedrag = `monthly_amount`
- `quarterly` -> `3 months`, bedrag = `monthly_amount * 3`
- `yearly` -> `12 months`, bedrag = `monthly_amount * 12`

## Testmodus

Gebruik voor deze fase een Mollie test API key:

- `MOLLIE_API_KEY=test_...`

Teststappen:

1. Voer `/docs/supabase-mollie-subscriptions.sql` uit.
2. Zorg dat het klantprofiel een geldig e-mailadres heeft.
3. Maak een abonnement aan met bedrag groter dan `0`.
4. Klik in het admin-dashboard op `Activeer abonnement`.
5. Controleer in het dashboard:
   - Mollie customer id
   - Mollie subscription id
   - abonnementstatus
   - volgende betaling indien Mollie die teruggeeft
6. Controleer in Mollie test dashboard of de customer/subscription bestaat.
7. Log in als klant en controleer het klantportaal.

## Bekende Beperkingen

Mollie Subscriptions vereisen in de praktijk meestal een geldige mandate op de customer. Zonder mandate kan Mollie de subscription-aanmaak weigeren. Deze fase bouwt alleen de basisactivatie; mandate-onboarding en eerste machtigingsbetaling horen in een volgende fase.

Webhook synchronisatie is bewust nog niet gebouwd. Daardoor worden `last_payment_at`, statusupdates na incasso en mislukte incasso's nog niet automatisch bijgewerkt.

Admin kan in deze fase nog niet pauzeren, hervatten of opzeggen vanuit het CRM.

## Security

- Geen Mollie key in frontend.
- Geen Supabase service role key in frontend.
- Adminactie vereist `ADMIN_TOKEN`.
- Klanten lezen alleen eigen subscriptions via RLS.
- Klanten kunnen geen subscription aanmaken of beheren.
