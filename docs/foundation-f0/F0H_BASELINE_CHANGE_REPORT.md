# Foundation F0-h — Baseline Change Report

Status: **EXACT FOUR-DEFECT CHANGE COMPLETE**

The pre-change allowlist in `F0H_CHANGE_BOUNDARY.json` was locked before editing. Only lines 4072, 4074, 4075 and 4076 of the authoritative baseline changed, all inside the `public.lead_intake_idempotency` table definition.

| column | old baseline | corrected baseline/runtime/original |
|---|---|---|
| `merged_fields` | `jsonb NOT NULL DEFAULT '{}'::jsonb` | `text[] NOT NULL DEFAULT array[]::text[]` |
| `created_at` | `timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()` | `timestamptz NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()` | `timestamptz NOT NULL DEFAULT now()` |
| `expires_at` | `timestamptz NOT NULL DEFAULT (pg_catalog.clock_timestamp() + interval '30 days')` | `timestamptz NOT NULL DEFAULT (now() + interval '30 days')` |

Old SHA-256: `6c8b9a8137850edadb6fe976938d44e16a5eecadc740481a65423bf72251ff11` (217,030 bytes). New SHA-256: `1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315` (216,966 bytes). Delta: -64 bytes. Supabase CLI statement count remains 612, so the statement-count delta is zero.

Semantic diff: one column type/default and three default expressions. Object count, column count, order, constraints, indexes, functions, triggers, RLS, policies, grants, Storage configuration, cutover version and data are unchanged. No broad formatting or reordering occurred.

The bootstrap file was subsequently materialized one-way from the authoritative file; it was not independently edited. Both files now have the same size, bytes and SHA-256.
