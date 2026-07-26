# DCA-0 security and staging closure

Status: **STAGING FOUNDATION CERTIFIED; PRODUCTION REPAIR NOT EXECUTED; DCA-1 STOPPED**

## 1. Architecture decisions

- `lead_demo_invitations` keeps the proven production columns and adds a bound `preview_version_id`, a canonical SHA-256 `idempotency_key`, and a constrained `dca_phase`.
- `public_preview_publications` mirrors the production contract. It is service-only, has forced RLS, and exposes no browser policy.
- `client_activation_links` owns expiry, revoke, rotation and activation state. It stores only a SHA-256 token hash.
- A token is 32 cryptographically random bytes, hex encoded for transport. The raw value is returned once to server-side delivery code and is never inserted into a table.
- Canonical invitation identity is SHA-256 over `lead_id + demo_journey_id + preview_version_id + normalized_email`.
- At most one `active` or `opened` activation link may exist per invitation. Rotation first marks the previous link `rotated` and sets `revoked_at`.
- `leads.converted_customer_id` is the only lead-to-customer relation. `leads.customer_id` is never referenced.
- A provisional lead can bind only to an isolated `demo_user`. It cannot complete account activation until a canonical customer exists.
- Existing customer activation requires matching lead, customer, profile, auth user, project, publication and preview ownership.
- The legacy `plan_demo_invitation` execute grant is revoked because that function permanently stores private preview URLs and message snapshots.
- DCA-0 creates no outbox action and calls no provider. DCA-1 must pass the one-time raw token directly to provider memory and must not persist a rendered token-bearing message.
- `projects.status` remains `onboarding`; DCA state lives in constrained invitation/link columns.

## 2. Exact orphan repair

The prepared production repair is `docs/deployment/DCA_0A_PRODUCTION_ORPHAN_REPAIR.sql`.

It:

- locks exactly one active lead publication whose lead is absent and whose preview exists;
- fails for zero or multiple candidates;
- fails if ownership context changed;
- sets only `enabled = false`, `revoked_at`, and `updated_at`;
- does not delete, relink, reuse a slug, or change the preview;
- returns only a SHA-256 audit identifier and exact row count.

The production schema has no `reason`, `metadata`, or `revoked_by` column on this table. The reason `DCA_0_ORPHANED_LEAD_PUBLICATION_REPAIR` therefore exists in the immutable repair artifact/output, not in an invented column.

This repair was **not executed**, because the full repository suite did not pass. Production received no write.

## 3. Files

- `supabase/migrations/20260726100000_dca_0_token_safe_invitation_foundation.sql`
- `docs/deployment/DCA_0A_PRODUCTION_ORPHAN_REPAIR.sql`
- `docs/deployment/DCA_0A_PRODUCTION_POSTCHECK.sql`
- `scripts/dca-0-certify-staging.mjs`
- `tests/dca-0-security-and-staging-closure.test.js`
- `docs/evidence/dca-0-security-and-staging-closure/STAGING_CERTIFICATION.json`
- `docs/evidence/dca-0-security-and-staging-closure/STAGING_POSTSTATE.json`

## 4. Migration and staging execution

The migration was applied to staging project `xlxpuuycigeqhgxqtzni` and immediately applied a second time successfully. The first attempted execution failed before commit because staging lacks the optional legacy `automation_outbox`; the migration was corrected to add that foreign key only when the existing table is present. No legacy outbox was created.

Staging drift discovered and handled:

- missing `lead_demo_invitations`;
- missing `public_preview_publications`;
- missing service-role CRUD grants on DCA fixture source tables;
- `pgcrypto` installed under `extensions` instead of `public`;
- previews require a matching succeeded build job;
- staging preview columns are stricter than the earlier production CSV export.

All corrections are forward-only and repeatable. Existing staging records were not overwritten or deleted.

## 5. RLS and grants

Read-only staging poststate:

- all three DCA tables exist and have RLS enabled;
- publication and activation-link tables have forced RLS;
- two service-only policies exist;
- browser table grants: 0;
- browser DCA function grants: 0;
- service DCA function grants: 5;
- legacy invitation planner service execute grants: 0;
- `leads.customer_id` columns: 0;
- `leads.converted_customer_id` columns: 1.

