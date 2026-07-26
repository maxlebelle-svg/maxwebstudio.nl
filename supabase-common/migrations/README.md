# Approved common migrations

This is the immutable canonical source of truth for post-cutover common migrations.

- Cutover: `20260721000000`
- First approved migration: `20260721010000_harden_role_helper_search_paths.sql`
- Manifest: `COMMON_MIGRATION_MANIFEST.json`

Every file must be materialized byte-identically to the existing historical and permanent bootstrap roots and pass the external dual-root validator. Applied versions are append-only and may never be edited in place.
