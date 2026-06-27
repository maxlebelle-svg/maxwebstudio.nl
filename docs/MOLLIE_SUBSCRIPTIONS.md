# Mollie Subscriptions

Dit document beschrijft de basisarchitectuur voor Mollie Customers en onderhoudsabonnementen binnen Max Web Studio.

## Status

Fase 6.2 maakt de basisflow werkend met mandates, eerste machtigingsbetaling en webhook-synchronisatie. Admin kan vanuit het CRM een Mollie Customer voorbereiden, een eerste mandatebetaling laten afronden door de klant en daarna automatisch een Mollie Subscription laten aanmaken via de webhook.

Nog niet gebouwd:

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
- maakt een eerste Mollie betaling met `sequenceType: first` wanneer nog geen geldige mandate bestaat
- slaat Mollie IDs en statusmetadata terug op in Supabase
- `/.netlify/functions/mollie-webhook`
- verwerkt mandatebetalingen en subscription payments
- synchroniseert subscriptionstatus, mandate status en incassodatums

Database:

- `public.customer_subscriptions`
- uitbreiding staat in `/docs/supabase-mollie-subscriptions.sql`
- sync-uitbreiding staat in `/docs/supabase-mollie-subscriptions-sync.sql`

Klantportaal:

- `/public/client-dashboard.html`
- leest eigen abonnementen via Supabase Auth en RLS
- toont bedrag, status en volgende incasso
- toont `Voltooi machtiging` wanneer `mandate_checkout_url` bestaat en de mandate nog niet geldig is
- bevat geen beheeracties

## Flow

1. Admin maakt of selecteert een klantprofiel in het CRM.
2. Admin maakt een onderhoudsabonnement aan in de module Onderhoud.
3. Admin klikt `Activeer abonnement`.
4. De Netlify Function controleert `ADMIN_TOKEN`.
5. De function leest het abonnement en klantprofiel uit Supabase.
6. Als `mollie_customer_id` ontbreekt, maakt de function een Mollie Customer aan.
7. De function controleert Mollie mandates voor deze customer.
8. Als er geen geldige mandate is, maakt de function een eerste payment aan met `sequenceType: first`.
9. De function slaat de checkout URL op als `mandate_checkout_url`.
10. Klant opent in het klantportaal `Voltooi machtiging`.
11. Mollie stuurt de betaalstatus naar `/.netlify/functions/mollie-webhook`.
12. Bij succesvolle eerste betaling zoekt de webhook de geldige mandate op.
13. De webhook maakt automatisch de Mollie Subscription aan.
14. De webhook synchroniseert statusmetadata terug naar Supabase.
15. Admin ziet de Mollie metadata in het CRM.
16. De klant ziet de abonnementstatus en volgende incasso in het klantportaal.

## SequenceType

Mollie gebruikt `sequenceType` om onderscheid te maken tussen de eerste machtigingsbetaling en terugkerende incasso's.

- `first`: eerste betaling waarmee de klant toestemming/machtiging geeft.
- `recurring`: latere betalingen op basis van een geldige mandate.

In deze implementatie maakt Max Web Studio alleen de `first` payment zelf aan. Mollie Subscriptions verzorgen daarna de terugkerende payments.

## Webhook Flow

De Mollie webhook ontvangt een payment id.

De function haalt altijd server-side de payment op bij Mollie en kijkt daarna naar:

- `payment.metadata.source`
- `payment.metadata.subscriptionId`
- `payment.subscriptionId`
- `customer_subscriptions.mandate_payment_id`

Bij een mandatebetaling:

- `mandate_payment_status` wordt bijgewerkt
- `mandate_status` wordt bijgewerkt op basis van Mollie mandates
- `last_payment_at` wordt gevuld bij `paid`
- als er nog geen subscription bestaat en de mandate geldig is, maakt de webhook de subscription aan

Bij een subscription payment:

