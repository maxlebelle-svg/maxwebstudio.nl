# Food Demo Bundles v1 — staging execution plan

## Target lock

- Admin staging site: `https://maxwebstudio-staging.netlify.app`
- Supabase project ref: `xlxpuuycigeqhgxqtzni`
- Silverado Food Demo Cloud (`obprooubcbnfgouytvrw`) is explicitly out of scope.
- Production is explicitly out of scope.

Stop before any remote action unless the provider metadata independently confirms the admin staging project, environment, organization and healthy status. The local `.env.staging` values `APP_ENV=test` and `APP_ENVIRONMENT=test` are not sufficient proof of a staging deployment target.

## Order

1. Verify branch commit and clean worktree.
2. Verify exact migration checksum from `FILESET.json`.
3. Create a staging deploy preview without changing the Food Demo Cloud site.
4. Certify and apply the separately catalogued prerequisite `factory-hub-projects-v1-2026-07-29`, then apply only `20260729170000_food_demo_bundles.sql` from this bundle to the same target-locked admin staging database.
5. Prove table/constraint/RLS/function ownership and grants.
6. Create one bundle for a controlled internal test relationship.
7. Verify close/reopen, two-link rendering, role denial, sales-partner ownership and cross-relationship isolation.
8. Send one testmail only to `FOOD_DEMO_INTERNAL_TEST_EMAIL`; never to Silverado.
9. Revoke the test invitation and prove the append-only audit remains.
10. Record staging PASS or stop. Production needs a separate release decision.

## Rollback

Before migration: remove the staging deploy/branch; no data rollback is needed.

After migration: disable the UI by reverting its deploy. Keep the additive tables and audit history in place. Any schema removal requires a separately reviewed forward-only compensating migration; no down migration or destructive data deletion is permitted.
