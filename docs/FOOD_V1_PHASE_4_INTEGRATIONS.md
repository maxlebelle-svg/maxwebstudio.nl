# Food v1 — Fase 4 integratiescherm

## Doel

Het lokale restaurantdashboard toont een professionele roadmap voor zes integraties zonder een providerverbinding te simuleren. Het scherm ondersteunt het verkoopgesprek, maar verandert niets aan de bewezen bestel-, status- of menuflow.

Route:

```text
http://127.0.0.1:4173/admin/food/integrations
```

## Status per integratie

| Integratie | Getoonde status | Werkelijkheid in Fase 4 |
| --- | --- | --- |
| Mollie | Onboarding vereist | Geen sandboxcheck, betaling of webhook geactiveerd |
| Google Business Profile | Niet verbonden | Geen accounttoestemming of publicatie |
| Google Ads | Binnenkort beschikbaar | Geen advertentieaccount, budget of conversiemeting |
| Meta | Binnenkort beschikbaar | Geen Instagram-/Facebook-account of pixel gekoppeld |
| WhatsApp Business | Niet verbonden | Geen nummerverificatie of berichtenverkeer |
| Thuisbezorgd | Haalbaarheid onderzoeken | Technische en contractuele toegang nog onbevestigd |

Het scherm toont daarom expliciet `0 van 6 verbonden`. Er bestaan geen verbindingsknoppen, OAuth-routes, tokens, providercredentials, webhooks of verzonnen campagneresultaten.

## Veiligheidsgrens

- Geen migraties of nieuwe provider-endpoints.
- Geen staging-, productie- of dashboardconfiguratie gewijzigd.
- Geen betaling nodig voor de donderdagflow.
- De bestaande serverberekende pickuporder blijft volledig onafhankelijk van Mollie.
- Een echte integratie krijgt later een eigen ontwerp, threat model, testomgeving en expliciete releasepoort.

## Lokaal controleren

```sh
node --test tests/food-v1-phase-4.test.js
```

Gebruik voor de presentatieroute dezelfde lokale server als Fase 3. De knop **Demo herstellen** brengt orders en menu terug naar de vaste uitgangssituatie; het integratiescherm bevat zelf geen mutaties.
