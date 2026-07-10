# P0 Test Harness

De herbruikbare P0-testharness staat in:

```bash
node scripts/p0-test-harness.mjs
```

De harness is bedoeld voor de definitieve bewijssprint rond:

- klant A/B RLS-isolatie;
- storage-isolatie;
- `commercial-order`;
- webhook/idempotency;
- salesassignment A/B.

De harness logt geen tokens, wachtwoorden of secrets.

Credential-setup staat in:

```bash
docs/P0_TEST_CREDENTIAL_SETUP.md
```

## Veilige Uitgangspunten

- Zonder testcredentials voert de harness alleen veilige publieke checks uit.
- Muterende tests draaien pas wanneer `P0_ENABLE_MUTATIONS=true` expliciet is gezet.
- Gebruik alleen herkenbare testrecords zoals `P0 Testorganisatie A`.
- Gebruik geen echte klantdata.
- Gebruik geen echte productiebetaling.
- Gebruik Mollie uitsluitend in testmodus.
- Gebruik service-role nooit als bewijs voor klant A/B RLS.

## Commando's

```bash
node scripts/p0-test-harness.mjs all
node scripts/p0-test-harness.mjs preflight
node scripts/p0-test-harness.mjs api
node scripts/p0-test-harness.mjs anon-rls
node scripts/p0-test-harness.mjs rls-ab
node scripts/p0-test-harness.mjs storage
node scripts/p0-test-harness.mjs commercial-order
node scripts/p0-test-harness.mjs sales
```

## Environment Variables

Gebruik `.env.p0.example` als lege lokale template. Vul echte waarden alleen lokaal in.

Algemeen:

- `P0_BASE_URL`
- `P0_TEST_RUN_ID`
- `P0_ENABLE_MUTATIONS`
- `P0_SUPABASE_URL`
- `P0_SUPABASE_ANON_KEY`

Klant A/B:

- `P0_CUSTOMER_A_JWT`
- `P0_CUSTOMER_B_JWT`
- `P0_CUSTOMER_A_ID`
- `P0_CUSTOMER_B_ID`
- `P0_RLS_TABLES_JSON`
- `P0_RLS_READ_CASES_JSON`
- `P0_RLS_WRITE_CASES_JSON`

Storage:

- `P0_STORAGE_BUCKET`
- `P0_STORAGE_A_PATH`
- `P0_STORAGE_B_PATH`

Commercial order:

- `P0_ADMIN_JWT`
- `P0_TEST_CUSTOMER_EMAIL`
- `P0_COMMERCIAL_ORDER_PAYLOAD_JSON`

Salesassignment:

- `P0_SALES_A_JWT`
- `P0_SALES_B_JWT`
- `P0_SALES_CASES_JSON`

Nooit waarden in docs, screenshots, issues of commits zetten.

## Minimale Handmatige Voorbereiding

Maak of gebruik testdata:

- `P0 Testorganisatie A`
- `P0 Testorganisatie B`
- `P0 Klant A`
- `P0 Klant B`
- `P0 Salesmedewerker A`
- `P0 Salesmedewerker B`
- `P0 Testadmin`

Leg intern vast:

- auth user ID;
- customer ID;
- organization ID indien live aanwezig;
- membership ID indien live aanwezig;
- workspace ID indien live aanwezig;
- lead ID;
- project ID;
- website ID;
- invoice ID;
- testbestandpad.

## Token Helper

Gebruik de helper om tijdelijke Supabase Auth JWT's voor P0-testaccounts op te halen:

```bash
P0_TOKEN_TARGET_ENV=P0_CUSTOMER_A_JWT P0_TOKEN_EMAIL="<test-email>" P0_PRINT_TOKEN=true node scripts/p0-fetch-test-token.mjs
```

De helper gebruikt alleen Supabase Auth met de anon key. Hij gebruikt geen service-role en print het token alleen wanneer `P0_PRINT_TOKEN=true` expliciet is gezet.

## Preflight

`preflight` toont:

