# DCA-1 admin invitation and personal start link

## Architecture

- Demo Sites remains the single admin surface. `admin-demo-invitation` is the staff-only orchestration boundary.
- Creation, reuse, rotation and revoke use the DCA-0 service-only RPCs and tables. No second invitation model exists.
- `/start/:token` is a static, no-store shell. It sends the token once in a POST body to `client-activation-start`; the server hashes it in the service-only `dca_1_open_personal_start` RPC.
- The resolver rechecks invitation, link, expiry, publication, preview, lead and customer ownership on every open and preview request.
- Preview HTML is rendered server-side from the exact bound preview package and displayed in a sandboxed iframe. No private preview URL or preview token reaches the browser.
- The raw activation token is returned only by DCA-0 during create/rotation, transformed into an in-memory response link, and never written to timeline, email logs, outbox or browser storage.

## Function contracts

- `admin-demo-invitation` (`POST`): active staff only. Actions: `status`, `prepare`, `create`, `rotate`, `revoke`. POST-only prevents recipient details from entering query-string access logs.
- `client-activation-start` (`POST`): public token boundary. Actions: `open`, `preview`. Returns minimal presentation data or sandbox-ready HTML.
- `dca_1_open_personal_start(text)`: service-role only; hashes the token, validates all bindings and writes `opened_at` idempotently.

## Explicit limitation

A lead without a customer must already have exactly one isolated active `demo_user` profile for the intended e-mail address, as required by the approved DCA-0 contract. DCA-1 does not create a customer, project or auth identity. Account activation remains deliberately inactive pending DCA-2.

## Privacy and operations

- No provider call is made; WhatsApp is a transient `wa.me` deep link opened by the admin.
- No raw token logger, storage call, analytics call, timeline write, email-log write or outbox write exists in DCA-1.
- Referrer policy and cache headers are `no-referrer` and `no-store` for `/start/*`.
- Platform access-log redaction for token-bearing path segments must be demonstrated in staging before production review can pass.

## Deployment order

1. Apply `20260726130000_dca_1_personal_start_resolver.sql` to staging only.
2. Deploy the branch to staging with provider suppress mode.
3. Run DCA-1, DCA-0, governance, manifest and root gates.
4. Execute the acceptance matrix for new/converted leads, ZIP/Factory, invalid/expired/revoked/rotated tokens, status refresh, mobile path and customer A/B isolation.
5. Do not migrate or deploy to production in DCA-1 staging certification.

## Staging execution — 2026-07-26

- Project ref `xlxpuuycigeqhgxqtzni` was verified before any staging action.
- Only `20260726130000_dca_1_personal_start_resolver.sql` was applied. The existing remote migration-history drift made an automatic database push unsafe, so the exact migration was executed in the authenticated staging SQL editor instead.
- The controlled database fixture run completed with 22/22 assertions, zero provider calls and complete cleanup. The evidence contains no raw tokens, personal data or secrets.
- A non-production Netlify draft was deployed as `6a65d066af33410287d4d152` to the existing review site `mws-gold-review-2026-1-7q4k`.
- The mobile start shell and generic invalid-token failure were visually verified at 390 × 844.

## Certification decision

The implementation and database behavior pass, but staging certification remains fail-closed for two operational reasons:

1. The existing review site has no staging Supabase runtime configuration. Consequently a valid personal start link could not be proven end-to-end on the deployed draft without adding secrets or changing that site's configuration.
2. Redaction of the token-bearing `/start/:token` path in platform access logs has not been demonstrated on a correctly configured staging host.

No production migration, production deploy, production invitation, auth mutation, WhatsApp provider call or customer communication was performed. Production review may resume only after a dedicated staging host is safely configured and both checks above are evidenced.

## Verified gates

- DCA-1 targeted tests: 33/33
- DCA-0 regression tests: 10/10
- Foundation/governance: 58/58
- Product migration manifests: 5/5
- Current complete repository suite: 299/299
- Staging fixture assertions: 22/22, cleanup complete

Historical counts of 458/458 and 463/463 describe an earlier test-tree composition. They are not relabeled as current evidence; the complete test tree in this integration worktree currently contains 299 tests.
