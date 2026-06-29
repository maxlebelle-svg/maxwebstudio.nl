# SQL Bundle

Status: index, geen uitvoer.

## Uitvoeren in testomgeving na review

| Bestand | Gebruik |
| --- | --- |
| `supabase/schema.sql` | canonical basis |
| `docs/supabase-rls-canonical-draft.sql` | RLS draft, pas na review aanpassen van rollback naar commit in test |
| `supabase/seed-demo.sql` | optionele demo seed na schema/RLS checks |

## Optioneel/contextafhankelijk

| Bestand | Gebruik |
| --- | --- |
| `docs/supabase-change-requests.sql` | wijzigingsverzoeken + uploadbucket |
| `docs/supabase-invoice-storage.sql` | private invoice PDF bucket |

## Niet blind uitvoeren

| Bestand | Reden |
| --- | --- |
| `docs/supabase-client-portal.sql` | legacy/overlap met profiles/customer_websites |
| `docs/supabase-billing.sql` | legacy `customer_invoices`/`customer_subscriptions` |
| `docs/supabase-website-health.sql` | target legacy `customer_websites` |
| `docs/supabase-mollie-payments.sql` | target legacy `customer_invoices` |
| `docs/supabase-invoice-emails.sql` | target legacy `customer_invoices` |
| `docs/supabase-mollie-subscriptions.sql` | target legacy `customer_subscriptions` |
| `docs/supabase-mollie-subscriptions-sync.sql` | target legacy `customer_subscriptions` |
| `docs/supabase-mollie-subscription-actions.sql` | target legacy `customer_subscriptions` |
| `docs/supabase-subscription-retries.sql` | target legacy `customer_subscriptions` |

## Legacy

Legacy tabellen blijven historische context:

- `customer_websites`
- `customer_invoices`
- `customer_subscriptions`

Nieuwe productiefeatures gebruiken canonical tabellen.

## Fase 24 Migration Drafts

Nieuwe draftbundel:

- `supabase/migration-drafts/001_schema_tables.sql`
- `supabase/migration-drafts/002_indexes.sql`
- `supabase/migration-drafts/003_rls_enablement.sql`
- `supabase/migration-drafts/004_rls_policies.sql`
- `supabase/migration-drafts/005_audit_logging_foundation.sql`
- `supabase/migration-drafts/006_seed_demo_data_optional.sql`

Status:

- Draft only.
- Niet uitgevoerd.
- Niet uitvoeren zonder expliciete approval.
- Eerst reviewen met `docs/SUPABASE_MIGRATION_DRAFT_REVIEW_CHECKLIST.md`.
- Testuitvoering plannen met `docs/SUPABASE_STAGING_EXECUTION_PLAN.md`.
- Afvinken met `docs/deployment/STAGING_EXECUTION_CHECKLIST.md`.

Belangrijk:

- Deze drafts zijn bedoeld als opvolger van de canonical schema/RLS-planning.
- Legacy `customer_*` tabellen blijven uitgesloten.
- `006_seed_demo_data_optional.sql` is alleen test/demo.
