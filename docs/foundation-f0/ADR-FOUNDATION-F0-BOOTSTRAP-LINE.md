# ADR — Foundation F0 Bootstrap Line

Status: **Accepted as design; implementation pending**

## Context

F0-b bewees dat de final-state baseline zelfstandig werkt. F0-c bewees dat replay van historische SQL boven die baseline structureel breekt, eerst op `files_one_relationship_check`, met latere verwachte dubbele CREATEs. Twee remote migrationbytes ontbreken en volledige runtimekolompariteit is niet bewezen.

## Decision

Kies uitsluitend model C: een aparte bootstrapprojectroot/directory met één echte baselinehistoryrecord en daarna een fysiek gescheiden common lijn vanaf kandidaat `20260721000000`. Bestaande omgevingen behouden hun originele history en ontvangen alleen append-only reconciliation/common migrations. Er worden geen historische applied markers gesynthetiseerd en geen remote repairs uitgevoerd.

Het cutoverpoint is `blocked` totdat missing lineage, kolomcatalogus, unieke leadindex, CLI multi-root proof, lokaal Supabase-profiel en reconciliationgates zijn gesloten.

## Consequences

Positief: geen dubbele uitvoering, eerlijke lineage, sterke auditbaarheid en behoud van bestaande omgevingen. Kosten: extra configuratie/runnerdiscipline, twee-lijntests en governance rond fingerprints. Assetmigraties met oude timestamps worden niet als common geaccepteerd. De unieke normalized-domain-index is geen target state.

## Rejected

Model A is afgewezen wegens valse lineage door synthesized markers. Model B is afgewezen omdat historische SQL in dezelfde directory zichtbaar blijft en replayrisico houdt.

## Invariants

Baseline SHA-256 blijft `6c8b9a8137850edadb6fe976938d44e16a5eecadc740481a65423bf72251ff11`; bestaande migrationbytes blijven ongewijzigd; geen SQL-, remote-, commit-, push- of deployactie hoort bij deze ADR.