- `last_payment_at` wordt bijgewerkt bij `paid`
- Mollie subscription wordt opgehaald
- `mollie_subscription_status` wordt gesynchroniseerd
- `next_payment_at` wordt gesynchroniseerd
- `subscription_synced_at`, `webhook_last_event` en `webhook_last_received_at` worden bijgewerkt

## Subscription Lifecycle

Belangrijke klantvriendelijke staten:

- `mandate_status = pending`: klant moet de eerste machtiging nog afronden.
- `mandate_status = valid`: machtiging is geldig.
- `mollie_subscription_status = active`: abonnement loopt.
- `mollie_subscription_status = pending`: abonnement is aangemaakt maar nog niet volledig actief.
- `mollie_subscription_status = suspended`: abonnement is gepauzeerd of tijdelijk geblokkeerd door Mollie.
- `mollie_subscription_status = canceled`: abonnement is gestopt.

Deze fase bouwt alleen aanmaken en synchroniseren. Pauzeren, hervatten en opzeggen blijven buiten scope.

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
- `mandate_status`
- `mandate_reference`
- `mandate_checkout_url`
- `mandate_payment_id`
- `mandate_payment_status`
- `subscription_synced_at`
- `webhook_last_event`
- `webhook_last_received_at`

## Opslag

De function slaat onder andere op:

Bij mandatebetaling:

- `mandate_checkout_url`
- `mandate_payment_id`
- `mandate_payment_status`
- `mandate_status`
- `mandate_reference`

Bij subscription:

- `mollie_customer_id`
- `mollie_subscription_id`
- `mollie_subscription_status`
- `mollie_mandate_id` indien beschikbaar
- `next_payment_at` indien beschikbaar
- `last_payment_at`

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
2. Voer `/docs/supabase-mollie-subscriptions-sync.sql` uit.
3. Zorg dat het klantprofiel een geldig e-mailadres heeft.
4. Maak een abonnement aan met bedrag groter dan `0`.
5. Klik in het admin-dashboard op `Activeer abonnement`.
6. Als er nog geen mandate is, verwacht:
   - melding `Klant moet eerst machtiging afronden.`
   - `Open mandate betaallink`
   - klant ziet `Voltooi machtiging`
7. Rond de eerste betaling af in Mollie test checkout.
8. Controleer in Netlify logs dat de webhook verwerkt is.
9. Controleer in het dashboard:
   - Mollie customer id
   - Mollie subscription id
   - abonnementstatus
   - mandate status
   - volgende betaling indien Mollie die teruggeeft
10. Controleer in Mollie test dashboard of de customer/subscription bestaat.
11. Log in als klant en controleer het klantportaal.

## Veelvoorkomende Fouten

### Klant moet eerst machtiging afronden

Dit is normaal wanneer er nog geen geldige mandate bestaat. Laat de klant de mandate checkout URL openen en afronden.

### Geen checkout URL

Controleer:

- `SITE_URL` is gevuld
- `MOLLIE_API_KEY` is geldig
- Mollie accepteert `sequenceType: first`

### Webhook maakt geen subscription aan

Controleer:

- webhook URL is publiek bereikbaar
- mandate payment heeft metadata `subscriptionId`
- `mandate_payment_id` staat op het abonnement
- `MOLLIE_API_KEY`, `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` staan in Netlify
- `/docs/supabase-mollie-subscriptions-sync.sql` is uitgevoerd

## Fase 6.3 - Abonnementen Beheren

Admin kan onderhoudsabonnementen beheren via:

- `/.netlify/functions/admin-mollie-subscription-action`

Ondersteunde acties:

- `pause`
- `resume`
- `cancel`
- `sync`

De function vereist altijd `ADMIN_TOKEN` en gebruikt `MOLLIE_API_KEY`, `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` alleen server-side.

Voor `cancel` wordt de gekoppelde Mollie Subscription server-side opgezegd via Mollie. Daarna worden lokaal onder andere `status`, `mollie_subscription_status`, `canceled_at`, `cancellation_requested_at`, `cancellation_reason`, `admin_action_last_type` en `admin_action_last_at` bijgewerkt.

