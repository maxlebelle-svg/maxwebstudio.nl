# P0 complete production database recovery rollback and recovery

The six migrations are append-only and each logical step is transaction-bounded. A failure inside one file must roll that file back. Stop immediately, preserve the database error and rerun the precondition and postcondition querysets before any recovery decision.

- Before the application cutover, a failed database step does not require a Netlify rollback. Repair only through a separately reviewed append-only compensating migration.
- The V1 columns remain authoritative and present throughout this release. The compatibility trigger must remain installed while either V1 or V2 writers are active.
- The sales-manager policy hardening is atomic: the legacy ALL policy is replaced by SELECT and UPDATE policies within one transaction. A failure restores the original policy automatically.
- Never remove or rename V1 columns as rollback. Before runtime traffic, correct a compatibility defect only with an append-only compensation; after traffic, preserve both aliases and reconcile conflicts before reopening intake.
- Business events and lead-intake ledgers are durable/append-only contracts. Do not drop them after traffic has used the new runtime.
- A Netlify rollback is sufficient only when the database poststate remains backward-compatible and no destructive database compensation is attempted.
- If a committed step is semantically wrong but has received no traffic, prefer an append-only compensation. If data integrity cannot be proved, close intake and restore from the pre-release physical backup.
- After any partial sequence, do not reopen traffic until migration history, object definitions, owners, RLS, ACLs, fixed search paths and staging-object absence all pass.
- Recovery approver and stable Netlify rollback deploy must be named in the later production execution gate.
- Capture the safe server/database identity fingerprint, full migration-history digest and P0 contract fingerprint immediately after Gate B and recheck all three immediately before Gate C. A mismatch blocks Gate C; Gate B is never blindly rerun.
- Keep Gate B and Gate C in one controlled release window. If that window is interrupted, repeat the read-only execution preflight and obtain fresh authorization rather than assuming the poststate persisted.
