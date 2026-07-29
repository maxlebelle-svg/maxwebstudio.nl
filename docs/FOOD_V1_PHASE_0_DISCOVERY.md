# Max Webstudio Food v1 — Fase 0 discovery

Status: `PASS_FOOD_V1_PHASE_0_READY_FOR_IMPLEMENTATION`

Datum: 2026-07-28

Pilottenant: Silverado Roti Shop, Emmeloord

Branch bij discovery: `codex/food-v1-silverado-pilot`

Basiscommit: `9897af9559b61f0c08582f91bdca9fd9eb949319` (`origin/main` en merge-base waren gelijk)

Scope: uitsluitend repositoryonderzoek en ontwerp; geen runtime-, configuratie-, migratie-, staging- of productiewijziging.

## 1. Executive summary

De bestaande repository kan Food v1 dragen zonder de platformkern naar Silverado te vernoemen. De veilige aansluiting is:

- `customers.id` blijft het commerciële/platformanker;
- een nieuw `food_accounts.id` wordt de expliciete Food-tenantgrens;
- restaurantrollen komen in een nieuwe `food_account_members`-tabel en niet in de globale `profiles.role`;
- iedere tenantgebonden Food-rij bevat `food_account_id`; locatiegebonden rijen bevatten daarnaast `location_id`;
- de browser schrijft niet rechtstreeks naar Food-tabellen;
- een versieerbare Netlify Function routeert `/api/food/v1/*` en valideert auth, tenant, capability, payload en statustransities;
- publieke ordercreatie gebeurt in één database-transactie/RPC, met serverprijzen, serverbelasting en een verplichte idempotency key;
- de donderdagflow gebruikt polling. Supabase Realtime en Mollie zijn geen voorwaarde;
- de bestaande Silverado-demo is alleen een visuele bron. Hardcoded prijzen, claims en checkoutlogica zijn geen betrouwbare data of order-engine;
- bestaande factuur-, abonnement- en Mollie-tabellen worden niet met restaurantorders vermengd.

Fase 0 geeft een **PASS voor implementatie in gecontroleerde fasen**, niet voor deployment. Voor het toepassen van een migratie blijven een read-only schema-/migratiehistoriecontrole van de doelomgeving, een geïsoleerde testomgeving, negatieve tenanttests en expliciete releasegoedkeuring verplicht.

## 2. Huidige repositoryarchitectuur

### 2.1 Runtime en frontend

- `netlify.toml` publiceert `public/` en bundelt CommonJS Netlify Functions uit `functions/` met esbuild.
- De generieke redirect `/api/:splat -> /.netlify/functions/:splat` verwacht momenteel platte functienamen. Een geneste Food-namespace vereist daarom een expliciete redirect naar één routerfunctie.
- `package.json` is bewust klein; de runtime gebruikt overwegend platform-API's en `fetch`, zonder applicatieframework.
- `public/` is volgens `docs/CONTRIBUTING.md` de canonieke live frontend. Pagina's zijn statische HTML met vanilla JavaScript-modules.
- Tests staan in `tests/` en gebruiken Node's ingebouwde test-runner. De gangbare volledige regressieopdracht is `node --test tests/*.test.js`.

### 2.2 Database en identiteit

Repositorybewijs:

- `supabase/migrations/00000000000000_authoritative_baseline.sql` definieert onder meer `profiles`, `customers`, `websites`, `projects`, facturen en platform-RLS.
- `profiles.auth_user_id` koppelt een platformprofiel aan `auth.users`.
- `customers` koppelt de commerciële klant aan een profiel/auth-user.
- De helpers `current_profile_id()`, `current_app_role()`, `has_app_role()`, `is_admin_role()`, `is_staff_role()` en `owns_customer()` bestaan in de baseline.
- `supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql` is de latere, leidende rolstatusmigratie. Werkelijke platformrollen zijn `super_admin`, `admin`, `sales_manager`, `sales_partner`, `designer`, `developer`, `support`, `customer` en `demo_user`.
- De actuele profielstatussen zijn `invited`, `pending`, `active`, `disabled` en `archived`.

`owns_customer(customer_id)` ondersteunt één bestaande klantrelatie, maar modelleert geen restaurantteam, meerdere locaties of restaurantrollen. Het is daarom niet voldoende als Food-autorisatiemodel.

### 2.3 Authenticatie en beheer-UI

- `functions/_admin-auth.js`, functie `verifyAdmin`, verifieert de Bearer-token via Supabase Auth, leest het profiel server-side, controleert rol/status en faalt gesloten. De legacy `ADMIN_TOKEN` is in productie standaard geblokkeerd.
- `functions/services/profileAccessPolicy.js`, `public/src/config/roles.js`, `public/src/config/permissions.js`, `public/src/config/protectedRoutes.js` en `public/src/services/routeGuardService.js` bevatten het bestaande globale rol- en routebeleid.
- `public/src/admin-route-guard.js` is geschikt voor platformmedewerkers, niet voor restaurantgebruikers met globale rol `customer`.
- `public/admin/config/sidebar-navigation.js` en `public/admin/components/admin-sidebar.js` vormen een centrale, herbruikbare beheer-navigatie en componentset.
- Bestaande admin-CSS, statusbadges, toastmeldingen en kaartpatronen kunnen visueel worden hergebruikt, maar Food krijgt een eigen routeguard en tenantcontext.

### 2.4 Bestaande Silverado-demo

