# Food v1 Silverado Demo Content

This release unit updates only the public presentation content of the existing
synthetic Silverado tenant in the isolated Food Demo Cloud project.

## Target

- Project ref: `obprooubcbnfgouytvrw`
- Environment: `food_demo`
- Storefront: `silverado-roti-shop-emmeloord`
- Production and staging are forbidden targets.

## Intended result

- Silverado public business name, address and phone are present.
- The conflicting opening-hours sources remain represented by the existing
  provisional Monday-to-Friday 15:00–19:00 demo schedule and pilot warning.
- Exactly eight products published on the current Silverado website are active.
- Two old synthetic pilot products are retained but inactive.
- All active products point to one of the six supplied Silverado food photos.
- The demo reset baseline matches the resulting price and availability state.

## Preconditions

- Branch and remote HEAD are identical on the reviewed source commit.
- The working tree is clean.
- The target project ref is exactly `obprooubcbnfgouytvrw`.
- The synthetic Silverado account and location IDs match the SQL preflight.
- The Silverado demo contains zero orders before execution.
- The SQL checksum matches `FILESET.json`.

## Execution boundary

Execute exactly one file using `psql` with `ON_ERROR_STOP=1`. Do not use
`supabase db push`, do not add migration history, and do not run the original
full seed. The SQL is one transaction and contains its own target, empty-order
and eight-product postconditions.

This evidence does not authorize remote execution. Database execution requires
separate user authorization after this evidence is committed and pushed.

## Validation

- Public storefront profile contains the intended Silverado contact data.
- Public menu contains exactly eight active items with the reviewed prices.
- Two old pilot items are inactive and absent from the public menu.
- Isolation tenant remains unchanged.
- Orders and Auth users remain unchanged.
- No schema, migration history, provider, Netlify or featureflag change occurs.

## Local proof

- Relevant Node tests: 64/64 passed.
- Isolated PostgreSQL content application: passed twice.
- Reset baseline: aligned.
- Isolation tenant: unchanged.
- Remote contact during local validation: false.
