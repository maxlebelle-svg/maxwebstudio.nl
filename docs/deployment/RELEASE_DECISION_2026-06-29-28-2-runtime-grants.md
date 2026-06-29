# Release Decision - Fase 28.2 Runtime Role Grants

Datum: 2026-06-29  
Scope: Runtime role grants patch op Supabase staging/test  
Status: `STAGING GO / PRODUCTION NO-GO`

## Samenvatting

`supabase/migration-drafts/007_runtime_role_grants.sql` is uitgevoerd op uitsluitend het Supabase staging/testproject `maxwebstudio-test`.

De blocker waarbij `authenticated` vóór RLS-policy-evaluatie faalde met `permission denied for table customers` is opgelost.

## Patch

Uitgevoerd:

- `supabase/migration-drafts/007_runtime_role_grants.sql`

Niet uitgevoerd:

- Geen productie.
- Geen andere migrations opnieuw.
- Geen schema-drift patches.
- Geen RLS policy versoepelingen.
- Geen OpenAI/Mollie/Resend.

## Validatie

| Check | Resultaat | Status |
| --- | --- | --- |
| Patch execution | SQL succesvol uitgevoerd op staging | PASS |
| Customer A isolation | Eigen customer/site zichtbaar, Customer B niet zichtbaar | PASS |
| Customer B isolation | Eigen customer/site zichtbaar, Customer A niet zichtbaar | PASS |
| `authenticated` permission blocker | Geen permission denied vóór RLS bij customer tests | PASS |
| Leadfinder klanttoegang | Customer ziet 0 leads | PASS |
| Audit read customer | Customer ziet 0 audit logs | PASS |
| Audit insert customer | Directe insert geblokkeerd | PASS |
| Anonymous klantdata | Geen klantdatatoegang | PASS |
| Demo user isolation | Alleen demo data zichtbaar | PASS |
| Interne basisrollen | Admin/sales/support/developer basisreads werken volgens policy | PASS |

## Besluit

Fase 28 staging database foundation: `GO`

Productie/live release: `NO-GO`

## Waarom productie nog NO-GO blijft

Deze fase bewijst de staging database foundation, maar is nog geen volledige production release. Productie vereist nog:

- production approvals;
- production environment confirmation;
- backup/restore evidence;
- monitoring/logging readiness;
- Storage production review;
- Resend/Mollie production checks;
- finale releasecandidate decision.

## Volgende stap

Start de volgende data-layer fase pas op basis van deze bewezen staging foundation, of voer eerst een formele Fase 28.3 GO/NO-GO review uit voor de Supabase data layer.
