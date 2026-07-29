# Food Demo Bundle — implementation and release report

Status: `STOPPED_STAGING_MIGRATION_HISTORY_DIVERGENCE`

## Implemented locally

- canonical Food Demo Bundle linked to exactly one lead or customer and optionally one Food Factory dossier;
- separate two-link Food cards in Demo Sites without converting existing website demos;
- lead/customer action and control modal with QR, preview, test, send, resend, revoke, copy and link checks;
- presentation mode with the honest pickup-only/no-payment sequence;
- server-authoritative Silverado blueprint URLs and safe login deeplink;
- role and relationship-ownership enforcement;
- durable idempotency reservation, database rate limiting and append-only audit;
- central Resend mail service with exact Silverado subject, escaped HTML, text fallback and QR;
- definitive relationship mail closed outside separately enabled production; internal testmail closed outside a controlled non-production runtime.

## Verification

- New tests: 7/7 PASS.
- Relevant existing regression suite: 122/122 PASS.
- Desktop fixture: PASS.
- Mobile 390 × 844: PASS, document width 390, no horizontal overflow.
- Live storefront: reachable, eight products, pickup-only, server-price message, robots denial.
- Live dashboard deeplink: login page reachable; no token, password or service credential in URL.
- Frozen Silverado files changed by this implementation: 0.

## Staging identity and release stop

Provider metadata independently confirmed project `xlxpuuycigeqhgxqtzni` as `maxwebstudio-test`, region `eu-west-1`, status `ACTIVE_HEALTHY`; `.env.staging` points to this ref and to `https://maxwebstudio-staging.netlify.app`. The separate Silverado project `obprooubcbnfgouytvrw` was confirmed as `max-webstudio-food-demo` and remained untouched.

No deploy, migration or mail was executed. The staging/test migration history diverges materially from the local governed history: it contains remote-only versions and many local-only versions, including the Factory Hub prerequisite. Applying a normal database push would therefore exceed the allowlisted fileset and fail the migration-consistency gate. A target-locked reconciliation/certification of that history is required before the two additive migrations may be applied.

`FOOD_DEMO_INTERNAL_TEST_EMAIL` is not configured in the available staging environment. Consequently the internal testmail gate remains closed even after database reconciliation; an explicit controlled Max Webstudio address must be configured server-side before that one test send.

Silverado self-service ownership is also not proven. The evidence confirms a synthetic Silverado manager scoped to one tenant, not an account owned by Silverado. Until that identity, role and tenant membership are proven, Max must operate the dashboard from an already safe session during the guided demo.

## Freeze evidence

- Runtime commit: `7622d884f822fabe68198c9bc9fccdbaf5924b6c`
- Active deploy recorded in frozen evidence: `6a699e15ccf9a2902dd27606`
- Evidence commit: `3d0a222df0376a99aaa07d26442fe2b86b8ed91c`
- No files under `public/food`, `public/admin/food`, `_food-api.js`, the Silverado assets or Silverado freeze documents were modified.
