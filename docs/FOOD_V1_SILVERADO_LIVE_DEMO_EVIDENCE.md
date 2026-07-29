# Silverado live-demo freeze-evidence

- Datum: 29 juli 2026
- Branch: `codex/food-v1-silverado-pilot`
- Runtimecommit: `7622d884f822fabe68198c9bc9fccdbaf5924b6c`
- Actieve Netlify-deploy: `6a699e15ccf9a2902dd27606`
- PR: `#12`, open als draft, auto-merge uit

## Afbakening

Deze validatie raakt uitsluitend de geïsoleerde Food Demo Cloud voor Silverado.
De Max Webstudio-productie- en stagingprojecten zijn niet benaderd of gewijzigd.
Er is geen echte betaling, betaalprovider, externe integratie of andere
providercall gebruikt.

## Database voor de runs

- migratiegeschiedenis: 8 entries;
- Food-accounts: 2;
- restaurantlocaties: 2;
- Silverado-actieve gerechten: 8;
- orders, orderregels, statushistorie en idempotencyrecords: 0;
- Auth-gebruikers: 3 synthetische demoaccounts.

## Drie demonstratieruns

Alle drie runs zijn uitgevoerd op een mobiele viewport en bevatten dezelfde
volledige keten:

1. twee Silverado-gerechten selecteren;
2. een synthetische testbestelling zonder betaling plaatsen;
3. de bestelling live in het Silverado-managerdashboard ontvangen;
4. de bestelling accepteren en op `In bereiding` zetten;
5. één menuprijs tijdelijk wijzigen;
6. de gewijzigde prijs na verversen op de storefront controleren;
7. de oorspronkelijke prijs herstellen;
8. uitsluitend de Silverado-demodata transactioneel resetten.

Resultaten:

| Run | Bestelling | Dashboard | Statusflow | Prijswijziging | Reset |
| --- | --- | --- | --- | --- | --- |
| 1 | geslaagd | direct zichtbaar | Nieuw → Geaccepteerd → In bereiding | `€ 10,00` → `€ 10,50` → `€ 10,00` | geslaagd |
| 2 | geslaagd | direct zichtbaar | Nieuw → Geaccepteerd → In bereiding | `€ 10,00` → `€ 10,75` → `€ 10,00` | geslaagd |
| 3 | geslaagd | direct zichtbaar | Nieuw → Geaccepteerd → In bereiding | `€ 10,00` → `€ 10,25` → `€ 10,00` | geslaagd |

Elke order was in storefront en dashboard herkenbaar als demo/test. Geen run
bevatte een betaalstap of echte persoonsgegevens.

## Accounts en tenantisolatie

- Silverado-manager: login geslaagd, één Silverado-scope, sessieverversing en logout geslaagd;
- platformadmin: login geslaagd, twee geïsoleerde demo-scopes, sessieverversing en logout geslaagd;
- isolatiemanager: login geslaagd, uitsluitend de synthetische isolatietenant, sessieverversing en logout geslaagd;
- een Silverado-managersessie kreeg geen toegang tot de isolatietenant;
- credentials en tokens zijn uitsluitend runtime uit macOS Keychain gebruikt en niet gelogd of opgeslagen.

## Eindstaat

- Food-accounts: 2;
- restaurantlocaties: 2;
- Silverado-actieve gerechten: exact 8;
- vaste Silverado-testprijs: `1000` cent (`€ 10,00`);
- isolatietenant-gerechten: 1, ongewijzigd;
- orders: 0;
- orderregels: 0;
- statushistorie: 0;
- idempotencyrecords: 0;
- Auth-gebruikers: 3, ongewijzigd;
- reset-auditrecords: 3;
- reset-rate-limit teller: 3, overeenkomstig de drie bewezen runs.

## Storefront- en releasecontrole

- mobiel: 390 px breed, geen horizontale overloop;
- desktop: 1440 px breed, geen horizontale overloop;
- exact 8 zichtbare gerechten;
- exact 6 galerijafbeeldingen, alle 6 geladen;
- geen browserconsolefouten;
- live robots-meta: `noindex, nofollow, noarchive, nosnippet`;
- Netlify verwerkte 23 redirects, 25 headerregels en 121 Functions zonder fout;
- QR-code: `public/assets/food/silverado/silverado-demo-qr.svg`;
- klikhandleiding en foutbestendige reset: `docs/FOOD_V1_SILVERADO_LIVE_DEMO.md`.

## Bekende beperkingen

- De demo accepteert uitsluitend afhalen zonder online betaling.
- Buiten echte openingstijden is bestellen alleen mogelijk door de expliciete,
  Silverado-allowlisted `food_demo`-override; de getoonde openingstijden blijven
  de echte restauranttijden.
- De reset is bewust begrensd tot drie verzoeken per tien minuten per actor en
  tenant. Na drie oefenruns moet het venster verstrijken voordat opnieuw drie
  resets mogelijk zijn.
- Menu-inhoud, ingrediënten en allergenen blijven pilotinhoud die vóór echte
  livegang door Silverado moet worden bevestigd.
- Er is geen extra schermopname gemaakt; de handleiding bevat het noodscenario
  wanneer internet of live bestellen tijdens het gesprek uitvalt.

## Freeze-besluit

De Silverado-demo is functioneel bevroren op runtimecommit `7622d884` en deploy
`6a699e15ccf9a2902dd27606`. Er volgt vóór het verkoopgesprek geen verdere
functionele wijziging, merge naar `main` of nieuwe deploy. PR #12 blijft draft
met auto-merge uit.
