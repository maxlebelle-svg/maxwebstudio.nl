# P0 email_logs compatibility rollback and recovery

This release is append-only. Do not use a down migration and do not remove the four columns after production traffic can write them.

If execution stops before commit, PostgreSQL rolls the transaction back and the prestate remains intact.

If execution commits but a postcondition later fails, keep the additive poststate, block a new Gate D request, and prepare a separately reviewed append-only correction. Do not delete or fabricate historical Gate-D logs.

Application rollback does not require database rollback: the four added columns are additive and the existing mail-delivery fields remain unchanged.

Recovery evidence must include the migration-history row, row count, required-column null counts, idempotency uniqueness, recipient-normalization validity, and unchanged RLS, policy, and ACL digests.
