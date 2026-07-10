# Productievalidatie En End-to-End Smoke Test - 2026-07-10

## 1. Deploymentbewijs

Status: gedeeltelijk bewezen.

- Lokale branch: `main`
- GitHub `origin/main`: `827d211b8235867fd86f51a3caf81d0f274de60e`
- Lokale HEAD bij start validatie: `827d211b8235867fd86f51a3caf81d0f274de60e`
- Live commitbewijs: indirect bewezen doordat live `protectedRoutes.js` de nieuwe P0-route-registraties uit `827d211b` bevat en `create-payment` live `410` teruggeeft.
- Netlify: live responses komen van `server: Netlify`.
- Deploy-ID: niet beschikbaar via veilige publieke headers.
- Deploytijdstip: niet beschikbaar via veilige publieke headers.
- Production branch: `main`.
- Publish-directory: `/public` volgens `netlify.toml`.
- Functions-directory: `/functions` volgens `netlify.toml`.
- API redirect: `/api/platform-health`, `/api/create-payment`, `/api/admin-leads`, `/api/commercial-order` en `/api/mollie-webhook` bereiken Netlify Functions.
- Rootduplicaatcontrole: `https://maxwebstudio.nl/` en `/index.html` geven beide `53625` bytes en dezelfde ETag terug.
- Rollbackstatus: gedocumenteerd in `/docs/DEPLOYMENT.md`; uitvoering verloopt via Netlify deploy history of Git na expliciete beslissing.

Headerresultaten:

- Homepage: `200`, `cache-control: public,max-age=0,must-revalidate`, CSP actief, HSTS actief, `x-frame-options: DENY`.
- Adminpagina's: alle 29 live adminpagina's geven `cache-control: no-store,max-age=0,must-revalidate`.
- Functions: authgevoelige functions geven `cache-control: no-store`.

## 2. Adminroute-resultaten

Status: blokkade server-side bewezen; frontend-routeguard had een P0-zwakte en is lokaal gefixt.

Live getest:

- 29 adminpagina's via directe GET.
- Alle 29 geven HTTP `200` HTML, met `no-store`.
- 12 van 29 hadden live herkenbare bestaande routeguard-code.
- 17 van 29 hadden live geen herkenbare centrale routeguard-code in de HTML.

Directe functioncalls live:

- `/api/platform-health` zonder token: `401 Niet geautoriseerd`.
- `/api/admin-leads` zonder token: `401 Niet geautoriseerd`.
- `/api/admin-leads` met vervalste bearer: `401 Niet geautoriseerd`.
- `/api/admin-billing` zonder token: `401 Niet geautoriseerd`.
- `/api/commercial-order` zonder token: `401 Niet geautoriseerd`.

Fix uitgevoerd:

- Nieuwe gedeelde guard: `/public/src/admin-route-guard.js`.
- Alle 29 `public/admin-*.html` pagina's laden deze guard.
- Lokale audit na fix: 29 adminpagina's, 29 geregistreerde adminroutes, 0 missend, 0 route-permissiemismatches, 0 adminpagina's zonder gedeelde guard.

Nog live te bewijzen:

- De nieuwe guardfix moet nog naar productie gedeployed worden.
- Klant-, medewerker- en adminrollentests met echte sessies zijn niet uitgevoerd omdat er geen testaccounts/tokens zijn meegegeven.

## 3. Orderflow-resultaten

Status: legacyroute live bewezen dicht; volledige canonieke flow niet live uitgevoerd.

Legacyroute live:

- `POST /api/create-payment` met lege JSON geeft `410`.
- Melding: klantvriendelijk, zonder technische platformdetails.
- Omdat de route vroeg stopt, wordt er geen Mollie-payment, factuur, klant of project aangemaakt.

Canonieke route live:

- `POST /api/commercial-order` zonder token geeft `401`.
- Server-side adminautorisatie is leidend.
- Geen echte of testbetaling gestart, omdat er geen veilig admintestaccount en Mollie-testscenario is meegegeven.

Statisch bewijs:

- `commercial-order` berekent bedragen server-side op basis van cataloguswaarden.
- `commercial-order` koppelt profile, customer, invoice, terms en Mollie-payment.
- `mollie-webhook` zoekt facturen via `mollie_payment_id`, update status en gebruikt `paid_email_sent_at` om dubbele betaalmails te voorkomen.
- Project/website/customer finalization zoekt bestaande records op voordat wordt ge-upsert.

Niet volledig bewezen:

- dubbele webhook in echte testmodus;
- idempotency key tweemaal;
- fulfillmentretry;
- bestaande klant koopt opnieuw;
- geannuleerde/mislukte betaling;
- project exact een keer in live database.

## 4. RLS-bewijs

Status: niet live bewezen.

Statisch bewijs:

- RLS-policyvoorbereiding staat in `/supabase/rls-policies.sql`.
- Customer ownership gebruikt `customers.auth_user_id = auth.uid()` of `customers.profile_id = public.current_profile_id()`.
- Child-tabellen gebruiken `customer_id` of parent joins naar `customers`.

Niet uitgevoerd:

- Klant A/B SELECT/INSERT/UPDATE/DELETE-tests.
- Storage-isolatietests.
- Medewerker assignment-scope tests.
- Admin versus medewerker versus anoniem met echte Supabase-sessies.

Reden: er zijn geen testaccounts, Supabase projecttoegang of veilige testorganisatiegegevens meegegeven. RLS mag daarom niet als productiebewezen worden gemarkeerd.

