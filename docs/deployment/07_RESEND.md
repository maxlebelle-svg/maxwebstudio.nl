# 07 Resend

Doel: klantmails gecontroleerd live zetten.

Bronnen:

- `docs/BILLING_TEST_PLAN.md`
- `functions/admin-invoice-email.js`
- `functions/send-lead.js`

Eisen:

- `RESEND_API_KEY` server-side
- verified from-domain
- templates getest
- interne en klantbevestiging getest
- geen directe private PDF-links in mails

Rollback:

- e-mailtrigger uitschakelen
- vorige function deploy terugzetten
- klanten handmatig informeren indien nodig
