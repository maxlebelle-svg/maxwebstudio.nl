# Food v1 Demo Cloud initial provisioning execution plan

Status: lokaal uitvoeringsbewijs; geen remote database-uitvoering geautoriseerd.

## Vaste scope

- Doelproject: `max-webstudio-food-demo` (`obprooubcbnfgouytvrw`).
- Organisatie: `Max Webstudio Demo`.
- Omgeving: `food_demo`.
- Brondatum en -commit: `codex/food-v1-silverado-pilot` op `2fed2907978a6dea47aebcd508aa4abca1be147c`.
- Exact zeven migraties uit `FILESET.json`, in de daar vastgelegde volgorde.
- Geen gewone `supabase db push`, geen volledige repositorymigratiemap en geen achtste migratie.
- Geen seed, Auth-gebruiker, redirect, secretopslag, Netlifywijziging of providerwijziging.

Productie `yxxahurphdbblkuxoeje` en staging `xlxpuuycigeqhgxqtzni` zijn uitsluitend verboden referentiedoelen. Geen uitvoeringsstap mag een verbinding naar een van beide referenties openen.

## Afzonderlijk te autoriseren uitvoering

### 1. Target-identiteit

Bevestig direct vóór verbinding via de Supabase-projectmetadata dat projectnaam, projectref, organisatie, regio en projectstatus exact overeenkomen. Vereist: `max-webstudio-food-demo`, `obprooubcbnfgouytvrw`, `Max Webstudio Demo`, `eu-west-1`, Healthy. Stop bij iedere afwijking.

Controleer read-only dat de migration history leeg is, `public` geen applicatietabellen bevat en Auth geen gebruikers bevat. Productie en staging worden niet geopend.

### 2. Veilige wachtwoordrotatie

Roteer het databasewachtwoord uitsluitend in het doelproject. Laat Supabase een nieuw sterk wachtwoord genereren of laat de eigenaar het rechtstreeks invoeren. Sla het uitsluitend in de wachtwoordmanager op; nooit in chat, terminaloutput, shellgeschiedenis, Git, een bestand of een environmentbestand.

### 3. Verbindingsmethode zonder relink

Gebruik geen persistente `supabase link` en wijzig geen bestaande lokale projectlink. Maak voor de uitvoering een tijdelijke, geïsoleerde werkmap met uitsluitend de zeven allowlisted migraties. Geef de Demo Cloud-databaseverbinding alleen kortstondig via een niet-gelogde procesomgeving aan de Supabase CLI. De host/projectidentiteit moet `obprooubcbnfgouytvrw` bevatten en mag geen verboden projectref bevatten.

Gebruik vanuit die geïsoleerde werkmap uitsluitend de migratie-upgradefunctie tegen de expliciete Demo Cloud-database-URL. Gebruik geen `supabase db push`. Verwijder de tijdelijke werkmap en de procesvariabele na afloop.

### 4. Checksumcontrole

Bereken direct vóór uitvoering SHA-256 en bytegrootte van ieder bronbestand opnieuw. Vergelijk met zowel `FILESET.json` als de bestaande `food-v1-online-demo-bundle/FILESET.json`. Stop als een pad, bytegrootte, checksum, volgorde of aantal afwijkt.

### 5. Exact zeven migraties

Pas uitsluitend onderstaande versies toe, ieder exact eenmaal en in deze volgorde:

1. `00000000000000_authoritative_baseline.sql`
2. `20260726200000_partner_profile_role_status_foundation.sql`
3. `20260728160000_food_v1_data_foundation.sql`
4. `20260728161000_food_v1_tenant_security.sql`
5. `20260728162000_food_v1_application_api_support.sql`
6. `20260728163000_food_v1_storefront_confirmation.sql`
7. `20260728210000_food_v1_online_demo_reset.sql`

Stop direct bij de eerste fout. Voer geen seed uit en probeer geen gedeeltelijke rollback.

### 6. Migration history

Controleer na succesvolle schema-apply dat de remote migration history exact deze zeven versies bevat, in dezelfde volgorde, zonder duplicaat of achtste entry. Leg alleen niet-gevoelige versies, namen en checksums vast.

### 7. Schema-, RLS-, RPC- en grantvalidatie

Valideer read-only:

- de verwachte Food-tabellen en tenantgebonden constraints;
- RLS en `FORCE ROW LEVEL SECURITY` waar het contract dit vereist;
- de allowlisted Food-RPC's met verwachte signatures;
- grants uitsluitend volgens het bewezen migratiecontract;
- geen directe publieke tabeltoegang buiten het contract;
- de resetfunctie vereist expliciet `service_role` en een allowlisted demoaccount.

Voer geen muterende rooktest uit in deze poort.

### 8. Lege datastatus

Bewijs na schema-apply dat er nog geen demo-tenant, Food-account, locatie, menu, bestelling, profielkoppeling of Auth-gebruiker bestaat. De schema-apply mag uitsluitend structuur en migration history toevoegen.

### 9. Stop vóór seed

Stop na de schema-, security- en leegtevalidatie. `supabase/demo/food-v1-online-demo-seed.sql`, Auth-gebruikers en alle runtimeconfiguratie vereisen nieuwe, afzonderlijke toestemming.

## Rollback en disable

- Geen destructieve down-migraties.
- Eerste operationele blokkade vóór publieke ingebruikname: `FOOD_PUBLIC_ORDERING_ENABLED=false`.
- Bij schemafout: stop, geen seed, en herstel uitsluitend met een afzonderlijk beoordeelde forward-only migratie.
- Bij verkeerd target: voer niets uit.
- Volledige verwijdering van het demoproject vereist afzonderlijke destructieve toestemming.

## Governancepoort

Dit pakket verleent zelf geen remote uitvoeringsrecht: `remoteExecutionAuthorizedByThisManifest=false`. Repositorybeleid vereist afzonderlijke toestemming voor commit, push en remote uitvoering. Commit of push dit pakket niet automatisch. Wanneer voorafgaande publicatie als uitvoeringsvoorwaarde wordt gekozen, stop dan vóór iedere databasehandeling totdat die commit en push afzonderlijk zijn geautoriseerd en opnieuw zijn gevalideerd.
