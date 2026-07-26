# F0-d — Bootstrap Model Comparison

## Model A — Baseline plus gesynthetiseerde historical version markers

- Werking: baseline uitvoeren en alle geabsorbeerde historische versies kunstmatig als applied registreren.
- History-impact: lijkt op de originele lijn zonder dat die SQL werkelijk is uitgevoerd.
- Bestaande omgevingen: geen directe wijziging, maar historyvergelijking wordt misleidend.
- Nieuwe omgevingen: voorkomt dubbele uitvoering.
- Tooling: waarschijnlijk herkenbaar voor versiegebaseerde tooling, maar vereist repair-/markerhandelingen.
- Auditbaarheid/rollback: zwak; markers moeten afzonderlijk worden teruggedraaid.
- Risico: zeer hoog op valse lineage, vooral voor de twee ontbrekende bytes.
- Besluit: **AFGEWEZEN** — strijdig met de eis dat niet-uitgevoerde historische identiteit niet wordt gesuggereerd.

## Model B — Baseline plus één bootstrap history marker in dezelfde lijn

- Werking: één bootstrapversie registreren, maar historische en toekomstige bestanden blijven in dezelfde migrationsdirectory.
- History-impact: eerlijker dan A, maar oude versies blijven voor tooling zichtbaar.
- Bestaande omgevingen: behouden hun history, mits zij de bootstrapmarker nooit zien.
- Nieuwe omgevingen: dubbele uitvoering blijft mogelijk zodra de normale directory wordt gebruikt.
- Tooling: vereist blijvende skiplogica of filters buiten het standaardpad.
- Auditbaarheid/rollback: marker is duidelijk, directorysemantiek niet.
- Risico: hoog op accidentele replay en operatorfouten.
- Besluit: **AFGEWEZEN** — één marker alleen is onvoldoende om historische SQL fysiek uit het uitvoerpad te houden.

## Model C — Aparte bootstrapdirectory plus common cutovermigraties

- Werking: aparte bootstrapprojectroot met één baseline; daarna een common bron met alleen versies vanaf cutover.
- History-impact: één echte bootstraprecord plus werkelijk uitgevoerde common records; historische provenance staat in een apart manifest, niet in applied history.
- Bestaande omgevingen: blijven de originele history en append-only reconciliation gebruiken.
- Nieuwe omgevingen: zien geabsorbeerde migraties nooit opnieuw.
- Tooling: vereist lokaal bewezen gescheiden Supabase CLI-configuraties/runner.
- Auditbaarheid/rollback: sterk; bootstrapdatabase kan vóór promotie volledig worden weggegooid, fingerprints zijn expliciet.
- Risico: middelmatig, hoofdzakelijk configuratie- en cutoverdiscipline.
- Besluit: **AANBEVOLEN — ENIG AANBEVOLEN MODEL**.

Exact één model is aanbevolen: model C.
