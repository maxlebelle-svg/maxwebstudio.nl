# Governed staging migration root — certification evidence

Date: 29 July 2026  
Environment: `maxwebstudio-test`  
Locked project ref: `xlxpuuycigeqhgxqtzni`  
Branch: `codex/factory-hub-staging-certification`

This report records the certification and database application completed before the application deployment. Deployment identity, visual smoke results and the single internal test-mail result belong to the release report and must not be backfilled into this pre-deployment evidence.

## Decision

The permanent staging migration line is certified and both authorized schema migrations were applied successfully to the locked staging project. No production or Silverado target was used.

Database status: `PASS_GOVERNED_STAGING_MIGRATIONS_APPLIED`

Application status at this evidence point: `PENDING_EXACT_COMMIT_STAGING_DEPLOYMENT`

## Permanent structure

```text
supabase-environments/staging/
├── README.md
├── migration-manifest.json
├── target-project-ref
├── run.zsh
├── supabase/
│   ├── config.toml
│   └── migrations/                 # 32 applied + 2 release candidates
└── release-steps/factory-hub/
    ├── target-project-ref
    └── supabase/
        ├── config.toml
        └── migrations/             # 32 applied + Factory Hub only
```

Supabase CLI `2.108.0` was used through its global `--workdir` option. Both workdirs are permanently locked to staging. The runner requires the explicit environment lock `MWS_STAGING_PROJECT_REF=xlxpuuycigeqhgxqtzni`, verifies the local CLI link, and exposes only `list`, `dry-run`, `apply-factory` and `apply-food`. It refuses production and Silverado refs, missing target locks, `--include-all`, history repair, reset and write-capable `db push` requests.

## Manifest and byte provenance

The machine-readable source of truth is `supabase-environments/staging/migration-manifest.json`.

- Applied before this release: 32 versions.
- Pending at the certified dry-run: exactly 2 versions.
- Excluded from this staging lineage: 38 versions: 31 older provider-blocking migrations and 7 later feature-line migrations.
- Canonical root: 34 SQL files.
- Factory-only release step: 33 SQL files.
- General migration-root fingerprint remained `90544baa57b6c99e3fd65411432f1f861e1de079bc99fc0172ad338d51cbfa39`.

Every applied and pending entry records its filename, SHA-256, source commit and Git blob ID. The governance validator proves each copy byte-identical to that historical Git blob.

### Applied versions before release

```text
20260710160200  20260710170500  20260711133000  20260712123000
20260712170000  20260718120000  20260718222000  20260719160000
20260719170000  20260719180000  20260719190000  20260720160000
20260720200000  20260721010000  20260721020000  20260721030000
20260721040000  20260721050000  20260722125000  20260722126000
20260724110000  20260724120000  20260724130000  20260726200000
20260726201000  20260726202000  20260726203000  20260726204000
20260726205000  20260726210000  20260727090000  20260727120000
```

### Authorized release candidates

| Order | Version and file | SHA-256 | Source commit | Git blob |
| --- | --- | --- | --- | --- |
| 1 | `20260729120000_factory_hub_projects.sql` | `070243fb04f11a2828950e64074684332ac4549666ae37a0324ea000bdc11638` | `5e252e6ec1af3d3790bd6069692f3e13907e5431` | `899db217d151cddd4be5a1537e4a7b906177f70c` |
| 2 | `20260729170000_food_demo_bundles.sql` | `010c01ffc9c2ac2cd01d85196a93c27d2a8cf5dde5ac5d629350ef7a620b56e2` | `5312d927fde5518f7e0be4f3a636386b65e617ab` | `feca2163a07f18dbe5d454f4a22d608caefc61b3` |

The complete excluded list, its reasons and original feature-line classification are retained in the manifest. No excluded file exists in either execution root and no excluded version was added to remote history.

## Read-only certification and exact dry-run

Before any database write, the canonical migration list showed 32 matched local/remote versions and only the two release candidates as local-only. The normal provider-supported dry-run returned exactly:

