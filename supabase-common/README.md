# Canonical common migrations

`migrations/` is the single source of truth for approved migrations after cutover `20260721000000`. R2-A authorizes the first product common migration, `20260721010000_harden_role_helper_search_paths.sql`.

Materialized copies are mechanical execution views, not editing locations. The checksum manifest and `supabase-bootstrap/scripts/dual-root-validator.mjs` are mandatory before every local or later approved remote run. Existing environments require a safe execution view that excludes the authoritative baseline and unapplied historical/future files.
