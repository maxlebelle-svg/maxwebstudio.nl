Ja. Maar we moeten nu **heel streng kiezen wat donderdag echt moet werken**. Niet meteen Google Ads, Instagram, loyaliteit, bezorgers, AI en boekhouding volledig bouwen. Dan krijg je tien halfwerkende onderdelen.

## Doel voor donderdag

Je moet bij Silverado kunnen laten zien:

1. Een professionele mobiele restaurantwebsite.
2. Een echte digitale menukaart.
3. Producten toevoegen aan een winkelwagen.
4. Afhalen of bezorgen kiezen.
5. Een bestelling plaatsen.
6. De bestelling direct terugzien in het restaurantdashboard.
7. De bestelling door statussen zetten:

   * nieuw
   * geaccepteerd
   * in bereiding
   * gereed
   * onderweg
   * afgerond
8. Zelf prijzen, gerechten, beschikbaarheid en openingstijden aanpassen.
9. Een scherm met toekomstige koppelingen voor Mollie, Google, Meta en Thuisbezorgd.
10. Uitleggen dat dit later bij ieder restaurant opnieuw geactiveerd kan worden.

De **wow-factor** is niet dat ieder menu-item perfect is. De wow-factor is:

> Jij plaatst op je telefoon een bestelling en enkele seconden later verschijnt die in het dashboard van het restaurant.

Dat moet ons belangrijkste bewijs worden.

## Positionering van de pilot

> **Silverado wordt de eerste pilotpartner voor het Max Webstudio Food Platform.**

Silverado Roti Shop in Emmeloord is de eerste tenant en testcase. Het platform zelf blijft restaurantonafhankelijk en moet na de pilot direct herbruikbaar zijn voor andere restaurants.

Silverado krijgt binnen de pilot de positie van eerste officiële **Max Webstudio Food Partner**:

> “Jullie worden onze eerste officiële Food Partner. Daardoor krijgen jullie als eerste toegang tot nieuwe functies en kunnen jullie meedenken over de ontwikkeling van het platform.”

Dit partnerschap geeft recht op vroege toegang en een duidelijke feedbackrol, maar niet op onbeperkt gratis maatwerk. Afspraken over pilotduur, feedbackmomenten, casegebruik, tarieven en werk buiten de afgesproken scope worden vooraf vastgelegd.

# Productdefinitie — Max Webstudio Food v1

**Max Webstudio Food** is een officiële, herbruikbare productlijn binnen het bredere Max Webstudio-platform. Silverado is de eerste pilottenant, maar bepaalt niet de interne architectuur of generieke productnaam.

## Core v1

* restaurantprofiel;
* menubeheer;
* categorieën;
* bestellingen;
* dashboard;
* openingstijden;
* instellingen.

## Integraties

* Mollie;
* Google Business Profile;
* Google Ads;
* Meta;
* WhatsApp Business.

Een integratie behoort alleen tot de werkende v1-scope wanneer zij technisch getest, veilig geconfigureerd en voor de pilot expliciet geaccepteerd is. Anders verschijnt zij uitsluitend als roadmap of als duidelijk gemarkeerde toekomstige koppeling.

## Toekomstige modules

* loyaliteit;
* cadeaubonnen;
* AI-upselling;
* reserveringen;
* QR-tafelbestellingen;
* keukendisplay;
* voorraadbeheer;
* bezorgbeheer;
* Thuisbezorgd-koppeling, indien technisch en contractueel haalbaar.

Deze toekomstige modules vallen niet binnen de donderdagrelease en mogen de kernflow niet vertragen.

# Wat we voorlopig nog niet volledig bouwen

Deze onderdelen tonen we als roadmap of veilige demo:

* echte Instagram-publicatie;
* automatische Google Ads-campagnes;
* echte Google Bedrijfsprofiel-mutaties;
* volledige Thuisbezorgd-koppeling;
* eigen bezorgertracking;
* loyaliteitspunten;
* automatische e-mails en WhatsApp;
* uitgebreide omzetboekhouding;
* productiebetalingen.

