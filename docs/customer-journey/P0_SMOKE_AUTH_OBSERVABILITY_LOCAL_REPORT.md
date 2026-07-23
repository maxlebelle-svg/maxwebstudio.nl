# P0 smoke-auth observability hardening — local report

## Status

`PASS_P0_SMOKE_AUTH_OBSERVABILITY_LOCAL_STAGING_REVIEW_REQUIRED`

This phase performed local authoring and validation only. It made no staging, production, deployment, configuration, database, commit, push, provider, or Function-invocation action.

## Lineage and scope

- Basis commit: `7bdfb15d659a2f9da5d0816732ad19828bcb296d`
- Snapshot commit: `1da026be7edc6258a3ed6762c9bf3d9ceba89078`
- Parent release: the proven 37-file timeline-repair unit
- Parent manifest SHA-256: `fbaaf77c32929b6e1a22835a141c58c04d1c9522c6e7c035417a23d3a14d172f`
- Runtime changes: `functions/send-lead.js` and `functions/services/p0StagingSmokeControl.js`
- Configuration-contract templates: `.env.example` and `.env.local.example`
- Updated test: `tests/p0-staging-smoke-contract.test.js`
- Function entrypoints: 70 before and 70 after; the only changed entrypoint is `send-lead.js`
- Migrations `20260721040000` and `20260721050000`: unchanged and byte-identical across all three roots

## Closed observability gap

The previous implementation emitted `SMOKE_AUTH_INVALID` for both a malformed authorization header and a validly shaped header with a mismatching signature. It retained no safe client/server body or secret-version correlation. After destroying the one-time credential and raw request material, those paths could not be distinguished retrospectively.

The new contract assigns an exact internal category and validation stage before every fail-closed return. Public responses remain generic.

## Internal categories

- `SMOKE_AUTH_HEADER_MISSING`
- `SMOKE_AUTH_FORMAT_INVALID`
- `SMOKE_AUTH_VERSION_INVALID`
- `SMOKE_AUTH_TIMESTAMP_INVALID`
- `SMOKE_AUTH_EXPIRED`
- `SMOKE_AUTH_NONCE_INVALID`
- `SMOKE_AUTH_SECRET_VERSION_MISMATCH`
- `SMOKE_AUTH_BODY_MISMATCH`
- `SMOKE_AUTH_SIGNATURE_INVALID`
- `SMOKE_TARGET_REFUSED`
- `SMOKE_SECRET_INVALID`
- `SMOKE_AUTH_REPLAY`
- `SMOKE_AUTH_BINDING_CONFLICT`
- `SMOKE_AUTH_INTERNAL_FAILURE`

Existing staging-mode errors remain separately classified as `SMOKE_MODE_INVALID` and `SMOKE_MODE_NOT_ENABLED`.

## Public mapping

Malformed or refused request credentials, version/timestamp/nonce errors, correlation mismatches, signature failures, replay and binding conflicts return HTTP 403 with the existing generic `validationRejected` response. Invalid server mode, target, secret/version configuration and internal nonce-control failures retain HTTP 503 with the generic safe configuration message. No internal category, proof, stage, nonce, signature, secret, body, target detail or provider detail is returned publicly.

In `OUTBOUND_PROVIDER_MODE=suppress`, a missing smoke authorization now fails closed before nonce consumption and every business operation. Ordinary production-like mode without smoke configuration or a smoke header remains unchanged.

## Safe diagnostics

Only the following bounded metadata may enter operational logs/evidence:

- PII-free random request reference;
- validation stage and internal safe category;
- protocol accepted and parsed version;
- timestamp parse/window status and signed timestamp;
- nonce-shape status and a 128-bit nonce correlation proof;
- target pass/fail status;
- random non-secret rotation ID;
- secret-version pass/fail status and a 128-bit secret-version proof;
- raw-body pass/fail status and a 128-bit body proof;
- signature pass/fail status;
- nonce decision and bounded internal component classification.

