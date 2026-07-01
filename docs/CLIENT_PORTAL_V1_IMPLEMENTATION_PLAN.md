# Klantportaal v1 Implementation Plan

Status: `PLAN ONLY / GEEN AUTH ACTIVATIE / GEEN SQL / GEEN RUNTIME WIJZIGINGEN`

Dit document is de veilige blauwdruk voor het technisch werkend maken van het klantportaal met echte Supabase Auth. Het doel is niet om nu iets live te activeren, maar om vast te leggen welke route leidend is, welke onderdelen legacy zijn en welke stappen nodig zijn voordat klanten veilig kunnen inloggen.

## Doel

Klantportaal v1 moet klanten veilig toegang geven tot hun eigen projecten, websites, offertes, facturen, abonnementen, bestanden, wijzigingsverzoeken, berichten en notificaties.

De eerste live versie moet:

- echte Supabase Auth gebruiken;
- de canonical Supabase-tabellen gebruiken;
- customer ownership afdwingen via `profiles`, `customers` en RLS;
- bestaande local/demo fallback behouden voor ontwikkeling en demo's;
- geen technische statusmeldingen tonen aan normale bezoekers;
- geen legacy `customer_*` tabellen als nieuwe productiebasis gebruiken.

## Huidige situatie

### `public/login.html`

De publieke loginpagina is productie-vriendelijk gemaakt:

- normale bezoekers zien geen technische Supabase-meldingen;
- echte login staat nog uit zolang Auth niet is goedgekeurd;
- demo-login is alleen zichtbaar in Developer Mode;
- accountaanvragen kunnen local/demo voorbereid worden;
- de pagina verwijst bezoekers netjes naar toegang aanvragen zolang het portaal nog niet live is.

### `public/klantportaal.html`

Dit is de leidende v1-portaalervaring.

De pagina bevat inmiddels de complete klantportaal-UX:

- klantoverzicht;
- projecten;
- websites;
- offertes;
- facturen;
- abonnementen;
- bestanden;
- wijzigingsverzoeken;
- klantberichten;
- notificaties;
- Supabase/hybrid readiness;
- local/demo fallback.

De pagina leest data via `public/src/services/clientPortalDataService.js` en de repository/data-layer. Dit sluit aan op de huidige canonical architectuur.

Nog niet productieklaar:

- route guard staat nog soft/readiness;
- klantcontext mag in demo nog via query/local fallback komen;
- echte Supabase sessie is nog niet verplicht;
- productie-Auth is nog niet actief;
- harde customer ownership check moet nog aan de echte sessie worden gekoppeld.

### `public/client-dashboard.html`

Dit bestand is een eerdere Supabase Auth-prototypepagina.

Het is nuttig als referentie voor:

- Supabase sessie ophalen;
- Auth-config ophalen via `/.netlify/functions/client-auth-config`;
- redirect naar `/login.html`;
- server-side signed URL patronen.

Maar dit bestand is niet de leidende v1-productieroute, omdat het nog leunt op oudere tabellen zoals:

- `customer_websites`;
- `customer_subscriptions`;
- `customer_invoices`.

Nieuwe klantportaalontwikkeling moet niet opnieuw op deze legacy-lijn worden gebouwd.

## Productiebeslissing

Voor Klantportaal v1 is de leidende route:

```text
public/login.html
        |
        v
public/klantportaal.html
        |
        v
canonical Supabase data layer
```

`public/client-dashboard.html` blijft voorlopig alleen:

- legacy/auth prototype;
- technische referentie;
- migratiebron voor nuttige patronen.

Het bestand wordt pas weer productieleidend als het expliciet naar de canonical data-layer wordt gemigreerd. Tot die tijd mag het niet de basis zijn voor nieuwe klantportaalfeatures.

## Canonical datalijn

Klantportaal v1 gebruikt deze lijn:

```text
auth.users
  -> profiles
  -> customers
  -> websites
  -> projects
  -> quotes / quote_lines
  -> invoices / invoice_lines
  -> subscriptions
  -> files
  -> change_requests
  -> client_portal_messages
  -> client_portal_notifications
```

Legacy tabellen blijven uitgesloten voor nieuwe v1-productieontwikkeling:

- `customer_websites`;
- `customer_invoices`;
- `customer_subscriptions`.

## Benodigde configuratie

### Browserveilig

Deze waarden mogen alleen als publieke browserconfig worden gebruikt:

- `SUPABASE_URL`;
- `SUPABASE_ANON_KEY`.

De bestaande function `/.netlify/functions/client-auth-config` is de voorkeursroute om deze browserconfig gecontroleerd beschikbaar te maken.

### Alleen server-side

Deze waarden mogen nooit in frontendcode of browserconfig terechtkomen:

- `SUPABASE_SERVICE_ROLE_KEY`;
- admin tokens;
- provider secrets;
- payment secrets;
- AI provider keys.

### Omgevingsscheiding

Klantportaal v1 moet altijd onderscheid maken tussen:

- development;
- staging/test;
- production.

Production Auth wordt pas actief wanneer staging evidence, RLS, customer isolation en release approval groen zijn.

## Implementatievolgorde

### Stap 1 - Staging Auth-validatie

Doel: bewijzen dat Supabase Auth veilig werkt in test/staging.

Taken:

- testgebruikers aanmaken voor Customer A en Customer B;
- `profiles.auth_user_id` koppelen aan `auth.users.id`;
- `customers.profile_id` en/of `customers.auth_user_id` koppelen;
- Customer A/B isolation opnieuw bewijzen;
- anonymous en no-profile blokkeren;
- interne rollen afzonderlijk valideren.

