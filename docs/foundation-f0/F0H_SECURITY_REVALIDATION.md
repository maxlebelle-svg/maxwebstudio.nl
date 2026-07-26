# Foundation F0-h — Security Revalidation

Status: **PASS / NO REGRESSION**

Fresh local catalog results after applying the corrected baseline:

| invariant | result |
|---|---:|
| unsafe included SECURITY DEFINER search paths | 0 |
| PUBLIC EXECUTE grants | 0 |
| anon direct public-table grants | 0 |
| PUBLIC policy roles | 0 |
| public tables without RLS | 0 of 29 |
| forced-RLS tables | 0 |
| policies on `storage.objects` | 0 |
| test buckets | 0 |

`relationship-assets` remains private with an 8 MiB (`8388608`) file-size limit. `lead_intake_idempotency` remains RLS-enabled with forced RLS disabled, seven validated constraints and no broadened grant or policy. No Auth rows, Storage object rows, application rows or seed data were retained.
