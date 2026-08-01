# Production/main lineage reconciliation certificate

Status: `PASS_LOCAL_RECONCILIATION`

This certificate covers one local-only reconciliation. It does not authorize a push, pull request change, deployment, database migration, provider action, email, payment, signing request or external smoke test.

## Git identity

- First parent / certified production baseline: `0ea4f16bbbcba6b5113d5111fe194271a9f03cc8`
- First-parent tree: `6019d21bb46857f3136780183e9b62eadf2cb08a`
- Second parent / current `origin/main`: `c51b28222471e78a8ecb1cf38f08d3067328568d`
- Second-parent tree: `b00848275cc0fdf8d698197137f123c22bdbf5ae`
- Merge base: `9897af9559b61f0c08582f91bdca9fd9eb949319`
- Local branch: `codex/production-main-lineage-reconciled`
- Commit subject: `Reconcile production lineage with main governance`

The result commit and tree are reported after Git creates the merge commit; they are intentionally not self-referenced here.

## Preserved commit lineage

Certified production commits, in first-parent order:

1. `fb771f46e31eccc96a24a312bb97f962689e06b2` — Release Factory Production Gate from production base
2. `7ce94327a8a7782a6b2bcdce94be0e8315c36964` — Add Food Factory demo card
3. `ac56749936d20abc5a50a5f082dbecb49876901d` — Add dual Food demo presentation
4. `588a7e2656d42e3793ad7205df4ed62547529312` — Recognize saved Silverado demo preview
5. `0ea4f16bbbcba6b5113d5111fe194271a9f03cc8` — Improve restaurant demo sharing card

Preserved `main` governance commits:

1. `7ec426733fbfd200c10c6a80b986e5a6b898ef8a` — catalog partner onboarding activation migration
2. `c51b28222471e78a8ecb1cf38f08d3067328568d` — merge the governance-only change into `main`

The `main` side changes only `PRODUCT_MIGRATION_CATALOG.json` and the partner activation `MANIFEST.json` and `FILESET.json`. Those records already existed on the production side. The reconciled catalog therefore remains byte-identical to the first parent while preserving both the partner and Factory Production Gate records.

## Conflict resolution

The only merge conflict was `docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json`. It was resolved semantically: the partner onboarding activation record and the Factory Production Gate record are both retained exactly once. No migration file, checksum, runtime file or release status was changed. JSON and migration-governance tests validate the result.

## Hermetic regression fixture

The earlier certification stop was caused solely by `tests/admin-manual-preview-zip.test.js` reading an unversioned local customer ZIP. No customer file was opened, copied, recreated at its old path or committed.

The correction was informed by the isolated test-only change reviewed in `4d225d6012c5f28f314b580a4472b4f4ebb282a8`, but was not copied byte-for-byte: this version is stricter. It uses only generic fictional content, creates a unique directory under the operating-system temporary directory, writes an in-memory generated ZIP there, preserves the root-index, asset-presence and `.htaccess`-omission assertions, and removes the temporary directory in a `finally` block. It adds no dependency, runtime change, network call, conditional pass, skip, todo or weakened assertion.

Exact test-only diff:

- add the built-in `node:os` import;
- replace the external customer ZIP read with a generated `representative-site.zip`;
- fixture contents: generic `index.html`, generic `assets/company-logo.jpg` and ignored `.htaccess`;
- retain the three functional assertions;
- guarantee recursive cleanup after the assertion path.

## Machine-readable reconciliation manifest