Mollie kunnen we eventueel in testmodus aansluiten, maar een betrouwbare bestelling zonder betaling is belangrijker dan een halfwerkende betaalflow.

# Architectuurkeuze

Food wordt één afgebakende module binnen Max Webstudio:

```text
modules/
├── website/
├── crm/
├── finance/
├── food/
├── marketing/
├── seo/
├── automation/
└── ai/
```

Toekomstige branches zoals `construction/`, `beauty/`, `healthcare/` en `automotive/` kunnen volgens dezelfde modulaire principes worden toegevoegd zonder de platformkern of Food-module te herschrijven. Deze indeling is een gewenste architectuurrichting; Fase 0 moet eerst vaststellen hoe zij veilig aansluit op de bestaande repository.

Ieder restaurant krijgt **geen volledig losse database**.

We gebruiken één centrale Max Webstudio-database met gegevensscheiding per organisatie:

```text
organizations
- id
- name
- type: restaurant

organization_members
- organization_id
- user_id
- role

restaurant_profiles
- organization_id
- address
- phone
- opening_hours
- delivery_settings

menu_categories
- organization_id

menu_items
- organization_id
- category_id
- name
- description
- price
- active

orders
- organization_id
- customer_details
- order_type
- status
- total

order_items
- order_id
- menu_item_id
- quantity
- unit_price
```

Iedere query en RLS-policy wordt beperkt op `organization_id`.

Zo kan Max Webstudio later honderd restaurants bedienen, terwijl ieder restaurant uitsluitend zijn eigen menu, klanten en bestellingen ziet.

## Interne naamgeving

Gebruik in code en infrastructuur neutrale namen:

```text
food-platform
modules/food
pilot-silverado
```

Vernoem het product, de gedeelde module, generieke routes, tabellen of services niet naar Silverado. Gebruik `Silverado` alleen voor tenantspecifieke configuratie, seeddata, demo-inhoud en pilotdocumentatie.

# Planning voor vanavond: acht uur

## Uur 1 — Discovery en ontwerp vastzetten

Codex moet eerst de bestaande repository inspecteren.

Laat Codex bepalen:

* welke bestaande customer-, profile- en role-tabellen herbruikbaar zijn;
* waar de Food-module logisch thuishoort;
* welke bestaande Mollie-, auth- en portaalonderdelen hergebruikt kunnen worden;
* welke migraties nodig zijn;
* welke delen productie absoluut niet mogen raken.

**Resultaat van uur 1:**

* implementatieplan;
* databasediagram;
* routes;
* acceptatiecriteria;
* lijst met bestaande componenten die worden hergebruikt.

Nog geen wilde codewijzigingen voordat dit duidelijk is.

## Uur 2 en 3 — Database en tenantbeveiliging

Bouwen:

* `restaurant_profiles`;
* `menu_categories`;
* `menu_items`;
* `orders`;
* `order_items`;
* eventueel `restaurant_integrations`;
* organisatie- of klantkoppeling;
* RLS-policies;
* seeddata voor Silverado;
* testrestaurant voor isolatietests.

Belangrijke controle:

* Silverado mag restaurant B nooit kunnen lezen.
* Publieke bezoekers mogen alleen actieve menugegevens zien.
* Publieke bezoekers mogen een bestelling creëren, maar geen andere orders uitlezen.
* Prijzen worden server-side opnieuw berekend.

## Uur 4 — Publieke bestelervaring

Bouwen op de bestaande Silverado Roti Shop-demo:

* categorieën;
* gerechten;
* productdetails;
* aantallen;
* extra opmerkingen;
* winkelwagen;
* afhalen of bezorgen;
* naam, telefoon en adres;
* totaalbedrag;
* bestelling bevestigen.

De flow moet mobiel eerst worden ontworpen.

## Uur 5 — Restaurantdashboard

