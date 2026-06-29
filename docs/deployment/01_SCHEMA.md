# 01 Schema

Doel: canonical databasebasis opbouwen.

Primaire bron:

- `supabase/schema.sql`

Referenties:

- `docs/SUPABASE_CANONICAL_SCHEMA.md`
- `docs/SUPABASE_CONSOLIDATED_PLAN.md`
- `docs/SUPABASE_SQL_INDEX.md`

Niet doen:

- geen legacy `customer_websites`, `customer_invoices`, `customer_subscriptions` als basis gebruiken
- geen losse overlap-scripts blind uitvoeren

Rollback:

- testomgeving resetten of database backup terugzetten
- geen handmatige rollback SQL schrijven zonder review
