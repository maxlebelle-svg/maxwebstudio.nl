# RLS Dry Run Plan

Status: voorbereid. Geen SQL uitgevoerd.

## Doel

Dit plan beschrijft hoe de canonical RLS policies veilig getest worden voordat ze ooit op productie worden uitgevoerd.

## Stappen

1. Maak of gebruik een Supabase testproject.
2. Voer het canonical schema uit, niet de legacy `customer_*` scripts.
3. Voeg minimale synthetische testdata toe volgens `docs/RLS_TEST_DATA_PLAN.md`.
4. Maak testprofiles en test Auth-users aan.
5. Voer de RLS-draft uit in test na review. Gebruik nooit productie als eerste omgeving.
6. Test per rol: super_admin, admin, sales, support, developer, customer, demo_user en anonymous.
7. Test Customer A / Customer B isolatie.
8. Test demo-user isolatie.
9. Test anonymous toegang.
10. Test admin toegang.
11. Test sales/support/developer beperkingen.
12. Log resultaten in `docs/RLS_TEST_LOG_TEMPLATE.md`.
13. Pas policies aan bij fouten.
14. Herhaal de volledige scenario-set.
15. Bereid pas daarna het productieplan voor.

## Testvolgorde

1. Anonymous baseline.
2. Demo-user alleen demo.
3. Customer A eigen data.
4. Customer A probeert Customer B.
5. Customer B eigen data.
6. Sales beperkte salesdata.
7. Support support-read en geen payments.
8. Developer technische data en geen payment writes.
9. Admin/super_admin beheer.
10. Logs/settings/imports.

## Go/No-Go

Default is altijd No-Go.

Go mag alleen wanneer:

- alle scenario's pass zijn
- A/B isolatie is bewezen
- demo/productie isolatie is bewezen
- anonymous klantdata blokkeert
- rollbackplan klaarstaat
- productie-execution window gepland is

## Niet doen

- Geen productie-RLS uitvoeren.
- Geen service role key in frontend.
- Geen echte klantdata gebruiken.
- Geen legacy `customer_*` RLS als basis nemen.
