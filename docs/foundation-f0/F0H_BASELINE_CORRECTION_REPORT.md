# Foundation F0-h — Baseline Correction Closure Report

Status: **COMPLETE / RECONCILIATION APPROVAL REQUIRED**

F0-h changed exactly four pre-proven properties on `public.lead_intake_idempotency`: `merged_fields` is now `text[]` with an empty text-array default; `created_at` and `updated_at` now default to `now()`; `expires_at` now defaults to `now() + 30 days`.

The baseline SHA-256 moved from `6c8b9a8137850edadb6fe976938d44e16a5eecadc740481a65423bf72251ff11` to `1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315`. The bootstrap copy is byte-identical. Statement count remains 612.

Fresh comparison results: 33 runtime tables, 657 runtime columns, 612 baseline columns, 678 union keys, 591 equivalent, 66 intentional exclusions, 21 intentional design differences, zero unresolved defects and zero unclassified differences.

The empty local database, rolled-back ledger fixture, recovered-byte compatibility review, dual-root history scenarios, external drift gate and all security invariants pass. The proven test runtime already has all four correct end states; no reconciliation is needed there. Any other existing environment still requires read-only preflight and separate reconciliation approval.

Cutover candidate `20260721000000` is now `schema_evidence_complete_candidate_ready`, without authorization to apply it remotely. Open work remains reconciliation governance, lead-index correction, asset release, product common-migration materialization and staging validation.

No historical migration or recovered evidence byte changed. No reconciliation SQL was created. No remote database was read or written in F0-h. Nothing was committed, pushed or deployed. All temporary clusters and fixtures were cleaned.
