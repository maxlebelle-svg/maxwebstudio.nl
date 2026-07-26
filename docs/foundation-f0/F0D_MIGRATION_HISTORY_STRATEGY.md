# F0-d — Migration History Strategy

## Nieuwe bootstrapomgeving

Geabsorbeerde historische versies worden **niet** als applied geregistreerd. Er komt één werkelijke bootstrapversion voor de daadwerkelijk uitgevoerde baseline, met checksum `6c8b9a8137850edadb6fe976938d44e16a5eecadc740481a65423bf72251ff11`. Een los provenance-manifest legt vast welke runtime-effecten zijn geabsorbeerd, welke 11 checksums bewezen zijn en welke twee remote identities bewijs missen. Dit manifest is auditbewijs, geen migration history.

Na bootstrap wordt alleen een common migrationsbron gebruikt met versies vanaf `20260721000000`. Historische directories zijn niet bereikbaar vanuit dit profiel. Tooling kan daardoor oude versies niet later alsnog uitvoeren.

## Bestaande omgevingen

Zij blijven de originele migrationsdirectory/history gebruiken. Zij krijgen nooit de bootstrapversion. Nieuwe reconciliation- en common migrations worden echt uitgevoerd en normaal geregistreerd. Geen remote `migration repair`, synthesized marker of history rewrite is toegestaan.

## Beschermingsmechanismen

- afzonderlijke lokale projectroots/configs voor `bootstrap`, `existing-history` en `common`;
- environment-kind, database-id en history-mode als verplichte runnerinputs;
- weigeren bij niet-lege bootstrapdatabase of een staging/productieprojectref;
- fingerprint van baseline, alle common files, PostgreSQL-versie, extensies en platformprofiel;
- voor bestaande projecten preflight op exacte verwachte laatste echte historyversie;
- dubbele menselijke approval vóór staging; productie pas na stagingfingerprint en rollbackreview.

## Open toolinggate

De geïnstalleerde CLI probeerde bij lokale helpinspectie telemetrymetadata buiten de workspace te schrijven en is daarom niet als uitvoeringsbewijs gebruikt. De exacte multi-root workflow en CLI-historysemantiek moeten in een volgende, expliciet geautoriseerde lokale implementatiefase worden bewezen.
