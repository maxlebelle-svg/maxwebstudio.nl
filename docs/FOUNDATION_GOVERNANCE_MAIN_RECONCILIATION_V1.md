# Foundation governance/main reconciliation V1

Status: **PASS**

This repository-only closure reconciles the modernized Foundation controls with production `main` at `73edb9885d5a5b2c1768f6030dad0ac40b964af1`. It performs no remote query, migration, deploy, fixture, auth action or provider call.

## Decisions

| Conflict | Evidence | Decision |
|---|---|---|
| `20260712123000_relationship_asset_library.sql` | F0C records remote-history checksum `c7081e…` as `verified_unchanged`; commit `480493a` later added 21 lines under the same version | `RESTORE_CANONICAL_HISTORICAL_BYTES` |
| nonce replay common outputs | `supabase-common` manifest names the canonical 6,583-byte source with checksum `a733d0…`; both outputs had one extra final LF | `FIX_BOOTSTRAP_COPY_TO_CANONICAL_BYTES` |
| F0-d pre-cutover directory assertion | The 2026-07-20 staging inventory was compared with the later reconstructed production lineage; production release evidence proves the 18-file current lineage | `UPDATE_TEST_TO_CORRECT_SCOPED_CONTRACT` |
| CP-A product fileset | The production reconstruction manifest proves four ordered CP-A migrations and exact checksums | `UPDATE_MANIFEST_TO_PROVEN_PRODUCT_RELEASE` |

The machine-readable companion file freezes the exact pre-cutover production lineage. Negative catalog, unknown-file, wrong-category, missing-copy and checksum-drift tests remain mandatory and unchanged.

## Final gates

- Former failure group and Foundation/R2-A targeted set: 51/51.
- Foundation/governance including negative manifest and byte tests: 63/63.
- DCA-0 plus DCA-1: 64/64.
- Explicit repository suite: 1,358/1,358.
- Full Node auto-discovery: 1,359/1,359.
