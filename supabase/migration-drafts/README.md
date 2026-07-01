# Supabase Migration Drafts

Status: Fase 24 draft/readiness.

Deze map bevat concept-migraties voor het toekomstige Supabase productieschema.  
Voer deze bestanden niet uit zonder expliciete review, testomgeving-validatie en release-approval.

## Volgorde

0. `000_production_existing_tables_alignment.sql` alleen voor productie waar oudere `profiles`/`change_requests` al bestaan
1. `001_client_portal_baseline.sql` voor de eerste minimale klantportaal-livegang
2. `002_client_portal_indexes.sql` voor minimale klantportaal-indexes
3. `003_client_portal_rls_enablement.sql` voor minimale klantportaal-RLS enablement
4. `004_client_portal_rls_policies_and_grants.sql` voor minimale klantportaal-policies en runtime grants
5. `005_client_portal_legacy_policy_cleanup.sql` voor het opruimen van oude klantportaal-policies vóór productie-auth

Elke stap vereist aparte review, handmatige execution approval en read-only validatie voordat de volgende stap mag starten.

Brede platformdrafts blijven bestaan, maar zijn uitgesloten van de eerste minimale klantportaal-livegang:

- `001_schema_tables.sql`
- `002_indexes.sql`
- `003_rls_enablement.sql`
- `004_rls_policies.sql`
- `005_audit_logging_foundation.sql`
- `006_seed_demo_data_optional.sql`
- `007_runtime_role_grants.sql`
- `008_change_request_customer_ownership.sql`
- `009_client_portal_message_customer_ownership.sql`
- `013_client_portal_schema_rls_alignment.sql`

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
- `000_production_existing_tables_alignment.sql` verwijdert geen data en is bedoeld om bestaande productie-tabellen compatibel te maken voordat `001_client_portal_baseline.sql` draait.
- `001_schema_tables.sql` blijft bestaan als brede platformdraft, maar is uitgesloten van de eerste minimale klantportaal-productie-uitrol.
