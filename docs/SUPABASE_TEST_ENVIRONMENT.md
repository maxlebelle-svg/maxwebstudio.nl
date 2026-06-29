# Supabase Test Environment

Status: voorbereid. Geen SQL uitvoeren in productie zonder afgeronde testresultaten.

## Waarom eerst een testomgeving

RLS bepaalt straks welke klant, medewerker of demo-user data mag lezen of wijzigen. Een fout in RLS kan leiden tot datalekken, geblokkeerde klantportalen of te brede adminrechten. Daarom moet de RLS-draft eerst in een aparte Supabase testomgeving worden getest.

## Productie vs test

| Onderdeel | Productie | Testomgeving |
| --- | --- | --- |
| Klantdata | echte klanten | synthetische testdata |
| RLS execution | pas na Go/No-Go | eerste plek voor uitvoering |
| Service role | alleen server-side | alleen lokaal/server-side voor setup |
| Anon key | browser + RLS | browser + RLS-tests |
| Demo-data | gescheiden | expliciet aanwezig voor isolatietest |

## Environment variables

Gebruik alleen environment variables, nooit hardcoded secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` alleen server-side/setup, nooit frontend
- `ADMIN_TOKEN` alleen voor admin/server-side testtools waar nodig

Voor een testproject is het verstandig aparte waarden te gebruiken, bijvoorbeeld via Netlify deploy context of lokale `.env` die niet wordt gecommit.

## Scheiding demo/test/productie

- Gebruik alleen canonical schema.
- Gebruik geen legacy `customer_websites`, `customer_invoices` of `customer_subscriptions` voor nieuwe RLS.
- Testdata gebruikt `environment = 'test'` of `environment = 'demo'`.
- Demo-records krijgen `is_demo = true`.
- Productierecords mogen niet naar de testomgeving worden gekopieerd zonder anonimisering.

## Verplichte stappen vóór live execution

1. Testproject of resetbare database branch aanmaken.
2. Canonical schema uitvoeren.
3. Minimale testdata aanmaken.
4. Testprofiles/Auth-users aanmaken.
5. `docs/supabase-rls-canonical-draft.sql` reviewen en gecontroleerd aanpassen naar testexecution.
6. Alle scenario's uit `docs/RLS_TEST_SCENARIOS.md` uitvoeren.
7. Resultaten invullen in `docs/RLS_TEST_LOG_TEMPLATE.md`.
8. Fouten corrigeren en opnieuw testen.
9. Preflight checklist volledig afvinken.
10. Pas daarna productie-execution plannen.

## Harde regel

Geen RLS uitvoeren in productie zonder testresultaten, backup, rollbackplan en expliciete Go-beslissing.