- `Website factory maxwebstudio.nl/silverado-maxwebstudio-demo/index.html` bevat een mobiele presentatie en hardcoded menukaarten.
- `Website factory maxwebstudio.nl/silverado-maxwebstudio-demo/script.js` bewaart een winkelmand alleen in browsergeheugen, vertrouwt `data-price` en verstuurt geen bestelling.
- `Website factory maxwebstudio.nl/silverado-maxwebstudio-demo/README-MAXWEBSTUDIO.txt` markeert prijzen, openingstijden, allergenen en claims als te verifiëren conceptinhoud.
- De map staat buiten `public/` en is dus geen canonieke productiefrontend.

### 2.5 Betalingen en publieke previews

- `functions/admin-mollie-payment.js` maakt betalingen voor canonieke `invoices`, gebruikt `verifyAdmin`, hergebruikt een actieve checkout en blokkeert live betalingen tenzij expliciet toegestaan.
- `functions/mollie-webhook.js` is sterk verweven met facturen, abonnementen, commerciële orders, portaalactivatie en e-mails.
- `functions/create-payment.js` is een legacy websitepakketflow en in productie standaard uitgeschakeld.
- `functions/public-preview-render.js` biedt goede patronen voor method allowlisting, veilige slugverwerking, minimale publieke projectie en fail-closed responses. De in-memory limiter in die functie is niet duurzaam genoeg voor ordercreatie.
- `functions/_cors.js` biedt een bestaand same-origin CORS-patroon.

### 2.6 Migratiegovernance

- De baseline waarschuwt expliciet dat zij alleen voor een lege lokale database is en geen bewijs van actuele productiestaat vormt.
- `supabase-common/migrations/README.md`, `COMMON_MIGRATION_MANIFEST.json` en `supabase-bootstrap/scripts/dual-root-validator.mjs` beschermen gemeenschappelijke migraties met byte-identiteit en checksums.
- `docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json` vereist dat iedere post-cutover productmigratie door precies één goedgekeurd release-manifest en checksummed fileset wordt benoemd.
- `supabase/migration-drafts/README.md` vereist review, testomgevingsvalidatie en releasegoedkeuring; drafts worden niet automatisch toegepast.
- Bestaande migraties en checksums zijn append-only. Food mag geen historische migratie aanpassen.

## 3. Mapping van doelarchitectuur naar bestaande code

| Doel | Bestaande basis | Besluit |
|---|---|---|
| Platformidentiteit | `profiles`, Supabase Auth | Hergebruiken |
| Commerciële klant | `customers` | Hergebruiken als accountanker |
| Food-tenant | Niet aanwezig | Nieuw `food_accounts` |
| Restaurantteam | Niet aanwezig | Nieuw `food_account_members` |
| Meerdere locaties | Niet aanwezig | Nieuw `restaurant_locations` onder Food-account |
| Platformrollen | Partner role/status foundation | Hergebruiken voor platformtoegang |
| Restaurantrollen | Niet aanwezig | Eigen lidmaatschapsrollen |
| Admin-auth | `verifyAdmin` | Patroon hergebruiken; geen restaurantauth ermee simuleren |
| Food-auth | Niet aanwezig | Nieuwe `verifyFoodMember`-laag plus RLS-helper |
| API | Platte Netlify Functions | Eén Food v1-router plus kleine services |
| Publieke projectie | `public-preview-render.js` | Beveiligingspatroon hergebruiken |
| Storefront | Silverado conceptdemo | Alleen visueel hergebruiken; data/API nieuw |
| Dashboard | Admincomponenten en portalpatronen | Visueel hergebruiken; routes/auth nieuw |
| Mollie | Factuurgerichte integratie | Alleen adapter-/veiligheidspatronen; Food-data gescheiden |
| Audit/status | Bestaande event-/timelinepatronen | Concept hergebruiken; Food-historie nieuw |

## 4. Hergebruik-versus-nieuw-beslissingen

### Hergebruiken

- Supabase Auth en `profiles` als identiteit.
- `customers` als contract-/klantanker.
- Globale platformrollen en actieve-profielcontrole.
- Server-side Bearer-validatie en fail-closed gedrag uit `verifyAdmin`.
- Netlify Function response-, CORS- en Supabase REST-patronen.
- Admin/portal design tokens, toegankelijke componenten, statusbadges en toastpatronen.
- Silverado-layout, huisstijl en goedgekeurde assets als tenantconfiguratie.
- Mollie test/live-gates en het principe van providerverificatie.

### Nieuw bouwen

- Food-account, restaurantlidmaatschappen en locaties.
- Capabilities, entitlements en locatieconfiguratie.
- Menu-, belasting-, order-, snapshot-, idempotency- en statusgeschiedenismodellen.
- Food RLS-helpers en policies.
- Food API v1 en transactionele order-RPC.
- Generieke storefrontrenderer en restaurantdashboard.
- Databasegedragen abuse-control voor publieke ordercreatie.

### Niet hergebruiken of vermengen

- `profiles.role` voor restaurantrollen.
- `owns_customer()` als enige tenantbeveiliging.
- `invoices` of subscriptions als restaurantorder-/betalingstabel.
- Clientprijzen uit `data-price` of requestpayloads.
- In-memory rate limiting als enige publieke bescherming.
- Silverado in generieke tabel-, route-, service- of modulenaam.

## 5. Concreet datamodel

Alle geldwaarden zijn `bigint` minor units; valuta is ISO-4217, voor de pilot `EUR`. Tijden worden als `timestamptz` opgeslagen; een locatie bewaart haar IANA-tijdzone, voor Silverado `Europe/Amsterdam`.

### 5.1 Account, leden en locaties

**`food_accounts`**

