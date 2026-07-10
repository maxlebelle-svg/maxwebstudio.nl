# Customer Tenancy Model

Dit document legt het canonieke klant- en tenantmodel vast.

## Canonieke Lijn

De productielijn is:

```text
auth.users -> profiles -> customers -> websites/projects/quotes/invoices/subscriptions/files
```

Betekenis:

- `auth.users` is identiteit en login.
- `profiles` is de brug naar rol, status en accountmetadata.
- `customers` is de zakelijke klantbron.
- Klantgebonden modules hangen aan `customers.id`.

## Huidige Compatibiliteit

Er bestaan nog legacy tabellen en velden:

- `customer_invoices`
- `customer_websites`
- `customer_subscriptions`
- lokale CRM/customer opslag in de browser

Deze blijven compatibiliteit totdat de migratie volledig is afgerond. Nieuwe productiefunctionaliteit mag er niet als primaire bron op leunen, behalve wanneer bestaande flows nog bewust via een compatibilitylaag lopen.

## Dedupe En Matching

Voor nieuwe commerciële opdrachten:

- `profiles` wordt gezocht op e-mailadres.
- `customers` wordt gezocht via `profile_id`, met e-mail als fallback wanneer geen profiel bestaat.
- bestaande `auth_user_id` wordt behouden.
- nieuwe records krijgen klantstatus zonder bestaande klantlogin te overschrijven.

## Tenantgrens

Een klant mag alleen eigen data zien wanneer:

- `customers.auth_user_id = auth.uid()`, of
- `customers.profile_id = current_profile_id()`.

Voor child-tabellen moet ownership via `customer_id` terug te leiden zijn naar `customers.id`.

## Wijzigingsregel

Nieuwe klantgebonden functionaliteit:

1. Koppel aan `customers.id`.
2. Gebruik `profiles.auth_user_id` alleen als identity bridge.
3. Vermijd nieuwe losse `customerId`, `profileId` of e-mail-only ownershipmodellen.
4. Houd legacy opslag read-only of compatibility-only.
5. Voeg RLS/tenant-test toe voordat de feature live klantdata toont.
