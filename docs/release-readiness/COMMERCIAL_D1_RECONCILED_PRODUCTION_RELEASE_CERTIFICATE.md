# Commercial D1 reconciled production release certificate

Status: `PASS_LOCAL_CANDIDATE`

This certificate covers one local-only Commercial D1 merge candidate on the reconciled production lineage. It does not authorize a push, pull-request change, deployment, database migration, email, signing action, payment, configuration change, or provider mutation.

## Identity

- Branch: `codex/commercial-d1-reconciled-production-release`
- First parent: `170df83245b60419ba986b5fef6ebdf00c4ccc74`
- First-parent tree: `6c48fddb538579cf8b971c101dc7df4dcf6dd4cd`
- Second parent: `4d225d6012c5f28f314b580a4472b4f4ebb282a8`
- Second-parent tree: `b524fdfbf60f7babbb19003384b901360ac6712e`
- Merge base: `0ea4f16bbbcba6b5113d5111fe194271a9f03cc8`
- Required commit subject: `Prepare Commercial D1 on reconciled production baseline`

The resulting commit and tree are recorded in the final handoff because a commit cannot contain its own future hash.

## Prior STOP and test resolution

The first integration attempt stopped before creating a branch because the two source lines did not contain byte-identical versions of `tests/admin-manual-preview-zip.test.js`:

- Reconciled production blob: `cf9cf3abbd2330bf72c23614b12f92e46c5ba7e9`
- Commercial D1 blob: `e1c610521ae7b295cb5ce6728a265c7422226aee`

The explicitly authorized resolution retained the first-parent blob exactly. It creates the representative ZIP in a unique operating-system temporary directory, uses only synthetic `Example Company` content for that fixture, and removes the directory in a `finally` block. No assertion was removed, skipped, weakened, or made conditional. No untracked or external customer ZIP was read or copied; the pre-existing tracked regression fixture and all unrelated assertions remained unchanged.

Post-resolution proof:

- Index blob: `cf9cf3abbd2330bf72c23614b12f92e46c5ba7e9`
- Difference from first parent for this file: none
- Hermetic ZIP tests: `10/10 PASS`, `0` failed, `0` skipped
- Temporary ZIP or `maxwebstudio-preview-zip-*` directory left behind: none

## Merge and catalog resolution

The merge used `--no-ff --no-commit`, with no rebase, cherry-pick, or squash. Git reported only the authorized ZIP-test conflict. `docs/release-readiness/PRODUCT_MIGRATION_CATALOG.json` merged automatically and was then validated semantically.

The unified catalog contains 22 unique release records:

- 15 reconciled production, partner, Factory, and governance records;
- 7 Commercial D1 records;
- no duplicate manifest path;
- no duplicate fileset path;
- valid JSON.

No migration file was edited during integration.

## Base-relative release manifest

Against the first parent, the candidate contains the bounded Commercial D1 closure already enumerated file-by-file in `COMMERCIAL_D1_CLEAN_RELEASE_CERTIFICATE.md`, with these integration rules:

- `tests/admin-manual-preview-zip.test.js` is not a base-relative change because the stricter certified blob already exists in the first parent;
- the unified `PRODUCT_MIGRATION_CATALOG.json` keeps all first-parent governance and adds the seven D1 registrations exactly once;
- this integration certificate is the sole newly authored evidence file;
- the 30 certified Factory/Food production-lineage items remain inherited unchanged from the first parent;
- the full D1 runtime, admin integration, tests, evidence, preflight route, absence guard, and seven migrations remain inherited byte-for-byte from the second parent.

Against the second parent, the only content differences before this certificate were:

- `docs/release-readiness/PRODUCTION_MAIN_LINEAGE_RECONCILIATION_CERTIFICATE.md` from the reconciled production lineage;
- the stricter certified blob of `tests/admin-manual-preview-zip.test.js`.

The merged migration catalog was already semantically identical to the certified D1 catalog and therefore has no second-parent diff.

