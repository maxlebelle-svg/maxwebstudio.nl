# Supabase Test Setup

Status: voorbereiding voor Fase 14.4B. Dit document voert niets uit en bevat geen secrets.

## Doel

Een aparte Supabase testomgeving klaarzetten zodat schema, Auth, RLS, Storage en klantisolatie veilig getest kunnen worden zonder productie of echte klantdata te raken.

## Benodigde environment variables

Gebruik aparte testwaarden. Deze mogen niet naar productie wijzen.

| Naam | Verplicht | Scope | Doel |
| --- | --- | --- | --- |
| `SUPABASE_URL` | ja | lokaal / Netlify testcontext | URL van het Supabase testproject |
| `SUPABASE_ANON_KEY` | ja | browser-safe testcontext | Publieke anon key voor Auth/RLS tests |
| `SUPABASE_SERVICE_ROLE_KEY` | ja | alleen server-side/setup | Schema/setup/admin tests; nooit frontend |
| `SUPABASE_PROJECT_ID` | aanbevolen | lokaal / documentatie | Controle dat de juiste testomgeving wordt gebruikt |
| `APP_ENV` | ja | lokaal / testcontext | Moet `test` zijn |
| `APP_ENVIRONMENT` | ja | lokaal / testcontext | Moet `test` zijn |
| `DATA_PROVIDER` | ja | app instelling | Blijft standaard `localStorage` tot test bewust wordt gestart |
| `DATA_PROVIDER_MODE` | ja | app instelling | Blijft standaard `local` tot test bewust wordt gestart |
| `ADMIN_TOKEN` | ja voor admin functions | server-side | Admin endpoints testen zonder echte admin-login |
| `SITE_URL` | ja voor redirects | lokaal / Netlify testcontext | Test URL, bijvoorbeeld lokale Netlify dev URL |
| `CLIENT_PORTAL_REDIRECT_URL` | ja voor Auth | Supabase Auth settings | Redirect naar test-klantportaal |
| `ADMIN_REDIRECT_URL` | ja voor Auth | Supabase Auth settings | Redirect naar test-admin |

Optioneel voor latere integratietests:

| Naam | Gebruik |
| --- | --- |
| `RESEND_API_KEY` | Alleen Resend testmails; niet nodig voor schema/RLS |
| `FROM_EMAIL` | Testafzender |
| `ADMIN_EMAIL` | Testontvanger/admin |
| `LEAD_TO_EMAIL` | Testontvanger leads |
| `LEAD_FROM_EMAIL` | Testafzender leads |
| `MOLLIE_API_KEY` | Alleen Mollie testmodus |
| `MOLLIE_WEBHOOK_SECRET` | Alleen webhookvalidatie indien actief |

## Testproject aanmaken

1. Maak in Supabase een nieuw project aan met een duidelijke naam, bijvoorbeeld `maxwebstudio-test`.
2. Gebruik geen productieproject en importeer geen echte klantdata.
3. Noteer alleen niet-geheime metadata in documentatie, zoals projectnaam en project-ID.
4. Kopieer de testwaarden naar een lokale `.env.local` of veilige Netlify testcontext.
5. Zet `APP_ENV=test` en `APP_ENVIRONMENT=test`.
6. Controleer handmatig dat `SUPABASE_URL` niet gelijk is aan de productie-URL.

## Supabase CLI installeren/gebruiken

Gebruik de officiele Supabase CLI-installatie voor je platform. Installeer niets vanuit deze fase als dat niet expliciet gewenst is.

Na installatie:

1. Controleer lokaal of de CLI beschikbaar is.
2. Log in op Supabase met je eigen account.
3. Link uitsluitend het testproject.
4. Controleer de projectnaam voordat je SQL uitvoert.
5. Voer nooit SQL uit als de CLI naar productie wijst.

Veilige controles voor uitvoering:

- projectnaam bevat `test`
- `APP_ENVIRONMENT=test`
- geen echte klantdata aanwezig
- backup/rollback-notitie aanwezig
- uitvoering staat gepland als Fase 14.4B

## Schema uitvoeren op testomgeving

Gebruik de deploymentvolgorde uit `docs/deployment/SQL_BUNDLE.md`.

Minimale testvolgorde:

1. `supabase/schema.sql`
2. canonical patches volgens `docs/SUPABASE_PATCH_PLAN.md`
3. `docs/supabase-rls-canonical-draft.sql` pas na review en alleen in test
4. optionele synthetische testdata

Regels:

- geen `DROP` of destructieve statements toevoegen
- geen productie-connection gebruiken
- uitvoer/resultaat vastleggen in `docs/deployment/TEST_RESULTS.md`
- errors eerst analyseren voordat de volgende stap wordt uitgevoerd

## Testgebruikers aanmaken

Maak minimaal:

| Testuser | Doel |
| --- | --- |
| Customer A | eigen klantdata lezen/schrijven volgens RLS |
| Customer B | isolatie tegenover Customer A |
| Admin testuser | adminrollen en beheerflow |
| Anonymous | geen klantdata zichtbaar |

Gebruik synthetische e-mailadressen, bijvoorbeeld `customer-a-test@...`. Noteer geen wachtwoorden in documenten.

## RLS en klantisolatie testen

Gebruik:

- `docs/RLS_TEST_SCENARIOS.md`
- `docs/RLS_EXPECTED_ACCESS_MATRIX.md`
- `docs/RLS_TEST_LOG_TEMPLATE.md`
- `docs/deployment/CUSTOMER_ISOLATION_CHECKLIST.md`

Minimale bewijzen:

- Customer A ziet alleen data van Customer A.
- Customer B ziet alleen data van Customer B.
- Customer A kan Customer B niet lezen of wijzigen.
- Anonymous ziet geen klantdata.
- Admin testuser ziet alleen wat de rol mag zien.
- Klantportaal toont geen interne notities, tokens, debugdata of betaalproviderdetails.

## Storage testen

Storage is pas klaar wanneer:

1. Buckets private zijn.
2. Klantbestanden niet publiek browsebaar zijn.
3. Signed URL flow werkt.
4. Customer A geen bestanden van Customer B kan openen.
5. Admin/server-side flow bestanden kan beheren zonder service role key in de frontend.

Te testen buckets waar van toepassing:

- `change-request-files`
- `invoice-pdfs`

## Blocker evidence

Na echte uitvoering in Fase 14.4B:

- voeg schema-output toe aan `TEST_RESULTS.md`
- vul Auth-resultaten in
- vul RLS-testlog in
- vul customer isolation evidence in
- vul Storage evidence in
- werk `docs/deployment/RELEASE_DECISION_*.md/json` bij
- zet blockers niet automatisch op approved; laat handmatige review volgen

## Harde regels

- Geen productie aanpassen.
- Geen echte klantdata gebruiken.
- Geen secrets documenteren.
- Geen service role key in frontend.
- Geen GO zonder echte evidence.
