# Foundation F0-h — Baseline Defect Inventory

Status: **PRE-CHANGE INVENTORY COMPLETE**

Authoritative evidence is limited to the F0-g comparison/catalog reports, the two `original_verified` migration files, the current baseline, the F0-b/F0-c manifests, and existing local tests. All four defects affect only `public.lead_intake_idempotency`. The current test runtime already has the intended end state; the correction is bootstrap-only and does not authorize remote or reconciliation SQL.

| defect-id | column | runtime/original | current baseline | classification | functional/data/security impact | required baseline correction | existing environments |
|---|---|---|---|---|---|---|---|
| `F0H-DEFECT-001` | `merged_fields` | `text[] NOT NULL DEFAULT ARRAY[]::text[]` | `jsonb NOT NULL DEFAULT '{}'::jsonb` | `baseline_defect` | RPC output and persisted merge-field names require an ordered text array; bootstrap creates the wrong data type and default. RLS/grants are unaffected. | Replace only the type/default expression with `text[] NOT NULL DEFAULT array[]::text[]`. | `existing_environment_already_correct`; no reconciliation for the proven runtime. Other existing environments require a read-only preflight before any separately approved reconciliation decision. |
| `F0H-DEFECT-002` | `created_at` | `timestamptz NOT NULL DEFAULT now()` | `timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()` | `baseline_defect` | Transaction timestamp must be stable across the intake transaction and anchors the retention constraint. No ACL/RLS impact. | Replace only the default with `now()`. | `existing_environment_already_correct`; no reconciliation for the proven runtime. |
| `F0H-DEFECT-003` | `updated_at` | `timestamptz NOT NULL DEFAULT now()` | `timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()` | `baseline_defect` | Initial ledger timestamps must share the transaction timestamp and satisfy `updated_at >= created_at` deterministically. No ACL/RLS impact. | Replace only the default with `now()`. | `existing_environment_already_correct`; no reconciliation for the proven runtime. |
| `F0H-DEFECT-004` | `expires_at` | `timestamptz NOT NULL DEFAULT (now() + interval '30 days')` | `timestamptz NOT NULL DEFAULT (pg_catalog.clock_timestamp() + interval '30 days')` | `baseline_defect` | Expiry must derive from the same transaction timestamp as `created_at`, matching the exact retention constraint. No ACL/RLS impact. | Replace only the default with `(now() + interval '30 days')`. | `existing_environment_already_correct`; no reconciliation for the proven runtime. |

## Exact evidence

- F0-g comparison IDs: `F0G-COL-0416`, `F0G-COL-0409`, `F0G-COL-0418`, `F0G-COL-0411` in `F0G_COLUMN_COMPARISON.json`.
- Runtime values: the eleven `public.lead_intake_idempotency` rows in `F0G_RUNTIME_COLUMN_CATALOG.json`.
- Original migration source: `evidence/recovered-migrations/20260720200000_transactional_lead_intake_rpc.sql`, table definition beginning at line 179; SHA-256 `40397c9d45e2c7dfef7c702837999630343f7fb033fa408119509483c29c6370`.
- Supporting lineage migration: `evidence/recovered-migrations/20260720160000_lead_event_foundation.sql`; SHA-256 `d0252a9ed2062da2cdd499030afea01a3b3ac734402568176ed48d4fe434e6ba`.
- Current baseline definition: `supabase/migrations/00000000000000_authoritative_baseline.sql`, lines 4065–4083 before correction.

No fifth defect, dependent constraint change, index change, policy change, grant change, function change, historical migration change, or cutover-version change is authorized.
