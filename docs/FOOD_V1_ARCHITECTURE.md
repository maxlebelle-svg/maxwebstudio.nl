# Max Webstudio Food v1 — Architectuur

Status: doelarchitectuur voor Fase 0-validatie  
Pilottenant: Silverado Roti Shop, Emmeloord  
Product: Max Webstudio Food  
Interne module: `modules/food`

## 1. Doel

Max Webstudio Food v1 is een configureerbare, multi-tenant food-engine binnen het bestaande Max Webstudio-platform. Silverado is de eerste pilotpartner, maar krijgt geen eigen productvariant of aparte bedrijfslogica.

Een nieuwe horecaklant moet uiteindelijk binnen ongeveer tien minuten kunnen worden ingericht door:

1. een organisatie en restaurantlocatie aan te maken;
2. een horecaprofiel als startpreset te kiezen;
3. toegestane capabilities aan of uit te zetten;
4. huisstijl, openingstijden, bezorggebied, belastingklassen en menu te configureren;
5. kanalen te activeren;
6. een testbestelling uit te voeren;
7. de omgeving te publiceren.

## 2. Architectuurstatus

Dit document legt de gewenste product- en modulegrenzen vast. Het geeft nog geen toestemming om productiedata, migraties of runtimecode te wijzigen.

De repository gebruikt momenteel onder andere Netlify Functions, Supabase-migraties en bestaande klant-, authenticatie-, portaal- en Mollie-bouwstenen. Fase 0 moet vaststellen welke onderdelen veilig kunnen worden hergebruikt en waar een adapter of nieuw model nodig is.

Beslissingen die pas na Fase 0 definitief worden:

* aansluiting op het bestaande customer-, organization- of tenantmodel;
* definitieve map- en routelocaties binnen de huidige repository;
* auth- en rollenmapping;
* RLS-helpers en migratievolgorde;
* hergebruik van de bestaande Mollie-sandbox;
* realtime-techniek voor orderupdates;
* exacte publieke en interne URL-structuur.

## 3. Kernprincipes

1. **Configuratie boven maatwerk.** Verschillen tussen restaurants worden vastgelegd in data en capabilities, niet in tenant-specifieke code.
2. **Eén Food-engine.** Website, QR, kiosk, tablet, WhatsApp, dashboard, app en API gebruiken dezelfde order- en menulogica.
3. **API-first.** Clients spreken een versieerbare interne Food API aan en schrijven niet rechtstreeks naar tabellen.
4. **Tenantisolatie.** Elke relevante rij is gekoppeld aan een organisatie en, wanneer nodig, een locatie.
5. **Server is leidend.** Prijzen, belasting, beschikbaarheid, bezorgregels, bevoegdheden en statustransities worden server-side gecontroleerd.
6. **Fail-closed.** Ontbrekende tenantcontext, capability, rol of configuratie leidt tot weigering.
7. **Presets zijn startwaarden.** Een horecatype versnelt onboarding, maar creëert geen eigen codepad of databaseschema.
8. **Donderdag blijft klein.** De pilot bewijst één perfecte orderflow; de architectuur maakt uitbreiding mogelijk zonder die uitbreiding nu al te bouwen.

## 4. Plaats binnen Max Webstudio

Gewenste modulaire richting:

```text
modules/
├── website/
├── crm/
├── finance/
├── food/
│   ├── api/
│   ├── application/
│   ├── domain/
│   ├── infrastructure/
│   ├── storefront/
│   └── dashboard/
├── marketing/
├── seo/
├── automation/
└── ai/
```

De Food-module bezit de regels voor menu's, beschikbaarheid, winkelwagens, orderberekening, orderstatussen, fulfilment en food-specifieke instellingen. De website-module bezit presentatie en publicatie, maar niet de orderlogica.

Gedeelde platformdiensten blijven buiten Food, bijvoorbeeld authenticatie, organisaties, gebruikers, facturatie van Max Webstudio-abonnementen, bestanden, notificatie-infrastructuur en algemene auditlogging.

## 5. Configureerbaar productmodel

### 5.1 Capability-catalogus

Voorbeelden van capabilities:

```text
ordering.pickup
ordering.delivery
ordering.table_service
ordering.qr
ordering.kiosk
ordering.whatsapp
reservations
gift_cards
loyalty
kitchen_display
payments.mollie
integrations.google_business
integrations.google_ads
integrations.meta
```

