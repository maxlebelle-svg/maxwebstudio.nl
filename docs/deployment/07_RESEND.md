# 07 Resend

Doel: klantmails gecontroleerd live zetten.

Bronnen:

- `docs/BILLING_TEST_PLAN.md`
- `functions/admin-invoice-email.js`
- `functions/send-lead.js`

Eisen:

- `RESEND_API_KEY` server-side
- `RESEND_WEBHOOK_SECRET` server-side en gelijk aan de signing secret van de actieve Resend-webhook
- webhook endpoint: `https://maxwebstudio.nl/.netlify/functions/resend-webhook`
- `svix-id`, `svix-timestamp` en `svix-signature` worden gecontroleerd op de ongewijzigde requestbody
- verified from-domain
- templates getest
- interne en klantbevestiging getest
- geen directe private PDF-links in mails
- na configuratie één event vanuit Resend opnieuw afspelen en in Mail Center controleren op `afgeleverd`

Rollback:

- e-mailtrigger uitschakelen
- vorige function deploy terugzetten
- klanten handmatig informeren indien nodig
