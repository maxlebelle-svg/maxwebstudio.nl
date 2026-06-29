# Release Decision - Fase 28 After Staging Reset

Datum: 2026-06-29  
Scope: Supabase staging execution na reset  
Status: `NO-GO / BLOCKED`

## Samenvatting

De Supabase stagingdatabase is conform resetplan teruggebracht naar een schone `public` basis. Daarna zijn alle migration drafts uitgevoerd op het gelinkte testproject `maxwebstudio-test`.

De eerdere schema drift rond `public.leads.lead_score` is opgelost. Schema, indexes, RLS enablement, policies, audit foundation en optionele demo seed zijn succesvol toegepast.

De release blijft geblokkeerd omdat de Customer A/B isolation test niet volledig kon worden uitgevoerd. De runtime rol `authenticated` mist nog minimale tabelrechten om RLS te kunnen evalueren.

## Uitgevoerde stappen

| Stap | Resultaat |
| --- | --- |
| Pre-reset public table inventory | PASS |
| Public schema reset | PASS |
| Public table count na reset | PASS, 0 tabellen |
| `001_schema_tables.sql` | PASS |
| `002_indexes.sql` | PASS |
| `003_rls_enablement.sql` | PASS |
| `004_rls_policies.sql` | PASS |
| `005_audit_logging_foundation.sql` | PASS |
| `006_seed_demo_data_optional.sql` | PASS |

## Validatie

| Check | Resultaat |
| --- | --- |
| Public tables | 22 |
| Indexes | 85 |
| RLS-enabled tables | 22 |
| Policies | 70 |
| Demo customers | 1 |
| Demo websites | 1 |
| Demo settings | 1 |
| `lead_score` drift | opgelost |

## Blocker

Customer A/B isolation faalde niet op policylogica, maar op ontbrekende tabelrechten:

```text
ERROR 42501: permission denied for table customers
```

Supabase hint:

```text
GRANT SELECT ON public.customers TO authenticated;
```

## Besluit

`NO-GO / BLOCKED`

Er is een expliciete runtime role grants patch/migration nodig voordat RLS/customer isolation betrouwbaar kan worden bewezen.

## Productie-impact

Geen productieproject geraakt. Geen echte klantdata gebruikt. Geen secrets gelogd.

## Volgende stap

Maak een minimale staging-first runtime grants patch, review deze en voer daarna de Customer A/B isolation tests opnieuw uit.