## 5. Salespipeline

Status: statisch en syntaxmatig gecontroleerd; live regressietest niet uitgevoerd.

Bewezen:

- Commit `f9707c20` bevat migratie voor assignment, bellen, follow-up, afspraak, gewonnen/verloren en indexes.
- `functions/admin-leads.js` heeft conflictcheck bij leadacties en retourneert `409` wanneer een andere medewerker eigenaar is.
- Oude leadvelden en metadatafallbacks worden nog genormaliseerd.
- Syntaxcheck op `functions/admin-leads.js` is geslaagd.

Niet live getest:

- lead toewijzen;
- bellen en gespreksuitkomst opslaan;
- vandaag-bellenoverzicht;
- achterstallige opvolging;
- gelijktijdige medewerkers;
- RLS en dashboardtellingen met echte rollen.

## 6. Sessie- En Portaalresultaten

Status: publieke/loginroutes bereikbaar; rolgebaseerde sessietests niet bewezen.

Beperkt gecontroleerd:

- Login/klantportaalbestanden bestaan en laden lokaal.
- Server-side adminfunctions weigeren zonder geldige sessie.
- `commercial-order` weigert zonder geldige adminsessie.

Niet uitgevoerd:

- adminlogin met echte admin;
- salesmedewerkerlogin;
- klantlogin;
- sessieherstel/refresh/langdurige sessie;
- wachtwoordreset end-to-end;
- rolwijziging tijdens bestaande sessie;
- gedeactiveerde gebruiker.

Reden: geen testaccounts of tokens meegegeven.

## 7. Technische Controles

Uitgevoerd:

- `git status`
- `git diff --check`
- `node --check` op relevante functions en de nieuwe guard
- inline-script parse check op 57 HTML-bestanden: 0 issues
- adminroute-audit: 29/29 geregistreerd
- admin-guard-audit na fix: 29/29 HTML-pagina's laden gedeelde guard
- function-auth-audit: geen `functions/admin-*.js` zonder `verifyAdmin()`
- duplicate route-scan: 57 HTML-bestanden, 0 duplicate routes
- duplicate service-scan: 60 services, 0 duplicate service names
- secret-scan zonder waarden te tonen: alleen verwachte env-var-referenties/bestandsnamen, geen waarden gerapporteerd
- technische klantcopy-scan: login bevat developer-mode debugvelden; normale foutmeldingen maskeren codes buiten developer mode
- broken redirect/API check: `/api/:splat` functionredirect werkt
- cacheheadercontrole: admin `no-store` live bewezen

Niet uitgevoerd:

- browserconsolecontrole met echte rollen;
- network-errorcontrole binnen ingelogde portalen;
- echte webhook-idempotencytest;
- echte tenantisolatietest;
- echte storage-isolatietest.

## 8. Aangepaste Bestanden

Fixes noodzakelijk door gevonden P0 adminroute-zwakte:

- `/public/src/admin-route-guard.js`
- alle 29 `/public/admin-*.html` pagina's kregen een gedeelde guardscript-tag.

Geen nieuwe productfunctionaliteit toegevoegd.

## 9. Resterende Risico's

P0:

- RLS en cross-customer isolatie zijn niet live bewezen.
- De adminroute-guardfix is lokaal aanwezig, maar pas productiebewezen na push/deploy.
- Volledige commercial-order fulfillment is niet live bewezen met Mollie-testbetaling.

P1:

- Sessie- en rollentests ontbreken voor klant, salesmedewerker en admin.
- Salespipeline is niet live getest met meerdere medewerkers.
- Browserconsole/networkcontrole ontbreekt voor ingelogde flows.

P2:

- Login bevat developer-mode debugweergave; normale gebruikers krijgen gemaskeerde codes, maar developer mode moet intern blijven.
- Publieke HTML van adminpagina's wordt nog als statische HTML geserveerd; bescherming gebeurt via frontend guard plus server-side API guards.

P3:

- Netlify deploy-ID en deploytijd zijn niet via veilige publieke headers beschikbaar.

## 10. Eindoordeel

1. Staat commit `827d211b` aantoonbaar live?
   - Ja, indirect bewezen via live routeconfig en live legacyroutegedrag.
2. Zijn alle adminroutes aantoonbaar beschermd?
   - Server-side adminfunctions wel. Frontendroutes hadden een zwakte; lokaal gefixt, nog deploybewijs nodig.
3. Is `commercial-order` werkelijk de enige actieve commerciële flow?
   - Legacy `create-payment` is live dicht met `410`; `commercial-order` is auth-only. Volledige testbetaling niet uitgevoerd.
4. Zijn dubbele fulfillmentrecords uitgesloten?
   - Statisch beperkt onderbouwd via upsert/existing lookups en mailguard; niet live bewezen.
5. Is cross-customer toegang aantoonbaar geblokkeerd?
   - Nee, niet zonder Supabase testaccounts/tokens.
6. Is de salespipeline veilig voor meerdere medewerkers?
   - Conflictcheck bestaat statisch; live concurrency niet bewezen.
7. Kan Max Webstudio nu veilig met echte klanten verder?
   - Nog niet volledig. Eerst guardfix deployen, daarna RLS A/B, orderflow en sessietests met echte testaccounts afronden.
8. Eerstvolgende aanbevolen sprint:
   - Productievalidatie sprint met testaccounts: admin, sales, klant A, klant B, plus Mollie-testbetaling en Supabase RLS/storage A/B bewijs.
