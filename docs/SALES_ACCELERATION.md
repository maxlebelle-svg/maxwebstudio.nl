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

## Huidige Bouwstenen

Max CRM heeft nu de kern van de Sales Workspace:

- Google Maps Lead Finder;
- Google Places-resultaten en markers;
- leadformulier;
- Website Scan MVP;
- leadscore-basis;
- follow-up en notities;
- offerte- en klantflow als volgende stap.

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

Zo niet, dan hoort de functie niet in de eerstvolgende sprint.
