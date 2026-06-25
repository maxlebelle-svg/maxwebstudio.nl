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
