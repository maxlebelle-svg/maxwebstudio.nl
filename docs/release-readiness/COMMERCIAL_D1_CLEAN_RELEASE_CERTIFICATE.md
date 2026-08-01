# Commercial D1 clean production release certificate

Status: `PASS_LOCAL_CANDIDATE`

This certificate describes the one clean Commercial D1 candidate assembled in the isolated worktree. It does not authorize a deploy, database migration, mail, payment, signing action, or other provider mutation.

## Identity

- Base commit: `0ea4f16bbbcba6b5113d5111fe194271a9f03cc8`
- Base tree: `6019d21bb46857f3136780183e9b62eadf2cb08a`
- Source commit: `c8f7410fc75915936b23f6a7f9c008f4c6877cde`
- Source tree: `48fbd74ee999f370d4b793d4ad8734000d994c8f`
- Branch: `codex/commercial-d1-clean-production-release`
- Result commit: the single direct child of the base commit with subject `Prepare clean Commercial D1 production release`; its immutable hash is recorded in the final handoff after Git creates it.
- Result tree: the tree of that result commit; its immutable hash is recorded in the final handoff after Git creates it.
- Later rollback deploy reference only: `6a6b399fc4b2951a424037d2`

Git cannot embed a commit's own future hash in a file inside that commit. The final handoff is therefore the authoritative pairing of this certificate with the resulting commit and tree.

## Dependency-closure decision

The fifteen commits between the base and source were inspected individually. Their combined 69-file diff is the bounded Commercial D1 implementation. No Food, Silverado, onboarding-engine, Domain Center, Release Center, broad adminruntime, or D2 activation file occurs in that diff. One additional test-only correction removes an untracked customer-ZIP dependency from the full regression suite. This certificate is the only generated release-evidence file.

## Exact included manifest and necessity

### Commercial catalog and checkout compatibility

- `betalen.html` — keeps the root checkout mirror on the central server-side commercial catalog.
- `public/betalen.html` — keeps the published checkout on the same catalog and fixed deposit rules.
- `functions/_commercial-catalog.js` — canonical versioned price definitions and deterministic calculations.
- `functions/_legacy-commercial-order.js` — isolates the legacy order contract from the new D1 contract.
- `functions/commercial-catalog.js` — read-only public catalog endpoint.
- `functions/commercial-order.js` — keeps existing order creation compatible with the canonical catalog.
- `functions/mollie-products.js` — reads product display data from the canonical catalog without activating D2.
- `functions/product-catalog.js` — removes duplicate price ownership and delegates to the canonical catalog.
- `tests/phase-b-commercial-offers.test.js` — proves catalog, prices, fixed deposits, immutable evidence and provider boundaries.

### Offer service and admin API

- `functions/admin-commercial-offers.js` — authenticated Composer API and bounded D1 actions.
- `functions/services/commercialDocumentRegistry.js` — deterministic document-version binding used by immutable offers.
- `functions/services/commercialOfferService.js` — server-side offer composition, totals, snapshots and lifecycle control.
- `functions/services/commercialOfferValidityService.js` — immutable server-side fourteen-day validity contract.
- `tests/fixtures/phase-c-commercial-bootstrap.sql` — synthetic Composer schema prerequisite fixture.
- `tests/fixtures/phase-c-commercial-functional.sql` — synthetic Composer runtime fixture.
- `tests/fixtures/phase-bc-composer-read-fix-functional.sql` — service-role read regression fixture.
- `tests/phase-bc-composer-read-fix.test.js` — proves safe read failure and repaired grants.

### Offer Composer frontend and admin integration

- `public/admin-offer-composer.html` — integrated Composer page and accessible step layout.
- `public/src/offer-composer-core.mjs` — deterministic browser-side selection state without price authority.
- `public/src/offer-composer.css` — responsive Composer presentation and modal layout.
- `public/src/offer-composer.js` — relationship context, drafts, previews and guarded D1 actions.
- `public/admin-dashboard.html` — entry point from the admin dashboard.
- `public/admin-demo-sites.html` — entry point with selected demo context.
- `public/admin-klanten.html` — entry point with selected customer context.
- `public/admin-sales.html` — entry point with selected lead context.
- `public/admin-website-factory.html` — entry point with Factory context.
- `public/admin-nieuwe-opdracht.html` — replaces the duplicate legacy proposal workflow with Composer navigation.
- `public/admin/config/sidebar-navigation.js` — adds the bounded `Voorstellen` navigation item.
- `public/admin/ui/global-command-palette.js` — exposes the same protected Composer route through global navigation.
- `public/src/config/protectedRoutes.js` — keeps Composer behind the existing admin authentication boundary.
- `tests/phase-c-offer-composer.test.js` — proves context, pricing, preview, history, responsive UI and blocked provider actions.
- `tests/admin-sidebar-dashboard-pilot.test.js` — prevents sidebar/dashboard navigation regression.
- `tests/admin-sidebar-design-system.test.js` — prevents shared sidebar layout regression.
- `tests/helpers/admin-page-inventory.js` — registers the new protected page in shared admin tests.