- `id uuid` PK
- `customer_id uuid not null unique` FK naar `customers(id)`
- `name text not null`
- `business_type text not null`
- `status text not null` (`pilot`, `active`, `disabled`, `archived`)
- `currency char(3) not null default 'EUR'`
- `metadata jsonb not null default '{}'`
- `created_at`, `updated_at timestamptz`

**`food_account_members`**

- `id uuid` PK
- `food_account_id uuid not null` FK
- `profile_id uuid not null` FK naar `profiles(id)`
- `role text not null` (`owner`, `manager`, `staff`, `kitchen_staff`, `viewer`)
- `status text not null` (`invited`, `active`, `disabled`)
- timestamps
- unique `(food_account_id, profile_id)`

V1-rollen gelden accountbreed. Locatiegebonden lidmaatschap kan later additief via `food_member_locations` worden toegevoegd; geen kolom of policy hoeft daarvoor te worden hernoemd.

**`restaurant_locations`**

- `id uuid` PK
- `food_account_id uuid not null` FK
- `slug text not null unique`
- `name`, `phone`, adresvelden
- `timezone text not null`
- `status text not null`
- `is_published boolean not null default false`
- timestamps
- unique `(food_account_id, id)` voor samengestelde tenant-FK's

**`restaurant_hours`**

- `id`, `food_account_id`, `location_id`
- `weekday smallint` (0–6), `opens_at time`, `closes_at time`, `is_closed`
- optionele `valid_from`, `valid_until`
- tenant- en tijdsconstraints

**`restaurant_delivery_settings`**

- `location_id` PK plus `food_account_id`
- `enabled`, `minimum_order_minor`, `delivery_fee_minor`
- `zone_config jsonb`, alleen na schema-validatie

### 5.2 Capabilities

**`food_capability_catalog`**

- `key text` PK
- `availability_status text` (`unavailable`, `preview`, `available`)
- beschrijving en timestamps

**`food_entitlements`**

- `id`, `food_account_id`, `capability_key`
- `status` (`active`, `suspended`, `expired`)
- `starts_at`, `ends_at`
- unique `(food_account_id, capability_key)`

**`restaurant_capabilities`**

- `id`, `food_account_id`, `location_id`, `capability_key`
- `enabled boolean`, `config jsonb`
- unique `(location_id, capability_key)`

Een capability werkt alleen als catalogusstatus beschikbaar is, een actuele entitlement actief is en de locatieconfiguratie is ingeschakeld en compleet.

### 5.3 Belastingen en menu

**`restaurant_tax_classes`**

- `id`, `food_account_id`
- `code`, `label`
- `rate_basis_points integer` met check `0..10000`
- `effective_from timestamptz`, `effective_until timestamptz null`
- `active boolean`
- geen overlappende actieve periodes voor dezelfde account/code

**`menus`**

- `id`, `food_account_id`, `location_id`
- `name`, `status` (`draft`, `published`, `archived`), `published_at`

**`menu_categories`**

- `id`, `food_account_id`, `menu_id`
- `name`, `sort_order`, `active`

**`menu_items`**

- `id`, `food_account_id`, `menu_id`, `category_id`, `tax_class_id`
- `name`, `description`
- `price_minor bigint` met check `>= 0`
- `active`, `available`, `sort_order`
- `metadata jsonb`

V1 bouwt geen varianten/optiegroepen tenzij een geverifieerd Silverado-item die absoluut vereist. De tabelgrenzen laten latere `menu_item_variants`, `menu_option_groups` en `menu_options` additief toe.

### 5.4 Orders

**`food_orders`**

- `id`, `food_account_id`, `location_id`
- `public_reference text unique` met cryptografisch onvoorspelbare waarde
- `channel`, pilotwaarde `website`
- `fulfilment_type` (`pickup`, later `delivery`)
- `status`
- `currency`
- `subtotal_minor`, `tax_minor`, `delivery_minor`, `discount_minor`, `total_minor`
- `customer_snapshot jsonb`, `delivery_snapshot jsonb`
- `customer_note text`
- status-/audit-timestamps

**`food_order_items`**

- `id`, `food_account_id`, `order_id`
- `menu_item_id uuid null` voor traceerbaarheid
- `item_name_snapshot text`
- `item_description_snapshot text`
- `unit_price_minor`, `quantity`, `line_subtotal_minor`
- `tax_rate_basis_points`, `tax_amount_minor`, `line_total_minor`
- alle financiële snapshotvelden immutable na insert

**`food_order_status_history`**

- `id`, `food_account_id`, `order_id`
- `from_status`, `to_status`
- `actor_profile_id null`, `actor_type`, `reason`
- `created_at`

**`food_order_idempotency`**

- `id`, `food_account_id`, `location_id`
- `idempotency_key`, `request_hash`
- `order_id null`, `response_code`, `expires_at`
- unique `(location_id, idempotency_key)`
- geen directe clienttoegang

**Later/optioneel:** `food_order_payments` en `food_order_events`. Zij zijn niet nodig om donderdag de kernflow te bewijzen.

### 5.5 Relatie- en isolatieregels

- Iedere onderliggende tabel bevat expliciet `food_account_id`, ook als dat via een parent afleidbaar is.
- Samengestelde foreign keys of constraint-triggers bewijzen dat parent en child tot hetzelfde Food-account behoren.
- `location_id`, `menu_id`, `category_id`, `tax_class_id`, `order_id` en item-ID's mogen nooit cross-tenant worden gekoppeld.
- Deletes zijn in v1 beperkt; operationele records worden gedeactiveerd/gearchiveerd. Historische orderregels blijven bestaan.

## 6. Concrete route- en mappenkaart

