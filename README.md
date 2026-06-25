# Max Webstudio

Statische website voor Max Webstudio met een Fase 1 Mollie Checkout-betaalflow via Netlify Functions.

## Mollie testmodus

1. Zet in Netlify `MOLLIE_MODE=test`.
2. Controleer dat `MOLLIE_TEST_API_KEY` is ingevuld.
3. Redeploy de website.
4. Ga naar `/betalen.html`.
5. Kies een pakket of open direct bijvoorbeeld `/betalen.html?product=business_website_deposit`.
6. Vul naam, e-mailadres en telefoonnummer in.
7. Klik op `Betaal veilig via Mollie`.
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
- API keys staan alleen in Netlify environment variables.
- Frontend-code bevat geen Mollie API keys.
- Webhook verwerkt Mollie statussen via `netlify/functions/mollie-webhook.js`.