No D2, Domain Center, onboarding-engine, Release Center, broad adminruntime, Food/Silverado development, dependency change, Netlify configuration change, or other outside-scope development was introduced.

## Seven immutable Commercial D1 migrations

| Order | Version | SHA-256 |
|---:|---|---|
| 1 | `20260730150000` | `a6f043620b7bc1e56dc974f0d29631b4fe139aeef2a445342745e5d016a3513e` |
| 2 | `20260730170000` | `c5cfd06648d52225b1833a6214cb1e3f983734199273294824941afbc6dbf89c` |
| 3 | `20260730223000` | `be3a84c026da82650fae95a2d33fc7706c21d84835fc09145838857810c8128c` |
| 4 | `20260731100000` | `facbccb7d4fe014c24922f22bb18255c10a0e59bfaceccd0691376aaec2ae58f` |
| 5 | `20260731190000` | `5cdb759417ef3c68cf4d81da5ed9cc80cefaa994e654167de320ca44f222a99f` |
| 6 | `20260731200000` | `c9c98e69cb7ac1bbebedb7d13bd43f7b18b51a025ec2637a2cbe416736f16a35` |
| 7 | `20260731213000` | `bdc3b1a612dc34225e46d649a4fcdf09a5d13b31091cc553d39beb690692e4f6` |

All seven files are absent from the reconciled production first parent and byte-identical to the Commercial D1 second parent.

## Certification results

- Hermetic ZIP test: `10/10 PASS`.
- Commercial D1, migration, rollback, RLS, tenant-isolation, preflight, and absence-guard set: `130/130 PASS`.
- Factory, Production Gate, Food/Silverado, partner, and governance set: `82/82 PASS` (minimum required: 67).
- Migration catalog and release-governance validation: `14/14 PASS`.
- Complete repository regression suite: `1640/1640 PASS`, `0` failed, `0` skipped.
- Local Netlify production-context build: `PASS`.
- Netlify Build: `36.2.3`, offline mode.
- Existing duplicate `customerId` warning: unchanged; `functions/_website-factory-core.js` has blob `297335178eae8d79ed7fa89cc7ed5549cb1bd655`, identical in both parents and the candidate.

The staged-diff scan found only expected environment-variable names and deliberately fake secret-leak test values. No credential, token, database URL, customer record, or personal-data payload was added. No unexpected temporary file remains in the worktree.

## Read-only external identity checks

- `origin/main`: `c51b28222471e78a8ecb1cf38f08d3067328568d`
- Draft PR `#14`: open, unmerged, head `4d225d6012c5f28f314b580a4472b4f4ebb282a8`, base `main` at `c51b28222471e78a8ecb1cf38f08d3067328568d`
- Deploy Preview: `6a6de97896603100085d94d0`, ready, deploy-preview context, commit `4d225d6012c5f28f314b580a4472b4f4ebb282a8`
- Production deploy reference: `6a6b399fc4b2951a424037d2`, ready, production/main
- Staging deploy reference: `6a6d9858bd62e96cd1abaa4e`, ready, `maxwebstudio-staging`
- Commercial production migrations remain at the previously certified pre-release state `0/7`; no database or authenticated preflight action was performed during this integration.

## Scoped dirty-worktree exceptions

The pre-existing status report and two byte-identical detached Food-staging migration copies retained their previously certified status and SHA-256 values. They were not opened for dependency reuse, modified, copied, staged, committed, moved, or removed. They are not part of this release manifest.

## External effects

- Existing source branches: unchanged.
- PR #14 and Deploy Preview: unchanged.
- Production and staging: unchanged.
- Supabase and database state: unchanged.
- Netlify configuration and provider state: unchanged.
- Email, Signhost, Mollie, DNS, Storage, and other providers: unchanged.
- No push, deploy, rollback, remote SQL, migration execution, database write, session action, or provider mutation occurred.

This certificate authorizes no further action.