The implementation never logs the secret, secret length, authorization header, full signature/HMAC, plaintext nonce, raw body, raw SHA-256 body digest, name, email, phone, company, message, IP address, or user agent.

## Cryptographic correlation model

Every future temporary smoke rotation must create two coupled values:

1. a cryptographically random secret of at least 32 bytes;
2. a non-secret rotation ID in the exact form `rot_` plus 32 lowercase hexadecimal characters.

The client and runtime both calculate three 128-bit diagnostic proofs using HMAC-SHA-256 with the temporary high-entropy secret and distinct domain-separated payloads:

- secret-version proof: binds rotation ID and the fixed staging target;
- body proof: binds rotation ID, timestamp, nonce, fixed target and the SHA-256 of the exact decoded raw body;
- nonce proof: correlates the plaintext nonce without recording it.

Only the first 128 bits are retained. These values do not authorize a request, cannot be used instead of the full 256-bit request signature, and are computationally non-invertible for the required random secret. Domain separation prevents reuse across signature, body, secret-version and nonce purposes. Their correlation lifetime must be limited to the controlled smoke evidence window.

The server compares in this order:

1. runtime target and secret/version configuration;
2. authorization presence and structure;
3. protocol version;
4. timestamp syntax and window;
5. nonce shape;
6. rotation ID and secret-version proof;
7. body proof;
8. full request signature with constant-time comparison;
9. atomic nonce consumption.

This ordering proves one unique diagnosis:

- unequal rotation ID or secret proof: secret-version/material mismatch;
- equal secret proof but unequal body proof: exact raw-body mismatch, including encoding/newline/proxy differences;
- equal secret and body proofs but unequal full signature: authorization-signature corruption or algorithm mismatch;
- equal proofs and signature: nonce/replay handling is reached.

## Client evidence procedure for the next Gate 4

Before sending, the controlled client must build one immutable raw-body byte sequence and retain it only in memory until the response and server diagnostics are reconciled. It records only the safe evidence returned by `buildSmokeAuthorization`: protocol version, signed timestamp, nonce-shape pass, fixed target binding, rotation ID, secret-version proof, body proof and nonce proof. It sends the exact same raw-body bytes used for signing.

The server evidence is then compared with the client evidence. Raw body and secret material must be destroyed only after response, logs, nonce decision and safe proof correlation have been verified. They must never be written to the repository or durable evidence.

## Functional invariants

The functional order remains:

1. honeypot;
2. staging mode and target;
3. header parsing;
4. protocol version;
5. timestamp;
6. secret/body/signature verification;
7. nonce consumption;
8. abuse limiter;
9. canonical create;
10. reconciliation;
11. canonical events and provider suppression.

All diagnostic failures stop before nonce or downstream work as appropriate. The canonical transactional lead writer, reconciliation, canonical `lead.created` event, provider suppression, timeline repair and abuse control were not changed.

## Test results

- Required smoke-auth scenarios and P0 regression group: 87/87 pass.
- Complete isolated JavaScript suite: 273/273 pass.
- Syntax checks: pass.
- Header case, decoded Netlify base64 transport and newline/body drift: pass.
- Public generic response and exact internal category separation: pass.
- Secret/header/nonce/raw-body/PII/network-identity leakage assertions: pass.
- 70 Function-entrypoint inventory: unchanged.
- Migration checksums: unchanged across all three roots.

## Required future gates

1. Read-only staging review of the new release unit and current staging drift.
2. Separate configuration authorization to set `P0_STAGING_SMOKE_ROTATION_ID` together with the temporary secret on the confirmed staging site. The rotation ID is non-secret but must be generated randomly and treated as one atomic version pair with the secret.
3. Separate byte-identical staging deploy authorization to activate both values and the observability code.
4. Separate Gate 4 smoke authorization using the new client evidence contract.
5. Cleanup, final secret/rotation pair, and closing byte-identical redeploy under a separately locked execution plan.

No remote action or later gate is authorized by this report.
