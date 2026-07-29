# Food v1 — Fase 2 lokale verkoopdemo

## Doel en scope

Deze demo bewijst één complete, mobiele afhaalflow voor de eerste pilottenant Silverado Roti Shop in Emmeloord:

1. restaurantprofiel en gepubliceerd menu laden via de Food API;
2. meerdere gerechten en aantallen in een lokaal winkelmandje beheren;
3. contactgegevens valideren en één afhaalbestelling plaatsen;
4. het definitieve, door de server berekende totaal ophalen;
5. de bevestiging tonen via een ondoorzichtige publieke referentie.

De storefront zelf is generiek. De route `/food/:storefrontSlug`, de componenten en de API bevatten geen Silverado-specifieke logica. Silverado staat uitsluitend in de tenantfixture.

## Lokaal starten

Vanaf de repositoryroot:

```sh
FOOD_PUBLIC_ORDERING_ENABLED=true node scripts/food-v1-phase-2-demo-server.mjs --port=4173
```

Open daarna:

```text
http://127.0.0.1:4173/food/silverado-roti-shop-emmeloord
```

De lokale server gebruikt `tests/fixtures/food-v1-phase-2-storefront.json`, bewaart bestellingen alleen in het geheugen en logt geen klantgegevens. Stoppen en opnieuw starten wist alle demo-orders. Het winkelmandje kan worden gewist door de aantallen naar nul te brengen of de sessie/tab te sluiten.

## Veilige fallback demonstreren

Start met de bestelfunctie uitgeschakeld:

```sh
FOOD_PUBLIC_ORDERING_ENABLED=false node scripts/food-v1-phase-2-demo-server.mjs --port=4173
```

Het profiel en menu blijven zichtbaar. De winkelmand toont professioneel dat online bestellen nog niet beschikbaar is en de API weigert nieuwe orders. Dit is de standaardveilige toestand wanneer de omgevingsvariabele ontbreekt of niet exact `true` is.

## Handmatige demo-flow

1. Open de Silverado-route op een telefoonformaat.
2. Voeg twee verschillende gerechten toe.
3. Verhoog en verlaag een aantal en controleer dat nul de regel verwijdert.
4. Open het winkelmandje en ga verder met afhalen.
5. Vul minimaal naam en telefoon in; e-mail, afhaalmoment en opmerking zijn optioneel.
6. Bevestig de bestelling eenmaal. De knop blokkeert dubbelklikken.
7. Controleer referentie, status, immutable bestelregels en definitief servertotaal.
8. Een technische retry gebruikt dezelfde idempotency key en kan daardoor geen tweede bestelling maken.

De browser verstuurt alleen itemreferenties, aantallen en expliciet ingevulde bestelgegevens. Tenant-ID's, locatie-ID's, belastingklasse-ID's en door de browser berekende bedragen worden niet geaccepteerd als bron van waarheid.

## Geautomatiseerde controle

```sh
node --test tests/food-v1-phase-2.test.js
./scripts/food-v1-phase-2-local-validation.zsh
```

De tweede opdracht bouwt een tijdelijke PostgreSQL-cluster op een lokale Unix-socket, weigert bekende remote databasevariabelen en ruimt de cluster altijd op. Er worden geen externe Supabase-, staging- of productieomgevingen geraakt.

## Herkomst pilotinhoud

De Silverado-verkoopdemo uit het aangeleverde ZIP-bestand is alleen als visuele en inhoudelijke referentie gebruikt. De groene, crème en gouden richting is vertaald naar de generieke storefront. Beoordelingen, bezorgbeloften, allergenenclaims en andere niet-bevestigde verkoopclaims zijn bewust niet overgenomen.

Het officiële woordmerk is op 28 juli 2026 gecontroleerd op de bestaande Silverado-site. Daar is geen afzonderlijk logo-afbeeldingsbestand gepubliceerd: het merk wordt weergegeven als `Silverado` in een klassieke serifstijl met de Surinaamse vlag. Food v1 modelleert dit daarom als veilige, configureerbare `logo_text` plus `logo_suffix`; andere tenants kunnen dezelfde brandingconfiguratie of een veilige `logo_url` gebruiken.

Alle gerechten, prijzen, openingstijden, contact- en adresgegevens in de fixture zijn realistische pilotinhoud en moeten vóór livegang door Silverado worden bevestigd.

## Bekende grenzen van Fase 2

- Alleen afhalen; geen bezorgen, reserveren of tafelbestellen.
- Geen online betaling of providerconfiguratie.
- De demo-server is lokaal en in-memory; hij is geen productiebackend.
- De echte API controleert de feature flag en bekende gesloten openingstijden vóór ordercreatie.
- Openingstijdvensters die over middernacht lopen worden in v1 niet geïnterpreteerd; configureer zulke uren als afzonderlijke dagvensters of houd bestellen uitgeschakeld.
- Bevestigingen zijn alleen opvraagbaar met de storefrontslug én een 32-byte ondoorzichtige referentie; er bestaat geen publieke orderlijst.
- De nieuwe migratie is forward-only en is niet remote uitgevoerd.

## Terugdraaien

Voor de lokale demo: stop de server. Voor een toekomstige omgeving: zet `FOOD_PUBLIC_ORDERING_ENABLED=false` om ordercreatie direct te blokkeren terwijl het menu leesbaar blijft. De Fase 2-migratie wordt niet destructief teruggedraaid; een eventuele correctie gebeurt met een nieuwe forward-only migratie.
