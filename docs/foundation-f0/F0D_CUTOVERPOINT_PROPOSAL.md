# F0-d — Cutoverpoint Proposal

Status: **BLOCKED**

## Kandidaat

- Laatste lokaal byte- en checksumbewezen historische migration: `20260719190000_create_demo_invitation_delivery_foundation`.
- Latere remote history zonder lokale originele bytes: `20260720160000` en `20260720200000`.
- Kandidaat eerste gemeenschappelijke versie: `20260721000000`.
- Regel: de eerste werkelijke common migration moet versie `>= 20260721000000` hebben en strikt later zijn dan alle bestaande remote history.

De bootstrap beoogt functioneel de targettoestand na remote versie `20260720200000`, maar mag die migration niet als bewezen/geabsorbeerd registreren zolang de originele bytes ontbreken. Daarom is `20260720200000` slechts de remote-historygrens, niet een bewijsbare bootstrap-lineagegrens.

## Future assetmigraties

`20260719120000` en `20260719150000` liggen vóór de remote-only versies en vóór het kandidaat-cutover. Zij worden gequarantaineerd als `future_not_deployed`; niet uitgevoerd, niet hernummerd en niet beschouwd als common migrations. Een latere release moet hun intentie opnieuw als nieuwe append-only common versies na cutover authoriseren.

## Gates vóór approval

1. Originele bytes/checksums van beide remote-only migrations herstellen of formeel accepteren dat officiële historische lineage onvolledig blijft.
2. Volledige runtimekolomcatalogus verkrijgen en vergelijken.
3. `leads_unique_normalized_domain_idx` uit de bootstrapdoeltoestand verwijderen of via goedgekeurde correctie neutraliseren.
4. Model C met Supabase CLI/history in twee disposable lokale lijnen bewijzen.
5. Supabase-compatibiliteitsrollen implementeren en beide assetmigraties opnieuw lokaal testen.
6. Reconciliationplan voor bestaande omgevingen afzonderlijk goedkeuren.
