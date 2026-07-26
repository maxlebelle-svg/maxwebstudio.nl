# DCA-1 admin invitation and personal start link

## Architecture

- Demo Sites remains the single admin surface. `admin-demo-invitation` is the staff-only orchestration boundary.
- Creation, reuse, rotation and revoke use the DCA-0 service-only RPCs and tables. No second invitation model exists.
- The outgoing link is `/start#<opaque token>`. URL fragments never enter the HTTP request. The browser removes the fragment immediately, exchanges it once through a same-origin POST and then retains no token reference.
- `client-activation-exchange` validates the activation binding and sets a 15-minute `__Host-` HttpOnly session cookie. Only the session hash is stored.
- `client-activation-start` accepts no activation token. It resolves presentation and preview exclusively through the cookie-bound exchange session and rechecks invitation, link, expiry, publication, preview, lead and customer ownership on every request.
- Preview HTML is rendered server-side from the exact bound preview package and displayed in a sandboxed iframe. No private preview URL or preview token reaches the browser.
- The raw activation token is returned only by DCA-0 during create/rotation, transformed into an in-memory response link, and never written to timeline, email logs, outbox or browser storage.

## Function contracts

- `admin-demo-invitation` (`POST`): active staff only. Actions: `status`, `prepare`, `create`, `rotate`, `revoke`. POST-only prevents recipient details from entering query-string access logs.
- `client-activation-exchange` (`POST`): same-origin JSON exchange boundary with a 1024-byte body limit and database-backed HMAC client rate limit.
- `client-activation-start` (`POST`): cookie-only actions `open` and `preview`; returns minimal presentation data or sandbox-ready HTML.
- `dca_1_exchange_activation_token`: atomically validates token ownership, revokes the previous short session and stores a new session hash.
- `dca_1_resolve_exchange_session`: validates the short session and every underlying binding on each use.

## Provisional identity boundary

For a lead without a customer, the staff-only create action may prepare exactly one isolated active `demo_user` profile and its Supabase Auth identity before invoking the canonical DCA-0 invitation RPC. It does not create a customer or project, never adopts an existing unbound Auth identity, and compensates a newly prepared identity if the canonical invitation write fails. Status checks, rotation and revoke never provision identities. CX2 account activation remains the only path that can convert the lead through `converted_customer_id`.

## Privacy and operations

- No provider call is made; WhatsApp is a transient `wa.me` deep link opened by the admin.
- No raw token logger, storage call, analytics call, timeline write, email-log write or outbox write exists in DCA-1.
- Referrer policy and cache headers are `no-referrer` and `no-store` for `/start` and legacy `/start/*`.
- The activation token exists only in the fragment and the same-origin POST body; traffic request URLs contain only `/start`.
- The exchange cookie is `HttpOnly; Secure; SameSite=Strict; Path=/`, has no `Domain`, contains a fresh 256-bit random secret and expires after 15 minutes.
- `SameSite=Strict` is safe here because the external WhatsApp navigation initially needs no cookie; the cookie is created only after the page performs its same-origin exchange. Exact origin/host validation protects both cookie endpoints from CSRF, while the server-generated secret prevents session fixation.
- An activation token may create a fresh short session while its activation link remains valid. Each exchange revokes the previous session, so at most one is live. Rotation, revoke and expiry invalidate the session through the activation-link trigger and runtime revalidation.

## Deployment order

1. Apply `20260726130000_dca_1_personal_start_resolver.sql`, followed by `20260726150000_dca_1_fragment_token_exchange_v1.sql`, to staging only.
2. Deploy the branch to staging with provider suppress mode.
3. Run DCA-1, DCA-0, governance, manifest and root gates.
4. Execute the acceptance matrix for new/converted leads, ZIP/Factory, invalid/expired/revoked/rotated tokens, status refresh, mobile path and customer A/B isolation.
5. Do not migrate or deploy to production in DCA-1 staging certification.

## Staging execution — 2026-07-26

- Project ref `xlxpuuycigeqhgxqtzni` was verified before every staging action.
- The forward-only resolver and fragment-exchange migrations were applied manually to staging after exact byte/checksum verification. No automatic migration push and no production SQL were used.
- The controlled database fixture run completed with 23/23 assertions, zero provider calls and complete cleanup.
- The deployed end-to-end run completed with 31/31 assertions and complete cleanup on deploy-preview `6a65e0586c7609484808d741` of review site `mws-gold-review-2026-1-7q4k`.
- A real fragment link was opened at 390 × 844. The address bar contained only `/start`; the ZIP preview rendered the exact bound fixture; refresh preserved access through only the HttpOnly cookie; no browser errors appeared.
- ZIP and Factory flows, wrong/tampered/expired/revoked/rotated tokens, publication revoke, preview mismatch, origin mismatch, method mismatch, oversized body and cookie tampering all failed or succeeded as specified.
- The synthetic activation and exchange secrets were absent from activation links, invitation rows, exchange sessions and every present operational log surface. `email_logs` was checked; the optional `automation_outbox` and `customer_timeline_events` tables are not present in this staging schema and therefore provide no persistence surface.
- Netlify traffic receives `/start` without a fragment by browser protocol. The application exchange/context paths contain no token/body logger, the browser console was clean, and the browser code contains neither analytics/error tracking nor secret storage.

## Historical certification decision before fragment exchange

The implementation and database behavior pass, but staging certification remains fail-closed for two operational reasons:

1. The existing review site has no staging Supabase runtime configuration. Consequently a valid personal start link could not be proven end-to-end on the deployed draft without adding secrets or changing that site's configuration.
2. Redaction of the token-bearing `/start/:token` path in platform access logs has not been demonstrated on a correctly configured staging host.

That historical STOP is superseded by the fragment-exchange closure below. No production migration, production deploy, production invitation, production auth mutation, WhatsApp provider call or customer communication was performed.

## Fragment exchange closure

`DCA_1_FRAGMENT_TOKEN_EXCHANGE_V1` removes the token from the request URL rather than attempting infrastructure-log redaction. Legacy `/start/:token` requests render only the generic migration error and never invoke a token resolver. The original `dca_1_open_personal_start` RPC remains as immutable migration history but its runtime grant is revoked by the forward-only exchange migration.

## Verified gates

- DCA-1 targeted tests: 54/54
- DCA-0 regression tests: 10/10
- Combined DCA-1 + DCA-0: 64/64
- Foundation/governance: 58/58
- Product migration manifests: 5/5
- Official auto-discovered repository suite: 320/320
- Explicit root test set: 282/282
- Database staging fixture assertions: 23/23, cleanup complete
- Deployed fragment-exchange assertions: 31/31, cleanup complete

Historical counts of 458/458 and 463/463 describe an earlier test-tree composition. They are not relabeled as current evidence; Node's current official auto-discovery finds and passes 320 tests in this integration worktree.
