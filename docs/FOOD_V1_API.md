# Max Webstudio Food v1 API

Status: lokale Food v1-contractlaag tot en met Phase 3. Niet gedeployed en niet remote toegepast.

## Grens en uitgangspunten

`/api/food/v1` is de enige applicatielaag voor de toekomstige website en het restaurantdashboard. De Netlify-adapter routeert naar `functions/food-v1.js`; domeinlogica en validatie staan in `functions/_food-api.js`. Clients muteren geen Food-tabellen rechtstreeks.

Phase 1A blijft leidend voor tenantisolatie, prijzen, belasting, idempotency en statustransities. Phase 1B voegt alleen twee smalle service-only databasefuncties toe: een geredigeerd bevestigings-readmodel en een duurzame order-rate-limit.

Alle JSON-responses hebben deze envelop:

```json
{"success":true,"data":{},"request_id":"uuid"}
```

Fouten hebben `success: false`, een stabiele `code`, een generieke Nederlandse melding en dezelfde request-id. Responses zijn `no-store` en bevatten geen secrets of databasefouttekst.

## Routes

### Publiek

| Methode | Route | Functie |
| --- | --- | --- |
| `GET` | `/api/food/v1/storefronts/:slug` | Publiceerbaar restaurant- en locatieprofiel |
| `GET` | `/api/food/v1/storefronts/:slug/menu` | Laatste gepubliceerde menu, actieve categorieën en actieve/beschikbare items |
| `POST` | `/api/food/v1/storefronts/:slug/orders` | Pickuporder via `food_create_order_v1` |
| `GET` | `/api/food/v1/storefronts/:slug/orders/:public_reference/confirmation` | Eén geredigeerde orderbevestiging |

Er bestaat bewust geen publieke orderlijstroute. `public_reference` is een willekeurige 128-bit bearerreferentie en wordt bovendien aan de storefrontslug gebonden. De bevestiging bevat geen interne tenant-/locatie-/order-ID, klantgegevens, notitie of auditgeschiedenis.

Het publieke menu noemt UUID-gebaseerde `category_ref` en `item_ref` als opaque clientreferenties. Deze zijn nodig om een item te bestellen, maar geven geen tenant- of locatie-identiteit vrij.

### Restaurantbeheer

| Methode | Route | Vereisten |
| --- | --- | --- |
| `GET` | `/api/food/v1/session/context` | Actieve sessie; retourneert uitsluitend Food-locaties waarvoor de actor lidmaatschap en beheerrechten heeft |
| `GET` | `/api/food/v1/accounts/:account_id/orders?location_id=...&status=...&limit=...&offset=...` | Actieve sessie, Food-lidmaatschap voor locatie, `orders.management` |
| `GET` | `/api/food/v1/accounts/:account_id/orders/:order_id` | Zelfde, plus order binnen account en locatiebereik |
| `PATCH` | `/api/food/v1/accounts/:account_id/orders/:order_id/status` | Muterende orderrol; transitie via `food_transition_order_status_v1` |
| `GET` | `/api/food/v1/accounts/:account_id/menu?location_id=...` | Food-lidmaatschap voor locatie, `menu.management` |
| `PATCH` | `/api/food/v1/accounts/:account_id/menu/items/:item_id` | `owner` of `manager`, item binnen eigen account/locatie, `menu.management` |

Platformrollen `admin` en `super_admin` mogen dezelfde beheercontracten gebruiken. Alle overige accounts worden via het actieve profiel en `food_account_members` aan hun locatiebereik gebonden. De authenticated Supabase-JWT blijft actief voor RLS-gelezen orders en menugegevens. Alleen de gecontroleerde RPC-adapters gebruiken service role.

`GET /session/context` is de veilige bootstrap voor het restaurantdashboard. De browser kiest geen account- of locatie-ID uit URL, local storage of hardcoded Silverado-configuratie. De response bevat per toegestaan bereik alleen de opaque account-/locatiereferentie, weergavenaam, storefrontslug, tijdzone, plaats, valuta, sterkste rol en beschikbare beheerrechten. Zonder passend Food-lidmaatschap volgt `FORBIDDEN`. Secrets, service-role-gegevens en lidmaatschappen van andere tenants worden nooit teruggegeven.

## Ordercontract

Header:

```text
Idempotency-Key: 16..128 veilige ASCII-tekens
```

Body:

```json
{
  "fulfilment_type": "pickup",
  "customer": {
    "name": "Naam",
    "phone": "0612345678",
    "email": "optioneel@example.nl"
  },
  "pickup": {"pickup_at": "2026-07-30T18:00:00+02:00"},
  "items": [{"item_ref": "uuid", "quantity": 1}],
  "note": "optioneel"
}
```

Onbekende velden, dubbele itemregels, nul/negatieve of extreme aantallen, delivery en clientprijzen/-totalen worden geweigerd. De server vertaalt alleen `item_ref` en `quantity`; de database resolveert actuele gepubliceerde items, beschikbaarheid, prijs en inclusief-belastingbedrag. Een identieke key plus payload geeft dezelfde order terug; hergebruik met een andere payload geeft `IDEMPOTENCY_CONFLICT`.

## Beheermutaties

Statusbody:

```json
{"status":"accepted","reason":"optioneel, maximaal 500 tekens"}
```

De Phase 1A-RPC controleert actor, rol, capability en transitiegraaf en schrijft append-only geschiedenis. Kitchen staff kan uitsluitend `accepted → preparing → ready` uitvoeren.

