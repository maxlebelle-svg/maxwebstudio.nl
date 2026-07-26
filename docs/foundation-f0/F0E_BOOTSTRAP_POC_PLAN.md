# Foundation F0-e — Bootstrap PoC Plan

Status: **EXECUTED LOCALLY / STOPPED AT REQUIRED CLI HISTORY BOUNDARY**

Doel was Model C te toetsen zonder remote toegang: een disposable PostgreSQL 17.6-cluster op `127.0.0.1`, een minimale Supabase-compatibiliteitslaag, één checksum-gecontroleerde baseline, één echte CLI-historyrow, omschakeling naar een afzonderlijke common-root, een tijdelijke dummy migration en een schone tweede run.

Vaste grenzen:

1. authoritative source: `supabase/migrations/00000000000000_authoritative_baseline.sql`;
2. verwachte SHA-256: `6c8b9a8137850edadb6fe976938d44e16a5eecadc740481a65423bf72251ff11`;
3. kandidaat-cutover: `20260721000000`, status `BLOCKED`;
4. geen link/login, remote host, repair, reconstructie, historische marker of productmigratie;
5. stop zodra de CLI alleen verder kan na history repair of het opnieuw aanbieden van pre-cutover SQL.

De stopvoorwaarde trad op na de geslaagde baseline en vóór uitvoering van `20260721000100_bootstrap_poc_marker.sql`. Classificatie: **FAIL**.
