# Foundation F0-h — Existing Environment Impact

Status: **PROVEN TEST RUNTIME ALREADY CORRECT**

| defect | existing-environment classification | reconciliation decision |
|---|---|---|
| `merged_fields` type/default | `existing_environment_already_correct` | None for the F0-g-proven runtime; any other environment requires read-only type/default preflight before a separate approval. |
| `created_at` default | `existing_environment_already_correct` | None for the F0-g-proven runtime; preflight `pg_get_expr` elsewhere. |
| `updated_at` default | `existing_environment_already_correct` | None for the F0-g-proven runtime; preflight `pg_get_expr` elsewhere. |
| `expires_at` default | `existing_environment_already_correct` | None for the F0-g-proven runtime; preflight `pg_get_expr` and retention constraint elsewhere. |

The SQL change itself is a `bootstrap_only_correction`: it fixes what a new empty database receives. No existing environment was changed. If a future read-only preflight finds drift, the migration category would be a narrow append-only schema reconciliation with explicit type-conversion/data validation, lock assessment, transactional rollback plan and postcondition checks. No reconciliation SQL is authored in F0-h.
