# 06 Mollie

Doel: betalingen en abonnementen pas live zetten na database/Auth/RLS.

Bronnen:

- `docs/MOLLIE_SUBSCRIPTIONS.md`
- `docs/BILLING_TEST_PLAN.md`
- `docs/supabase-mollie-payments.sql`

Eisen:

- testmodus eerst
- webhook getest
- factuurstatussen getest
- subscription lifecycle getest
- geen Mollie key in frontend

Rollback:

- webhook tijdelijk uitschakelen
- keys terugzetten
- payment/subscription status handmatig controleren in Mollie dashboard
