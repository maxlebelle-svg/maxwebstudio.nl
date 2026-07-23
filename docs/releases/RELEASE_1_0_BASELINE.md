# Release 1.0.0 baseline

Status: `P0 PRODUCTION RELEASE: LIVE`

Completion date: `2026-07-23`

## Production baseline

| Component | Proven baseline |
| --- | --- |
| Gates | A: PASS · B: PASS · C: PASS · D: PASS |
| End-to-end production verification | PASS |
| Active Netlify deploy | `6a613eff1e9fc5627095f198` |
| Database migration | `20260722136000` |
| Function runtime | `70 × nodejs24.x` |
| Rollback deploy | `6a610b05c1c2b5f0789f1c24` |
| Final `functions/send-lead.js` | `443b7c2176e60737a945ac67b7c1eab8d788239dc02d094f18cbbfe886a33c49` |
| Email-log compatibility migration | `be0028b4ade10ede39d6da66c18a6a1fa10446120d4e1a9a06e74e33b6423cb0` |

## Proven release chain

The production intake was validated through four separately authorized gates:

1. Gate A installed the production-only abuse-control signing secret.
2. Gate B installed the append-only P0 database foundation and compatibility chain through migration `20260722136000`.
3. Gate C deployed the validated application artifact under Node.js 24.
4. Gate D executed exactly one owner-submitted production intake and verified the result read-only.

The final end-to-end evidence proved one frontend submission, one `send-lead` invocation, one non-duplicate lead, one idempotency record, one `lead.created` event, two sent email-log records, the expected timeline/provider results, no retry and no unexpected duplicate writes.

The final lead and its `lead.created` payload both stored `environment=production`. The runtime resolver uses `APP_ENVIRONMENT`, falls back to `APP_ENV`, rejects missing, unknown or conflicting values before side effects, and reserves `test` for the explicitly authorized smoke/suppress path.

## Database and security contract

- Business-event foundation and the `lead.created` contract are active.
- Transactional lead intake, timeout reconciliation and idempotency are active.
- Abuse control, RLS, ACL and safe `SECURITY DEFINER` search paths are active.
- V1/V2 compatibility is additive. `company ↔ company_name`, `name ↔ contact_name` and `website_url ↔ website` are synchronized fail-closed.
- `source` and `external_source` remain independent domain fields.
- Sales managers have only `SELECT` and `UPDATE` access to leads.
- Staging-only nonce objects are absent from the final P0 poststate.
- `email_logs` supports all 28 runtime-written columns; the additive compatibility migration preserved row identity and security policy.

## Release evidence

- [Smoke-auth observability manifest](../customer-journey/P0_RELEASE_UNIT_MANIFEST_SMOKE_AUTH_OBSERVABILITY_7BDFB15.json)
- [Runtime environment fix manifest](../customer-journey/P0_RELEASE_UNIT_MANIFEST_RUNTIME_ENVIRONMENT_FIX_1DA026B.json)
- [Node 24 artifact manifest](../customer-journey/P0_RELEASE_UNIT_MANIFEST_RUNTIME_ENVIRONMENT_FIX_NODE24_1DA026B.json)
- [Complete database recovery manifest](../release-readiness/p0-complete-production-database-recovery/MANIFEST.json)
- [Complete database recovery fileset](../release-readiness/p0-complete-production-database-recovery/FILESET.json)
- [Email-log compatibility manifest](../release-readiness/p0-email-logs-additive-compatibility/MANIFEST.json)
- [Email-log compatibility fileset](../release-readiness/p0-email-logs-additive-compatibility/FILESET.json)

## Rollback and recovery

The approved application rollback target is Netlify deploy `6a610b05c1c2b5f0789f1c24`; the rollback approver is Max Le Belle. Database changes are append-only and are not rolled back with down migrations. A later database correction must be a separately reviewed append-only release.

## Accepted residual risks

- Migration `20260722136000` legitimately refreshed legacy `email_logs.updated_at` values through the existing row-update trigger. This was classified as an acceptable migration effect without functional or security impact.
- Synthetic Gate-D production evidence is intentionally retained where the database contract is append-only or retention-governed.
- The application rollback target predates the runtime-environment metadata correction; if used during an incident, the approved forward fix must be restored before a new intake verification.

## Baseline policy

Release 1.0.0 is frozen as the production reference point. No direct changes are made to this baseline. Future work starts from this release and is delivered as a new reviewed release (`1.0.1`, `1.1.0`, P1, P2, and later), with its own manifest, checksums, authorization gates and rollback point. Existing database migrations remain immutable; database evolution is append-only.
