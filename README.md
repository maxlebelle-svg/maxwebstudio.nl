# Max Webstudio

Statische website voor Max Webstudio met een Fase 1 Mollie Checkout-betaalflow via Netlify Functions.

## Mollie testmodus

1. Zet in Netlify `MOLLIE_MODE=test`.
2. Controleer dat `MOLLIE_TEST_API_KEY` is ingevuld.
3. Redeploy de website.
4. Ga naar `/betalen.html`.
5. Kies een websitepakket en onderhoudspakket, of open direct bijvoorbeeld `/betalen.html?website=business_website&care=care_plus`.
6. Vul naam, e-mailadres en telefoonnummer in.
7. Klik op `Betaal aanbetaling via Mollie`.
8. Controleer of Mollie Checkout opent.
9. Controleer de webhook logs bij Netlify Functions.

## Live

1. Zet in Netlify `MOLLIE_MODE=live`.
2. Controleer dat `MOLLIE_API_KEY` is ingevuld.
3. Controleer `BASE_URL`, bijvoorbeeld `https://maxwebstudio.nl`.
4. Redeploy de website.
5. Test met een kleine betaling of echte aanbetaling.
6. Controleer de betaling in het Mollie dashboard en de Netlify webhook logs.

## Belangrijk

- Bedragen worden server-side bepaald in `netlify/functions/create-payment.js`.
- Mollie rekent in Fase 1 alleen de website-aanbetaling af.
- Het gekozen onderhoudspakket wordt opgeslagen in Mollie metadata en start nog niet automatisch.
- Het restbedrag wordt later via aparte betaallink of factuur voldaan.
- API keys staan alleen in Netlify environment variables.
- Frontend-code bevat geen Mollie API keys.
- Webhook verwerkt Mollie statussen via `netlify/functions/mollie-webhook.js`.

## Fase 2 onboarding en e-mail

Na betaling gaat de klant via `bedankt.html` door naar `onboarding.html`.

Benodigde environment variables voor automatische e-mail:

- `EMAIL_PROVIDER=resend`
- `RESEND_API_KEY`
- `FROM_EMAIL=info@maxwebstudio.nl`
- `ADMIN_EMAIL=info@maxwebstudio.nl`
- `ADMIN_TOKEN`

Als `RESEND_API_KEY` nog ontbreekt, wordt de intake wel verwerkt en gelogd. De function geeft dan `success: true` terug met een waarschuwing: `Email skipped: RESEND_API_KEY missing`.

Admin intakes uitlezen:

`GET /.netlify/functions/admin-intakes`

Header:

`Authorization: Bearer ADMIN_TOKEN`

## Fase 4 premium project wizard

`onboarding.html` bevat nu een premium 10-staps project wizard voor:

- bedrijfsinformatie
- logo-keuze en logo-upsell
- huisstijl en inspiratie
- pagina's en extra pagina's
- teksten en copywriting-upsell
- foto's/media en fotografie-upsell
- extra functies zoals WhatsApp, Google Maps, afspraakplanner, Mollie en analytics
- planning en intakegesprek
- samenvatting met geschatte extra waarde excl. btw

Belangrijk:

- Extra opties worden niet automatisch afgerekend.
- Extra opties worden opgeslagen als extra wensen/offerte-uitbreiding.
- De wizard gebruikt `localStorage` voor autosave.
- `submit-onboarding.js` stuurt de volledige samenvatting naar Max Webstudio en naar de klant zodra e-mail actief is.
- Later uitbreidbaar met klantportaal en aparte betalingen voor extra opties.
