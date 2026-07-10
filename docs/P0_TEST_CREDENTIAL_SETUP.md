# P0 Testcredential Setup

Dit runbook maakt de credential-afhankelijke P0-tests uitvoerbaar zonder secrets in de repository te zetten.

## Basisregels

- Gebruik alleen herkenbare P0-testrecords.
- Gebruik geen echte klantgegevens.
- Gebruik geen service-role token als klant-, sales- of adminbewijs.
- Zet echte waarden alleen lokaal in je shell of lokale env-manager.
- Commit nooit gevulde `.env`-bestanden, JWT's, wachtwoorden of Mollie keys.
- Gebruik Mollie alleen in testmodus.

## Benodigde Testrollen

Maak of bevestig deze accounts in Supabase Auth en de applicatierollen:

| Label | Rol | Doel |
| --- | --- | --- |
| `P0 Testadmin` | admin of super admin | `commercial-order`, adminchecks en assignmentwijzigingen |
| `P0 Klant A` | customer | Eigen tenant lezen/schrijven |
| `P0 Klant B` | customer | Cross-tenant blokkades bewijzen |
| `P0 Salesmedewerker A` | sales | Toegewezen lead gebruiken |
| `P0 Salesmedewerker B` | sales | Ongeoorloofde leadactie blokkeren |

Leg lokaal vast:

- auth user id;
- customer id;
- organization id indien live aanwezig;
- workspace of membership id indien live aanwezig;
- lead id;
- project id;
- invoice id;
- storage bucket en objectpad.

## Benodigde Testtenants

Gebruik minimaal:

- `P0 Testorganisatie A`
- `P0 Testorganisatie B`

Elke testtenant krijgt alleen eigen P0-records. Gebruik duidelijke namen zoals `p0-2026-07-10-klant-a` in notities, bestandsnamen en metadata.

## Lokaal Env-bestand

Kopieer het lege voorbeeldbestand:

```bash
cp .env.p0.example .env.p0.local
```

Vul alleen lokaal waarden in. `.env.p0.local` valt onder `.env.*.local` en mag niet worden gecommit.

## Testtokens Ophalen

De helper gebruikt alleen de browserveilige Supabase anon key en Supabase Auth password login. Hij gebruikt geen service-role en schrijft niets naar disk.

Voorbeeld voor klant A:

```bash
P0_TOKEN_TARGET_ENV=P0_CUSTOMER_A_JWT \
P0_TOKEN_EMAIL="<test-email>" \
P0_PRINT_TOKEN=true \
node scripts/p0-fetch-test-token.mjs
```

Voer het wachtwoord interactief in of zet het tijdelijk in `P0_TOKEN_PASSWORD` in je lokale shell. Zonder `P0_PRINT_TOKEN=true` toont de helper het token niet.

Herhaal dit voor:

- `P0_CUSTOMER_A_JWT`
- `P0_CUSTOMER_B_JWT`
- `P0_ADMIN_JWT`
- `P0_SALES_A_JWT`
- `P0_SALES_B_JWT`

## RLS Cases

Minimaal nodig:

```bash
export P0_CUSTOMER_A_ID="<customer-a-id>"
export P0_CUSTOMER_B_ID="<customer-b-id>"
```

De standaard readcases controleren eigen `customers` records en cross-tenant reads. Voor mutaties gebruik je exacte P0-records:

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

Mutaties draaien pas met:

```bash
export P0_ENABLE_MUTATIONS=true
```

## Storage Setup

Maak in de testbucket een bestand voor klant A met een tenantpad dat duidelijk bij A hoort, bijvoorbeeld:

```text
p0/<RUN_ID>/tenant-a/read-check.txt
```

Zet:

```bash
export P0_STORAGE_BUCKET="<bucket>"
export P0_STORAGE_A_PATH="p0/<RUN_ID>/tenant-a/read-check.txt"
export P0_STORAGE_B_PATH="p0/<RUN_ID>/tenant-b/write-check.txt"
```

Bewijsdoelen:

- klant A leest eigen bestand;
- klant B leest bestand A niet;
- klant B verwijdert bestand A niet;
- klant B uploadt niet naar tenantpad A;
- anon krijgt geen ongeoorloofde toegang.

## Commercial Order en Mollie

Controleer in Netlify of lokale testomgeving:

```bash
MOLLIE_MODE=test
MOLLIE_TEST_API_KEY=<test-key>
```

Gebruik geen live key en zet geen live payments vrij voor deze P0-run. De orderpayload blijft lokaal:

```json
{
  "orderId": "p0-<RUN_ID>-order",
  "name": "P0 Klant A",
  "company": "P0 Testorganisatie A",
  "email": "p0-klant-a@example.test",
  "phone": "0612345678",
  "domain": "p0-testorganisatie-a.example",
  "packageKey": "starter",
  "packagePrice": 1,
  "options": ["seo"],
  "paymentChoice": "deposit",
  "termsAccepted": true,
  "termsAcceptedAt": "2026-07-10T00:00:00.000Z",
  "notes": "P0 credential run"
}
```

De harness moet aantonen dat de serverprijs leidend blijft en onbekende pakketten, add-ons en ontbrekende voorwaarden worden geweigerd. Rond daarna de Mollie testcheckout af en laat de webhook verwerken.

## Sales Assignment Cases

Zet exacte backendcases in `P0_SALES_CASES_JSON`. Voorbeeld:

```json
[
  {
    "name": "sales-a-can-update-assigned-lead",
    "tokenEnv": "P0_SALES_A_JWT",
    "method": "PATCH",
    "body": {
      "id": "<LEAD_A_ID>",
      "action": "contact",
      "outcome": "reached"
    },
    "expectStatus": 200
  },
  {
    "name": "sales-b-cannot-update-lead-a",
    "tokenEnv": "P0_SALES_B_JWT",
    "method": "PATCH",
    "body": {
      "id": "<LEAD_A_ID>",
      "action": "contact",
      "outcome": "blocked-cross-assignment"
    },
    "expectStatus": 409
  }
]
```

Voeg voor de definitieve run ook cases toe voor admin assignmentwijziging en gelijktijdige claimconflicten.

## Runvolgorde

```bash
node scripts/p0-test-harness.mjs preflight
node scripts/p0-test-harness.mjs rls-ab
node scripts/p0-test-harness.mjs storage
node scripts/p0-test-harness.mjs commercial-order
node scripts/p0-test-harness.mjs sales
node scripts/p0-test-harness.mjs all
```

Preflight toont alleen welke variabelen aanwezig of ontbrekend zijn. Waarden worden niet getoond.

## Cleanup

Verwijder na de run alleen records met P0-markering:

1. Storageobjecten onder `p0/<RUN_ID>/`.
2. Testleads en assignmentrecords.
3. Testprojecten, websites, onboardingrecords en timeline-events.
4. Testfacturen en Mollie testpayment-koppelingen.
5. Testcustomers en testorganisaties.
6. Auth testusers pas als alle gekoppelde records weg zijn.

Voer daarna duplicate- en orphan-scans uit en noteer het resultaat in het P0-rapport.