```text
Would push:
20260729120000_factory_hub_projects.sql
20260729170000_food_demo_bundles.sql
```

The permanent Factory-only workdir independently returned exactly:

```text
Would push:
20260729120000_factory_hub_projects.sql
```

No `--include-all`, migration repair, raw SQL write, temporary migration hiding or manual history mutation was used.

## Sequential database application

Factory Hub was applied first with the official linked `migration up` route from the Factory-only workdir. Its poststate was validated before Food Demo Bundle was allowed to proceed. A second canonical dry-run then showed Food Demo Bundle as the sole remaining migration. Food Demo Bundle was applied with the same official linked route.

Remote history after application contains the original 32 versions plus exactly:

```text
20260729120000  20260729120000
20260729170000  20260729170000
```

All 34 canonical versions now match local and remote history. None of the 38 excluded versions was registered or executed.

## Database poststate

Factory Hub:

- `factory_projects` exists with primary-key, relationship/update and type/status indexes.
- RLS is enabled; no client policy exists.
- Table access remains limited to `postgres` and `service_role`.

Food Demo Bundle:

- `food_demo_bundles`, `food_demo_bundle_dispatches`, `food_demo_bundle_events` and `food_demo_bundle_rate_limits` exist.
- RLS and forced RLS are enabled on all four tables.
- Expected foreign keys connect only to the governed `leads`, `customers`, `factory_projects` and `profiles` relationships.
- No client policies exist; table access remains limited to `postgres` and `service_role`.
- `consume_food_demo_bundle_rate_limit` is `SECURITY DEFINER`, has an empty `search_path`, and execute access is limited to `postgres` and `service_role`.
- `food_demo_bundle_events_append_only` has an empty `search_path`, restricted execute access and is attached through the append-only trigger.

The new tables contained zero rows immediately after migration.

## Existing-data invariance

Read-only counts were identical immediately before and after both migrations:

| Relation | Before | After |
| --- | ---: | ---: |
| `auth.users` | 58 | 58 |
| `storage.objects` | 5 | 5 |
| `storage.buckets` | 3 | 3 |
| `leads` | 4 | 4 |
| `customers` | 15 | 15 |
| `website_build_jobs` | 5 | 5 |
| `website_preview_versions` | 4 | 4 |

Both candidate SQL files are schema-only and contain no seed, Auth or Storage mutation. Catalog and data checks were performed in explicit read-only transactions.

## Automated validation

- Governed staging-root tests: **26/26 PASS**.
- Updated Foundation suite: **63/63 PASS**.
- Food Demo Bundle and relevant regressions: **138/138 PASS**.
- Website Factory suite: **245/245 PASS**.
- Static validator: `PASS_GOVERNED_STAGING_ROOT_STATIC`.
- `git diff --check`: PASS.

The four updated Foundation assertions now require proven historical source, exact checksum, correct staging classification and no re-execution. Security and governance coverage was not reduced.

## Isolation boundaries

Only `maxwebstudio-test` / `xlxpuuycigeqhgxqtzni` was linked and changed. The execution runner fail-closes for both forbidden refs:

- Production: `yxxahurphdbblkuxoeje`.
- Silverado Food Demo Cloud: `obprooubcbnfgouytvrw`.

Silverado remained frozen at:

- Runtime commit: `7622d884f822fabe68198c9bc9fccdbaf5924b6c`.
- Active deploy: `6a699e15ccf9a2902dd27606`.
- Evidence commit: `3d0a222df0376a99aaa07d26442fe2b86b8ed91c`.

## Rollback position

These are forward-only additive schema migrations. A rollback must therefore be a separately reviewed compensating migration; migration history must never be repaired or rewritten. Before application data exists, the smallest database compensation is to revoke access and remove only the five newly introduced, empty tables and their owned functions/triggers in dependency order. Once application data exists, preserve it and disable application entry points first. Application deployment can independently be rolled back to the previously proven staging deploy.

Production remains a separate, explicitly approval-gated release. This evidence does not authorize production, Silverado changes or external customer mail.