Een capability kent drie afzonderlijke niveaus:

1. **Platform availability:** bestaat de functie technisch en is zij veilig vrijgegeven?
2. **Entitlement:** hoort de functie bij het contract of abonnement van de tenant?
3. **Tenant configuration:** staat de toegestane functie voor deze restaurantlocatie aan en is zij volledig geconfigureerd?

Een schakelaar in de browser mag nooit zelfstandig toegang verlenen. De server controleert alle drie de niveaus.

### 5.2 Belastingen zijn configuratie, geen simpele featureflags

`BTW 9%` en `BTW 21%` worden gemodelleerd als tenantgebonden belastingklassen. Menu-items verwijzen naar een geldige belastingklasse. Percentages worden met ingangsdatum opgeslagen, zodat een wijziging geen historische orders verandert.

Een orderregel bewaart daarom minimaal de toegepaste prijs, het belastingtarief en de berekende bedragen als onveranderlijke snapshot.

### 5.3 Horecaprofielen

Ondersteunde startpresets kunnen zijn:

```text
restaurant
snackbar
pizzeria
sushi
broodjeszaak
lunchroom
cafetaria
ijssalon
cafe
```

Een preset bepaalt uitsluitend standaardwaarden, zoals aanbevolen capabilities, menu-indeling, fulfilmentopties en openingsuren. Na creatie kan de configuratie worden aangepast. Dezelfde domeinmodellen, API en autorisatieregels blijven gelden.

Silverado gebruikt bijvoorbeeld `restaurant` of een later gevalideerde horecapreset met `ordering.pickup` en eventueel `ordering.delivery` actief.

## 6. Kanaalonafhankelijke Food-engine

```text
Website ───────┐
QR-code ───────┤
Tablet ────────┤
Kiosk ─────────┤──> Food API ──> Food Engine ──> Database
WhatsApp ──────┤                       │
Mobiele app ───┤                       ├──> Betaling
Externe API ───┘                       ├──> Notificaties
                                      └──> Integratie-events
```

Elke order bevat een `channel` en optioneel een externe referentie. Kanalen mogen geen eigen prijsberekening of statusmachine implementeren.

Voorbeelden van kanalen:

```text
website
qr
tablet
kiosk
whatsapp
mobile_app
api
dashboard
```

Voor ordercreatie is een idempotency key verplicht. Zo leidt opnieuw verzenden door een slechte verbinding niet tot dubbele orders.

## 7. Conceptueel datamodel

Definitieve tabelnamen worden in Fase 0 afgestemd op bestaande conventies.

### Platform en configuratie

```text
organizations
organization_members
food_accounts
restaurant_locations
food_capability_catalog
food_entitlements
restaurant_capabilities
restaurant_channel_settings
restaurant_hours
restaurant_delivery_settings
restaurant_tax_classes
restaurant_integrations
```

### Menu

```text
menus
menu_categories
menu_items
menu_item_variants
menu_option_groups
menu_options
menu_item_availability
```

Varianten en opties kunnen in de eerste pilot beperkt blijven, maar de kern moet voorkomen dat hiervoor tenant-specifieke kolommen nodig worden.

### Orders

```text
orders
order_items
order_item_options
order_status_history
order_payments
order_events
```

Belangrijke ordervelden:

```text
id
organization_id
location_id
channel
external_reference
idempotency_key
fulfilment_type
status
customer_snapshot
delivery_snapshot
currency
subtotal_amount
tax_amount
delivery_amount
discount_amount
total_amount
created_at
```

Orderregels bewaren snapshots van naam, variant, opties, prijs en belasting. Latere menuwijzigingen veranderen een bestaande order nooit.

## 8. Food API v1

Voorgestelde interne namespace:

```text
/api/food/v1
```

### Publieke storefront

```text
GET  /storefronts/{slug}
GET  /storefronts/{slug}/menu
POST /storefronts/{slug}/orders
GET  /storefronts/{slug}/orders/{public_reference}/confirmation
```

De publieke API toont alleen publiceerbare restaurant- en menuvelden. Orderbevestiging gebruikt een niet-voorspelbare publieke referentie en retourneert nooit interne of andere klantgegevens.

### Beveiligd restaurantbeheer

