# Commercial D1 user-JWT/RLS preview fix certificate

Status: `PASS_LOCAL_IMPLEMENTATION`

This certificate covers only the least-privilege preview fix above candidate commit
`14197cd977ebe36c79a4b78e25a3b9947c7eaceb`. It does not authorize a merge,
database migration, production or staging deploy, login, authenticated preflight,
email, signing, payment, configuration change, or provider mutation.

## Scope

- `functions/account-profile.js` reads the validated caller's own profile with the
  anon/publishable key and the same user JWT, under existing RLS.
- `functions/admin-commercial-postgrest-preflight.js` authenticates only an active
  `super_admin` and sends the same JWT with the anon/publishable key for the two
  fixed `profiles` and `customers` `GET ... limit=0` probes.
- The preflight route never reads an upstream response body and returns only fixed
  resource names, HTTP statuses, locally derived safe error codes, and categories.
- The sales-partner gate remains fail-closed when its separately required
  service-role-only document-version access is unavailable.

No migration, policy, grant, catalog, commercial business rule, Factory, Food,
Silverado, Netlify configuration, or environment variable is changed.

## Local certification

- Focused account-profile, admin-session bridge and preflight tests: `21/21 PASS`.
- Commercial D1, migration, RLS, route and absence-guard tests: `135/135 PASS`.
- Factory, Website Factory, Food/Silverado, partner and governance tests:
  `332/332 PASS`.
- Complete executable repository regression suite: `1645/1645 PASS`, with no
  failures or skipped tests.
- Local Netlify production-context build: `PASS` with Netlify Build `36.2.3` in
  offline mode.
- The existing duplicate `customerId` bundler warning remains outside this patch;
  `_website-factory-core.js` was not changed.

No external login, authenticated preflight, database action, migration, email,
payment, webhook, provider action, configuration change, or deployment was
performed during local certification.

## Remaining preview proof

- one normal push to the existing draft PR branch;
- anonymous inspection of the automatically generated Deploy Preview only.

The final commit, tree, test totals, build result, and Deploy Preview identity are
recorded in the release handoff because a commit cannot contain its own hash.
