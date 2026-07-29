# Silverado live-demo

Status: functioneel bevroren zodra de drie online demonstratieruns en de eindreset groen zijn vastgelegd.

## Openen

- Storefront: `https://max-webstudio-food-demo.netlify.app/food/silverado-roti-shop-emmeloord`
- Dashboard: `https://max-webstudio-food-demo.netlify.app/admin/food`
- Login wanneer de sessie verlopen is: `https://max-webstudio-food-demo.netlify.app/login.html?next=%2Fadmin%2Ffood`
- QR-code: `public/assets/food/silverado/silverado-demo-qr.svg`

De QR-code bevat uitsluitend de publieke storefront-URL. Er staan geen
credentials, tenant-ID's of persoonsgegevens in.

## Klikvolgorde voor donderdag

1. Open het dashboard op de laptop en controleer links `Silverado` en `Manager · Emmeloord`.
2. Open of scan de storefront op de telefoon.
3. Toon kort het Silverado-logo, de zes gerechtfoto's en de actuele kaart met acht gerechten.
4. Voeg `Roti kip filet met groenten en ei` en `Loempia's 5 stuks` toe.
5. Open het mandje en kies `Verder met afhalen`.
6. Gebruik uitsluitend synthetische gegevens, bijvoorbeeld naam `Silverado Demo` en telefoon `0612345678`.
7. Bevestig de bestelling. Er vindt geen online betaling plaats.
8. Wacht maximaal vijf seconden tot de nieuwe `Demo/test`-bestelling in het dashboard verschijnt.
9. Open de bestelling, kies `Bestelling accepteren` en daarna `Start bereiding`.
10. Open `Menukaart`, wijzig de prijs van de roti tijdelijk van `10,00` naar `10,50` en sla op.
11. Vernieuw de storefront en toon de prijs `€ 10,50`.
12. Zet de prijs in het dashboard terug naar `10,00`.
13. Ga naar `Overzicht`, kies `Demo herstellen`, typ exact
    `HERSTEL silverado-roti-shop-emmeloord` en bevestig.
14. Controleer nul bestellingen en de oorspronkelijke acht prijzen.

## Foutbestendige reset

Gebruik uitsluitend de knop `Demo herstellen` in het Silverado-dashboard. De
server toont de knop alleen aan een bevoegde manager of platformadmin, eist de
tenantgebonden bevestiging en verwijdert transactioneel uitsluitend Silverado-
demo-orders en bijbehorende regels, historie en idempotencyrecords. De vaste
menu-baseline herstelt prijs en beschikbaarheid. De isolatietenant, accounts,
rollen, restaurantgegevens en Auth-gebruikers blijven behouden.

Wanneer de reset faalt: plaats geen tweede bestelling, voer geen SQL uit en
ververs niet herhaaldelijk. Noteer het tijdstip en stop de live orderflow.

## Noodscenario

Wanneer internet of live bestellen tijdens het gesprek faalt:

1. Blijf op de reeds geladen storefront en demonstreer branding, foto's, menu en mandje zonder te verzenden.
2. Toon op de laptop het reeds geladen dashboard met de vijfsecondenverversing en de menukaart.
3. Leg uit: `De demo staat bewust geïsoleerd van productie en echte betalingen. De live orderstap doen we na het gesprek opnieuw zodra de verbinding stabiel is.`
4. Gebruik geen productie- of stagingomgeving als alternatief en activeer geen betaalprovider.

## Accounts

De synthetische manager-, platformadmin- en isolatieaccountcredentials blijven
uitsluitend in macOS Keychain. Gebruik geen credential in documentatie,
screenshots, QR-codes of chat. De manageraccount hoort exact één Silverado-scope
te zien; de isolatiemanager uitsluitend de synthetische isolatietenant.

## Freeze-regels

- Geen echte betaling of providercall.
- Geen verdere kernfunctionaliteit vóór het verkoopgesprek.
- Geen merge naar `main`; PR #12 blijft draft en auto-merge blijft uit.
- Alleen feitelijk onjuiste presentatietekst mag na de freeze nog worden gecorrigeerd.
