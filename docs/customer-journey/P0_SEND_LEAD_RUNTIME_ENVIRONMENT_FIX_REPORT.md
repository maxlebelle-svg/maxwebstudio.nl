# P0 send-lead runtime-environmentclassificatie

Status: `PASS_P0_SEND_LEAD_RUNTIME_ENVIRONMENT_FIX_PACKAGED`

## Scope

Deze correctie wijzigt uitsluitend de environmentresolutie van `functions/send-lead.js`, de direct geraakte tests en deze lokale release-evidence. Er zijn geen database-, configuratie-, frontend- of andere Function-wijzigingen uitgevoerd.

## Contract

- Een geautoriseerd suppress-/smokepad resulteert altijd in `test`.
- Normaal verkeer gebruikt eerst `APP_ENVIRONMENT` en daarna `APP_ENV`.
- Alleen `production`, `test` en `demo` zijn geldig.
- Twee ingevulde, genormaliseerde waarden moeten gelijk zijn.
- Ontbrekende, onbekende of conflicterende waarden stoppen vóór limiter, opslag en providers met een generieke HTTP 503-configuratiefout.
- `CONTEXT` is geen autoritatieve runtimebron en wordt niet gebruikt door de resolver.

## Validatie

- Syntaxcontrole `functions/send-lead.js`: PASS.
- Gerichte plus bestaande P0-suites: 92/92 PASS.
- Volledige JavaScript-regressiesuite: 285/285 PASS.
- Smoke-auth en provider-suppressie: ongewijzigd groen.
- Productiepayload met twee expliciete productionwaarden: `environment=production`.
- Statische databasecontrole: de transactionele intake-RPC bewaart de aangeleverde environmentwaarde in de lead en bouwt `lead.created` uit dezelfde opgeslagen waarde.
- Geen migratie of configuratiewijziging nodig.

## Uitvoering

Deze packaging autoriseert geen deploy of nieuwe Gate-D-aanvraag. De minimale volgende stap is een read-only deploy execution preflight voor uitsluitend deze applicatiecorrectie.

