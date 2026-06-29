# Supabase Migration Drafts

Status: Fase 24 draft/readiness.

Deze map bevat concept-migraties voor het toekomstige Supabase productieschema.  
Voer deze bestanden niet uit zonder expliciete review, testomgeving-validatie en release-approval.

## Volgorde

1. `001_schema_tables.sql`
2. `002_indexes.sql`
3. `003_rls_enablement.sql`
4. `004_rls_policies.sql`
5. `005_audit_logging_foundation.sql`
6. `006_seed_demo_data_optional.sql` alleen voor test/demo, nooit productie zonder expliciet akkoord

## Vereiste Review Voor Uitvoering

- Schema review.
- RLS review.
- Backup bevestigd.
- Staging/test Supabase project bevestigd.
- Rollbackplan bevestigd.
- Customer A/B isolation testplan bevestigd.
- Release approval vastgelegd.

## Belangrijk

- Geen bestand in deze map is automatisch uitgevoerd.
- Deze map vervangt geen handmatige review.
- Legacy `customer_*` tabellen zijn bewust uitgesloten.

