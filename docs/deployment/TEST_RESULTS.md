# Test Results Registry

Statusopties:

- `PASS`
- `FAIL`
- `BLOCKED`
- `NOT TESTED`

Dit bestand is een leeg template. Vul alleen testresultaten in vanuit een echte Supabase testomgeving. Noteer geen secrets.

## Samenvatting

| Onderdeel | Status | Datum | Tester | Evidence / link | Opmerkingen |
| --- | --- | --- | --- | --- | --- |
| Schema | NOT TESTED |  |  |  |  |
| Auth | NOT TESTED |  |  |  |  |
| RLS | NOT TESTED |  |  |  |  |
| Storage | NOT TESTED |  |  |  |  |
| Functions | NOT TESTED |  |  |  |  |
| Mollie | NOT TESTED |  |  |  |  |
| Resend | NOT TESTED |  |  |  |  |
| Customer tests | NOT TESTED |  |  |  |  |
| Go/No-Go | NOT TESTED |  |  |  |  |

## RLS tests

Status: `NOT TESTED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Admin leest toegestane testdata | NOT TESTED |  |  |
| Customer A ziet alleen eigen data | NOT TESTED |  |  |
| Customer B ziet alleen eigen data | NOT TESTED |  |  |
| Anonymous ziet geen klantdata | NOT TESTED |  |  |
| Demo-user ziet geen productiedata | NOT TESTED |  |  |

## Auth tests

Status: `NOT TESTED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Login testuser | NOT TESTED |  |  |
| Profile mapping | NOT TESTED |  |  |
| Role mapping | NOT TESTED |  |  |
| Route guards | NOT TESTED |  |  |

## Customer isolation tests

Status: `NOT TESTED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Customer A scenario | NOT TESTED |  |  |
| Customer B scenario | NOT TESTED |  |  |
| Demo scenario | NOT TESTED |  |  |
| Anonymous scenario | NOT TESTED |  |  |

## Client portal tests

Status: `NOT TESTED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Klantdashboard | NOT TESTED |  |  |
| Offertes | NOT TESTED |  |  |
| Facturen | NOT TESTED |  |  |
| Projecten | NOT TESTED |  |  |
| Bestanden | NOT TESTED |  |  |

## Mollie tests

Status: `NOT TESTED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Test payment aanmaken | NOT TESTED |  |  |
| Checkoutlink openen | NOT TESTED |  |  |
| Webhook verwerken | NOT TESTED |  |  |
| Factuurstatus bijwerken | NOT TESTED |  |  |

## Resend tests

Status: `NOT TESTED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Interne mail | NOT TESTED |  |  |
| Klantbevestiging | NOT TESTED |  |  |
| Factuurmail | NOT TESTED |  |  |
| Afzender/reply-to | NOT TESTED |  |  |

## Storage tests

Status: `NOT TESTED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Private bucket | NOT TESTED |  |  |
| Signed URL | NOT TESTED |  |  |
| Klantbestand isolatie | NOT TESTED |  |  |
| Admin upload/download | NOT TESTED |  |  |

## Functions tests

Status: `NOT TESTED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| JSON responses | NOT TESTED |  |  |
| Admin token checks | NOT TESTED |  |  |
| Server-side secrets | NOT TESTED |  |  |
| Error handling | NOT TESTED |  |  |

## Post-deploy checks

Status: `NOT TESTED`

| Scenario | Status | Evidence | Opmerkingen |
| --- | --- | --- | --- |
| Monitoring | NOT TESTED |  |  |
| Rollback route bekend | NOT TESTED |  |  |
| Backup bevestigd | NOT TESTED |  |  |
| GO/NO-GO besluit geëxporteerd | NOT TESTED |  |  |

## Dag 1 - Schema

Status: `NOT TESTED`

Te bewijzen:

- Canonical schema aanwezig in testomgeving.
- Canonical tabellen werken.
- Legacy `customer_*` tabellen zijn niet leidend.

Notities:

-

## Dag 2 - Auth

Status: `NOT TESTED`

Te bewijzen:

- Login werkt.
- Profiles en rollen zijn correct gekoppeld.
- Route guards reageren correct.

Notities:

-

## Dag 3 - RLS

Status: `NOT TESTED`

Te bewijzen:

- Customer A/B isolatie.
- Admin toegang.
- Anonymous blokkade.
- Demo-user isolatie.

Notities:

-

## Dag 4 - Storage

Status: `NOT TESTED`

Te bewijzen:

- Private buckets.
- Signed URLs.
- Klant ziet alleen eigen bestanden.

Notities:

-

## Dag 5 - Functions

Status: `NOT TESTED`

Te bewijzen:

- Functions werken met test-env-vars.
- Secrets blijven server-side.
- Foutresponses zijn netjes.

Notities:

-

## Dag 6 - Mollie

Status: `NOT TESTED`

Te bewijzen:

- Testbetaling.
- Webhook.
- Statusupdates.

Notities:

-

## Dag 7 - Resend

Status: `NOT TESTED`

Te bewijzen:

- Interne e-mail.
- Klantbevestiging.
- Templates en afzender.

Notities:

-

## Dag 8 - Customer Tests

Status: `NOT TESTED`

Te bewijzen:

- CRM.
- Klantportaal.
- Offertes/facturen.
- Projecten/websites/bestanden/abonnementen.

Notities:

-

## Dag 9 - Go/No-Go

Status: `NOT TESTED`

Besluit:

-

Open blockers:

-

Goedgekeurd door:

-
