# Foundation F0-e — Runtime Column Evidence Plan

Status: **PLAN ONLY / NO QUERY EXECUTED**

Een toekomstige, afzonderlijk goedgekeurde read-only catalogrun moet exact alle `public`-kolommen ophalen met schema, tabel, ordinal position, kolomnaam, datatype (`data_type`, `udt_schema`, `udt_name`), default, nullability, identity (`is_identity`, `identity_generation`), generated status/expression en collation. De output wordt stabiel gesorteerd op schema, tabel en ordinal position, inclusief server/project-identiteit en verzameltijd.

Voorgenomen catalogquery:

```sql
select table_schema, table_name, ordinal_position, column_name,
       data_type, udt_schema, udt_name, column_default, is_nullable,
       is_identity, identity_generation, is_generated, generation_expression,
       collation_schema, collation_name
from information_schema.columns
where table_schema = 'public'
order by table_schema, table_name, ordinal_position;
```

De ruwe export moet vóór vergelijking worden gehasht en immutable opgeslagen. Vergelijking gebeurt per volledig benoemde kolom tegen de 612 lokale baselinekolommen. Geen query is in F0-e uitgevoerd; de gate blijft `BLOCKED_MISSING_EVIDENCE`.
