# Billing Test Plan

Gebruik dit testplan voordat Mollie Subscriptions of automatische incasso worden gebouwd.

## Benodigde Environment Variables

Netlify Functions gebruiken deze variabelen server-side:

- `ADMIN_TOKEN`
- `MOLLIE_API_KEY`
- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

Plaats deze waarden nooit in frontendcode.

## SQL Vooraf

Voer deze bestanden uit in Supabase SQL Editor:

1. `/docs/supabase-billing.sql`
2. `/docs/supabase-invoice-storage.sql`
3. `/docs/supabase-mollie-payments.sql`
4. `/docs/supabase-mollie-subscriptions.sql`
5. `/docs/supabase-mollie-subscriptions-sync.sql`
6. `/docs/supabase-mollie-subscription-actions.sql`
7. `/docs/supabase-subscription-retries.sql`

Controleer daarna dat `public.customer_invoices` minimaal deze velden heeft:

- `profile_id`
- `customer_auth_user_id`
- `amount`
- `status`
- `mollie_payment_id`
- `mollie_checkout_url`
- `mollie_payment_status`
- `paid_at`

## Mollie Testmodus

Gebruik in Netlify voor deze fase een Mollie test API key in:

- `MOLLIE_API_KEY`

Voorbeeldvorm:

- `test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

Zet `SITE_URL` op de publieke Netlify URL of productie-URL die Mollie kan bereiken. Lokale URLs werken niet voor webhooks.

## Testfactuur Aanmaken

1. Open `/admin-dashboard.html`.
2. Vul `ADMIN_TOKEN` in en laad CRM-data.
3. Maak of selecteer een klant.
4. Controleer dat het klantprofiel een gekoppelde Supabase Auth-user heeft.
5. Ga naar `Facturen`.
6. Maak een factuur aan met:
   - klant/profiel
   - factuurnummer
   - titel
   - bedrag groter dan `0`
   - status `draft`
7. Sla de factuur op.

Facturen zonder `profile_id` mogen niet worden opgeslagen. Facturen zonder `customer_auth_user_id` zijn niet zichtbaar in het klantportaal.

## Betaallink Testen

1. Klik bij de factuur op `Betaalverzoek maken`.
2. Verwacht:
   - factuurstatus wordt `sent`
   - Mollie payment id wordt zichtbaar
   - Mollie betaalstatus wordt zichtbaar
   - betaallink wordt opgeslagen
   - actie `Open betaallink` verschijnt
3. Klik opnieuw op `Betaalverzoek maken` terwijl de bestaande link nog actief is.
4. Verwacht:
   - bestaande actieve checkoutlink wordt hergebruikt
   - er wordt geen nieuw Mollie payment aangemaakt
   - admin ziet een waarschuwing dat er al een actieve betaallink is

## Klantportaal Testen

1. Log in op `/login.html` als de gekoppelde klant.
2. Open `/client-dashboard.html`.
3. Controleer dat de factuur zichtbaar is.
4. Controleer dat `Betaal factuur` zichtbaar is zolang de factuur niet `paid`, `expired`, `canceled` of `failed` is.
5. Klik `Betaal factuur`.
6. Rond de betaling af in Mollie test checkout.

## Webhook Controleren

Mollie stuurt statusupdates naar:

- `/.netlify/functions/mollie-webhook`

Controleer in Netlify logs:

- Mollie payment id
- Mollie status
- invoice id
- bijgewerkte factuurstatus
- eventuele automatische betaalbevestiging

De webhook zoekt de factuur via:

- `customer_invoices.mollie_payment_id`

Als er geen factuur is gevonden, hoort er een waarschuwing in de logs te staan zonder secrets.

## Factuurmails Testen

Benodigde extra env vars:

- `RESEND_API_KEY`
- `FROM_EMAIL`
- `ADMIN_EMAIL`
- `SITE_URL`

Voorbereiding:

1. Voer `/docs/supabase-invoice-emails.sql` uit in Supabase.
2. Controleer dat de klant in `profiles.email` een geldig e-mailadres heeft.
3. Controleer dat Resend het ingestelde `FROM_EMAIL` domein mag verzenden.

Handmatige mailtest:

1. Open `/admin-dashboard.html`.
2. Laad admin met `ADMIN_TOKEN`.
3. Ga naar Facturen.
4. Klik op `Verstuur factuurmail`.
5. Verwacht:
   - klant ontvangt een Nederlandstalige factuurmail
   - `email_sent_at` wordt gevuld
   - admin toont de verzenddatum in de e-mailkolom

Herinnering testen:

1. Gebruik een factuur die nog niet `paid`, `expired`, `canceled` of `failed` is.
2. Klik op `Verstuur herinnering`.
3. Verwacht dat `payment_reminder_sent_at` wordt gevuld.

Betaalbevestiging testen:

1. Zet een factuur op `paid` of rond Mollie testbetaling af.
2. Klik eventueel handmatig op `Verstuur betaalbevestiging`.
3. Verwacht dat `paid_email_sent_at` wordt gevuld.
4. Bij Mollie webhook `paid` probeert de webhook dit automatisch te doen als `paid_email_sent_at` nog leeg is.

Verlopenmelding testen:

1. Zet een factuur op `expired`.
2. Klik op `Verstuur verlopenmelding`.
3. Verwacht dat `expired_email_sent_at` wordt gevuld.

## Verwachte Statusovergangen

Factuurstatussen:

- `draft`
- `sent`
- `paid`
- `expired`
- `canceled`
- `failed`

Mollie-statussen:

- `open`
- `pending`
- `paid`
- `failed`
- `expired`
- `canceled`

Mapping:

- Mollie `paid` -> factuur `paid`, `paid_at` gevuld
- Mollie `canceled` -> factuur `canceled`
- Mollie `expired` -> factuur `expired`
- Mollie `failed` -> factuur `failed`
- Mollie `open` of `pending` -> factuur `sent`

## Veelvoorkomende Foutmeldingen

### Mollie- of Supabase-configuratie ontbreekt

Controleer:

- `MOLLIE_API_KEY`
- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### Factuurbedrag moet groter zijn dan 0

Oplossing:

- Vul een bedrag hoger dan `0` in op de factuur.

### Factuur niet gevonden

Controleer:

- bestaat de factuur nog in `public.customer_invoices`
- klopt het factuur ID in de adminactie
- is de SQL-migratie uitgevoerd

### Mollie gaf geen geldige betaallink terug

Controleer:

- Mollie API key is geldig
- Mollie-account staat in testmodus met een test key
- bedrag staat als geldig EUR-bedrag met twee decimalen

### Klant ziet factuur niet

Controleer:

- `customer_auth_user_id` is gevuld op de factuur
- klant is ingelogd met dezelfde Supabase Auth-user
- RLS uit `/docs/supabase-billing.sql` is uitgevoerd

### Webhook werkt status niet bij

Controleer:

- `SITE_URL` is publiek bereikbaar
- webhook URL in Mollie payment eindigt op `/.netlify/functions/mollie-webhook`
- `mollie_payment_id` staat op de factuur
- Netlify function logs tonen geen Supabase-configuratiefout

### Abonnement opzeggen testen

Voor Fase 6.3:

1. Voer `/docs/supabase-mollie-subscription-actions.sql` uit.
2. Zorg dat een abonnement een `mollie_customer_id` en `mollie_subscription_id` heeft.
3. Klik in de Onderhoud-module op `Opzeggen`.
4. Bevestig de actie en vul optioneel een opzegreden in.
5. Verwacht:
   - lokale status `canceled`
   - Mollie-status `canceled`
   - `canceled_at` en `cancellation_requested_at` gevuld
   - `admin_action_last_type` = `cancel`
6. Controleer in Mollie test dashboard dat de subscription is opgezegd.

### Abonnement pauzeren/hervatten testen

Pauzeren en hervatten zijn in deze fase lokale CRM-acties:

1. Klik op `Pauzeren`.
2. Verwacht lokale status `paused` en een melding in `admin_action_last_error`.
3. Klik op `Hervatten`.
4. Verwacht lokale status `active`, `resumed_at` gevuld en opnieuw een duidelijke melding.
5. Gebruik `Synchroniseer abonnement` om de actuele Mollie-status naast de lokale CRM-status te controleren.

## Subscription Retries Testen

Voor Fase 6.4:

1. Voer `/docs/supabase-subscription-retries.sql` uit.
2. Zorg dat `RESEND_API_KEY`, `FROM_EMAIL`, `ADMIN_EMAIL` en `SITE_URL` zijn ingesteld als je e-mail wilt testen.
3. Gebruik Mollie testmodus en laat een subscription payment falen, verlopen of annuleren.
4. Controleer Netlify logs van `/.netlify/functions/mollie-webhook`.
5. Verwacht op het abonnement:
   - `last_failed_payment_at` gevuld
   - `last_failed_payment_id` gevuld
   - `failed_payment_count` verhoogd
   - `retry_status` = `payment_failed`, `retry_needed` of `action_required`
   - `subscription_risk_level` = `attention` of `high`
   - `retry_next_action_at` gevuld
6. Controleer in het admin-dashboard de Onderhoud-module:
   - mislukte betalingen zichtbaar
   - retry status zichtbaar
   - risiconiveau zichtbaar
   - volgende actie zichtbaar
   - knoppen `Retry-mail versturen`, `Markeer opgelost`, `Voeg notitie toe`, `Synchroniseer retry-status`
7. Klik `Retry-mail versturen`.
8. Verwacht dat `retry_last_email_sent_at` wordt gevuld.
9. Klik `Markeer opgelost`.
10. Verwacht `retry_status = resolved` en `subscription_risk_level = normal`.

Wanneer een latere Mollie betaling `paid` wordt:

- `retry_status` wordt `resolved`
- `subscription_risk_level` wordt `normal`
- `subscription_last_error` wordt leeg
- `last_payment_at` wordt bijgewerkt
- `failed_payment_count` blijft bewaard als historische teller

Klantportaal:

1. Log in als gekoppelde klant.
2. Controleer dat bij een open retryprobleem een klantvriendelijke melding zichtbaar is.
3. Controleer dat technische Mollie foutcodes niet zichtbaar zijn.
4. Als `mandate_checkout_url` beschikbaar is, controleer dat `Voltooi machtiging` zichtbaar blijft.

### Factuurmail kan niet worden verzonden

Controleer:

- `RESEND_API_KEY` is gezet in Netlify
- `FROM_EMAIL` is toegestaan in Resend
- `profiles.email` is gevuld en geldig
- `/docs/supabase-invoice-emails.sql` is uitgevoerd
- `email_last_error` op de factuur bevat de laatste provider- of validatiefout

## Beperkingen

Nog niet in deze flow:

- Mollie Subscriptions
- automatische incasso
- PDF-generatie
- volledige admin-auth met rollen en audit trail
