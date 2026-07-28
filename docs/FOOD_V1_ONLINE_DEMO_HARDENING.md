# Food v1 Online Demo Hardening

Status: lokaal bewezen; niet geprovisioned, niet gedeployed en niet voor remote uitvoering geautoriseerd.

## Doel en grens

Deze hardening bereidt de functioneel bevroren Food v1-demo voor op één afzonderlijke `food_demo`-omgeving. Zij voegt geen restaurantfunctionaliteit toe. Productie, gewone staging en alle niet-Food-routes blijven buiten scope.

## Omgevingseisen

De server accepteert online demo-reset uitsluitend wanneer alle onderstaande voorwaarden tegelijk gelden:

- `APP_ENVIRONMENT=food_demo`;
- `FOOD_DEMO_RESET_ENABLED=true`;
- `FOOD_DEMO_RESET_ALLOWLIST` bevat exact de demo-`food_account_id` of storefrontslug;
- de gebruiker heeft een geldige Supabase-sessie;
- de gebruiker is `super_admin`/`admin` of actief Food-lid met rol `owner`/`manager`;
- entitlement en locatiecapability `demo.reset` staan beide actief;
- de database bevat dezelfde tenant en slug in `food_demo_accounts` met `enabled=true`.

Veilige standaarden:

- `FOOD_PUBLIC_ORDERING_ENABLED=false` wanneer de variabele ontbreekt of niet exact `true` is;
- `FOOD_DEMO_RESET_ENABLED=false` wanneer de variabele ontbreekt of niet exact `true` is;
- een ontbrekende, onbekende of gewone stagingwaarde van `APP_ENVIRONMENT` blokkeert reset;
- browsercode leest of bepaalt geen van deze servervariabelen.

De provisioningstap moet daarnaast `FOOD_RATE_LIMIT_SECRET` als afzonderlijk serversecret instellen voordat publieke bestellingen bewust worden geactiveerd. Geen secret staat in de repository.

## Routes en indexering

De volgende routes krijgen `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`:

- `/food/*` en de interne entrypoint `/food.html`;
- `/admin/food` en `/admin/food/*` plus `/admin-food.html`;
- `/api/food/v1/*` en de equivalente Netlify Function-route.

De twee HTML-entrypoints bevatten dezelfde robots-meta. Niet-Food-routes krijgen deze Food-regel niet. Robotsbeveiliging beperkt indexering maar vervangt nooit authenticatie of tenantautorisatie.

## Online resetroute

`POST /api/food/v1/accounts/:foodAccountId/demo-reset`

Vereist:

- bearer-sessie;
- `Idempotency-Key` van 16–128 toegestane tekens;
- JSON met uitsluitend `storefront_slug` en `confirmation`;
- bevestiging exact `HERSTEL <storefront_slug>`.

De UI toont de resetknop alleen wanneer de server `permissions.demo_reset=true` teruggeeft. De gebruiker moet de tenantgebonden tekst opnieuw typen.

De databasefunctie `food_reset_demo_account_v1` voert alles in één transactie uit. Zij:

1. vereist een expliciete `service_role`-claim;
2. neemt een tenantgebonden advisory transaction lock;
3. controleert database-allowlist, capability en actor opnieuw;
4. retourneert een eerder auditresultaat bij dezelfde idempotencysleutel;
5. staat maximaal drie nieuwe resets per actor en tenant per tien minuten toe;
6. verwijdert uitsluitend orders, orderregels, statushistorie en order-idempotency van de allowlisted tenant;
7. herstelt prijs, beschikbaarheid en actieve status uit de vaste menu-itembaseline;
8. schrijft één onveranderlijk bedoeld auditrecord met aantallen en actorsoort.

De reset behoudt Food-account, klantanker, locaties, profielen, memberships, capabilities, tax classes, menu's, categorieën en tenantconfiguratie. De synthetische isolatietenant is niet opgenomen in `food_demo_accounts` en kan dus niet worden gereset.

