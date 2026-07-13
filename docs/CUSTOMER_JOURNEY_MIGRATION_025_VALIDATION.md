# Migration 025 — veiligheidsvalidatie

Datum: 13 juli 2026
Status: **uitsluitend statisch gevalideerd; niet uitgevoerd tegen lokaal, test of productie-Supabase**

## Besluit

`supabase/migration-drafts/025_customer_journey_automation_foundations.sql` blijft een migration draft. De huidige opdracht geeft geen afzonderlijke autorisatie voor een live schemawijziging en bevat geen aantoonbare databaseback-up of getest herstelpad. Daarom is geen Supabase-project benaderd en is geen schema of data gewijzigd.

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

## Bekende aandachtspunten vóór latere uitvoering

Een toekomstige uitvoerder moet vóór deployment read-only bewijzen:

1. dat `SUPABASE_URL` en project-ID bij het bedoelde Max Webstudio-project horen;
2. dat de zes tabellen en `record_journey_event_and_enqueue` nog niet onder een andere definitie bestaan;
3. dat de rollen `service_role`, `authenticated` en `anon` aanwezig zijn;
4. dat `pgcrypto` mag worden geactiveerd;
5. dat er een actuele schema-export en databaseback-up beschikbaar zijn;
6. dat de migration eerst tweemaal succesvol in een representatieve testdatabase draait;
7. dat RLS- en granttests vanuit anon, authenticated en service-rolecontext slagen.

`create table if not exists` reconcilieert bewust geen afwijkende, gedeeltelijk bestaande tabel. Wanneer een gelijknamige tabel al bestaat, moet de deployment stoppen voor handmatige vergelijking.

## Herstelprocedure

Omdat de migration niet is uitgevoerd, is nu geen rollback nodig.

Bij een toekomstige deployment is het herstelpad:

1. stop journeyflags en eventuele toekomstige workers;
2. bewaar logs en een schema-/databack-up van de zes nieuwe tabellen;
3. herstel de database vanuit de vooraf gemaakte back-up als de transactie zelf niet volledig terugrolt;
4. verwijder nieuwe objecten alleen na expliciete database-ownergoedkeuring en alleen wanneer bewezen is dat zij geen productiegegevens bevatten;
5. controleer daarna bestaande checkout-, Mollie-, preview-, factuur-, timeline-, portal- en mailflows opnieuw.

Er is bewust geen automatisch destructief rollbackscript toegevoegd.
