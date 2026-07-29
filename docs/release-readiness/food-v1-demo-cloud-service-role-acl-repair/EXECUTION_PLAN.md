# Food v1 Demo Cloud service-role ACL repair

Status: lokaal bewezen forward-only herstel; remote uitvoering is niet door dit pakket geautoriseerd.

## Doel en vaste scope

- Doelproject: `max-webstudio-food-demo` (`obprooubcbnfgouytvrw`).
- Organisatie en omgeving: `Max Webstudio Demo`, `food_demo`.
- Exact één migratie: `20260728211000_food_v1_service_role_order_acl_hardening.sql`.
- Productie `yxxahurphdbblkuxoeje` en staging `xlxpuuycigeqhgxqtzni` zijn verboden doelen.
- Geen seed, Auth-gebruiker, Netlify-, provider- of runtimewijziging.
- Geen gewone `supabase db push` en geen volledige migratiemap.

## Aanleiding

De eerste zeven Demo Cloud-migraties zijn succesvol toegepast, maar Supabase geeft objecten die door `postgres` in `public` worden aangemaakt standaard brede rechten aan `service_role`. Daardoor had `service_role`, naast het platform-beheerde `BYPASSRLS`, directe mutatierechten op de ordertabellen. De database bevat nog geen Food-tenant, locatie, bestelling, demoaccount of Auth-gebruiker.

`BYPASSRLS` blijft bewust ongewijzigd. Dit herstel verwijdert uitsluitend objectprivileges en houdt gecontroleerde `SECURITY DEFINER`-RPC's als mutatiegrens in stand.

## Lokaal bewezen ACL-contract

De migratie trekt alle directe rechten van `service_role` in op de negentien bestaande Food-tabellen. Alleen `SELECT` wordt hersteld voor de zes readmodellen die de serverroute aantoonbaar direct gebruikt:

- `food_accounts`;
- `restaurant_locations`;
- `restaurant_tax_classes`;
- `menus`;
- `menu_categories`;
- `menu_items`.

De vier kritieke ordertabellen behouden voor `service_role` geen `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES` of `TRIGGER`:

- `food_orders`;
- `food_order_items`;
- `food_order_status_history`;
- `food_order_idempotency`.

De server behoudt uitsluitend `EXECUTE` op de expliciete capability-, rate-limit-, create-, confirmation-, transition- en reset-RPC's. Interne assertions en triggerhelpers blijven owner-only. `anon` en `authenticated` krijgen geen server-RPC-uitvoerrecht; bestaande authenticated RLS-read- en menumutatiecontracten blijven intact.

## Functieveiligheid

De migratie stopt vóór ACL-wijzigingen wanneer een toegestane RPC niet:

- `SECURITY DEFINER` is;
- dezelfde betrouwbare owner als `food_orders` heeft;
- een vaste allowlisted `search_path` gebruikt.

De reset-RPC behoudt zijn service-role-claim, demoaccount-allowlist, `demo.reset`-capability, actorcontrole, idempotency en rate limiting.

## Default-privilegebeslissing

Er wordt bewust geen schema-brede `ALTER DEFAULT PRIVILEGES` uitgevoerd. PostgreSQL-defaultprivileges zijn per owner, schema en objecttype, niet per tabelnaam. Een wijziging voor `postgres` in `public` zou daarom ook CRM-, finance-, website- en toekomstige niet-Food-tabellen raken.

Herhaling wordt voorkomen met table-by-table governance: iedere toekomstige migratie die een `food_*`, `restaurant_*`, `menus`, `menu_categories` of `menu_items`-tabel aanmaakt, moet een expliciete `service_role`-ACL-beslissing bevatten. De geautomatiseerde test controleert dat contract en de lokale databasevalidator reproduceert eerst de brede Supabase-defaultgrant voordat het herstel wordt toegepast.

Food gebruikt UUID-identiteiten en bezit momenteel geen sequences. De migratie stopt wanneer later toch een Food-owned sequence wordt gevonden, zodat sequenceprivileges niet stilzwijgend ontstaan.

## Afzonderlijk te autoriseren remote uitvoering

1. Fetch en controleer de gepubliceerde broncommit, schone werkboom en checksums.
2. Bevestig projectnaam, projectref, organisatie en `Healthy` status.
3. Bevestig read-only dat migration history exact de zeven vereiste versies bevat.
4. Bevestig opnieuw: nul Food-tenants, nul orders en nul Auth-gebruikers.
5. Pas uitsluitend de ene checksummed herstelmigratie toe, zonder `db push`.
6. Registreer uitsluitend versie `20260728211000` in migration history.
7. Valideer read-only alle tabel- en functie-ACL's, owners, security modes en search paths.
8. Bewijs via een afzonderlijk geautoriseerde, transactiegebonden rooktest dat directe ordermutatie faalt en gecontroleerde RPC-mutatie slaagt; rol alle synthetische testdata terug.
9. Stop vóór seed, Auth, runtimeconfiguratie of deployment.

## Stop- en herstelbeleid

- Stop bij ieder target-, checksum-, history-, owner-, search-path- of ACL-verschil.
- Geen destructieve rollback of down-migratie.
- Herstel alleen forward-only na nieuwe review en autorisatie.
- `FOOD_PUBLIC_ORDERING_ENABLED` blijft uit totdat ACL-herstel, seed, Auth en online smoke elk afzonderlijk zijn goedgekeurd.

## Lokaal bewijs

- `node --test tests/food-v1-service-role-acl-repair.test.js`: 6/6 geslaagd.
- `scripts/food-v1-service-role-acl-repair-local-validation.zsh`: `PASS_FOOD_V1_SERVICE_ROLE_ACL_REPAIR_LOCAL_VALIDATION`.
- De validator bewijst RPC-continuïteit, idempotency, snapshots, tenantisolatie, resetisolatie en directe ACL-denial in een tijdelijke Unix-socket-only PostgreSQL-cluster.
- De zeven oorspronkelijke migratiechecksums blijven exact gelijk.

Dit pakket zet `remoteExecutionAuthorizedByThisManifest` expliciet op `false`. Commit, push en remote apply zijn afzonderlijke autorisatiepoorten.
