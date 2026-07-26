# R2-A — Implementation Report

Status: **PASS / STAGING EXECUTION APPROVAL REQUIRED**

R2-A authored exactly one append-only common migration, version `20260721010000`, containing exactly eight allowlisted `CREATE OR REPLACE FUNCTION` statements. Every body is an exact byte match to R2-A.1 runtime evidence; only function-level search path changes from `public` to `pg_catalog`. No other object or access rule is changed.

The canonical and two materialized copies are 3578 bytes with SHA-256 `fd787e93077783963d87879d6f9fba32395949fe572ef94609101293c91af966`. Dual-root validation passed. Existing local history moved from one genuine historical row to that row plus exactly one common row and never acquired a baseline row. Bootstrap moved from one genuine 612-statement baseline row to baseline plus exactly one 8-statement common row. Both second runs reported up to date.

All functional fixtures passed before and after and rolled back completely. Seventy runtime policy references are statically compatible; all 64 target-baseline materializations were locally fingerprinted unchanged. Security invariants passed. Disposable clusters/workspaces were cleaned.

No remote query/apply, staging, production, commit, push or deploy occurred. The only open gate is separate staging execution approval.
