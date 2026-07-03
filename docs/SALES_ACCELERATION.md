# Sales Acceleration

Status: `RC1 PRIORITEIT / OMZETMOTOR`

## Doel

Vanaf RC1 bouwen we niets meer dat geen directe invloed heeft op:

- omzet;
- snelheid;
- schaalbaarheid;
- kwaliteit van de dagelijkse verkoopworkflow.

Max CRM moet een verkoper helpen om sneller goede verkoopkansen te vinden, beter voorbereid te bellen en eenvoudiger door te gaan naar offerte en klantactivatie.

## North Star

Een verkoper moet in minder dan 5 minuten:

1. een bedrijf vinden;
2. de website analyseren;
3. de verkoopkansen zien;
4. een gesprek voorbereiden;
5. de lead opslaan;
6. een follow-up plannen.

Als deze workflow soepel loopt, is Max CRM niet alleen administratie, maar een verkoopmachine.

## KPI-Gestuurde Sprints

Vanaf Sales Acceleration krijgt iedere sprint een meetbaar bedrijfsdoel. We bouwen niet meer feature-first, maar business-first.

Iedere sprint moet vooraf vastleggen:

- Primaire KPI: welke verkoop-, snelheid- of klantervaringsmetric verbetert.
- Verwachte impact: wat wordt sneller, beter of winstgevender.
- Meetmethode: hoe we zien of het echt werkt.
- Acceptatie: wanneer de sprint zakelijk geslaagd is.

Voorbeeld:

- Niet: Google Maps verbeteren.
- Wel: Een verkoper bespaart gemiddeld 2 minuten per lead bij het verzamelen van bedrijfsgegevens.

Als een feature binnen 90 dagen geen duidelijke bijdrage levert aan omzet, snelheid of klantervaring, gaat hij naar de backlog.

## KPI Sets

### Sales

- Nieuwe leads per dag.
- Gebelde leads.
- Gesprekken gevoerd.
- Offertes verstuurd.
- Conversie afspraak naar verkoop.
- Conversie lead naar klant.
- Gemiddelde verkoopwaarde.

### CRM Workflow

- Tijd om een nieuwe lead aan te maken.
- Tijd van Google Maps naar offerte.
- Aantal klikken per verkoopworkflow.
- Open follow-ups.
- Gemiste follow-ups.

### Website Scan

- Gemiddelde leadscore.
- Aantal scans per dag.
- Meest voorkomende verbeterpunten.
- Meest voorkomende verkoopkansen.

### Bedrijf

- Maandelijkse terugkerende omzet.
- Aantal actieve klanten.
- Opzegpercentage.
- Gemiddelde klantwaarde.
- Omzet per verkoper.

## Huidige Bouwstenen

Max CRM heeft nu de kern van de Sales Workspace:

- Google Maps Lead Finder;
- Google Places-resultaten en markers;
- leadformulier;
- Website Scan MVP;
- leadscore-basis;
- follow-up en notities;
- offerte- en klantflow als volgende stap.

## Sales Cockpit

De volgende productrichting is de Sales Cockpit: niet zomaar een extra pagina, maar de dagelijkse werkruimte van een verkoper.

Doel:

Een verkoper hoeft niet na te denken wat de volgende stap is. Max CRM toont automatisch waar aandacht nodig is en welke lead als eerste opgepakt moet worden.

Eerste cockpit-blokken:

- Vandaag:
  - Nieuwe leads vandaag.
  - Nog te bellen.
  - Follow-ups.
  - Open offertes.
  - Verkocht vandaag.
- Volgende lead:
  - Google Maps context.
  - Website Scan.
  - Leadscore.
  - Beladvies.
  - Notities.
  - Vorige contactmomenten.
  - Offerte maken.
  - Follow-up plannen.

Belangrijk:

- De Sales Cockpit vervangt niet direct bestaande modules.
- Hij bundelt de belangrijkste acties uit Leads, Website Scan, Follow-up en Offertes.
- De eerste versie mag eenvoudig zijn, zolang hij de verkoper sneller naar actie brengt.

## RC1 Focus

RC1 wordt eerst afgerond voordat nieuwe grote salesfuncties worden toegevoegd.

Toegestaan:

