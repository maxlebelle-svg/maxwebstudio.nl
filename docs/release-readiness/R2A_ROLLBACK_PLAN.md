# R2-A — Append-only Rollback Plan

Status: **COMPLETE / NO DOWN MIGRATION CREATED**

The exact pre-migration definitions and bodies remain immutable under `docs/release-readiness/evidence/r2a-current-functions/`. Their checksums are recorded in `R2A1_CURRENT_FUNCTION_DEFINITIONS_MANIFEST.json` and summarized below.

- `public.current_app_role()`: definition `45a9ddcb1c72838ce7a1a582e5c5e7538d6bc88916d16b6ab0b0eff966c41a88`; body `a69623e13ab16ce5ba417f06c9ebb3d10388394e525aaf2e623185ec4dd175ec`; prior `search_path=public`.
- `public.current_profile_id()`: definition `1f66124cf1e38d9ff83d5ecb4eca20812dfa5a07ccad9225473fabad92b2a942`; body `8c06dfcc2d1b272cd24b0f9910d3e5e5583f3faefbe6be79f829b3e1c2fa2d93`; prior `search_path=public`.
- `public.has_app_role(allowed_roles text[])`: definition `9681bdc521823365e81a6eeacf679f65d680ce5b8ad4997bcb3372bc5b51ef45`; body `8f3ee27c8a43947a3f3a506afd5e3873bfa3e123b83acb56258f7541b18b0a2f`; prior `search_path=public`.
- `public.is_admin_role()`: definition `6049eeb8295fa3428ee0b6fd49a8e261e8f40424c245196c5646a50eb5551b8f`; body `8c6b37db773c3fe2dbdfe1bafd3d90662207c51e798403e59cb83a131f087b37`; prior `search_path=public`.
- `public.is_demo_context()`: definition `d1a54739e29fcf1098b726275d4d3f9110f6b56a903e679d53bf01de0f1ad889`; body `eae49855559f0c332dd9cd64e59ea4f07043085ad59940319f44fc09db56f960`; prior `search_path=public`.
- `public.is_demo_record(record_is_demo boolean, record_environment text)`: definition `db3295e6a7b193a2d81d902ac4e21898fc92c816dc3057e1a73346f0e20d1423`; body `fc66eb47b335f51c6c81a5402c66e858c8137dc62fae80cf85162fdeab75ae92`; prior `search_path=public`.
- `public.is_staff_role()`: definition `ebadcac34a80d4bd364ef8346ff514f441013a38a371b970acd4ee2c67f71c8e`; body `678ea6785f0b472170a427a6aef054c53eb661065f3746f344ef5afd833cd1bd`; prior `search_path=public`.
- `public.owns_customer(target_customer_id uuid)`: definition `8890959bd97579f37ebb31e45ac72c4620952d10e1874cc9e52a21990eda4925`; body `2e28a9cb7a172bd73ca91eb0736c8d93d41692dcf23e2b47a7353a11b7207a16`; prior `search_path=public`.

If staging shows a reproducible caller, auth, tenant or latency regression attributable to R2-A, stop downstream work. Re-fingerprint all eight exact identities, owners and ACLs; require the R2-A post-state; then author a separately approved append-only compensation that recreates the eight captured definitions with `search_path=public`. Apply all eight together because they form one role/tenant helper chain, although an isolated function could be compensated only after dependency/caller proof and explicit approval.

Verification repeats body/metadata/ACL/policy fingerprints and functional fixtures. Owners and ACLs need no rollback because R2-A never changes them. No automatic down migration, history repair or historical-file edit is allowed.
