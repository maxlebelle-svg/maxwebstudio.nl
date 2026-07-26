# Foundation F0-f — Bootstrap Root History Proof

Status: **PASS**

Supabase CLI 2.108.0 draaide op PostgreSQL 17.6 via `127.0.0.1/32`.

1. baseline-only root: exact `00000000000000`, name `authoritative_baseline`, 612 statements;
2. dezelfde actieve root kreeg fixture `20260721000100_dual_root_poc_marker.sql`;
3. daarna exact twee rows: baseline plus fixture met 3 statements;
4. tweede run meldde `Local database is up to date` en history bleef gelijk;
5. markerrecord: exact 1;
6. geen historical files, synthetic markers, repair of pull.

Baseline-SHA bleef `6c8b9a8137850edadb6fe976938d44e16a5eecadc740481a65423bf72251ff11` en de baseline bleef tijdens alle runs in de actieve root aanwezig.