Bouwen:

```text
Food Dashboard
├── Overzicht
├── Bestellingen
├── Menukaart
├── Openingstijden
├── Bezorging
├── Marketing
├── Koppelingen
└── Instellingen
```

Werkend krijgen:

* nieuwe orders bekijken;
* order openen;
* status wijzigen;
* geluid of duidelijke melding bij nieuwe order;
* overzicht met aantallen en omzet;
* actieve/onbeschikbare gerechten.

## Uur 6 — Zelfbeheer van het menu

Werkend krijgen:

* gerecht toevoegen;
* prijs wijzigen;
* omschrijving wijzigen;
* categorie kiezen;
* beschikbaarheid aan/uit;
* openingstijden aanpassen;
* bezorgkosten en minimum orderbedrag instellen.

Hier zou ik een beheermodel van maken:

### Zelf beheren

De restauranteigenaar mag dagelijkse zaken aanpassen:

* prijzen;
* beschikbaarheid;
* openingstijden;
* productomschrijvingen;
* acties.

### Max Webstudio-beheer

Jullie beheren:

* ontwerp;
* technische wijzigingen;
* koppelingen;
* campagnes;
* SEO;
* beveiliging;
* onderhoud;
* nieuwe functionaliteit.

Dus zelfbeheer haalt het abonnement niet weg. Het abonnement wordt juist betaald voor het platform, hosting, support, updates, marketing en technisch beheer.

## Uur 7 — Koppelingenscherm en Mollie-test

Bouw een professioneel integrationscherm:

```text
Mollie              Verbonden / configureren
Google Business     Binnenkort verbinden
Google Ads          Binnenkort verbinden
Instagram & Facebook Binnenkort verbinden
Thuisbezorgd        Verkenning nodig
WhatsApp Business   Binnenkort verbinden
```

Mollie:

* alleen testmodus;
* geen echte transacties;
* webhook en orderstatus veilig ontwerpen;
* betaling mag niet het plaatsen van een demo-order blokkeren.

Wanneer Mollie niet snel betrouwbaar werkt, gebruiken we donderdag een duidelijk gelabelde demonstratiebetaling.

## Uur 8 — End-to-end test en bewijs

Test exact deze happy path:

1. Open website op telefoon.
2. Voeg twee gerechten toe.
3. Kies afhalen.
4. Plaats bestelling.
5. Open dashboard.
6. Bekijk nieuwe order.
7. Accepteer order.
8. Zet in bereiding.
9. Zet gereed.
10. Wijzig prijs van een gerecht.
11. Herlaad publieke website.
12. Controleer dat de nieuwe prijs zichtbaar is.

Daarna:

* screenshots maken;
* korte demoaccounts klaarzetten;
* seed/resetknop voor demo;
* bekende beperkingen opschrijven;
* commit en branch schoon maken.

# Woensdag: stabiliteit en presentatie

## Ochtend — Functionele afwerking

* fouten oplossen;
* mobiele ervaring verbeteren;
* lege staten;
* laadtoestanden;
* foutmeldingen;
* prijsberekening;
* dubbele orderinvoer voorkomen;
* tenantisolatie testen;
* auth herstellen bij refresh.

## Middag — Visuele polish

De dashboarddemo moet er verkoopbaar uitzien:

* restaurantnaam en logo;
* omzet vandaag;
* orders vandaag;
* gemiddelde orderwaarde;
* populaire gerechten;
* actuele orderkolommen;
* connection cards;
* nette statusbadges;
* goede mobiele restaurantweergave.

Gebruik echte of realistische menudata van Silverado, maar doe geen onbewezen claims over prijzen, reviews of omzet.

## Avond — Presentatiemodus

Maak één speciale demoflow:

```text
/public restaurantwebsite
→ bestelling plaatsen
→ /restaurant/orders
→ order behandelen
→ /restaurant/menu
→ prijs wijzigen
→ /restaurant/integrations
→ groeimogelijkheden tonen
```

