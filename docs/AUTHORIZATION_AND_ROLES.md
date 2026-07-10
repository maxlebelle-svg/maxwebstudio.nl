# Authorization And Roles

Dit document legt de centrale autorisatiegrens vast voor Max Webstudio.

## Canonieke Grens

- Frontend routebescherming staat in `/public/src/config/protectedRoutes.js` en `/public/src/services/routeGuardService.js`.
- Server-side adminbescherming staat in `/functions/_admin-auth.js`.
- Alle `functions/admin-*.js` moeten `verifyAdmin()` gebruiken.
- Productie mag niet op alleen frontendchecks vertrouwen.

## Rollen

Hoofdrollen:

- `super_admin`
- `admin`
- `sales_manager`
- `sales_partner`
- `developer`
- `designer`
- `support`
- `customer`
- `demo_user`

Legacy alias:

- `sales` wordt frontend naar `sales_partner` genormaliseerd.

## Adminroutes

Alle huidige `public/admin-*.html` pagina's staan centraal geregistreerd in `protectedRoutes.js`. Nieuwe adminpagina's mogen pas worden toegevoegd wanneer ze ook in deze registry staan.

Routegroepen:

- Algemeen dashboard: alle staffrollen met `dashboard:view`.
- Sales: `super_admin`, `admin`, `sales_manager`, `sales_partner` met `leads` of `quotes`.
- Klanten: interne klantrollen met `customers:view`.
- Productie: productie- en supportrollen met `websites`, `projects` of `files`.
- Developer/platform: `super_admin`, `admin`, `developer` met `developerTools:view`.
- Instellingen/facturen: beperkt tot beheer/finance-achtige rollen.

## Admin Functions

Auditregel:

```text
for each functions/admin-*.js:
  verifyAdmin(...) must exist
```

Status op 2026-07-10:

- Alle gevonden `functions/admin-*.js` gebruiken `verifyAdmin()`.
- Legacy `ADMIN_TOKEN` is in productie alleen toegestaan wanneer `ALLOW_LEGACY_ADMIN_TOKEN=true` expliciet is gezet.
- De service-role key blijft alleen server-side.

## Wijzigingsregel

Bij nieuwe adminfunctionaliteit:

1. Voeg de pagina toe aan `protectedRoutes.js`.
2. Gebruik bestaande rollen en permissies.
3. Bescherm elke admin function met `verifyAdmin()`.
4. Documenteer waarom de gekozen rolgroep toegang nodig heeft.
5. Controleer dat klanten en demo-users geen interne route kunnen openen.