Voor `pause` en `resume` wordt in deze fase de lokale CRM-status bijgewerkt. De function schrijft bewust een duidelijke melding naar `admin_action_last_error`, omdat er in deze integratie geen directe Mollie-pauzeer- of hervatactie wordt aangeroepen. Daardoor blijft zichtbaar dat de Mollie-status nog via sync/webhook gecontroleerd moet worden.

Voor `sync` haalt de function de actuele Mollie Subscription en mandate op en synchroniseert onder andere:

- `mollie_subscription_status`
- lokale `status` bij duidelijke Mollie-statussen
- `mandate_status`
- `next_payment_at`
- `subscription_synced_at`
- `admin_action_last_*`

De aanvullende SQL staat in:

- `/docs/supabase-mollie-subscription-actions.sql`

## Bekende Beperkingen

Automatische retry payments buiten Mollie om zijn nog niet gebouwd.

Pauzeren en hervatten zijn in Fase 6.3 lokale CRM-acties met expliciete waarschuwing. Opzeggen en synchroniseren werken server-side met Mollie.

## Fase 6.4 - Mislukte Incasso's En Retries

Fase 6.4 maakt mislukte subscription payments opvolgbaar in het CRM.

Nieuwe database-uitbreiding:

- `/docs/supabase-subscription-retries.sql`

Nieuwe adminfunctie:

- `/.netlify/functions/admin-subscription-retry`

De webhook verwerkt subscription payment statussen:

- `failed`
- `expired`
- `canceled`
- `charged_back`

Bij een mislukte of geweigerde incasso vult de webhook:

- `last_failed_payment_at`
- `last_failed_payment_id`
- `failed_payment_count`
- `retry_status`
- `retry_next_action_at`
- `subscription_risk_level`
- `subscription_last_error`
- `webhook_last_event`
- `webhook_last_received_at`

Retry statussen:

- `payment_failed`: eerste mislukte incasso.
- `retry_needed`: vervolgactie of herhaalde poging nodig.
- `action_required`: hoge prioriteit, meestal na meerdere failures of chargeback.
- `resolved`: handmatig of via succesvolle betaling opgelost.

Risiconiveaus:

- `normal`: geen open retryprobleem.
- `attention`: minimaal een mislukte incasso.
- `high`: meerdere mislukte incasso's of chargeback.

Wanneer een latere betaling `paid` wordt, zet de webhook `retry_status` op `resolved`, `subscription_risk_level` op `normal`, wist `subscription_last_error` en werkt `last_payment_at` bij. `failed_payment_count` blijft behouden als historische teller.

Retry e-mails:

- De webhook probeert bij een eerste open retryprobleem automatisch een klantmail te sturen.
- Dubbele automatische mails worden voorkomen via `retry_last_email_sent_at`.
- Als e-mailconfiguratie ontbreekt of Resend faalt, blijft de webhookstatus-update doorgaan en wordt de fout alleen opgeslagen/logged.
- Admin kan handmatig opnieuw mailen via `send_retry_email`.

Adminacties:

- `mark_resolved`: zet retry op opgelost en risico terug naar normaal.
- `send_retry_email`: verstuurt een klantvriendelijke betaalprobleem-mail.
- `add_admin_note`: bewaart een interne retry-notitie.
- `sync`: haalt de laatste Mollie subscriptionstatus op en werkt lokale status bij.

Klantportaal:

- Klanten zien alleen een vriendelijke melding dat er een probleem is met de automatische betaling.
- Klanten zien geen technische Mollie foutcodes.
- Als `mandate_checkout_url` bestaat, blijft de knop `Voltooi machtiging` beschikbaar.

## Security

- Geen Mollie key in frontend.
- Geen Supabase service role key in frontend.
- Adminactie vereist `ADMIN_TOKEN`.
- Klanten lezen alleen eigen subscriptions via RLS.
- Klanten kunnen geen subscription aanmaken of beheren.