## 6. Token storage and logging proof

- Entropy: 256 bits (`gen_random_bytes(32)`).
- Storage: only a lowercase 64-character SHA-256 token hash.
- Persistent activation URL: none.
- Persistent token-bearing HTML/text snapshot: none.
- `email_logs`, journey events and automation outbox writes by DCA-0: none.
- Browser access to activation tables/functions: none.
- Browser source scan found no literal service-role key and no activation/preview token logger.
- Certification used suppress mode with zero provider calls and zero Netlify requests.
- Returned WhatsApp path was exactly `/start/{opaque_token}`.
- The open RPC returned no access or refresh token; the activation token alone never created a portal session.

## 7. Idempotency and ownership proof

The staging run proved all 18 assertions in `STAGING_CERTIFICATION.json`, including:

- one invitation per canonical key;
- one live token per invitation;
- repeat invite returns the existing invitation/link and no raw token;
- rotation revokes the previous token;
- revoked and expired tokens cannot open;
- wrong email is rejected;
- a customer-B preview/publication cannot be bound to customer A;
- existing-account activation requires matching auth user/profile/customer;
- no duplicate customer, project or auth user is created;
- ZIP and Factory links resolve to their exact preview and publication;
- converted-customer ownership uses only `converted_customer_id`.

## 8. Fixture matrix

| Fixture | Created | Result |
|---|---:|---|
| New lead without customer | 1 | Bound to isolated demo_user; no account activation |
| Converted customer lead | 2 | Customer A/B ownership proven |
| ZIP preview | 1 | Correct build/preview/publication binding |
| Factory preview | 2 | Correct customer/project binding |
| Active publication | 3 | Service-only and version-bound |
| Demo user | 1 | Temporary auth/profile fixture |
| Customer account | 2 | Temporary existing-account fixtures |
| Activation states | 5 | active, activated, expired, revoked, rotated |
| Repeated invite | 1 | No duplicate invitation/link/token |

Every fixture, including auth users and three earlier interrupted test journeys, was removed. Final read-only counts are zero for all fixture object types.

## 9. Tests

- Targeted DCA-0 tests: **10 passed, 0 failed**.
- Real staging certification: **18 assertions passed**, cleanup passed.
- Migration repeat execution on staging: **passed**.
- Full repository suite: **451 passed, 7 failed** out of 458.

The seven failures are historical Foundation/governance assertions that already conflict with later migrations and current project-state documentation. They do not exercise DCA-0, but the requested release rule says to stop at every failed gate. They were not rewritten because that would alter unrelated frozen governance scope.

## 10. Production data not changed

- No production DDL.
- No production migration.
- No production auth action.
- No production invitation.
- No production configuration change.
- No provider or Mollie call.
- No production deploy.
- The active orphan publication remains unchanged pending a green full-suite gate.

## 11. Rollback and failure behavior

- Migration attempts are transaction-bounded; the first staging failure rolled back completely.
- Every activation operation rejects ownership drift before mutation.
- Rotation is atomic with new-token creation.
- Expiry and revoke fail closed.
- Fixture certification cleans up in dependency order, including on failure.
- The production repair is transaction-bounded and cannot commit unless exactly one locked candidate is changed and its preview remains byte-equivalent.
- No automatic production rollback is needed because the production repair was not run.

## 12. Remaining risks

- The full repository suite is not green due to seven unrelated historical governance tests.
- The production orphan remains active in the database until the prepared repair is separately allowed past the green-suite gate.
- DCA-1 provider delivery and `/start` user experience are intentionally not implemented. Platform access-log redaction must be proven when that route is deployed; DCA-0 made zero Netlify requests.

## 13. Decision

Staging proves the token-safe foundation, idempotency and isolation. The release nevertheless remains fail-closed because the complete test gate is red and the production orphan repair was therefore not executed.

`STOPPED_DCA_0_CLOSURE_NOT_PROVEN`