- aanwezige P0-variabelen per groep;
- ontbrekende P0-variabelen per groep;
- welke testgroepen direct uitvoerbaar zijn;
- logische inconsistenties zoals writecases zonder `P0_ENABLE_MUTATIONS=true`.

Waarden van tokens, wachtwoorden en keys worden niet getoond.

## RLS Read Cases

Wanneer `P0_CUSTOMER_A_ID` en `P0_CUSTOMER_B_ID` zijn gezet, test de harness standaard:

- klant A leest eigen `customers` record;
- klant A leest customer B;
- klant B leest eigen `customers` record;
- klant B leest customer A.

Voor extra tabellen gebruik je `P0_RLS_READ_CASES_JSON`:

```json
[
  {
    "name": "customer-a-own-project",
    "actor": "A",
    "table": "projects",
    "filter": "customer_id=eq.<CUSTOMER_A_ID>",
    "expect": "one-or-more"
  },
  {
    "name": "customer-a-cross-project",
    "actor": "A",
    "table": "projects",
    "filter": "customer_id=eq.<CUSTOMER_B_ID>",
    "expect": "zero-or-denied"
  }
]
```

## RLS Write Cases

Write-tests draaien alleen met:

```bash
P0_ENABLE_MUTATIONS=true
```

Gebruik `P0_RLS_WRITE_CASES_JSON` met exacte testrecords:

```json
[
  {
    "name": "customer-a-cross-update-customer-b",
    "actor": "A",
    "method": "PATCH",
    "table": "customers",
    "query": "id=eq.<CUSTOMER_B_ID>",
    "body": { "notes": "P0 cross tenant update should fail" },
    "expectStatus": [401, 403]
  }
]
```

Gebruik alleen records met een P0-testmarkering.

## Storage Tests

De storagecheck gebruikt:

- klant A-token;
- klant B-token;
- bucketnaam;
- objectpad van klant A.

De standaardcheck:

- klant A leest eigen bestand;
- klant B probeert bestand van A te lezen.

Upload/delete-tests mogen pas na exacte testpaden en `P0_ENABLE_MUTATIONS=true`.

## Commercial Order Tests

Zonder mutaties voert de harness alleen veilige negatieve tests uit met `P0_ADMIN_JWT`:

- onbekend pakket moet `400` geven;
- onbekende optie moet `400` geven;
- ontbrekende voorwaardenacceptatie moet `400` geven.

Met `P0_ENABLE_MUTATIONS=true` maakt de harness een testorder aan en controleert dat een gemanipuleerde `packagePrice` niet leidend is.

Voor een volledige Mollie-testbetaling blijven extra stappen nodig:

1. Controleer dat `MOLLIE_MODE=test` is.
2. Maak order met `commercial-order`.
3. Open Mollie test checkout.
4. Rond testbetaling af.
5. Laat webhook verwerken.
6. Scan duplicate records en fulfillmentstatus.

## Salesassignment Tests

Gebruik `P0_SALES_CASES_JSON` voor exacte backendcases:

```json
[
  {
    "name": "sales-b-cannot-update-lead-a",
    "tokenEnv": "P0_SALES_B_JWT",
    "method": "PATCH",
    "body": {
      "id": "<LEAD_A_ID>",
      "action": "contact",
      "outcome": "reached"
    },
    "expectStatus": 409
  }
]
```

Het bedoelde assignmentmodel moet vooraf expliciet zijn:

- alleen toegewezen leads;
- teamleads;
- alle leads;
- of rolgebaseerde combinatie.

## Cleanup

De harness voert geen destructieve cleanup uit zonder exacte selectie.

Voor cleanup:

1. Exporteer alle aangemaakte P0-record IDs.
2. Controleer relaties.
3. Controleer orphan records.
4. Verwijder alleen records met P0-testmarkering.
5. Verwijder authusers alleen wanneer dat expliciet veilig is.

## Beperkingen

Zonder echte testaccounts kan de harness P0 niet sluiten.

Zonder Mollie-testbetaling kan de harness fulfillment en webhook-idempotency niet bewijzen.

Zonder live storagebucket en testbestanden kan storage cross-tenant isolatie niet bewezen worden.