```text
GET   /organizations/{organization_id}/food/orders
GET   /organizations/{organization_id}/food/orders/{order_id}
PATCH /organizations/{organization_id}/food/orders/{order_id}/status

GET   /organizations/{organization_id}/food/menu
POST  /organizations/{organization_id}/food/menu/items
PATCH /organizations/{organization_id}/food/menu/items/{item_id}

GET   /organizations/{organization_id}/food/settings
PATCH /organizations/{organization_id}/food/settings
GET   /organizations/{organization_id}/food/capabilities
PATCH /organizations/{organization_id}/food/capabilities/{capability_key}
```

Het pad bevat een organisatie-id voor duidelijke routering, maar de server vertrouwt die id nooit op zichzelf. De organisatie wordt steeds vergeleken met de geauthenticeerde gebruiker en diens rol.

### API-regels

* JSON-contracten worden per versie vastgelegd en getest.
* Geldbedragen gebruiken gehele minor units, bijvoorbeeld eurocenten.
* Tijdstippen worden in UTC opgeslagen; presentatie gebruikt de locatietijdzone.
* Schrijfacties valideren tenant, rol, capability, payload en actuele status.
* Ordertotalen worden opnieuw berekend vanuit actuele menu- en configuratiedata.
* Statuswijzigingen gebruiken een expliciete transitiematrix.
* Integraties reageren op betrouwbare domeinevents en schrijven niet om de Food-engine heen.

## 9. Orderstatusmachine

Minimale statussen:

```text
pending
accepted
preparing
ready
out_for_delivery
completed
cancelled
```

Niet iedere fulfilmentvorm gebruikt iedere status. `out_for_delivery` is bijvoorbeeld alleen toegestaan voor bezorgorders. Ongeldige of terugwaartse transities worden geweigerd, behalve via een expliciet bevoegde herstelactie met auditlog.

Elke wijziging schrijft een record naar `order_status_history` met actor, tijdstip, oude status, nieuwe status en reden.

## 10. Rollen en autorisatie

Minimaal voorziene rollen:

```text
platform_admin
restaurant_owner
restaurant_manager
restaurant_staff
kitchen_staff
viewer
```

Voorbeeldmatrix:

| Actie | Owner | Manager | Staff | Kitchen | Viewer |
|---|---:|---:|---:|---:|---:|
| Orders bekijken | ✓ | ✓ | ✓ | ✓ | ✓ |
| Orderstatus wijzigen | ✓ | ✓ | ✓ | beperkt | — |
| Menu beheren | ✓ | ✓ | beperkt | beschikbaarheid | — |
| Capabilities wijzigen | ✓ | beperkt | — | — | — |
| Integraties configureren | ✓ | beperkt | — | — | — |

De definitieve mapping moet bestaande platformrollen hergebruiken waar dat veilig kan.

## 11. Beveiliging en tenantisolatie

Verdedigingslagen:

1. authenticatie voor alle beheerendpoints;
2. server-side organisatie- en rolcontrole;
3. RLS op alle tenantgebonden tabellen;
4. minimale databasegrants;
5. schema- en domeinvalidatie;
6. rate limiting en misbruikbeperking op publieke ordercreatie;
7. idempotency tegen dubbele orders;
8. auditlogging voor beheer- en statuswijzigingen;
9. geen secrets of providercredentials in clients;
10. privacybewuste logging zonder volledige klant- of betaalgegevens.

Verplichte isolatietests:

* tenant A kan geen gegevens van tenant B lezen of wijzigen;
* een gemanipuleerde organization-id geeft geen toegang;
* een publieke gebruiker kan geen orderlijsten ophalen;
* een uitgeschakelde of niet-gecontracteerde capability is niet aanroepbaar;
* service-rolegebruik is beperkt tot kleine, gecontroleerde serverfuncties;
* restaurantmedewerkers kunnen uitsluitend toegestane acties voor eigen locaties uitvoeren.

## 12. Integraties en events

Food publiceert interne events, bijvoorbeeld:

```text
food.order.created
food.order.status_changed
food.menu.item_updated
food.item.availability_changed
food.payment.status_changed
```

Mollie, notificaties, analytics en toekomstige koppelingen consumeren deze events via adapters. Een storing bij een niet-kritieke integratie mag een geldige bestelling niet verliezen.