Verder voorbereiden:

* reservevideo van de werkende flow;
* screenshots als internet uitvalt;
* tweede browserprofiel voor het dashboard;
* telefoon voor de klantzijde;
* laptop voor de restaurantzijde;
* testorder resetten vóór donderdag.

# Donderdag vóór vertrek

Geen grote nieuwe functionaliteit meer.

Alleen:

* deployment controleren;
* databaseverbinding controleren;
* demoaccount testen;
* bestelling plaatsen;
* orderstatus testen;
* mobiele versie testen;
* Mollie-test controleren;
* presentatie één keer volledig doorlopen;
* seeddata herstellen;
* backupdemo klaarzetten.

**Release-freeze: minimaal drie uur vóór het gesprek.**

Geen lastminute migraties, auth-aanpassingen of nieuwe koppelingen.

# Wat je tijdens het gesprek presenteert

Begin niet met techniek.

Zeg:

> “Ik wil jullie iets laten zien waar wij de komende jaren veel restaurants mee willen helpen. Jullie kunnen de eerste officiële Food Partner van Max Webstudio worden. We bouwen niet alleen een website, maar een compleet platform waarmee jullie online bestellingen, menu, betalingen en groei vanuit één omgeving kunnen beheren.”

Daarna laat je de klant zelf een bestelling plaatsen.

Vervolgens open jij het dashboard en zeg je:

> “Deze bestelling komt nu rechtstreeks bij jullie binnen. Jullie kunnen hem accepteren, voorbereiden en afronden. En wanneer een gerecht uitverkocht is of duurder wordt, kunnen jullie dat hier zelf aanpassen.”

Daarna toon je de koppelingen:

> “In de volgende fase koppelen we betalingen, Google, advertenties en eventueel platforms zoals Thuisbezorgd. Max Webstudio blijft het systeem beheren en helpt actief om meer bestellingen te realiseren.”

# Wat ik commercieel zou voorstellen

Maak Silverado de eerste officiële **Max Webstudio Food Partner** en founding pilot partner.

Bijvoorbeeld:

* lagere eenmalige ontwikkelprijs;
* gereduceerd abonnement gedurende de pilot;
* zij geven actief feedback;
* jij mag de resultaten als case gebruiken;
* maatwerk buiten de pilot wordt apart begroot;
* geen onbeperkt gratis ontwikkelwerk;
* advertentiebudget staat los van jouw beheervergoeding;
* transactiekosten staan los van het abonnement.

Beloof donderdag nog niet dat werkelijk iedere externe koppeling direct mogelijk is. Vooral Thuisbezorgd en socialmedia-platforms kunnen toegangsvoorwaarden, partnerprogramma’s en API-beperkingen hebben.

# Masteropdracht voor Codex

We bouwen **Max Webstudio Food v1** als veilige, herbruikbare productmodule binnen het bestaande Max Webstudio-platform. Silverado Roti Shop in Emmeloord is de eerste pilottenant en officiële Food Partner.

Gebruik [`FOOD_V1_ARCHITECTURE.md`](./FOOD_V1_ARCHITECTURE.md) als richtinggevend architectuurcontract. Valideer dit document in Fase 0 tegen de bestaande repository voordat migraties of runtimecode worden gewijzigd.

DOEL

Lever vóór de pilotpresentatie een end-to-end restaurantflow op waarmee:

1. Een bezoeker een restaurantmenu kan bekijken.
2. Gerechten aan een winkelwagen kunnen worden toegevoegd.
3. De bezoeker afhalen of bezorgen kan kiezen.
4. De bezoeker een bestelling kan plaatsen.
5. De bestelling direct zichtbaar wordt in het restaurantdashboard.
6. Een restaurantmedewerker de orderstatus kan wijzigen.
7. Een bevoegde restaurantgebruiker menuprijzen, beschikbaarheid en openingstijden kan aanpassen.
8. Wij professioneel toekomstige koppelingen kunnen tonen voor Mollie, Google Business, Google Ads, Meta, WhatsApp en Thuisbezorgd.
9. De module later veilig voor meerdere restaurants kan worden geactiveerd.

