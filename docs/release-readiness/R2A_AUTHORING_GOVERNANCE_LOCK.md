# R2-A — Authoring Governance Lock

Status: **LOCKED FOR LOCAL AUTHORING AND VALIDATION**
Date: 2026-07-21

## Evidence lock

R2-A.1 PASS proves exactly eight unique deployed identities in `maxwebstudio-test`, with exact raw definitions and bodies, metadata, owner, ACL and dependencies. Every per-function body file and definition file matches `R2A1_CURRENT_FUNCTION_DEFINITIONS_MANIFEST.json`; all eight readiness records are `AUTHORING_READY_EXACT_RUNTIME_BODY`.

The migration source must use only the raw R2-A.1 body evidence. Local drafts are not authoritative. In particular, `owns_customer(uuid)` retains the deployed predicate exactly: no null guard, customer-status condition or archive condition may be added.

## Hard allowlist

1. `public.current_app_role()`
2. `public.current_profile_id()`
3. `public.has_app_role(allowed_roles text[])`
4. `public.is_admin_role()`
5. `public.is_demo_context()`
6. `public.is_demo_record(record_is_demo boolean, record_environment text)`
7. `public.is_staff_role()`
8. `public.owns_customer(target_customer_id uuid)`

For every identity, signature, result type, SQL language, STABLE volatility, non-STRICT behavior, PARALLEL UNSAFE safety, non-leakproof status, SECURITY DEFINER mode and exact body remain unchanged. The sole permitted function change is `search_path=public` to `search_path=pg_catalog`. Owner and ACL are preserved by omitting owner and privilege statements.

Excluded: `add_audit_log`, all other functions, groups B/C/D, ACLs, grants, policies, tables, data, indexes, constraints, Auth, Storage, historical migrations and the frozen baseline.

## Version lock — recorded before migration creation

- Version: `20260721010000`
- Filename: `20260721010000_harden_role_helper_search_paths.sql`
- Canonical source: `supabase-common/migrations/20260721010000_harden_role_helper_search_paths.sql`
- Existing execution view: `supabase/migrations/20260721010000_harden_role_helper_search_paths.sql`
- Bootstrap execution view: `supabase-bootstrap/supabase/migrations/20260721010000_harden_role_helper_search_paths.sql`

The version is strictly after cutover `20260721000000`, absent from every local migration root, and later than the proven remote-history boundary `20260720200000`. No remote query was used for version selection. The earlier `20260721000100` name existed only as a disposable F0-f PoC fixture and is not present in product roots.

## Execution boundary

Authorized: local authoring, deterministic materialization, static checks, isolated local existing/bootstrap database runs, transactional fixtures, reports and tests.

Not authorized: any remote query or apply, staging, production, commit, push or deploy. Foundation remains **COMPLETE AND FROZEN**.
