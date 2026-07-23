# P0 send-lead environment fix — Node 24 rebuild

Status: `PASS_P0_SEND_LEAD_ENVIRONMENT_FIX_NODE24_REPACKAGED`

## Scope

The already validated `send-lead` environment-classification correction was rebuilt in a new isolated directory with exactly Node.js `v24.14.0`. No source behavior, database state, runtime configuration, or production system was changed.

## Build identity

- Build directory: `/private/tmp/maxwebstudio-p0-env-fix-node24-build`
- Build command mode: Netlify offline production-context build
- Node: `v24.14.0`
- npm: `10.9.3`
- pnpm: `11.9.0`
- Netlify CLI: `26.2.0`
- `@netlify/build`: `35.15.0`
- `functions/send-lead.js`: `443b7c2176e60737a945ac67b7c1eab8d788239dc02d094f18cbbfe886a33c49`

No `.nvmrc`, `.node-version`, `package.json` engine, release-source `NODE_VERSION`, or Node-22 pin was present. The exact Node 24 executable was selected explicitly before the build.

## Artifact proof

- Functions bundled: `70`
- `nodejs24.x`: `70`
- `nodejs22.x`: `0`
- Missing runtime entries: `0`
- Functions manifest SHA-256: `783b8091e3b8c06bba038475f921d8b0054a9ee84e778f21ff59fd635e1efeb3`
- Sorted runtime-entry SHA-256: `eadf2c46643f7be4583e7445d7be34fb200b6e93254f809ab9b584419d859fee`
- Function-artifact fileset SHA-256: `dcbebdbea8279b43c141780c0017b748d853c0431893f8aab4dd0ad8acd3643f`
- `send-lead.zip` SHA-256: `7749f341bac692338cd15dc5afb2553d8df1ea2513b967185cd64c1e5cc8aff0`

The bundled `send-lead` contains the approved resolver, retains the approved source hash, and contains no authoritative `env.CONTEXT` path.

## Validation

- Targeted and P0 tests: `92/92` PASS
- Complete JavaScript regression suite: `285/285` PASS
- Smoke-auth and suppress regressions: PASS
- Production configuration resolves to `production`: PASS
- Missing, unknown, or conflicting configuration fails closed before side effects: PASS
- Smoke/suppress resolves to `test`: PASS

## Safety outcome

- Production contacted: NO
- Application deployed: NO
- Production intake performed: NO
- Database changes performed: NO
- Configuration changes performed: NO
- Commit or push performed: NO

The isolated build directory is intentionally retained for the separately authorized deploy preflight.