Voorgestelde implementatielocaties, nog niet aangemaakt:

```text
functions/
├── food-v1.js                    # method/path allowlist en dispatch
└── food/
    ├── auth.js                   # token + membership + capability
    ├── config.js                 # env-validatie, geen secrets naar client
    ├── responses.js              # CORS/security/errors
    ├── validation.js
    ├── storefront.js
    ├── orders.js
    ├── menu.js
    └── settings.js

public/
├── restaurant-storefront.html
├── restaurant-dashboard.html
├── restaurant-orders.html
├── restaurant-menu.html
├── restaurant-settings.html
├── restaurant-integrations.html
└── src/food/
    ├── api.js
    ├── restaurant-route-guard.js
    ├── tenant-context.js
    ├── storefront.js
    ├── cart.js
    ├── orders.js
    ├── menu.js
    └── ui.js
```

Benodigde latere Netlify-regel:

```text
/api/food/v1/* -> /.netlify/functions/food-v1/:splat
```

Die expliciete regel moet vóór de bestaande `/api/:splat`-catchall staan. Fase 0 wijzigt `netlify.toml` niet.

Restaurantpagina's krijgen een eigen guard. Ze worden niet onder `admin-*` geplaatst, omdat `public/src/admin-route-guard.js` klanten terecht uit platformbeheer houdt. De Food-context wordt server-side uit het actieve lidmaatschap en gevraagde account bepaald; een account-ID uit localStorage is nooit autoriteit.

## 7. API-contracten voor de donderdagflow

Alle responses zijn JSON, bevatten geen secrets en gebruiken consistente `error.code`, `error.message` en optioneel `request_id`. Mutaties accepteren alleen `Content-Type: application/json`; onbekende velden worden geweigerd.

### 7.1 Publiek

**`GET /api/food/v1/storefronts/:slug`**

- Geeft uitsluitend gepubliceerde locatienaam, veilige contactgegevens, actieve fulfilmentopties en openingstoestand terug.
- `404` voor onbekend, ongepubliceerd of uitgeschakeld.

**`GET /api/food/v1/storefronts/:slug/menu`**

- Geeft alleen een gepubliceerd menu, actieve categorieën en actieve/beschikbare items.
- Prijs in `price_minor`, valuta apart; geen interne IDs buiten benodigde opaque item-ID's.

**`POST /api/food/v1/storefronts/:slug/orders`**

- Verplicht header `Idempotency-Key` van 16–128 tekens.
- Payload bevat uitsluitend `items[{menu_item_id, quantity}]`, `fulfilment_type`, toegestane klantvelden en notitie.
- Accepteert geen prijs, belasting, totaal, tenant-ID, status of entitlement uit de browser.
- Server/RPC resolveert slug naar actieve locatie en tenant, controleert capability/openingstijd/itembeschikbaarheid, herberekent alles en schrijft atomair.
- `201` bij eerste creatie; replay met dezelfde hash retourneert hetzelfde resultaat; dezelfde key met andere payload geeft `409`.
- Response bevat alleen publieke referentie, status, immutable berekende samenvatting en verwacht fulfilmenttype.

Er komt donderdag **geen publieke orderlijst**. Een eventuele latere confirmation-GET vereist een afzonderlijk hoog-entropietoken en retourneert alleen geredigeerde statusinformatie. De POST-response is voor de pilot voldoende.

### 7.2 Beveiligd restaurantbeheer

Bearer-auth, actief profiel, actief Food-lidmaatschap, tenantmatch en rol zijn verplicht.

- `GET /api/food/v1/accounts/:accountId/orders?location_id=&status=&updated_after=`
- `GET /api/food/v1/accounts/:accountId/orders/:orderId`
- `PATCH /api/food/v1/accounts/:accountId/orders/:orderId/status`
- `GET /api/food/v1/accounts/:accountId/menu?location_id=`
- `PATCH /api/food/v1/accounts/:accountId/menu/items/:itemId`
- `PATCH /api/food/v1/accounts/:accountId/locations/:locationId/hours`

De minimum item-patch allowlist is `name`, `description`, `price_minor`, `active`, `available`, `category_id`, `tax_class_id` en `sort_order`. De server controleert tenant en referenties opnieuw.

### 7.3 Vernieuwing dashboard

Voor donderdag pollt het dashboard iedere 3–5 seconden met `updated_after` en stopt/tempert wanneer de tab verborgen is. Dit vraagt geen Realtime-publicatie of extra infrastructuur. Supabase Realtime is pas na de pilot een optimalisatie.

## 8. Rollen- en autorisatiematrix

| Actor | Platformrol | Food-lidmaatschap | Orders lezen | Status wijzigen | Menu wijzigen | Leden/entitlements |
|---|---|---|---:|---:|---:|---:|
| Platformbeheerder | `super_admin`/`admin` | niet vereist, expliciete override | ja | ja | ja | ja |
| Restaurant owner | normaal `customer` | `owner` actief | ja | ja | ja | leden beheren; entitlement alleen lezen |
| Restaurant manager | normaal `customer` | `manager` actief | ja | ja | ja | nee |
| Restaurant staff | normaal `customer` | `staff` actief | ja | standaardflow | beschikbaarheid; geen entitlement | nee |
| Kitchen staff | normaal `customer` | `kitchen_staff` actief | ja, minimaal detail | `accepted -> preparing -> ready` | nee | nee |
| Viewer | normaal `customer` | `viewer` actief | ja | nee | nee | nee |
| Publieke bezoeker | geen | geen | nee | nee | nee | nee |