### D1 mail preview, definitive staging flow and interest lifecycle

- `functions/commercial-offer-interest.js` — token-hash-based, expiring, non-binding interest endpoint.
- `functions/services/commercialOfferMailService.js` — server-rendered preview/test/definitive mail content and QR contract.
- `functions/admin-email-logs.js` — prevents replay of sensitive definitive proposal bodies.
- `public/voorstel-interesse.html` — safe public interest page with validity display.
- `tests/phase-d1-commercial-offer-mail.test.js` — proves validity, mail ordering, redaction, idempotency, revoke/resend and environment gating.

### Fixed production preflight and release guard

- `functions/admin-commercial-postgrest-preflight.js` — super-admin-only fixed GET probes for `profiles` and `customers`, both `limit=0`.
- `scripts/commercial-release-absence-guard.js` — read-only `pg_policy` guard for the certified `leads_demo_read = ABSENT` contract.
- `tests/admin-commercial-postgrest-preflight.test.js` — proves fixed resources, no response bodies, authorization, rate limiting and secret-free errors.
- `tests/commercial-release-absence-guard.test.js` — proves project/checksum identity and fail-closed catalog-only behavior.
- `docs/release-readiness/COMMERCIAL_ABSENCE_CONTRACT_AND_PREFLIGHT.md` — records the absence contract and prefix history-recovery decision.

### Seven immutable migrations

- `supabase/migrations/20260730150000_commercial_offer_foundation.sql` — creates the six core commercial evidence tables, RLS, immutability and bounded RPCs.
- `supabase/migrations/20260730170000_composer_service_role_read_fix.sql` — grants the bounded service-role reads required by Composer.
- `supabase/migrations/20260730223000_commercial_offer_phase_d1_mail.sql` — adds dispatch and interest-token tables and D1 RPCs.
- `supabase/migrations/20260731100000_harden_commercial_offer_interest_security.sql` — hardens token lifecycle, redaction and `interested` status.
- `supabase/migrations/20260731190000_harden_commercial_offer_child_read_scope.sql` — scopes child-table reads to the owning relationship.
- `supabase/migrations/20260731200000_harden_commercial_offer_sales_assignment_rls.sql` — centralizes bounded sales-assignment checks.
- `supabase/migrations/20260731213000_harden_leads_demo_read_policy.sql` — enforces the certified absence of the unsafe blanket demo-lead policy.
- `tests/commercial-offer-child-read-scope.test.js` — proves child-table tenant and assignment boundaries.
- `tests/commercial-offer-customer-rls-leads-privilege.test.js` — proves customer isolation without customer access to leads.
- `tests/leads-demo-read-policy-hardening.test.js` — proves every forward/rollback prefix retains the ABSENT contract.

### Migration release evidence

- `docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json` — registers the exact forward-only migration sequence.
- `docs/release-readiness/phase-b-commercial-foundation/FILESET.json` — foundation file inventory.
- `docs/release-readiness/phase-b-commercial-foundation/MANIFEST.json` — foundation certification evidence.
- `docs/release-readiness/phase-bc-composer-read-fix/FILESET.json` — Composer read-fix inventory.
- `docs/release-readiness/phase-bc-composer-read-fix/MANIFEST.json` — Composer read-fix evidence.
- `docs/release-readiness/phase-d1-commercial-offer-mail/FILESET.json` — D1 mail inventory.
- `docs/release-readiness/phase-d1-commercial-offer-mail/MANIFEST.json` — D1 mail evidence.
- `docs/release-readiness/phase-d1-interest-security-hardening/FILESET.json` — interest-hardening inventory.
- `docs/release-readiness/phase-d1-interest-security-hardening/MANIFEST.json` — interest-hardening evidence.
- `docs/release-readiness/phase-d1-child-read-scope-hardening/FILESET.json` — child-scope inventory.
- `docs/release-readiness/phase-d1-child-read-scope-hardening/MANIFEST.json` — child-scope evidence.
- `docs/release-readiness/phase-d1-customer-rls-leads-privilege-repair/FILESET.json` — customer-RLS repair inventory.
- `docs/release-readiness/phase-d1-customer-rls-leads-privilege-repair/MANIFEST.json` — customer-RLS repair evidence.
- `docs/release-readiness/phase-d1-leads-demo-read-policy-hardening/FILESET.json` — absence-policy inventory.
- `docs/release-readiness/phase-d1-leads-demo-read-policy-hardening/MANIFEST.json` — absence-policy evidence.

