# Asset Candidate Preparation Report

## Resultaat

- Kandidaten voorzien: 60
- Branches: 10
- Hero-kandidaten: 20
- Service-kandidaten: 20
- About/team-kandidaten: 10
- Detail/ambiance-kandidaten: 10
- Ontbrekende beeldbestanden: 0
- Metadatafouten: 0
- Generatie-/koppelingsfouten: 1
- Uitgesloten gegenereerde varianten: 3
- Waarschuwingen: 60 (de ingebouwde generator accepteert geen configureerbare seed; de seed is alleen een kandidaat-/reproductiehint en `seed_applied` is daarom `false`)

## Veiligheidsstatus

- Alle kandidaten: `candidate_unreviewed`
- Reviewstatus: `unreviewed`
- Publicatiestatus: `blocked`
- Linkagestatus: `unlinked`
- Feitelijke claims aanwezig: `false`
- Echte merkelementen aanwezig: `false`
- Bestaande Content Library gewijzigd: nee
- Adapter of renderer gewijzigd: nee
- Gold Set gewijzigd: nee
- Productie-, staging- of databaseactie: nee

## Selectie en uitsluiting

Deze pilot gebruikt het toegestane maximum: zes unieke kandidaten per branche en 60 totaal. Iedere branche bevat twee heroes, twee services, één about/team en één detail/ambiance.

Uitgesloten varianten:

1. Een eerste sportschool-hero bevatte een geel kledingmotief dat als tekst of merkelement kon worden gelezen.
2. Een eerste tweede thuisbatterij-service leek op een autoaccu en was daardoor niet direct brancheherkenbaar.
3. De eerste vervanger voor die thuisbatterij-service bevatte minieme instrumentmarkeringen die als tekst of merkelement konden gelden.

Geen van deze drie varianten staat in de worktree, het manifest of de reviewgalerij. Daarnaast trad bij de eerste uitbreidingsbatch één technische padextractiefout op; er werd daarbij geen bestand aan een kandidaat gekoppeld en de batch is veilig opnieuw uitgevoerd.

## Eindvoorwaarde

De package is alleen gereed wanneer alle checksums gevuld zijn, alle bestanden uniek zijn en alle blokkadevelden exact op de verplichte waarden staan.
