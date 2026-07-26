# Foundation F0-h — Recovered Migration Compatibility

Status: **SCHEMA COMPATIBLE / BYTES UNCHANGED**

The two evidence files retain their original SHA-256 values:

- `20260720160000_lead_event_foundation.sql`: `d0252a9ed2062da2cdd499030afea01a3b3ac734402568176ed48d4fe434e6ba`;
- `20260720200000_transactional_lead_intake_rpc.sql`: `40397c9d45e2c7dfef7c702837999630343f7fb033fa408119509483c29c6370`.

The second migration defines the exact eleven-column ledger now produced by the baseline. Its RPC declares `v_merged_fields text[]`, appends field names, stores that array, calls `cardinality(...)`, serializes it with `to_jsonb(...)`, and uses stable transaction timestamps for both intake rows and lead events. The corrected type/defaults therefore absorb its intended final table state without coercion or retention-constraint drift.

The first migration explains `validate_lead_created_v1` and the lead-event validation path. The baseline already contains the compatible business-event table/contract infrastructure; F0-h does not add or alter function bodies because functions are outside the approved four-defect boundary.

Neither recovered migration is installed in the official migration root or replayed above the final-state baseline. Doing so would hit the migration's deliberate duplicate-object precondition. There are currently no product common migration files after cutover, so no common dependency is missing or silently re-executed. Product materialization of the recovered RPC/function intent remains a separate approved implementation phase, not a schema defect in this correction.