### Clean-worktree regression reproducibility

- `tests/admin-manual-preview-zip.test.js` — replaces a dependency on an untracked customer ZIP with a synthetic in-memory ZIP, preserving the same `.htaccess` exclusion assertion without copying customer data.

### Generated certificate

- `docs/release-readiness/COMMERCIAL_D1_CLEAN_RELEASE_CERTIFICATE.md` — this exact scope, test and release certificate.

## Explicit exclusions

- No Food or Silverado implementation.
- No onboarding-engine implementation.
- No Domain Center implementation.
- No Release Center implementation.
- No broad adminruntime refactor.
- No D2 contract activation.
- No Signhost action or new Signhost integration.
- No live Mollie action or payment activation.
- No Netlify configuration, redirect, header or build-setting change.
- No Supabase environment file or project-link change.
- No customer ZIP, production credential, token, secret, local environment file or dirty-worktree exception.

## Migration integrity

| Order | Version | SHA-256 |
|---:|---|---|
| 1 | `20260730150000` | `a6f043620b7bc1e56dc974f0d29631b4fe139aeef2a445342745e5d016a3513e` |
| 2 | `20260730170000` | `c5cfd06648d52225b1833a6214cb1e3f983734199273294824941afbc6dbf89c` |
| 3 | `20260730223000` | `be3a84c026da82650fae95a2d33fc7706c21d84835fc09145838857810c8128c` |
| 4 | `20260731100000` | `facbccb7d4fe014c24922f22bb18255c10a0e59bfaceccd0691376aaec2ae58f` |
| 5 | `20260731190000` | `5cdb759417ef3c68cf4d81da5ed9cc80cefaa994e654167de320ca44f222a99f` |
| 6 | `20260731200000` | `c9c98e69cb7ac1bbebedb7d13bd43f7b18b51a025ec2637a2cbe416736f16a35` |
| 7 | `20260731213000` | `bdc3b1a612dc34225e46d649a4fcdf09a5d13b31091cc553d39beb690692e4f6` |

All seven files are byte-identical to the certified source. Every file has one explicit `begin` and `commit`. They create or harden Commercial D1 objects and do not alter Auth or Storage. Existing `profiles`, `leads`, `customers` and `auth.users` are referenced for keys and authorization but their data is not migrated. Migration 4 defines an admin-only D1 RPC that can later redact commercial definitive-mail bodies in `email_logs`; applying the migration performs no such data update. Migration 7 targets an existing `leads` policy name, but the mandatory guard proves it is absent, making its `drop policy if exists` a no-op under the certified release contract.

`MIGRATION_HISTORY_RECOVERY_MODE = SCHEMA_ROLLBACK_THEN_EXACT_PREFIX_HISTORY_REPAIR`

## Tests

- Targeted Commercial D1, migration, RLS, route and guard tests: `130/130 PASS`.
- Hermetic ZIP regression after removing the local customer-file dependency: `10/10 PASS`.
- Full repository regression suite: `1640/1640 PASS`, `0 failed`, `0 skipped`.
- The total remains the known baseline; no test was added or removed.

## Full-site build gate

- Command: local Netlify production-context build in offline mode.
- Netlify Build: `36.2.3`.
- Result: `PASS`.
- Functions bundled: all functions in the production artifact, including the Commercial D1 functions and fixed preflight route.
- Netlify configuration: byte-identical to the base.
- Redirects and headers: byte-identical to the base.
- Public Food/Silverado assets and runtime files: byte-identical to the base.
- Existing login, customer portal, Website Factory, Demo Sites, Factory Hub and Production Gate files outside the explicitly listed admin integration points: byte-identical to the base.
- Existing bundler warning: duplicate `customerId` key in `functions/_website-factory-core.js`; the file is byte-identical to the base and was not changed by this release.
- Canonical price assertions: Business Website EUR 995 excl. VAT, fixed deposit EUR 300 excl. VAT, Care Basic EUR 19.95 excl. VAT per month.

## Scoped dirty-worktree exceptions

The accepted status report in the main worktree and the two identical detached Food staging migration copies were hash-checked before this work. They were not opened for dependency reuse, copied, modified, staged or included here. Their unchanged hashes are checked again after the result commit.

## External effects

- Production: untouched.
- Staging: untouched.
- Supabase: untouched.
- Netlify provider state: untouched.
- Email, Signhost, Mollie and other providers: untouched.
- No push, PR, merge, tag, deployment, remote SQL or database write occurred.

## Required separate next gates

1. Git-traceable preflight deploy with a new explicit GO.
2. Explicit recovery-model decision.
3. Controlled application of exactly seven production migrations.
4. Post-migration schema, RLS, RPC and PostgREST evidence.
5. Commercial application deploy and bounded production smokes.
