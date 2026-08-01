# Commercial absence contract and preflight

Status: local release contract. This document does not authorize staging or production execution.

## Fixed release identity

- Base candidate commit: `3e607711c7c232ab27722e08484ccbb05bfcd1a7`
- Production project reference: `yxxahurphdbblkuxoeje`
- Migration 7: `20260731213000_harden_leads_demo_read_policy.sql`
- Migration 7 SHA-256: `bdc3b1a612dc34225e46d649a4fcdf09a5d13b31091cc553d39beb690692e4f6`
- `LEADS_DEMO_READ_CONTRACT`: `ABSENT`
- `MIGRATION_HISTORY_RECOVERY_MODE`: `SCHEMA_ROLLBACK_THEN_EXACT_PREFIX_HISTORY_REPAIR`

Migration 7 remains byte-identical. Because the certified prestate is `ABSENT`, its `drop policy if exists` statement is a schema no-op. Its rollback is also a schema no-op and never creates `leads_demo_read`.

## Required execution window

The later release procedure must apply migrations 1–6, establish an exclusive schema-change window, run `scripts/commercial-release-absence-guard.js` through a reviewed read-only catalog adapter, and only then allow migration 7. The adapter must independently prove project reference `yxxahurphdbblkuxoeje`; environment input alone is not sufficient evidence.

The guard queries only `pg_catalog.pg_policy`, `pg_catalog.pg_class`, and `pg_catalog.pg_namespace`. It requires exactly one aggregate result with a matching-policy count of zero. The separately approved expected release commit must be a full SHA-1 and must equal the observed checkout commit. Wrong target identity, commit mismatch, checksum drift, an unavailable exclusive window, an existing policy, ambiguous output, or any query error stops the release before migration 7. Its audit entry contains only project reference, release commit, migration version/checksum, timestamp, result, and a safe error code.

## Prefix recovery manifest

For every applied prefix, first roll back only the release-owned schema changes in reverse order. Migration 7 contributes no schema rollback action. Only after schema equality is confirmed may the exact applied history prefix be marked reverted.

| Applied prefix | Reverse schema order | Exact history versions eligible after confirmed schema rollback |
| --- | --- | --- |
| 1 | 1 | `20260730150000` |
| 1–2 | 2, 1 | `20260730170000`, `20260730150000` |
| 1–3 | 3, 2, 1 | `20260730223000`, `20260730170000`, `20260730150000` |
| 1–4 | 4, 3, 2, 1 | `20260731100000`, `20260730223000`, `20260730170000`, `20260730150000` |
| 1–5 | 5, 4, 3, 2, 1 | `20260731190000`, `20260731100000`, `20260730223000`, `20260730170000`, `20260730150000` |
| 1–6 | 6, 5, 4, 3, 2, 1 | `20260731200000`, `20260731190000`, `20260731100000`, `20260730223000`, `20260730170000`, `20260730150000` |
| 1–7 | 7 (no-op), 6, 5, 4, 3, 2, 1 | `20260731213000`, `20260731200000`, `20260731190000`, `20260731100000`, `20260730223000`, `20260730170000`, `20260730150000` |

History repair is forbidden before a successful schema rollback and post-rollback proof that `leads_demo_read` is absent. Never repair a version that remote history does not show as applied.

## Server-side PostgREST preflight

`functions/admin-commercial-postgrest-preflight.js` is a fixed, read-only super-admin route. It accepts only `GET` and makes exactly two server-side requests:

- `profiles?select=id&limit=0`
- `customers?select=id&limit=0`

Resources and query parameters are not caller-controlled. The route uses the existing admin-session verifier, disables legacy-token auth, applies a per-actor rate limit, passes no PostgREST response body through, and returns only resource, HTTP status, safe error code, and result category. Its audit log contains safe actor/profile metadata and probe outcomes, never credentials, headers, cookies, tokens, record data, or upstream response bodies.

Existing `platform-health` and `admin-supabase-data` routes are unchanged.
