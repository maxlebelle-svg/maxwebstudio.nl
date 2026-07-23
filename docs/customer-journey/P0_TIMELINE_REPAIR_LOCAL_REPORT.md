# P0 timeline repair — local authoring report

## Status

`PASS_P0_TIMELINE_REPAIR_LOCAL_STAGING_REVIEW_REQUIRED`

This report covers local authoring and validation only. No staging, production, deployment, configuration, database, commit, or push action was performed.

## Snapshot lineage

- Published Gate 3A deploy: `6a5fea25b659e168ce2e19d6`
- Original staging basis: `7bdfb15d659a2f9da5d0816732ad19828bcb296d`
- Validated intermediate snapshot commit: `1da026be7edc6258a3ed6762c9bf3d9ceba89078`
- Historical 34-file manifest: `P0_RELEASE_UNIT_MANIFEST_NONCE_REPLAY_7BDFB15.json`
- Historical manifest SHA-256: `588ec57aeba79e1fd71ed0487f60df7560a539b3c0e8624ca1ca8123200e6c7b`
- All 33 externally hashable historical manifest entries matched before authoring.

## Repair

Only the obsolete `createTimelineEvent` side effect was removed from `functions/send-lead.js`, together with its now-unused import and input helper. No storage, abuse-control, smoke-authentication, nonce, limiter, reconciliation, or provider-suppression behavior was changed.

The resulting creation path is:

`send-lead` → `mws_create_lead_transactional_v1` → its existing canonical `lead.created` business event.

The handler performs no separate `customer_timeline_events` write and no direct or second `business_events` write. Handler-call evidence for a successful request is: nonce `0` for an ordinary request, limiter `1`, create RPC `1`, reconciliation `0`, legacy timeline `0`, extra business-event HTTP/RPC `0`, and configured provider calls `2`. In authenticated smoke mode the same storage path runs, nonce is `1`, and provider calls are suppressed to `0` by the existing contract.

Before the repair, successful storage followed by the absent legacy projection produced HTTP `202` with `notificationDegraded`. After the repair, the same stored request returns HTTP `200` with storage classification `created`. Genuine settings exceptions, provider exceptions, and provider `sent:false` still return HTTP `202` with `notificationDegraded`.

## Replay and failure behavior

- Exact smoke replay remains rejected before limiter, create, notification, and event side effects.
- Concurrent smoke contenders still consume exactly one nonce.
- A regular idempotent replay invokes the create RPC once for resolution, performs no legacy timeline call, no direct event call, and no provider call.
- A definitive storage failure is not reconciled and performs no timeline, direct event, or provider call.
- Ambiguous storage outcomes retain the existing single reconciliation path.

## Workspace and smoke cleanup findings

The Sales Workspace loads leads through `functions/admin-leads.js`. Its read projections do not select `archived_at`, and the list query does not filter on `archived_at`. The UI's `isOpenLeadStatus` excludes won, `lost`, and `geen_interesse`; it does not exclude `archived`. The current archive action sends only `callStatus: "archived"`. On the modern payload path that updates `status` and maps `lead_status` to `lost`, but does not reliably replace a pre-existing `call_status`; consequently an old `call_status: "new"` can keep the row operationally open.

No general archive logic was changed because that would alter a non-P0 Function and violate the release-unit constraint that `send-lead.js` is the sole changed Netlify entrypoint.

For the next explicitly authorized smoke cleanup, use one bounded cleanup operation on the exact smoke lead ID and set an already-supported inactive combination: `status = 'archived'`, `lead_status = 'lost'`, `call_status = 'geen_interesse'`, plus `archived_at` when that column is present. Then assert all of the following before declaring cleanup complete:

1. the exact database row has the inactive status combination and the smoke metadata remains identifiable;
2. `admin-leads` maps it with a non-open call status (`geen_interesse`) and lifecycle `lost`;
3. the Sales Workspace open-lead list and open-lead KPI no longer include the ID;
4. no second row exists for the smoke request identity;
5. the canonical business event remains append-only and is not deleted as part of cleanup.

This is a gate procedure, not a database or architecture change. It requires explicit remote-write authorization in the later smoke gate.

## Release-unit integrity

- New release unit: 37 files (the historical 34 plus this report, machine-readable evidence, and the new manifest).
- Netlify Function entrypoints before/after: `70 / 70`.
- Sole changed Netlify entrypoint relative to the validated deployed snapshot: `functions/send-lead.js`.
- Relevant changed tests: `tests/p0-lead-intake-handler.test.js`, `tests/public-lead-intake-persistence.test.js`, and `tests/p0-staging-smoke-contract.test.js`.
- Migrations `20260721040000` and `20260721050000` remain byte-identical across all three roots.
- No migration was added or changed.
- The historical 34-file manifest remains unchanged as evidence.
- The known unrelated navigation hunk and all ordinary working-tree pollution are excluded; `public/script.js` remains byte-identical to the deployed snapshot.

## Validation

- Targeted handler and public-form tests: `53 / 53` pass.
- Timeline, smoke-contract, and public persistence group: `70 / 70` pass.
- Complete isolated JavaScript suite: `263 / 263` pass.
- JavaScript syntax checks: pass.
- Public HTML structural and regression checks: pass.
- `git diff --check`: pass.
- Function inventory and migration checksums: pass.
- Secret scan: no credential-shaped assignment or private-key material introduced by the repair files.

## Remaining risk and next gate

The code repair is locally complete. The remaining operational risk is the cleanup status combination described above; it is documented as an exact next-smoke assertion and does not justify expanding this runtime release. A new read-only staging-readinessreview may now verify the 37-file release unit, staging drift, configuration presence, and atomically simulated deploy impact. It must not deploy or contact production.