Het orderdetail bevat de publieke orderreferentie en een veilige statusgeschiedenis met status, tijdstip en optionele reden. Interne actorprofiel-ID's worden niet aan het restaurantdashboard geleverd.

Menu-itembody bevat minimaal één en uitsluitend:

```json
{"price_minor":1495,"available":true,"active":true}
```

`price_minor` is een veilig geheel getal tussen 0 en 100.000.000. Tenant, locatie, categorie en belastingklasse zijn niet wijzigbaar via dit contract. De server voert de allowlisted update uit met de gebruikers-JWT, zodat Phase 1A-RLS nogmaals afdwingt dat het item bij de actor hoort.

## Rollen en capabilities

| Handeling | owner | manager | staff | kitchen_staff | viewer |
| --- | ---: | ---: | ---: | ---: | ---: |
| Orders lezen | ja | ja | ja | ja | ja |
| Status wijzigen | ja | ja | ja | beperkt door transitie-RPC | nee |
| Menu lezen | ja | ja | ja | ja | ja |
| Prijs/beschikbaarheid/active wijzigen | ja | ja | nee | nee | nee |

Naast de rol moet de accountentitlement actief zijn en de locatieconfiguratie respectievelijk `orders.management` of `menu.management` aan hebben.

## Validatie en misbruikbeperking

- Muterende browserrequests moeten dezelfde origin hebben als `SITE_URL`, `URL` of `DEPLOY_URL`.
- JSON-body is maximaal 16 KiB; maximaal 50 unieke itemregels; quantity 1..99.
- Publieke ordercreatie staat standaard uit. Activering vereist `FOOD_PUBLIC_ORDERING_ENABLED=true` én `FOOD_RATE_LIMIT_SECRET` van minimaal 32 tekens.
- De client-IP wordt nooit opgeslagen. De server maakt een HMAC-SHA-256 over storefront en clientidentiteit; de database limiteert atomisch per locatie tot 8 pogingen per 60 seconden.
- Alle Supabase-calls hebben een timeout van vijf seconden.
- Logs bevatten request-id, foutcode, HTTP-status en eventueel upstreamcode, maar geen requestbody, bearer, e-mail, telefoon of volledige databasefout.
- CORS staat alleen de geconfigureerde applicatie-origin toe.

## Foutcodes

| Code | HTTP | Betekenis |
| --- | ---: | --- |
| `INVALID_JSON`, `INVALID_REQUEST`, `UNKNOWN_FIELD` | 400 | Body of veld ongeldig |
| `INVALID_ITEMS`, `INVALID_PRICE`, `INVALID_STATUS`, `INVALID_PAGINATION` | 400 | Domeininput ongeldig |
| `PICKUP_ONLY` | 400 | Delivery valt buiten Food v1 |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Header ontbreekt of is ongeldig |
| `AUTH_REQUIRED`, `INVALID_SESSION` | 401 | Geen geldige sessie |
| `FORBIDDEN`, `CAPABILITY_UNAVAILABLE`, `ORIGIN_NOT_ALLOWED` | 403 | Bereik, rol, capability of origin geweigerd |
| `NOT_FOUND` | 404 | Generiek niet gevonden, zonder tenantinformatie |
| `IDEMPOTENCY_CONFLICT` | 409 | Key opnieuw gebruikt met andere payload |
| `INVALID_TRANSITION` | 409 | De gevraagde orderstatus volgt niet op de actuele status |
| `PAYLOAD_TOO_LARGE` | 413 | Body groter dan 16 KiB |
| `RATE_LIMITED` | 429 | Publieke orderlimiet bereikt |
| `ORDERING_UNAVAILABLE`, `SERVICE_UNAVAILABLE`, `UPSTREAM_TIMEOUT` | 503 | Veilig gesloten of tijdelijk niet beschikbaar |
| `UPSTREAM_REJECTED`, `INTERNAL_ERROR` | 502/500 | Generieke serverfout zonder intern detail |

## Lokaal testen

```text
node --test tests/food-v1-phase-1a.test.js tests/food-v1-phase-1b.test.js
zsh scripts/food-v1-phase-1b-local-validation.zsh
node --test tests/*.test.js
```

De validatiescript weigert alle bekende remote databasevariabelen, start PostgreSQL met lege `listen_addresses` op een tijdelijke Unix-socket, past alleen de lokale baseline/migraties toe en ruimt de tijdelijke cluster altijd op.

## Bekende beperkingen en releasegrens

- Alleen pickup; geen betaling, delivery, reservering, QR, kiosk of providerintegratie.
- Het restaurantdashboard bestaat lokaal vanaf Phase 3; er is nog geen deploy, stagingapply of productieapply uitgevoerd.
- De routeconfiguratie bestaat alleen in de repository en verandert pas runtimegedrag na een afzonderlijk geautoriseerde deploy.
- Publieke ordercreatie blijft veilig uit totdat de lokale migratie via een later expliciet stagingmanifest is toegepast en beide vereiste environmentvariabelen bewust zijn ingesteld.
- Repositorybrede migratie-governance blijft extern aan Food geblokkeerd door de reeds bestaande ongecatalogiseerde `20260728134000_partner_existing_user_onboarding_activation.sql`. Deze Phase 1B-release-eenheid autoriseert geen remote uitvoering.

Rollback vóór deployment is het terugdraaien van uitsluitend de lokale Phase 1B-commits. Na een toekomstige apply is de veilige operationele rollback eerst `FOOD_PUBLIC_ORDERING_ENABLED=false`; databaseobjecten worden niet destructief verwijderd. Een structurele databasecorrectie moet dan via een nieuwe forward-only migratie lopen.
