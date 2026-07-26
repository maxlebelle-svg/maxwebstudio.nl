# R2-A — Dual-root Materialization Report

Status: **PASS**

- Canonical: `supabase-common/migrations/20260721010000_harden_role_helper_search_paths.sql`
- Existing historical root: `supabase/migrations/20260721010000_harden_role_helper_search_paths.sql`
- Permanent bootstrap root: `supabase-bootstrap/supabase/migrations/20260721010000_harden_role_helper_search_paths.sql`
- Size: 3578 bytes in all three locations
- SHA-256: `fd787e93077783963d87879d6f9fba32395949fe572ef94609101293c91af966` in all three locations
- Symlinks/hidden/temp files: none
- Full byte comparison: equal
- External validator: PASS

Materialization used mechanical copies from the canonical source. The validator now recognizes the frozen baseline in the repository's existing historical source as a checksummed non-common artifact; local existing execution still used a filtered disposable view with genuine history and no baseline file/history row. Direct use of the mixed repository root against an existing remote environment remains forbidden; the staging plan requires an environment-specific safe execution view.
