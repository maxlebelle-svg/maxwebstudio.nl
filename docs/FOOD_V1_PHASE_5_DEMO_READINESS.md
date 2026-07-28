# Food v1 — Fase 5 lokale demogereedheid

## Uitkomst

De lokale Silverado-pilot is gereed voor een herhaalbare verkoopdemo. De kritieke flow werkt zonder betaling of externe provider en kan na iedere oefenronde met één knop worden hersteld.

Dit is geen deploymentgoedkeuring. Er zijn geen remote migraties, providerconfiguraties, stagingwijzigingen of productiewijzigingen uitgevoerd.

## Eén lokale gereedheidscontrole

Voer vanaf de repositoryroot uit:

```sh
./scripts/food-v1-phase-5-readiness.zsh
```

De controle stopt direct wanneer een bekende remote databasevariabele actief is. Daarna controleert zij syntax, alle Food-fasen, toegangsbeveiliging, de bestaande geïsoleerde PostgreSQL-validatie, de lokale reset en de eerlijke integratiestatussen.

Verwachte eindregel:

```text
status=PASS_FOOD_V1_PHASE_5_DEMO_READY_LOCAL
```

## Demo starten

```sh
FOOD_PUBLIC_ORDERING_ENABLED=true node scripts/food-v1-phase-3-demo-server.mjs --port=4173
```

Open:

```text
Telefoon:  http://127.0.0.1:4173/food/silverado-roti-shop-emmeloord
Laptop:    http://127.0.0.1:4173/admin/food
Roadmap:   http://127.0.0.1:4173/admin/food/integrations
```

## Repetitie van de donderdagflow

1. Klik in het dashboard op **Demo herstellen**.
2. Open de storefront op de telefoon en controleer het Silverado-woordmerk.
3. Voeg twee gerechten toe en open het winkelmandje.
4. Plaats de afhaalbestelling met testnaam en testtelefoon.
5. Open het dashboard op de laptop en wacht maximaal vijf seconden.
6. Open de nieuwe bestelling en accepteer haar.
7. Zet de order achtereenvolgens **in bereiding** en **gereed**.
8. Open **Menukaart**. Wijzig de prijs van één gerecht en sla op.
9. Vernieuw de storefront en toon de gewijzigde publieke prijs.
10. Open het orderdetail opnieuw en toon dat de historische orderprijs gelijk blijft.
11. Open **Integraties** en benoem expliciet dat `0 van 6 verbonden` is.
12. Sluit af met **Demo herstellen**, zodat de volgende presentatie schoon begint.

## Wat donderdag wel wordt beloofd

- Alleen afhalen.
- Serverberekende bedragen.
- Eén betrouwbare bestelling zonder dubbelklikduplicaat.
- Dashboardverschijning via vijfsecondenpolling.
- Geldige statusstappen en statusgeschiedenis.
- Prijs- en beschikbaarheidsbeheer voor bevoegde rollen.
- Tenantisolatie tussen Silverado en de tweede testtenant.
- Configureerbare restaurantbranding binnen het generieke Food-platform.

## Wat niet wordt beloofd

- Geen echte betaling of Mollie-sandboxflow.
- Geen bezorgen, reserveringen, QR-bestellen, kiosk of keukenhardware.
- Geen echte Google-, Meta-, WhatsApp- of Thuisbezorgdverbinding.
- Geen productieaccount, productiegegevens of live providerstatus.
- Geen deployment vanuit deze fase.

## Fallback tijdens het gesprek

- De lokale demo heeft geen internet nodig voor de kernflow.
- Storefront en dashboard draaien op dezelfde laptop; de telefoon kan desnoods worden vervangen door een smal browservenster.
- Bij een vervuilde demo: klik **Demo herstellen**.
- Bij een gestopte server: start dezelfde lokale opdracht opnieuw; alle data komt terug uit de vaste fixtures.
- Gebruik de vastgelegde storefront-, order-, menu-, dashboard- en integratiescreenshots als visueel bewijs wanneer een scherm niet kan worden gedeeld.

## Freezecheck vóór vertrek

- Gereedheidscontrole geeft PASS.
- Werkboom is schoon.
- Lokale server start zonder fout.
- Testorder verschijnt binnen vijf seconden.
- Prijswijziging is publiek zichtbaar.
- Demo herstellen geeft nul orders en de oorspronkelijke prijs.
- Geen lastminute migratie, authwijziging, providerkoppeling of nieuwe functionaliteit.
