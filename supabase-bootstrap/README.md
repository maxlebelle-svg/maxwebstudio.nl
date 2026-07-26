# Foundation F0-e local bootstrap root

This directory is a local-only proof-of-concept for the persistent bootstrap-root successor to model C. It is not a deployment root.

- `supabase/migrations/` permanently contains one byte-identical, checksum-controlled baseline materialization. It contains no historical migration line.
- The normal project root and historical migrations are never copied into the bootstrap root.
- `config/local-profile.sql` provides only the roles, schemas, extension and empty placeholders required by the baseline.
- Every command requires `F0E_LOCAL_ONLY=1`, rejects remote Supabase context, and requires an explicit workspace under `/private/tmp/f0e-`.
- Common migrations are supplied from another temporary root and must have a version at or after `20260721000000`.

The authoritative baseline remains `../supabase/migrations/00000000000000_authoritative_baseline.sql` with SHA-256 `1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315` after the four evidence-approved F0-h column corrections.

Future common migrations have the proposed source of truth in `../supabase-common/migrations/`. The validator requires deterministic byte identity in both execution views. These scripts select, validate, stage, verify and clean local fixtures; they do not link a project, contact a remote database, repair history, or deploy.
