# Food v1 — Fase 3 restaurantdashboard

## Doel en scope

Fase 3 bewijst lokaal dat één generiek restaurantdashboard dezelfde Food Engine gebruikt als de storefront. Een bevoegde medewerker kan nieuwe bestellingen zien, het detail veilig openen, de toegestane statusstappen uitvoeren en prijs of beschikbaarheid wijzigen. De storefront ziet de actuele menukaart; bestaande orderregels en totalen blijven immutable snapshots.

Silverado Roti Shop is alleen de eerste fixturetenant. Productieroutes, componenten en API-contracten blijven generiek en ondersteunen meerdere toegestane locaties via de sessiecontext.

## Lokaal starten

Vanaf de repositoryroot:

```sh
FOOD_PUBLIC_ORDERING_ENABLED=true node scripts/food-v1-phase-3-demo-server.mjs --port=4173
```

Open daarna:

```text
Dashboard:  http://127.0.0.1:4173/admin/food
Storefront: http://127.0.0.1:4173/food/silverado-roti-shop-emmeloord
```

De demo-server gebruikt `tests/fixtures/food-v1-phase-3-dashboard.json` en bewaart menu en orders uitsluitend in het geheugen. Stoppen en opnieuw starten herstelt de uitgangssituatie. De fixtures bevatten herkenbare lokale testtokens, geen echte sessies of secrets. De normale dashboardbootstrap gebruikt uitsluitend de centrale Supabase-sessie; alleen de lokale demo-server serveert een aparte testbootstrap.

In het lokale dashboard staat daarnaast **Demo herstellen**. Die knop wist uitsluitend de in-memory demo-orders en zet prijzen en beschikbaarheid terug naar de vaste fixture. De knop en het resetendpoint worden alleen door de lokale demoserver geleverd en bestaan niet in de productiebootstrap.

## Complete demonstratie

1. Open de storefront op telefoonformaat en plaats een afhaalbestelling met twee gerechten.
2. Open het dashboard op laptopformaat. De nieuwe bestelling verschijnt door de vijfsecondenpolling of direct na **Verversen**.
3. Open het orderdetail en controleer klantnaam, telefoon, regels, totaal en statusgeschiedenis.
4. Doorloop als manager `nieuw → geaccepteerd → in bereiding → gereed → afgerond`.
5. Open **Menukaart**, wijzig de prijs van één gerecht en sla op.
6. Vernieuw de storefront en controleer de nieuwe prijs.
7. Open de eerdere bestelling opnieuw en controleer dat de historische regelprijs en het totaal ongewijzigd zijn.

De statusknop blokkeert herhaalde klikken tijdens een mutatie en haalt daarna de actuele serverstatus opnieuw op. Polling pauzeert wanneer de pagina verborgen is, hervat bij terugkeer en stopt bij uitloggen of verlaten van de pagina.

## Rollen en isolatie controleren

De lokale demo start standaard als `manager`. Voor handmatige negatieve controles zijn uitsluitend lokaal deze queryvarianten beschikbaar:

```text
http://127.0.0.1:4173/admin/food?demo_role=kitchen
http://127.0.0.1:4173/admin/food?demo_role=viewer
http://127.0.0.1:4173/admin/food?demo_role=customer
```

- `kitchen` kan alleen geaccepteerde orders naar in bereiding en daarna gereed zetten.
- `viewer` kan lezen maar niet muteren.
- `customer` heeft geen Food-lidmaatschap en krijgt een veilige toegangsweigering.
- De isolatiefixture bevat daarnaast een tweede tenant om cross-tenant reads en mutaties te bewijzen; de UI toont nooit diens data.

Deze lokale rolkeuze bestaat niet in de productiebootstrap en is geen authenticatiebypass voor een gedeployde omgeving.

## Geautomatiseerde controle

```sh
node --test tests/food-v1-phase-3.test.js
node --test tests/food-v1-phase-1a.test.js tests/food-v1-phase-1b.test.js tests/food-v1-phase-2.test.js tests/food-v1-phase-3.test.js
./scripts/food-v1-phase-2-local-validation.zsh
node --test tests/*.test.js
```

De databasevalidatie weigert bekende remote databasevariabelen, gebruikt een tijdelijke lokale PostgreSQL-cluster zonder netwerklistener en ruimt die altijd op. Fase 3 voegt geen migratie toe en voert geen remote Supabase-, staging- of productieactie uit.

## Feature flags en fallback

- `FOOD_PUBLIC_ORDERING_ENABLED=true` is nodig om in de demo een nieuwe storefrontorder te maken.
- Ontbreekt de flag of staat deze niet exact op `true`, dan blijft het menu zichtbaar maar weigert de API ordercreatie veilig.
- Wanneer polling tijdelijk faalt, toont het dashboard een fout met een handmatige retry. De laatst bewezen data wordt niet stilzwijgend als actueel gepresenteerd.

## Bekende grenzen

- Alleen afhalen; geen betaling, bezorgen, reserveren, QR, kiosk of providerintegratie.
- De lokale demo-server is in-memory en niet bedoeld als productiebackend.
- Het dashboard haalt maximaal de eerste 100 recente orders op en filtert die lokaal voor de pilotweergave.
- Fase 3 biedt geen annulerenactie; alleen de bewezen positieve restaurantflow is bedienbaar.
- Geen realtime provider of pushkanaal: de pilot gebruikt betrouwbare polling van vijf seconden plus handmatig verversen.
- Menuprijzen, gerechten, tijden en Silverado-gegevens in fixtures moeten vóór livegang door de pilotpartner worden bevestigd.

## Terugdraaien

Vóór deployment kunnen uitsluitend de lokale Fase 3-commits worden teruggedraaid. Na een toekomstige deployment is de eerste veilige operationele stap `FOOD_PUBLIC_ORDERING_ENABLED=false`, zodat nieuwe storefrontorders stoppen terwijl bestaand beheer leesbaar blijft. Dashboardroutes worden alleen met een afzonderlijke forward commit verwijderd. Fase 3 bevat geen databasewijziging en autoriseert geen destructieve rollback of remote migratie.
