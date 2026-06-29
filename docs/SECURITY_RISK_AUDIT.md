# Security Risk Audit

Status: gereed als auditdocument, geen live SQL uitgevoerd.

## Hoogste risico's

| Risico | Impact | Huidige mitigatie | Nodige actie |
| --- | --- | --- | --- |
| Klant A ziet data van klant B | Hoog | klantportaal sanitize + customer access guard | RLS per customer ownership uitvoeren en testen |
| Demo-user ziet productiedata | Hoog | demo/local/hybrid bronbadge en filtering in app-laag | RLS demo-scheiding afdwingen op `is_demo`/`environment` |
| Anonymous opent klantportaal via losse link | Hoog | waarschuwing + mismatch empty state | harde auth route guard + RLS |
| Sales ziet Developer Tools | Middel/hoog | role navigation filtering | hard route guard en RLS/admin endpoints controleren |
| Support voert betaalmutatie uit | Hoog | permission config blokkeert UI | server-side + RLS mutatiebeleid |
| Developer wijzigt klant/betaaldata zonder admin | Hoog | developer permissies beperken UI-acties | RLS en server-side write-guards afdwingen |
| Open offerte/factuurlinks lekken gevoelige data | Hoog | demo-flow en sanitized klantportaal | tokenized links of authenticated klantportaal |
| Payment links zichtbaar voor verkeerde klant | Hoog | lokale/hybrid filtering | RLS op `invoices.customer_id` en tokenstrategie |
| `activity_logs` en `import_logs` bevatten gevoelige info | Middel | alleen Developer Mode UI | RLS admin/developer read-only en logging minimaliseren |
| Interne notities zichtbaar in klantportaal | Hoog | clientPortalDataService sanitizing | RLS/views zonder interne velden |
| Debug/readiness info zichtbaar voor verkeerde rol | Middel | Developer Tools hidden via route guards | hard route guard + role policy |
| Service role key lekt naar frontend | Kritiek | frontend gebruikt anon key; service role server-side | blijvende code-review, geen env in browser |
| Te brede RLS policy op canonical tabellen | Kritiek | SQL is draft-only | handmatige review vóór uitvoeren |
| Legacy `customer_*` opnieuw gebruikt | Hoog | consolidatieplan markeert legacy historisch | nieuwe SQL alleen op canonical tabellen baseren |

## Bekende open punten

- Database-level security is voorbereid, nog niet live.
- `supabase/rls-policies.sql` is historisch/conceptueel; nieuwe hardening moet via `docs/supabase-rls-canonical-draft.sql` worden gereviewd.
- Echte Supabase Auth-login en route guards zijn nog niet de enige toegangspoort.
- Publieke offerte- en betaalpagina's blijven demo/transition flows totdat tokenized of authenticated toegang is gebouwd.
- Storage policies vallen buiten deze fase en moeten apart worden gehard.

## Conclusie

De grootste risico's zitten niet meer in ontbrekende UI-waarschuwingen, maar in databasehandhaving. Fase 13.3 levert daarom de policy-matrix, claims-strategie, SQL-draft en readiness-checks op, maar zet niets live.
