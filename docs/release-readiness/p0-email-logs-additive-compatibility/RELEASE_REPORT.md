# P0 Email Logs Additive Compatibility Correction Release

Status: `PACKAGED_AND_LOCALLY_VALIDATED`

This database-only release adds the four fields already written and read by the deployed mail logging runtime: `created_by`, `idempotency_key`, `message_type`, and `normalized_recipient_email`.

The migration preserves all 56 legacy rows, IDs, `created_at`, existing non-timestamp content, RLS state, the existing service-role policy, and the table ACL. The existing `set_email_logs_updated_at` trigger intentionally gives all 56 backfilled rows one transactionally uniform `updated_at` value. This is classified as `ACCEPTABLE_UPDATED_AT_MIGRATION_EFFECT`: `updated_at` means last row modification, not immutable original log time. The migration performs no provider action and does not fabricate the two missing historical Gate-D log rows.

Legacy rows receive deterministic SHA-256 idempotency keys derived from their immutable IDs, runtime-equivalent lowercase-trimmed recipient normalization, `generic` message type, and either their existing `triggered_by` value or `legacy_mail_service`.

The release fails closed if the production row count, columns, recipient validity, RLS, policy digest, or ACL digest differs from the proven prestate. A second execution also fails closed because the target columns must be absent.

Migration `20260722136000` was executed under a separate production authorization. Its schema, backfill and security poststate passed; this evidence correction removes only the obsolete full-timestamp-preservation expectation.

The target-locked final production verification subsequently passed in one database-enforced read-only transaction: all 28 columns written by the deployed logging service exist with matching types, the four compatibility columns and all five new constraints are exact, both new indexes are present, all 56 legacy rows are complete, and policy, ACL and grant digests are unchanged. The prior missing-column error can therefore no longer be caused by the live `email_logs` schema. No production insert or Function invocation was used for this verification.

The database is suitable for renewed Gate-D preparation. This evidence update itself does not authorize a Gate-D retry.