Geen productie.

### Stap 2 - Auth readiness flag

Doel: echte login alleen activeren als de omgeving klaar is.

Taken:

- `supabaseAuthActive` alleen true maken wanneer config, sessie, profiles en customer ownership bewezen zijn;
- productie-login veilig geblokkeerd houden bij ontbrekende config;
- Developer Mode mag technische status tonen;
- normale bezoekers zien alleen nette productietekst.

### Stap 3 - Loginflow

Doel: `public/login.html` aansluiten op echte Supabase Auth zonder demo-route te breken.

Taken:

- e-mail/wachtwoord login met Supabase Auth;
- sessie uitlezen;
- profiel ophalen;
- redirect op basis van rol:
  - customer -> `/klantportaal.html`;
  - interne rollen -> `/admin-dashboard.html` indien toegestaan;
- foutmeldingen klantvriendelijk tonen;
- technische details alleen in Developer Mode.

### Stap 4 - Klantportaal sessiebinding

Doel: `public/klantportaal.html` niet meer vertrouwen op query-param ownership in productie.

Taken:

- echte Supabase sessie verplicht maken voor production portal;
- `auth.users.id -> profiles -> customers` resolve doen;
- customer context uit sessie/ownership halen;
- query/local customerId alleen toestaan in demo/development;
- route guard van soft naar hard-ready brengen na validatie.

### Stap 5 - Read-layer productiepad

Doel: bestaande read-layer gebruiken voor klantdata.

Taken:

- `clientPortalDataService` laten lezen op basis van resolved customer context;
- canonical repositories blijven leidend;
- local/demo fallback behouden voor development en demo;
- legacy `customer_*` tabellen niet opnieuw introduceren.

### Stap 6 - Low-risk klantwrites

Doel: alleen bestaande bewezen klantwrites gecontroleerd toestaan.

Voor v1 toegestaan na staging approval:

- `change_requests` create-only;
- `client_portal_messages` create-only.

Niet toegestaan in v1:

- facturen wijzigen;
- abonnementen wijzigen;
- betaalstatus wijzigen;
- bestanden uploaden naar Storage zonder aparte Storage approval;
- rollen of profielownership wijzigen;
- projectstatus door klant wijzigen.

### Stap 7 - Hard route guards

Doel: klantportaalroutes pas hard maken na bewijs.

Acceptatie:

- Customer A ziet alleen eigen data;
- Customer B ziet alleen eigen data;
- cross-customer access is geblokkeerd;
- anonymous wordt doorgestuurd naar login;
- no-profile ziet geen klantdata;
- demo-user ziet alleen demo-data;
- admin/support toegang is expliciet en gelogd.

### Stap 8 - Production approval

Doel: productie pas openen na governance.

Vereist:

- staging tests groen;
- RLS evidence groen;
- write evidence groen;
- rollback bekend;
- release checklist groen;
- production env bevestigd;
- geen open critical blockers.

## RLS en securityregels

Klantportaal v1 moet deze regels afdwingen:

- klantdata wordt nooit op e-mail alleen geautoriseerd;
- `auth.users.id` is de bron voor login-identiteit;
- `profiles` is de rol- en identity-brug;
- `customers` bepaalt customer ownership;
- RLS blijft de laatste beveiligingslaag;
- frontend mag customer ownership niet kunnen spoofen;
- service role blijft server-side;
- Developer Mode mag nooit toegankelijk worden voor normale customers.

## Fallback en rollback

Zolang Klantportaal v1 nog niet live is:

- `/login.html` blijft netjes `Klantportaal wordt momenteel afgerond` tonen;
- demo-login blijft alleen Developer Mode;
- local/demo portal blijft bruikbaar voor development;
- productie-write-mode blijft dicht.

Bij problemen na activatie:

- Auth readiness flag terug naar uit;
- loginpagina terug naar productieve `Binnenkort beschikbaar` staat;
- klantwrites terug naar local/demo fallback;
- geen schema rollback uitvoeren zonder aparte databaseprocedure.

## Acceptatiecriteria voor Klantportaal v1

Klantportaal v1 is pas klaar wanneer:

- Supabase Auth werkt in staging;
- `profiles` en `customers` correct gekoppeld zijn;
- Customer A/B isolation bewezen is;
- `public/login.html` echte login veilig afhandelt;
- `public/klantportaal.html` customer context uit sessie haalt;
- canonical read-layer werkt voor klantdata;
- `change_requests` en `client_portal_messages` alleen create-only werken waar toegestaan;
- anonymous/no-profile/cross-customer toegang geblokkeerd is;
- productie geen technische Supabase-meldingen toont;
- release governance expliciet GO geeft.

## Bewust niet uitgevoerd in deze fase

- Geen codewijzigingen.
- Geen Supabase Auth activatie.
- Geen SQL.
- Geen database writes.
- Geen productieconfiguratie.
- Geen nieuwe klantportaalfeatures.
- Geen OpenAI, Mollie, Resend of Storage-uploads.

## Volgende Codex-fase

Aanbevolen volgende uitvoerende fase:

```text
Klantportaal v1A - Staging Auth Validation
```

Doel van die fase:

- alleen staging/test;
- testgebruikers, profiles en customers valideren;
- sessie -> profile -> customer mapping bewijzen;
- Customer A/B isolation opnieuw vastleggen;
- daarna pas loginflow activeren achter readiness gate.