`developer`, `designer` en `support` krijgen niet automatisch restaurantdata. Tijdelijke supporttoegang moet later expliciet, auditeerbaar en least-privilege worden ontworpen.

Autorisatie is dubbel:

1. de API valideert token, status, tenant, rol, capability en actie;
2. RLS voorkomt dat een fout in API-selectie of clientcode cross-tenant toegang geeft.

Frontend guards zijn uitsluitend navigatie/UX en nooit de beveiligingsgrens.

## 9. RLS-plan per tabel

Nieuwe helperfuncties worden `security definer`, krijgen `search_path = pg_catalog`, vaste schemaqualificatie en alleen noodzakelijke execute-grants:

- `is_food_member(target_account uuid, allowed_roles text[] default null)`;
- optioneel `can_access_food_location(target_account uuid, target_location uuid, allowed_roles text[])`;
- platformoverride via bestaande `is_admin_role()`.

| Tabel | `anon` | Actief Food-lid | Platformadmin | Mutatiepad |
|---|---|---|---|---|
| `food_accounts` | geen | eigen account lezen | CRUD | API; beperkt ownerbeheer |
| `food_account_members` | geen | zelf lezen; owner team lezen | CRUD | guarded API, geen zelf-escalatie |
| `restaurant_locations` | geen direct | eigen account lezen | CRUD | owner/manager API |
| `restaurant_hours` | geen direct | eigen account lezen | CRUD | owner/manager API |
| `restaurant_delivery_settings` | geen direct | eigen account lezen | CRUD | owner/manager API |
| `food_capability_catalog` | geen direct nodig | lezen | CRUD | platformreleaseproces |
| `food_entitlements` | geen | eigen lezen | CRUD | platformbeheer, niet tenanttoggle |
| `restaurant_capabilities` | geen | eigen lezen | CRUD | owner/manager binnen entitlement |
| `restaurant_tax_classes` | geen | eigen lezen | CRUD | owner/manager API |
| `menus` | geen direct | eigen lezen | CRUD | owner/manager API |
| `menu_categories` | geen direct | eigen lezen | CRUD | owner/manager API |
| `menu_items` | geen direct | eigen lezen | CRUD | role-gebonden API |
| `food_orders` | geen | eigen lezen | CRUD | creatie-RPC; status-RPC/API |
| `food_order_items` | geen | eigen lezen | lezen | alleen order-RPC |
| `food_order_status_history` | geen | eigen lezen | lezen | alleen status-RPC |
| `food_order_idempotency` | geen | geen direct | diagnostisch | alleen order-RPC/service |

Publieke storefrontdata wordt via de Netlify Function met service-role uit een expliciete veilige kolomprojectie gelezen. `anon` krijgt geen rechtstreekse tabelgrants. RLS blijft op alle Food-tabellen ingeschakeld.

## 10. Capability- en entitlementmodel

De server voert bij iedere capability-afhankelijke actie drie controles uit:

1. `food_capability_catalog.availability_status = 'available'`;
2. een actuele `food_entitlements.status = 'active'` binnen start/einddatum;
3. `restaurant_capabilities.enabled = true` met geldige configuratie.

Ontbreekt één laag, dan faalt de actie gesloten met een stabiele foutcode. Browserknoppen reflecteren deze uitkomst, maar verlenen geen rechten.

### Silverado pilot: benodigd

- `ordering.pickup`
- `menu.management`
- `orders.management`
- `settings.hours`

### Alleen na bevestigde operationele regels

- `ordering.delivery`
- `payments.mollie` in testmodus

### Roadmap, donderdag niet werkend beloven

- tafelservice, QR, kiosk, WhatsApp-orders;
- reserveringen, cadeaubonnen, loyaliteit, keukendisplay;
- Google Business Profile, Google Ads, Meta;
- voorraad, bezorgbeheer, Thuisbezorgd en AI-upselling.

Het integratiescherm mag deze items als `Binnenkort` tonen, nooit als verbonden of operationeel.

## 11. Orderstatus-transitiematrix

Canonieke statussen: `pending`, `accepted`, `preparing`, `ready`, `out_for_delivery`, `completed`, `cancelled`.

| Van | Naar | Pickup | Delivery | Minimale rol |
|---|---|---:|---:|---|
| `pending` | `accepted` | ja | ja | staff/manager/owner |
| `pending` | `cancelled` | ja | ja | staff/manager/owner |
| `accepted` | `preparing` | ja | ja | kitchen/staff/manager/owner |
| `accepted` | `cancelled` | ja | ja | manager/owner |
| `preparing` | `ready` | ja | ja | kitchen/staff/manager/owner |
| `preparing` | `cancelled` | uitzonderlijk | uitzonderlijk | manager/owner + reden |
| `ready` | `completed` | ja | nee | staff/manager/owner |
| `ready` | `out_for_delivery` | nee | ja | staff/manager/owner |
| `ready` | `cancelled` | uitzonderlijk | uitzonderlijk | manager/owner + reden |
| `out_for_delivery` | `completed` | nee | ja | staff/manager/owner |

`completed` en `cancelled` zijn terminal. Achterwaartse of overgeslagen transities worden geweigerd. Iedere succesvolle overgang en actor wordt atomair in status history vastgelegd.

## 12. Idempotency-ontwerp