```json
{
  "schemaVersion": 1,
  "firstParent": "0ea4f16bbbcba6b5113d5111fe194271a9f03cc8",
  "secondParent": "c51b28222471e78a8ecb1cf38f08d3067328568d",
  "mergeBase": "9897af9559b61f0c08582f91bdca9fd9eb949319",
  "productionCommits": [
    "fb771f46e31eccc96a24a312bb97f962689e06b2",
    "7ce94327a8a7782a6b2bcdce94be0e8315c36964",
    "ac56749936d20abc5a50a5f082dbecb49876901d",
    "588a7e2656d42e3793ad7205df4ed62547529312",
    "0ea4f16bbbcba6b5113d5111fe194271a9f03cc8"
  ],
  "mainGovernanceCommits": [
    "7ec426733fbfd200c10c6a80b986e5a6b898ef8a",
    "c51b28222471e78a8ecb1cf38f08d3067328568d"
  ],
  "restoredAgainstMain": [
    "docs/release-readiness/FACTORY_PRODUCTION_GATE_RELEASE_MANIFEST.json",
    "docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json",
    "docs/release-readiness/factory-production-gate-product-migrations/FILESET.json",
    "docs/release-readiness/factory-production-gate-product-migrations/MANIFEST.json",
    "functions/_factory-blueprints.js",
    "functions/_factory-production-gate-suppliers.js",
    "functions/_factory-production-gate.js",
    "functions/admin-factory-projects.js",
    "functions/admin-preview-publication.js",
    "functions/services/leadDemoInvitationTemplate.js",
    "public/admin-demo-sites.html",
    "public/admin-factories.html",
    "public/admin/config/sidebar-navigation.js",
    "public/admin/styles/factory-hub.css",
    "public/admin/ui/factory-hub.js",
    "public/assets/food/silverado/silverado-demo-qr.svg",
    "public/styles.css",
    "scripts/factory-production-gate-local-validation.zsh",
    "supabase/migrations/20260729120000_factory_hub_projects.sql",
    "supabase/migrations/20260729200000_factory_production_gate.sql",
    "supabase/migrations/20260730120000_harden_factory_gate_generation_and_audit.sql",
    "tests/admin-sidebar-dashboard-pilot.test.js",
    "tests/demo-sites-food-presentation.test.js",
    "tests/factory-hub.test.js",
    "tests/factory-production-gate-release-scope.test.js",
    "tests/factory-production-gate.test.js",
    "tests/fixtures/factory-production-gate-functional.sql",
    "tests/fixtures/factory-production-gate-generation-functional.sql",
    "tests/food-demo-share-email.test.js",
    "tests/helpers/admin-page-inventory.js"
  ],
  "localOnlyChangesAgainstProductionBaseline": [
    "tests/admin-manual-preview-zip.test.js",
    "docs/release-readiness/PRODUCTION_MAIN_LINEAGE_RECONCILIATION_CERTIFICATE.md"
  ],
  "conflictResolutions": [
    "docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json"
  ],
  "excludedCommercialD1": true,
  "externalExecutionAuthorized": false
}
```

## Certification results

- Corrected ZIP test file: `10/10 PASS`, `0` failed, `0` skipped.
- Factory, Production Gate, Food/Silverado and governance set: `67/67 PASS`, `0` failed, `0` skipped.
- Full regression set: `1510/1510 PASS`, `0` failed, `0` skipped.
- Migration catalog and release-governance validation: `14/14 PASS`, `0` failed, `0` skipped.
- Local Netlify production build: `PASS` with `@netlify/build 36.2.3`, offline mode, production context.
- The build reported the pre-existing duplicate `customerId` warning in `_website-factory-core.js`; that runtime file is byte-identical to the certified first parent and is not changed by this reconciliation.

## Diff and exclusion gates

Against the certified production first parent, the final tree changes only the hermetic test and this certificate. No runtime file differs. Against `origin/main`, it restores the exact thirty certified Factory/Food items, adds the hermetic test correction and this certificate.

The seven Commercial D1 migrations, Commercial D1 runtime, Commercial D1 release certificate, D2 functionality, customer files, credentials, tokens, secrets and personal data are absent from the reconciliation diff. No lockfile, dependency, Netlify configuration or database configuration is changed.

No production, staging, Supabase, Netlify site, pull request, preview, Silverado environment or external provider was changed by this local certification.
