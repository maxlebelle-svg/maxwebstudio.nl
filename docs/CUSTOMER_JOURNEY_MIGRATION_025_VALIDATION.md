# Migration 025 — veiligheidsvalidatie

Datum: 13 juli 2026
Status: **op 13 juli 2026 veilig geactiveerd op productieproject `maxwebstudio` na volledige read-only preflight**

## Besluit

De gevalideerde draft is byte-identiek gepromoveerd naar `supabase/migrations/20260713173000_customer_journey_automation_foundations.sql` en additief uitgevoerd op projectref `yxxahurphdbblkuxoeje`. Projectidentificatie, back-up, objectpreflight, dry-run, live RLS/grants en het herstelpad staan in `docs/CUSTOMER_JOURNEY_STORAGE_ACTIVATION_PREFLIGHT.md`.

De Fase 3-code behandelt alle journeytabellen als optioneel. Een ontbrekende tabel levert een gecontroleerde legacy- of disabled state op en veroorzaakt geen mutatie of crash.

## Statische controle

Gecontroleerd tegen de bestaande schemafiles, migration drafts en uitgevoerde migrations:

- uitsluitend nieuwe tabellen; geen bestaande tabel of kolom wordt verwijderd;
- `gen_random_uuid()` en `pgcrypto` volgen de bestaande UUID-conventie;
- alle timestamps gebruiken `timestamptz` en `now()`;
- tabel-, constraint-, functie- en indexnamen botsen niet met gevonden repositoryobjecten;
- `create table if not exists`, `create index if not exists`, een gecontroleerd policyblok en `create or replace function` maken dezelfde draft opnieuw uitvoerbaar;
- de event- en outboxconstraints voorkomen dubbele events en dubbele effecten;
- alle zes tabellen hebben RLS;
- `anon` en `authenticated` krijgen geen rechtstreekse rechten;
- de security-definerfunctie is alleen uitvoerbaar door `service_role` en heeft een vaste `search_path`;
- foreign keys raken alleen nieuwe journeytabellen en gebruiken geen cascade naar bestaande klant-, project-, betaal- of maildata;
- de migration is transactioneel omsloten met `begin` en `commit`.

## Uitgevoerde live controles

- productieproject, ref en live publieke configuratie kwamen overeen;
- fysieke backup `1102601588` was vóór uitvoering `COMPLETED`;
- alle zes tabellen, beide RPC's en 025-indexnamen ontbraken vooraf;
- eerste migrationuitvoering slaagde;
- byte-identieke tweede uitvoering slaagde;
- ingebouwde catalogusasserties bewezen RLS, service-role-policies, anon/authenticated-denial, service-role-grants, security-definer en vaste `search_path`;
- postflight-types en indexstatistieken bevatten alle nieuwe objecten;
- synthetische duplicate-, claim-, lease-recovery- en executiontest slaagde zonder providercall.

## Herstelprocedure

Het huidige herstelpad is:

1. stop journeyflags en eventuele toekomstige workers;
2. bewaar logs en een schema-/databack-up van de zes nieuwe tabellen;
3. herstel alleen bij aantoonbare bredere schade vanuit de vooraf bevestigde fysieke back-up;
4. verwijder nieuwe objecten alleen na expliciete database-ownergoedkeuring en alleen wanneer bewezen is dat zij geen productiegegevens bevatten;
5. controleer daarna bestaande checkout-, Mollie-, preview-, factuur-, timeline-, portal- en mailflows opnieuw.

Er is bewust geen automatisch destructief rollbackscript toegevoegd.