- De publieke order-POST vereist een cryptografisch willekeurige `Idempotency-Key` van 16–128 tekens.
- Scope is `(location_id, key)`; de slug wordt server-side naar locatie vertaald.
- De server canonicaliseert alle betekenisvolle requestvelden en berekent een SHA-256 requesthash.
- Een transactionele PostgreSQL-functie reserveert de unieke key, valideert menu/tenant/capabilities, schrijft order en regels en koppelt het resultaat.
- Bestaande key + gelijke hash retourneert dezelfde order en bedragen zonder tweede insert.
- Bestaande key + andere hash retourneert `409 IDEMPOTENCY_CONFLICT`.
- De bewaartermijn is minimaal 24 uur; verlopen sleutels worden door gecontroleerd onderhoud opgeruimd, niet in de requestflow.
- Een half-afgeronde reservering wordt binnen dezelfde database-transactie teruggedraaid; er bestaat geen zichtbare `pending idempotency`-rij zonder order.

Dit ontwerp is nodig omdat losse REST-inserts vanuit één Netlify Function geen betrouwbare transactie over idempotency, order en orderregels bieden.

## 13. Belasting- en ordersnapshotmodel

- Menuprijzen zijn voor de Nederlandse consumentenstorefront in v1 **belastinginclusief** en worden als integer minor units opgeslagen.
- Belastingtarieven staan in basispunten: `900 = 9,00%`, `2100 = 21,00%`.
- De order-RPC selecteert de belastingklasse die op ordertijd effectief is.
- Per orderregel worden naam, omschrijving, unitprijs, hoeveelheid, belastingtarief, netto-/belastingcomponent en regeltotaal onveranderlijk vastgelegd.
- Menunaam-, prijs- of tariefwijzigingen muteren historische orders nooit.
- Berekening gebeurt per regel met één vastgelegde afrondingsregel. Voor inclusieve prijzen is de voorgestelde belastingcomponent `round(gross * rate / (10000 + rate))`; financiële/boekhoudkundige validatie hiervan is een releasegate.
- Ordertotalen zijn de som van snapshots plus serverberekende bezorging/min korting. De browserberekening is alleen indicatief.
- Correcties na plaatsing worden later als expliciete adjustment/refund vastgelegd, niet door snapshots te overschrijven.

## 14. Dreigingsanalyse publieke ordercreatie

| Dreiging | Maatregel |
|---|---|
| Gemanipuleerde prijs/btw/totaal | Velden niet accepteren; server herleest items en berekent |
| IDOR/cross-tenant IDs | Tenant uit slug; samengestelde tenantconstraints; RLS |
| Dubbelklikken/netwerkreplay | Verplichte idempotency key + unieke constraint + transactie |
| Orderenumeratie | Geen publieke lijst/detail; opaque publieke referentie |
| Spam/DoS | Payloadlimieten, databasegedragen rate window, IP-hash, honeypot/botgate |
| Order buiten openingstijd | Server controleert locatiezone en actuele uren |
| Uitverkocht item/race | Actieve/beschikbare items in dezelfde transactie herlezen |
| Prijswijzigingsrace | Prijs en belasting in de ordertransactie vastleggen |
| XSS in menu/notities | Lengtelimieten, normalisatie, renderen via `textContent` |
| PII-lek in logs | Geen volledige klantpayload loggen; redactie en retentie |
| Service-role lek | Sleutel alleen server-side; nooit in public assets/responses |
| Overposting | Per endpoint een strikte veldallowlist en type-/sizevalidatie |
| Statusmanipulatie | Auth, membership, matrix en atomair status-RPC |
| CORS/CSRF | Same-origin CORS; Bearer voor dashboard; publieke POST zonder cookie-auth |
| Tenant uit browserstorage | Account-ID altijd server-side tegen membership toetsen |

Een per-instance JavaScript-map zoals in de previewfunctie is alleen aanvullende demping; abuse-control voor orders moet databasegedragen zijn.

## 15. Veilige migratievolgorde

Iedere stap is een nieuwe forward-only productmigratie met release-manifest en checksumfileset. De exacte versienummers worden pas tijdens Fase 1A vastgesteld, na controle dat zij hoger zijn dan de actuele repository- en doelomgevingshistorie.

1. Read-only preflight: doelomgeving, migration history, bestaande objecten/owners/grants/RLS en versiecollision controleren.
2. Accountlaag: `food_accounts`, `food_account_members`, `restaurant_locations` en constraints.
3. Configuratie: capabilities, entitlements, uren, bezorginstellingen en belastingklassen.
4. Menu: menus, categorieën, items, tenantconsistentie en indexes.
5. Orders: orders, regels, status history, idempotency en immutable constraints.
6. Functies: geharde membershiphelpers en transactionele create/status-RPC's.
7. Beveiliging: RLS aanzetten, policies, minimale grants en revoke van public/anon direct access.
8. Verificatie: catalogus-, ACL-, RLS- en functionele tenantisolatietests in een geïsoleerde testomgeving.
9. Pilotseed: aparte, idempotente en expliciet goedgekeurde Silverado-configuratie; geen generieke productiefixture.

Niet doen: baseline aanpassen, common migrationbytes veranderen, automatische `db push`, destructive down migration of productie als eerste testomgeving gebruiken.

## 16. Testplan

### 16.1 Statische en unit-tests

- Tabellen, checks, samengestelde tenant-FK's, indexes en RLS aanwezig.
- Helpers hebben geharde `search_path`, juiste owner en minimale ACL.
- API-methodes/routes/veldallowlists en consistente errors.
- Minor-unitberekening en inclusieve belastingafronding, inclusief randgevallen.
- Statusmatrix per fulfilmenttype en rol.
- Idempotente replay, concurrente duplicate, hashconflict en rollback bij fout.
- Storefront render gebruikt veilige DOM-methodes; geen hardcoded Silverado-bedrijfslogica.

### 16.2 Verplichte negatieve tenanttests

