# Complete P0 Production Database Recovery Release

Status: `PASS_P0_COMPLETE_PRODUCTION_DATABASE_RECOVERY_RELEASE_PACKAGED`

This release recovers the complete P0 database contract from the currently proven production baseline `20260718190000`. It contains six new append-only migrations and does not replay, edit, or register any superseded migration version.

The chain installs the business-event foundation and `lead.created`, transactional intake and idempotency, security/ACL hardening, abuse control, the nine additive V2 columns, synchronization for the three proven aliases, exact conditional cleanup of staging-only nonce objects, and least-privilege sales-manager policies.

The security step preserves the target-locked production semantics of `current_app_role`, `current_profile_id`, `is_demo_context`, `is_staff_role` and `owns_customer`. It changes only their fixed `search_path` and EXECUTE ACLs. In particular, invited profiles remain recognized, the deployed staff-role vocabulary remains intact, demo context still requires an active profile, and customer ownership continues to reject null targets and archived customers.

`source` and `external_source` remain independent. Existing V1 lead rows, notes, status semantics, ACLs, RLS, indexes and non-sales-manager policies are preserved.

Gate execution must capture a safe server/database identity fingerprint, complete migration-history digest and contract-scoped P0 fingerprint immediately after Gate B, then recheck them immediately before Gate C. No production execution is authorized by this package.

Production contacted read-only for helper semantics: `YES`

Production changes performed: `NO`

Gate B authorized: `NO`

Gate C authorized: `NO`

Gate D authorized: `NO`

Local database validation: `PASS`

Runtime contract tests: `58/58 PASS`

Packaging tests: `8/8 PASS`

Contract-scoped fingerprint: `c4ad980d4bd34799df83011126b0d85b8259fed5b11e37a20000de47e3a84491`
