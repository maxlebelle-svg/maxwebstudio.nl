# Foundation F0-e — Local Bootstrap PoC Report

Resultaat: **FAIL**

## Geslaagd

- aparte `supabase-bootstrap/`-root met eigen config en lokale scripts;
- baselinechecksum exact behouden;
- lokale compatibiliteitslaag succesvol;
- baseline via Supabase CLI 2.108.0 volledig toegepast;
- 29 public tabellen en exact één echte baselinehistoryrow;
- vijf vereiste rollen, drie lege placeholders, 0 Storage-objecten en 0 testbuckets;
- alleen lokaal TCP op `127.0.0.1`;
- projectroot geïsoleerd en alle tijdelijke clusters/fixtures verwijderd;
- alle negatieve guardrails actief;
- ontbrekende migrationbytes lokaal niet gevonden en niet gereconstrueerd.

## Mislukt / blocker

De aparte common-root bevat conform Model C uitsluitend een post-cutover dummy migration. Supabase CLI weigert deze root omdat historyversie `00000000000000` niet als lokaal migrationbestand zichtbaar is. De dummy werd niet toegepast, history kwam niet op twee rows en de tweede idempotente run kon niet plaatsvinden.

De door de CLI aangeboden routes (`migration repair` of `db pull`) zijn verboden. De andere denkbare route—de baseline ook in de common-root zichtbaar houden—schendt het vastgestelde strikte scheidingscontract en is niet stilzwijgend toegepast.

## Besluit

Minimumcriteria voor `PASS` zijn niet gehaald. Kandidaat-cutover `20260721000000` blijft **BLOCKED**. Er is nieuw architectuurbesluit nodig over CLI-compatibele history/file-zichtbaarheid; remote evidence, reconciliation en deployment blijven buiten scope.