Maak tenant A (Silverado) en synthetische tenant B met gescheiden gebruikers en data. Bewijs minimaal:

- A kan accounts, locaties, menu, orders en status history van B niet selecteren;
- A kan B niet wijzigen via directe REST, API-ID, parent-ID of samengestelde referentie;
- B kan geen Silverado-item aan een B-order toevoegen en omgekeerd;
- `viewer`, `kitchen_staff`, `staff` en `manager` kunnen geen hogere rolacties uitvoeren;
- disabled membership/profiel en ontbrekende tenantcontext falen gesloten;
- anon kan geen Food-tabel rechtstreeks lezen/schrijven en geen orders uitlezen;
- platformoverride is beperkt tot de bedoelde adminrollen.

### 16.3 API en end-to-end

- Gepubliceerd menu zichtbaar; draft/inactief/onbeschikbaar niet zichtbaar.
- Server negeert/weigert clientprijs, belasting, status en tenant-ID.
- Mobiele pickuporder verschijnt binnen pollinginterval in dashboard.
- Toegestane statussen werken; ongeldige overgangen geven `409`.
- Prijswijziging verschijnt na refresh; bestaande order behoudt oude snapshot.
- Orderflow werkt volledig zonder Mollie.
- Volledige bestaande suite: `node --test tests/*.test.js`.

Databasefunctionele tests draaien uitsluitend tegen een disposable of expliciet geïsoleerde testdatabase, nooit impliciet tegen staging/productie.

## 17. Rollback- en feature-disableplan

- Begin runtime achter een server-side Food availability gate; zonder gate/entitlement zijn routes functioneel gesloten.
- Publiceer Silverado pas nadat tenant, menu en capabilities expliciet actief zijn.
- Bij runtimeproblemen: schakel catalogusavailability of tenantcapability uit en verwijder/disable de publieke route in een normale release. Bestaande platformflows blijven intact.
- Bij API-problemen: rol de runtime-commit terug zonder tabellen of data te verwijderen.
- Bij databaseschemafouten: maak een beoordeelde compenserende forward-only migratie. Geen destructive down migration op pilot-/orderdata.
- Orders en snapshots worden nooit als rollbackmechanisme verwijderd.
- Mollie is losgekoppeld; uitschakelen daarvan mag ordercreatie niet raken.
- Bewaar per fase een manifest, checksum, testbewijs en exact vorige runtimecommit voor herstel.

## 18. Open beslissingen

Deze besluiten blokkeren Fase 1 authoring niet, maar moeten vóór hun betreffende releasepoort zijn bevestigd:

1. Silverado: definitieve menunamen, prijzen, allergenen, openingstijden en contact-/adresdata.
2. Pickup als harde demo-optie; delivery alleen na bevestiging van gebied, minimum, kosten, adresvalidatie en operationele capaciteit.
3. Bevestiging door boekhouder/accountant van btw-classificatie en inclusieve afrondingsmethode.
4. Wie bij Silverado owner/manager/staff wordt en welk bestaand Supabase-profiel wordt gekoppeld.
5. Gewenste publieke slug en definitieve demo-/productiedomeinroute.
6. Retentie van klant-PII en orders, privacytekst en operationele verwijderprocedure.
7. Of Mollie-sandbox na de kernflow tijd krijgt; echte betaling blijft uitgesloten zonder aparte acceptatie.

## 19. Risico's en productieblokkades

| Risico/blokkade | Gevolg | Gate |
|---|---|---|
| Repositorybaseline is geen bewijs van live schema | Migratie kan botsen met remote drift | Verplichte read-only remote preflight vóór apply |
| Productmigraties vereisen manifest/checksum | Los SQL-bestand schendt governance | Release-unit en validators in Fase 1A |
| Donderdag 2026-07-30 is zeer dichtbij | Scope-/kwaliteitsrisico | Alleen pickup-kern; integraties roadmap |
| Silverado-content is concept | Onjuiste prijzen/claims | Zakelijke bevestiging vóór publicatie |
| Btw-afronding niet financieel bevestigd | Onjuiste fiscale uitsplitsing | Accountantgate vóór productieorders |
| Restaurantauth bestaat nog niet | IDOR/autorisatierisico | Membership + API + RLS vóór UI-release |
| Netlify-catchall ondersteunt namespace niet direct | 404/verkeerde function dispatch | Expliciete route vóór runtime-acceptatie |
| Bestaande Mollie-webhook is invoicegericht | Onbedoelde factuur-/portaalbijwerkingen | Niet koppelen in kritisch pad |
| Geen duurzame order-abuse-control | Spam/kosten/operationele hinder | DB-limiter vóór publieke productie-POST |
| Deliveryregels onbekend | Foute orderacceptatie | Capability standaard uit |

Geen van deze punten vereist een Fase 0 STOP: het ontwerp kan veilig worden geïmplementeerd en getest zonder productie te wijzigen. Zij zijn wel harde gates voor migratie-apply of publieke productieactivatie.

## 20. Implementatiesplitsing Fase 1 t/m 5

### Fase 1A — Schema, RLS en tenantisolatie

- Read-only preflight en release-unit opstellen.
- Forward-only schema, helpers, RLS, RPC's en testfixtures implementeren.
- Negatieve tenantmatrix volledig groen.
- Eén commit en expliciete PASS/STOP; niets toepassen zonder aparte toestemming.

### Fase 1B — Food API en serverberekeningen

- Food v1-router, auth/membership, storefrontqueries, create-order-RPC-aanroep, pollinglijst en status-/menumutaties.
- Payloadlimieten, foutcontract, abuse-control en idempotencytests.
- Kern werkt zonder betaalprovider.