BELANGRIJKE RANDVOORWAARDEN

* Positioneer Silverado als de eerste pilotpartner en tenant, niet als productnaam.
* Gebruik neutrale interne namen zoals `food-platform`, `modules/food` en `pilot-silverado`.
* Behandel Core v1, Integraties en Toekomstige modules als afzonderlijke scopes; roadmapfuncties mogen de donderdagdemo niet blokkeren.
* Bouw Food als configureerbare multi-tenant engine, niet als Silverado-maatwerk.
* Modelleer horecatypes als presets met gedeelde domeinlogica, niet als afzonderlijke codepaden of schema's.
* Trek orders los van websites: elk kanaal gebruikt dezelfde Food API, orderberekening en statusmachine.
* Scheid technische beschikbaarheid, contractuele entitlement en tenantconfiguratie van capabilities.
* Modelleer belastingtarieven als gedateerde belastingklassen en bewaar toegepaste bedragen als ordersnapshots.
* Gebruik idempotency voor ordercreatie om dubbele orders door retries te voorkomen.
* Houd generieke routes, tabellen, services en componenten restaurantonafhankelijk, zodat een volgende tenant zonder Silverado-specifieke kopieën kan worden toegevoegd.
* Inspecteer eerst de bestaande architectuur, auth, rollen, klantportalen, Mollie-integratie, databaseconventies en migratiebeleid.
* Hergebruik bestaande infrastructuur waar dat veilig en logisch is.
* Geen productiegegevens wijzigen.
* Geen echte betalingen, advertenties, e-mails, socialmediaberichten of externe publicaties uitvoeren.
* Gebruik uitsluitend sandbox/testmodus voor providers.
* Alle restaurantdata moet tenantgescheiden zijn.
* Gebruik bij voorkeur een bestaand organization-, customer- of tenantmodel wanneer dit geschikt is.
* Wanneer geen veilig tenantmodel bestaat, ontwerp een minimale organization-laag.
* Iedere relevante rij moet aan een tenant/organization gekoppeld zijn.
* Voeg RLS en server-side autorisatie toe.
* Vertrouw nooit prijzen, totalen, tenant-id’s of orderstatussen uit de browser.
* Bereken ordertotalen server-side vanuit de actuele menuprijzen.
* Publieke bezoekers mogen actieve menu-items lezen en orders creëren, maar geen orders of privégegevens uitlezen.
* Restaurantgebruikers mogen alleen hun eigen restaurant lezen en beheren.
* Behoud bestaande flows en tests.
* Werk fail-closed.
* Maak kleine, logisch gescheiden commits.
* Stop bij onbekende productie- of migratierisico’s en rapporteer exact wat ontbreekt.

FASE 0 — DISCOVERY

Inspecteer en documenteer:

* relevante repositorystructuur;
* bestaande rollen en auth;
* bestaande klant-/organizationtabellen;
* bestaande Molliecode;
* bestaande dashboardcomponenten;
* relevante migrations en RLS helpers;
* geschikte route- en componentstructuur;
* risico’s voor bestaande productieflows.

Lever vóór implementatie:

* voorgesteld datamodel;
* routekaart;
* gevalideerd `FOOD_V1_ARCHITECTURE.md` met API-contracten, modulegrenzen, capabilities en roadmap naar v2;
* autorisatiematrix;
* implementatiefasen;
* testplan;
* rollbackplan.

FASE 1 — DATA EN BEVEILIGING

Realiseer of hergebruik veilige modellen voor:

* restaurants/organizations;
* restaurant_members;
* restaurant_profiles;
* menu_categories;
* menu_items;
* orders;
* order_items;
* restaurant_settings;
* restaurant_integrations.

Minimale orderstatussen:

