# 03 RLS

Doel: database-level toegang afdwingen na test.

Bronnen:

- `docs/RLS_POLICY_MATRIX.md`
- `docs/supabase-rls-canonical-draft.sql`
- `docs/RLS_DRY_RUN_PLAN.md`
- `docs/RLS_TEST_SCENARIOS.md`
- `docs/RLS_EXPECTED_ACCESS_MATRIX.md`
- `docs/RLS_PREFLIGHT_CHECKLIST.md`

Status:

- draft voorbereid
- nog niet live
- Go/No-Go blijft No-Go tot testlog pass is

Rollback:

- alleen via backup/restore of handmatige policy-review
- geen productie-execution zonder rollback window

Niet doen:

- geen RLS op productie als eerste omgeving
- geen oude `customer_*` policies als basis nemen
