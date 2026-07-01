# Supabase Migration Drafts

Status: Fase 24 draft/readiness.

Deze map bevat concept-migraties voor het toekomstige Supabase productieschema.  
Voer deze bestanden niet uit zonder expliciete review, testomgeving-validatie en release-approval.

## Volgorde

0. `000_production_existing_tables_alignment.sql` alleen voor productie waar oudere `profiles`/`change_requests` al bestaan
1. `001_schema_tables.sql`
2. `002_indexes.sql`
3. `003_rls_enablement.sql`
4. `004_rls_policies.sql`
5. `005_audit_logging_foundation.sql`
6. `006_seed_demo_data_optional.sql` alleen voor test/demo, nooit productie zonder expliciet akkoord
7. `007_runtime_role_grants.sql` na RLS/policies/audit foundation, eerst staging-only review
8. `008_change_request_customer_ownership.sql`
9. `009_client_portal_message_customer_ownership.sql`
10. `013_client_portal_schema_rls_alignment.sql`

## Vereiste Review Voor Uitvoering

- Schema review.
- RLS review.
- Backup bevestigd.
- Staging/test Supabase project bevestigd.
- Rollbackplan bevestigd.
- Customer A/B isolation testplan bevestigd.
- Runtime role grants review bevestigd.
- Release approval vastgelegd.

## Belangrijk

- Geen bestand in deze map is automatisch uitgevoerd.
- Deze map vervangt geen handmatige review.
- Legacy `customer_*` tabellen zijn bewust uitgesloten.
- Runtime role grants maken RLS niet ruimer; ze zorgen alleen dat PostgreSQL de RLS policies kan evalueren.
- `000_production_existing_tables_alignment.sql` verwijdert geen data en is bedoeld om bestaande productie-tabellen compatibel te maken voordat `001_schema_tables.sql` draait.
