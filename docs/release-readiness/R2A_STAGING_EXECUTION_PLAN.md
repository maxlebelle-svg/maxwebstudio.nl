# R2-A — Staging Execution Plan

Status: **DESIGNED / NOT EXECUTED / SEPARATE APPROVAL REQUIRED**

Allowed future environment, only after explicit approval: `maxwebstudio-test` (`xlxpuuycigeqhgxqtzni`). Production remains excluded.

1. Lock the environment name/ref and reject production/unknown links.
2. Run bounded read-only preflight for the eight exact identities: body/definition hashes, strict/volatility/parallel/leakproof/security mode, owner, ACL and `search_path=public`.
3. Read only the selected migration-history identity and prove `20260721010000` absent; construct a safe existing execution view that excludes the `000...` baseline and all unapplied asset migrations while including genuine remote-history bytes plus the validated common file.
4. Re-run the external byte/checksum validator and a migration dry-run/history comparison.
5. Revalidate all 70 runtime policy references, policy definitions/roles and RLS flags.
6. Apply exactly `20260721010000_harden_role_helper_search_paths.sql` once.
7. Capture eight post-definition/body/metadata/owner/ACL fingerprints and the single new history row.
8. Run controlled anonymous-where-relevant, authenticated, customer-owner/non-owner, staff, admin and demo-context smoke tests without persistent business data.
9. Verify non-target definers, grants, policies, RLS, Storage and Auth invariants; observe API auth errors, policy denials, function errors and latency.
10. Re-run the migration runner to prove up-to-date behavior.

No-go/rollback triggers: any preflight mismatch, extra/missing history, body/metadata/ACL/owner drift, policy or tenant regression, new function error/latency spike, or validator drift. Stop before production and follow `R2A_ROLLBACK_PLAN.md`. A green staging execution still requires a separate production decision.
