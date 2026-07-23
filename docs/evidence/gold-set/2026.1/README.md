# Gold Set 2026.1 — V1/V2 certificeringsbenchmark

**STOPPED_GOLD_SET_CERTIFICATION**

De set is bevroren op `c1843f70245194cb5a2b67981e72700be057b78ad4e80456cddbf4f7bed6452d` met 24 cases. De A/B-koppeling blijft privé tot minimaal 2 volledige beoordelingen zijn ingeleverd.

## Gates

- Frozen manifest: PASS
- Automatische Gold Set: PASS
- No Hallucination Gate: PASS
- Blinde menselijke beoordeling: PENDING
- Customer Success Gate: PENDING

## Harde regel

Iedere afzonderlijke V2-case moet bij iedere beoordelaar op ieder criterium minimaal gelijk zijn aan V1. Resultaten worden niet over cases of beoordelaars gemiddeld om regressies te compenseren.

## Automatische bevindingen

- Cases met een objectieve regressie: 0
- V2-cases geblokkeerd door Truth Quality: 0
- Ongemarkeerde gegenereerde projectcases: 0/24
- Onbewezen testimonialblokken in de render: 0/24
- Onbewezen ervaringsclaims in de render: 0/24
- Deterministische V1-renders: 24/24
- Deterministische V2-renders: 24/24
- Volledige blinde beoordelingen: 0/2

Truth Quality-blockers worden per case volledig vastgelegd in `AUTOMATED_REPORT.json`. Geen menselijke beoordeling of certificering is door de benchmark gesimuleerd.

## Beoordelen

Open lokaal `review/index.html`. De beoordelaar ziet uitsluitend Website A en Website B en exporteert na 24 complete beoordelingen één JSON-bestand volgens `assessment.schema.json`. Plaats goedgekeurde exports in `content-factory/gold-set/2026.1/assessments/` en voer de benchmark opnieuw uit. De mapping wordt pas onthuld wanneer het minimumaantal volledige beoordelingen aanwezig is.
