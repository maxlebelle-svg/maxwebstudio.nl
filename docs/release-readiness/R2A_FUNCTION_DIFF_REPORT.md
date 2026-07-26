# R2-A — Function Diff Report

Status: **PASS**

Exactly eight allowlisted functions changed. In the existing-line pre/post catalog comparison, signature, result type, SQL language, STABLE volatility, non-STRICT status, PARALLEL UNSAFE safety, non-leakproof status, SECURITY DEFINER mode, owner, ACL and exact body SHA-256 are unchanged for every function. Only `proconfig` changes from `search_path=public` to `search_path=pg_catalog`; `pg_get_functiondef` fingerprints change solely as a consequence.

No function outside the allowlist changed. Body-derived table/function dependencies remain identical. `owns_customer(uuid)` retains the exact deployed predicate without null, status or archive additions.