* pending
* accepted
* preparing
* ready
* out_for_delivery
* completed
* cancelled

Voeg seeddata toe voor:

* Silverado-pilotrestaurant;
* tweede isolatierestaurant;
* minimaal drie categorieën;
* minimaal tien menu-items;
* realistische openingstijden en bezorginstellingen.

FASE 2 — PUBLIEKE BESTELFLOW

Bouw een mobiele publieke restaurantpagina met:

* restaurantinformatie;
* categorieën;
* gerechten;
* omschrijving;
* prijs;
* beschikbaarheid;
* winkelwagen;
* aantallen;
* opmerkingen;
* afhalen/bezorgen;
* klantgegevens;
* server-side orderberekening;
* duidelijke orderbevestiging.

FASE 3 — RESTAURANTDASHBOARD

Bouw:

* overzicht met orders en demo-KPI’s;
* live of betrouwbaar verversende orderlijst;
* orderdetail;
* statuswijzigingen;
* filters op status;
* duidelijke nieuwe-orderindicatie;
* menuoverzicht;
* gerecht toevoegen/bewerken;
* prijs wijzigen;
* beschikbaarheid aan/uit;
* openingstijden beheren;
* bezorgkosten en minimum bestelbedrag beheren.

FASE 4 — INTEGRATIONS

Maak een professioneel integrationscherm voor:

* Mollie;
* Google Business Profile;
* Google Ads;
* Meta/Instagram/Facebook;
* WhatsApp Business;
* Thuisbezorgd.

Gebruik alleen echte verbindingsstatussen wanneer deze technisch bewezen zijn. Markeer overige onderdelen als niet verbonden, binnenkort beschikbaar of vereist onboarding. Simuleer geen echte providerverbinding.

Onderzoek of de bestaande Mollie-sandbox veilig voor een testbetaling kan worden hergebruikt. Laat de kernbestelflow niet afhangen van een onbetrouwbare providerintegratie.

FASE 5 — TESTS

Minimaal testen:

* tenant A kan tenant B niet lezen;
* publieke gebruiker kan geen orders uitlezen;
* ordertotalen worden server-side berekend;
* inactief gerecht kan niet worden besteld;
* prijswijziging wordt correct toegepast;
* restaurantmedewerker kan alleen eigen orders wijzigen;
* onbevoegde rol kan menu niet beheren;
* happy path bestelling;
* orderstatusflow;
* mobiele rendering;
* bestaande relevante regressietests.

DEMO-ACCEPTATIE

De pilot is alleen gereed wanneer deze flow aantoonbaar werkt:

1. Bezoeker opent Silverado Roti Shop-demo op mobiel.
2. Bezoeker voegt gerechten toe.
3. Bezoeker kiest afhalen of bezorgen.
4. Bezoeker plaatst een order.
5. De order verschijnt in het Silverado-dashboard.
6. Een medewerker accepteert de order.
7. De order wordt in bereiding en daarna gereed gezet.
8. Een bevoegde gebruiker wijzigt een menuprijs.
9. De nieuwe prijs verschijnt publiek.
10. Het tweede restaurant kan geen Silverado-data lezen.

OPLEVERING

Rapporteer:

* branch en commit;
* gewijzigde bestanden;
* migrations;
* tests en exacte resultaten;
* demo-URL’s;
* demoaccounts zonder geheimen te publiceren;
* screenshots of bewijs;
* bekende beperkingen;
* rollbackstappen;
* expliciete PASS of STOP.

Begin uitsluitend met Fase 0 en presenteer het discoveryplan voordat je migraties of runtimecode wijzigt.

Mijn advies: geef Codex eerst alleen deze opdracht. Laat hem na Fase 0 rapporteren en gebruik dat rapport om de daadwerkelijke implementatiesprints gecontroleerd door te trekken. Zo krijg je snelheid zonder de bestaande Max Webstudio-basis onnodig in gevaar te brengen.
