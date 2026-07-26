# Foundation F0-h — Dual-root Revalidation

Status: **PASS**

Supabase CLI 2.108.0 revalidated both temporary local roots with baseline SHA-256 `1f5c2d03fad7e0b81ac82a00fef73ddbfbc85728e7f11684bdc89aed72bb9315`.

Bootstrap scenario:

1. corrected baseline applied to an empty local database;
2. history contained exactly `00000000000000` with 612 statements;
3. byte-identical common fixture `20260721000100` was added;
4. history contained exactly two rows, with three fixture statements;
5. second run reported up to date and history remained unchanged.

Existing scenario:

- genuine historical fixture `20260710160200` remained with 21 statements;
- only the same common fixture was added;
- baseline history rows remained 0;
- second run was clean and history remained unchanged.

The external validator accepted the restored fixture manifest and rejected intentional byte drift with exit status 1. Existing static negative tests also cover missing copies, pre-cutover versions, duplicate versions, symlinks, hidden files and temporary files. Both temporary clusters and fixture roots were removed by the cleanup trap; no fixture remains in any product migration root.