- bugs oplossen;
- UX verbeteren;
- foutmeldingen verduidelijken;
- responsive gedrag verbeteren;
- Google Maps Lead Finder stabiel maken;
- Website Scan betrouwbaarder maken;
- formulieren en follow-up sneller maken.

Niet toegestaan zonder aparte GO:

- AI Sales Coach;
- bulk scraping;
- automatische cold outreach;
- nieuwe sales portals;
- automatische offertegeneratie;
- complexe salesmanager-dashboarding.

## Sales Workspace Workflow

De gewenste verkopersflow:

```text
Google Maps
    ->
Website Scan
    ->
Leadscore
    ->
Gespreksvoorbereiding
    ->
Notities
    ->
Follow-up
    ->
Offerte
```

De verkoper moet zo min mogelijk wisselen tussen schermen.

## Sprint 1 - Pipeline Automation

Status: `NEXT AFTER RC1 STABILITY`

Doel:

Maak de salesflow voorspelbaar, zodat geen lead stil blijft liggen en iedere verkoper direct ziet wat de volgende actie is.

Primaire KPI:

- Minder gemiste follow-ups.
- Minder handmatige denkstappen per lead.
- Snellere route van lead naar offerte.

Pipeline-statussen:

- Nieuw.
- Gebeld.
- Afspraak.
- Offerte verstuurd.
- Gewonnen.
- Verloren.

Gedragsregels:

- Een nieuwe lead start automatisch op `Nieuw`.
- Na eerste contact kan de lead naar `Gebeld`.
- Als er een afspraak staat, gaat de lead naar `Afspraak`.
- Na offerteverzending gaat de lead naar `Offerte verstuurd`.
- Bij akkoord gaat de lead naar `Gewonnen`.
- Bij geen match of afwijzing gaat de lead naar `Verloren`.
- Elke niet-afgeronde lead heeft een volgende actie nodig.
- Elke niet-afgeronde lead heeft bij voorkeur een follow-up datum.
- Leads die te lang stil liggen krijgen een duidelijke waarschuwing.

Niet in deze sprint:

- Geen AI.
- Geen automatische outreach.
- Geen bulk scraping.
- Geen nieuwe finance-flow.
- Geen sales manager leaderboard.

## RC2 - Website Intelligence

RC2 verdiept de objectieve feitenlaag.

Voorbeelden:

- Lighthouse-score;
- Core Web Vitals;
- broken links;
- afbeeldingsoptimalisatie;
- accessibility;
- structured data;
- performance;
- SEO-score;
- technische signalen die als verkoopargument gebruikt kunnen worden.

Nog steeds zonder AI als basis.

## RC3 - AI Sales Coach

AI komt pas bovenop de feitenlaag.

De AI vertaalt objectieve scans naar:

- openingszin;
- mogelijke bezwaren;
- verkoopargumenten;
- pakketadvies;
- vervolgstappen.

AI mag niet gokken. AI moet uitleggen op basis van gemeten signalen.

## RC4 - Offerteflow

De latere commerciële flow:

```text
Scan
    ->
Leadscore
    ->
Advies
    ->
Pakketadvies
    ->
Conceptofferte
    ->
Klantflow
```

## Latere Schaalfase

Wanneer de verkoopworkflow bewezen werkt, komt de Sales Manager Module.

Mogelijke onderdelen:

- dashboard per verkoper;
- aantal gesprekken;
- aantal offertes;
- conversiepercentage;
- omzet;
- activiteiten;
- targets;
- leaderboard;
- commissiemodel.

Deze fase komt pas nadat de basisworkflow aantoonbaar omzet ondersteunt.

## Beslisregel

Elke nieuwe salesfunctie moet minimaal een van deze vragen met ja beantwoorden:

- Helpt dit om sneller een goede lead te vinden?
- Helpt dit om beter te bellen?
- Helpt dit om sneller een offerte te maken?
- Helpt dit om meer klanten te activeren?
- Helpt dit om een salesteam schaalbaar aan te sturen?

Extra filter:

Levert dit binnen 90 dagen meer omzet, meer snelheid of een betere klantervaring op? Zo niet, dan hoort het niet in de eerstvolgende sprint.

Zo niet, dan hoort de functie niet in de eerstvolgende sprint.