## Demoseed

`supabase/demo/food-v1-online-demo-seed.sql` is een afzonderlijk, idempotent seedbestand voor een lege, geïsoleerde demo-omgeving. Het maakt:

- Silverado Roti Shop als pilottenant;
- één Silverado-locatie met pickup;
- drie categorieën en tien synthetische menu-items;
- een synthetisch managerprofiel en platformadminprofiel met Food-memberships;
- één niet-gepubliceerde synthetische isolatietenant;
- de vaste resetbaseline voor de tien Silverado-items.

Het seedbestand maakt geen `auth.users`, wachtwoorden of providercredentials. Een latere, expliciet geautoriseerde provisioningstap maakt de demo-authgebruikers en koppelt hun UUID's aan de vooraf aangemaakte profielen. Gebruik daarvoor uitsluitend synthetische demo-identiteiten.

Lokaal valideren:

```text
zsh scripts/food-v1-online-demo-local-validation.zsh
```

Het script weigert remote databasevariabelen, start PostgreSQL zonder TCP-listener, past de seed tweemaal toe en verwijdert de tijdelijke cluster via een exit-trap.

## Begrensde migratiebundel

De vaste bundel staat in `docs/release-readiness/food-v1-online-demo-bundle/` en bevat exact:

1. `00000000000000_authoritative_baseline.sql`
2. `20260726200000_partner_profile_role_status_foundation.sql`
3. `20260728160000_food_v1_data_foundation.sql`
4. `20260728161000_food_v1_tenant_security.sql`
5. `20260728162000_food_v1_application_api_support.sql`
6. `20260728163000_food_v1_storefront_confirmation.sql`
7. `20260728210000_food_v1_online_demo_reset.sql`

`FILESET.json` fixeert bytes en SHA-256 van ieder bestand en van de afzonderlijke seed. `MANIFEST.json` fixeert de volgorde en bevat:

- `targetEnvironment=food-demo`;
- `productionAllowed=false`;
- `stagingAllowed=false`;
- `remoteExecutionAuthorizedByThisManifest=false`.

Deze bundel is bewijs en begrenzing, geen uitvoeringsautorisatie.

## Provisioningvoorwaarden

Provisioning mag pas in een aparte, expliciet geautoriseerde stap wanneer:

- branch en PR opnieuw schoon zijn beoordeeld;
- alle checksums opnieuw overeenkomen;
- Food-readiness, databasevalidatie, auth/governance en regressies groen zijn;
- het doel aantoonbaar een nieuw en leeg Supabase-project is;
- projectnaam en omgeving aantoonbaar bij de Demo Cloud horen;
- servervariabelen eerst veilig op disabled staan;
- demo-authidentiteiten synthetisch zijn;
- Netlify-headers na deployment via echte HTTP-responses zijn geverifieerd;
- geen productie- of gewone stagingreferentie aanwezig is.

Voorgestelde veilige activatievolgorde: migratiebundel, seed, synthetische authkoppeling, leescontrole, resetcontrole, Netlify-koppeling, robotsheadercontrole, pas daarna publieke ordering bewust activeren.

## Rollback en volledige verwijdering

Voor een nog niet gebruikte lokale database: verwijder de tijdelijke cluster; er blijft niets achter.

Voor de toekomstige geïsoleerde demo-omgeving is rollback geen down-migratie. Zet eerst `FOOD_PUBLIC_ORDERING_ENABLED=false` en `FOOD_DEMO_RESET_ENABLED=false`, verwijder daarna de Netlify-koppeling/site en verwijder vervolgens het volledige afzonderlijke Supabase-demo-project via de providerprocedure. Omdat de omgeving uitsluitend synthetische data bevat en niet met productie wordt gedeeld, is projectverwijdering het helderste volledige verwijderingspad.

Pas deze resetmigratie nooit zelfstandig toe op productie of gewone staging. De manifesten autoriseren geen remote uitvoering.
