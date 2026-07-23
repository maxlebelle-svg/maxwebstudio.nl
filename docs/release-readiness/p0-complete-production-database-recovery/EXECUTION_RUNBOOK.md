# Complete P0 database recovery execution runbook

This document is evidence only. It does not authorize Gate B.

## Mandatory isolation

Never run a database push from the repository migration root. It contains superseded P0 migration files that are not part of this recovery release.

Create a temporary CLI context outside the repository, target-lock it to projectref `yxxahurphdbblkuxoeje`, and expose only the six files listed in `MANIFEST.json`. Start its migration directory empty. Verify every file hash against `FILESET.json` before it enters that directory.

## Ordered execution

1. Run `PRECONDITIONS.sql` in a database-enforced read-only transaction.
2. Capture `TARGET_AND_HISTORY_EVIDENCE.sql`.
3. Add only `20260722130000` to the isolated migration directory, apply it, prove its history row, then run its limited postcondition.
4. Repeat one file at a time for `20260722131000`, `20260722132000`, `20260722133000`, `20260722134000`, and `20260722135000`.
5. Stop immediately after any failed migration, missing history row, failed limited postcondition, hash mismatch, target mismatch, or unexpected extra migration proposal. Do not expose the next file.
6. After all six history rows are proven, run `POSTCONDITIONS.sql`, `CATALOG_FINGERPRINT.sql`, and `TARGET_AND_HISTORY_EVIDENCE.sql` read-only.

The staging cleanup step accepts only two prestates: both nonce objects absent, or the exact locked implementation present with an empty table and no unknown dependency. Every other state stops.

## Gate B to Gate C handoff

Record the safe server/database identity fingerprint, complete migration-history digest, and P0 contract fingerprint immediately after Gate B. Re-run those same read-only proofs immediately before Gate C. Any difference blocks Gate C and does not authorize a Gate-B rerun.

Gate B and Gate C must remain in one controlled release window. If the window is interrupted, repeat the read-only execution preflight and obtain fresh owner authorization.

Production configuration changes: `NOT PART OF THIS RUNBOOK`

Application deployment: `NOT PART OF THIS RUNBOOK`
