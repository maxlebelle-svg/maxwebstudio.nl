# Base44 Cockpit restricted write bridge

`/.netlify/functions/cockpit-write` is the deliberately narrow production write path used by the private Base44 Cockpit.

## Allowed actions

- `add_note`: append one internal note to an existing production lead.
- `schedule_next_action`: set the type, date and optional note for one lead follow-up.

Everything else is rejected. The endpoint does not create, delete, archive, win or lose leads, send mail, publish websites, upload files, change proposals, or touch payments.

## Security contract

- POST only and server-to-server only; requests containing a browser `Origin` header are rejected.
- Uses a dedicated `COCKPIT_WRITE_TOKEN` of at least 48 characters. It must differ from `COCKPIT_READ_TOKEN`.
- The Supabase secret remains in Netlify and is never returned to Base44 or the browser.
- Base44 stores the write token only in Secrets and calls this endpoint from an authenticated backend function after confirming the app owner/admin.
- Lead IDs, actions, dates, text lengths and idempotency keys are validated by the bridge.
- Demo records are never writable.
- Writes use the observed `updated_at` value as an optimistic lock. Concurrent changes stop with HTTP 409 instead of overwriting newer data.
- The latest idempotency key is stored with the lead and prevents immediate retries from appending or scheduling twice.
- Every successful write attempts to add a minimal `activity_logs` audit event without including note contents.
- Responses use `Cache-Control: no-store` and never return internal notes, metadata or secrets.

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_COCKPIT_SECRET_KEY`
- `COCKPIT_READ_TOKEN`
- `COCKPIT_WRITE_TOKEN`

Keep all four server-side. Never paste their values into Base44 chat, source code, screenshots or documentation.

## Proposal control bridge

`/.netlify/functions/cockpit-offers` is a separate, deliberately staged route for
an existing production proposal. It reuses the canonical Max Webstudio proposal
mail engine; Base44 does not compose or deliver email itself.

The only permitted sequence is:

1. `preview`: records and returns the canonical server preview plus a short-lived token.
2. `test`: requires that preview token and sends only to the verified admin profile.
3. `send`: requires the test token and the exact typed confirmation `VERSTUUR`.

Every stage is bound to the same lead, offer, immutable current version and stored
customer email. Base44 cannot provide or override the definitive recipient. Tokens
expire after 30 minutes and may exist only in backend memory for the active flow;
never store them in a Base44 table, browser storage or logs. Demo leads, stale
versions, non-binding prices and incomplete proposals fail closed before delivery.

The route also needs `ADMIN_EMAIL`, or the optional `COCKPIT_ACTOR_EMAIL`, to resolve
one active Max Webstudio admin profile. Keep that value server-side alongside the
four variables above.