### Fase 2 — Publieke storefront

- Generieke renderer op basis van slug/API.
- Mobiele winkelwagen met item-ID en quantity, checkout voor pickup.
- Silverado alleen via seed/config/assets; geen tenantbranch in code.

### Fase 3A — Orderdashboard

- Eigen restaurantguard en tenantcontext.
- Orderlijst/detail, polling, statustransities en fout-/offline-status.

### Fase 3B — Menu en instellingen

- Prijs, beschikbaarheid, gerechtgegevens en openingstijden.
- Refresh storefront bewijst serverdata; capabilities begrenzen UI en API.

### Fase 4 — Integraties en optionele Mollie-sandbox

- Integratiescherm met eerlijke statuslabels.
- Alleen bij resterende tijd: afzonderlijke Food payment-adapter/-tabel en testmode. Geen invoice/subscription-hergebruik.

### Fase 5 — End-to-end, regressie en demo

- Tenant A/B, mobiel, polling, status, prijswijziging, foutpaden en volledige regressie.
- Demo-resetprocedure, vaste pilotdata, browser/device rehearsal en releasebewijs.

Elke fase krijgt één afgebakende commit, tests en een expliciete poort. Een latere fase mag een groene eerdere kern niet afhankelijk maken van een optionele integratie.

## 21. Geschat kritisch pad naar donderdagdemo

Huidige datum is dinsdag 28 juli 2026; donderdag is 30 juli 2026. Dit is een inschatting, geen garantie.

| Volgorde | Werk | Schatting | Harde uitkomst |
|---:|---|---:|---|
| 1 | Fase 1A schema/RLS lokaal + geïsoleerd testen | 3–4 uur | Tenant A/B bewezen |
| 2 | Fase 1B minimale API | 3–4 uur | Serverberekende pickuporder |
| 3 | Fase 2 storefront | 2–3 uur | Mobiele orderplaatsing |
| 4 | Fase 3A dashboard | 2–3 uur | Order binnen 3–5 sec en statussen |
| 5 | Fase 3B menuprijs/beschikbaarheid | 2 uur | Wijziging direct zichtbaar na refresh |
| 6 | Fase 5 regressie/rehearsal/fixbuffer | 3–4 uur | Herhaalbare demo en isolatiebewijs |

Kritiek totaal: ongeveer 15–20 gefocuste uren, exclusief goedkeuringswachttijd en onverwachte remote schemadrift. Daarom:

- pickup eerst; delivery standaard uit;
- geen Mollie op het kritieke pad;
- geen Realtime, QR, loyaliteit of echte marketingintegratie;
- uiterlijk drie uur vóór de afspraak feature freeze en alleen blokkerende fixes;
- bij onvoldoende tijd gaat openingstijden-bewerken vóór integraties, maar ná order/status/prijs.

De zes donderdagcriteria zijn: serverberekende order, betrouwbare dashboardverschijning, geldige statusmachine, live prijsrefresh, negatieve tenantisolatie en een volledig werkende flow zonder betaling.

## 22. Expliciete eindstatus

`PASS_FOOD_V1_PHASE_0_READY_FOR_IMPLEMENTATION`

Motivatie: de branchbasis en werkboom waren betrouwbaar; de bindende documenten zijn aanwezig; de repository bevat passende auth-, database-, Netlify-, UI- en testpatronen; noodzakelijke nieuwe grenzen en productiepoorten zijn concreet vastgesteld. Deze PASS autoriseert alleen gefaseerde implementatie. Zij autoriseert geen migration apply, providerconfiguratie, staging-/productiewijziging of live betaling.

## Onderzochte kernbestanden

- `docs/FOOD_V1_ARCHITECTURE.md`
- `docs/food-platform-silverado-pilot-plan.md`
- `docs/CONTRIBUTING.md`
- `netlify.toml`
- `package.json`
- `supabase/migrations/00000000000000_authoritative_baseline.sql`
- `supabase/migrations/20260726200000_partner_profile_role_status_foundation.sql`
- `supabase/migration-drafts/README.md`
- `supabase/migration-plan.md`
- `supabase-common/migrations/README.md`
- `supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json`
- `supabase-bootstrap/README.md`
- `supabase-bootstrap/scripts/dual-root-validator.mjs`
- `docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json`
- `functions/_admin-auth.js`
- `functions/_cors.js`
- `functions/services/profileAccessPolicy.js`
- `functions/public-preview-render.js`
- `functions/admin-mollie-payment.js`
- `functions/create-payment.js`
- `functions/commercial-order.js`
- `functions/mollie-webhook.js`
- `public/src/config/roles.js`
- `public/src/config/permissions.js`
- `public/src/config/protectedRoutes.js`
- `public/src/services/routeGuardService.js`
- `public/src/admin-route-guard.js`
- `public/admin/config/sidebar-navigation.js`
- `public/admin/components/admin-sidebar.js`
- `public/admin/ui/premium-ui.js`
- `public/admin/ui/admin-toast.js`
- `public/admin-dashboard.html`
- `public/klantportaal.html`
- `Website factory maxwebstudio.nl/silverado-maxwebstudio-demo/index.html`
- `Website factory maxwebstudio.nl/silverado-maxwebstudio-demo/script.js`
- `Website factory maxwebstudio.nl/silverado-maxwebstudio-demo/styles.css`
- `Website factory maxwebstudio.nl/silverado-maxwebstudio-demo/README-MAXWEBSTUDIO.txt`
- representatieve Node-tests en SQL-fixtures onder `tests/`.
