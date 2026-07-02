# Admin Auth Runbook

Status: `READY FOR FIRST ADMIN SETUP`

Doel: admin-toegang werkt via Supabase Auth met e-mail en wachtwoord. Het oude `ADMIN_TOKEN` blijft alleen Developer Mode/noodfallback.

## Waarom `Invalid login credentials` verschijnt

Supabase geeft bewust dezelfde melding wanneer:

- het e-mailadres nog niet bestaat;
- het wachtwoord niet klopt;
- het account nog niet bevestigd/bruikbaar is.

Daarmee wordt niet gelekt of een admin-account bestaat. Dat is gewenst gedrag.

## Eerste admin veilig aanmaken

Gebruik dit alleen voor het productieproject `maxwebstudio`.

1. Open Supabase Dashboard.
2. Kies project `maxwebstudio`.
3. Ga naar `Authentication` -> `Users`.
4. Controleer of `info@maxwebstudio.nl` bestaat.
5. Als het account ontbreekt:
   - kies `Add user` / `Create user`;
   - e-mailadres: `info@maxwebstudio.nl`;
   - stel tijdelijk een sterk wachtwoord in of verstuur een invite/resetlink;
   - zorg dat het e-mailadres bevestigd/bruikbaar is;
   - sla geen wachtwoord op in de repo, docs of frontend.
6. Controleer in Netlify production env:
   - `ADMIN_EMAILS=info@maxwebstudio.nl` staat expliciet ingesteld, of gebruik de code-fallback;
   - `SUPABASE_URL` wijst naar productie;
   - `SUPABASE_ANON_KEY` is de productie anon key;
   - `SUPABASE_SERVICE_ROLE_KEY` blijft server-side.
7. Open `https://maxwebstudio.nl/admin-dashboard.html`.
8. Log in met `info@maxwebstudio.nl`.
9. Controleer:
   - dashboard toont `Ingelogd als info@maxwebstudio.nl`;
   - refresh behoudt sessie;
   - logout schermt data weer af.

## Wachtwoord vergeten

Als het account bestaat maar het wachtwoord onbekend is:

1. Open `https://maxwebstudio.nl/admin-dashboard.html`.
2. Vul `info@maxwebstudio.nl` in.
3. Klik `Wachtwoord vergeten`.
4. Open de Supabase resetmail.
5. Stel een nieuw wachtwoord in via de Max Webstudio resetpagina.
6. Log opnieuw in op het admin-dashboard.

## Beveiligingsregels

- Geen service-role key naar frontend.
- Geen klantdata tonen zonder geldige adminsessie.
- Geen automatische klantmail vanuit admin-auth setup.
- Geen Mollie/incasso vanuit admin-auth setup.
- Voeg later extra admins toe via `ADMIN_EMAILS`, gescheiden met komma's.
