# Governed staging migration root

This directory is the permanent Supabase CLI workdir for `maxwebstudio-test` (`xlxpuuycigeqhgxqtzni`). It is not a production migration root and must never be repointed.

Supabase CLI 2.108.0 supports a project-specific `supabase/config.toml`, the global `--workdir` flag, linked migration listing and `migration up --linked`. Official references:

- https://supabase.com/docs/reference/cli/install
- https://supabase.com/docs/reference/cli/supabase-migration
- https://supabase.com/docs/guides/deployment/managing-environments

## Permanent structure

- `supabase/migrations`: the 32 versions already registered on staging, followed only by Factory Hub and Food Demo Bundle.
- `release-steps/factory-hub`: the same applied history followed only by Factory Hub. CLI 2.108.0 applies every pending migration and has no one-migration limit, so this permanent step root is required for the separately gated first application.
- `migration-manifest.json`: checksums, Git provenance, applied/pending classifications and every excluded general-root migration.
- `run.zsh`: the only authorized release entrypoint. It checks both the committed target lock and the CLI link before any provider operation.

The CLI link metadata under `supabase/.temp` is local and ignored by Git. Link both workdirs only to staging:

```text
supabase --workdir supabase-environments/staging link --project-ref xlxpuuycigeqhgxqtzni
supabase --workdir supabase-environments/staging/release-steps/factory-hub link --project-ref xlxpuuycigeqhgxqtzni
```

Every runner invocation additionally requires:

```text
MWS_STAGING_PROJECT_REF=xlxpuuycigeqhgxqtzni
```

Supported actions are `list`, `dry-run`, `apply-factory` and `apply-food`. Raw arguments are not forwarded. Repair, reset and `--include-all` are rejected. A write-capable `db push` is not exposed; the only `db push` invocation is the fixed provider-supported `--dry-run` action.

No seed, Auth or Storage data is part of either workdir. The general `supabase/migrations` directory remains intact and is not an execution source for this staging release.