Externe providerstatussen worden alleen als verbonden getoond wanneer authenticatie en een relevante test technisch zijn bewezen. Thuisbezorgd blijft roadmap totdat API-toegang, voorwaarden en technische haalbaarheid zijn bevestigd.

## 13. Onboarding van een nieuwe horecaklant

Het gewenste beheerproces:

1. selecteer bestaande organisatie of maak een organisatie aan;
2. maak een restaurantlocatie aan;
3. kies een horecapreset;
4. ken contractuele entitlements toe;
5. activeer en configureer capabilities;
6. stel belastingklassen en fulfilmentregels in;
7. importeer of voer het menu in;
8. configureer huisstijl en storefront;
9. maak gebruikers en rollen aan;
10. voer isolatie-, menu-, prijs- en ordertests uit;
11. publiceer na expliciete goedkeuring.

De tienminutendoelstelling geldt pas wanneer veilige templates, import en validatie zijn gebouwd. Zij is geen reden om controles over te slaan.

## 14. V1-scope en demonstratie

Werkend voor de pilot:

* Silverado-profiel en realistisch menu;
* afhalen en, indien betrouwbaar, bezorgen;
* mobiele winkelwagen en ordercreatie;
* server-side prijsberekening;
* dashboard met nieuwe order;
* gecontroleerde statustransities;
* menuprijs en beschikbaarheid wijzigen;
* publieke prijswijziging zichtbaar na verversen;
* tweede tenant voor isolatiebewijs.

De demonstratie bewijst exact één flow:

```text
Silverado-storefront
→ bestelling plaatsen
→ order verschijnt in dashboard
→ accepteren
→ in bereiding
→ gereed
→ menuprijs wijzigen
→ nieuwe prijs publiek zichtbaar
```

QR, kiosk, app, WhatsApp-ordering, loyaliteit, reserveringen en andere toekomstige capabilities worden in v1 architectonisch ondersteund, maar niet gebouwd tenzij zij apart worden geprioriteerd.

## 15. Roadmap naar v2

Mogelijke volgorde na een stabiele pilot:

1. herhaalbare tenant-onboarding en menu-import;
2. productiebetalingen en robuuste webhookafhandeling;
3. QR-tafelbestellingen en tafelcontext;
4. keukendisplay en printer-/bonrouting;
5. reserveringen;
6. cadeaubonnen en loyaliteit;
7. voorraad en uitgebreidere beschikbaarheidsregels;
8. bezorgzones en bezorgbeheer;
9. WhatsApp- of conversational ordering met expliciete bevestiging;
10. publieke partner-API en mobiele app;
11. AI-upselling met transparante regels en meetbare experimenten;
12. externe marketplacekoppelingen waar toegang en contracten dit toelaten.

Elke v2-module moet dezelfde tenant-, capability-, API-, event- en autorisatiegrenzen respecteren.

## 16. Fase 0 — verplichte uitwerking

Voordat migraties of runtimecode worden gewijzigd, levert Codex:

* mapping van dit conceptuele model op bestaande tabellen en rollen;
* keuze tussen hergebruik en nieuwe modellen, inclusief argumentatie;
* concrete route- en mappenkaart;
* API-contracten voor de donderdagflow;
* RLS- en autorisatiematrix;
* capability- en entitlementmodel;
* orderstatus-transitiematrix;
* dreigingsanalyse voor publieke ordercreatie;
* migratie-, test- en rollbackplan;
* lijst met aannames, open beslissingen en productieblokkades;
* expliciet `PASS` of `STOP` voor implementatie.

## 17. Definition of Done

Food v1 is pas architectonisch aanvaardbaar wanneer:

* er geen Silverado-specifieke domeinlogica in generieke code staat;
* een tweede restaurant via configuratie kan worden toegevoegd;
* website en dashboard dezelfde Food API en domeinregels gebruiken;
* prijs- en belastingberekening uitsluitend server-side gebeurt;
* capabilities niet alleen visueel maar ook server-side worden afgedwongen;
* tenantisolatie door geautomatiseerde negatieve tests is bewezen;
* orderregels historische prijs- en belastingsnapshots bewaren;
* dubbele ordercreatie veilig wordt afgehandeld;
* alle statuswijzigingen geautoriseerd en controleerbaar zijn;
* roadmapmodules zonder schemafork of tenantkopie kunnen worden toegevoegd;
* de volledige donderdagflow aantoonbaar soepel werkt.
