# Epic 1 - Digital Account Manager UX Blueprint

Status: `BLUEPRINT / NO CODE / PRODUCT EXPERIENCE`

## Doel

Ontwerp de complete gebruikerservaring van het klantportaal als digitale accountmanager.

## North Star

Max Webstudio is niet alleen een webbouwer. Het klantportaal moet voelen als een persoonlijke digitale accountmanager die proactief meedenkt, overzicht geeft en ondernemers helpt online te groeien.

## Ontwerpprincipe

Een klant mag nooit hoeven nadenken over de status van zijn website. Het portaal vertelt proactief wat belangrijk is, wat aandacht nodig heeft en wat de volgende stap is.

## Succescriteria

Elke pagina moet minimaal een van deze vragen direct beantwoorden:

- Is mijn website gezond?
- Moet ik vandaag iets doen?
- Wat heeft Max Webstudio voor mij gedaan?
- Wat is de volgende stap?
- Hoe kan ik mijn bedrijf online verder laten groeien?

Als een pagina geen van deze vragen beantwoordt, hoort die functionaliteit niet thuis in Epic 1.

De klant moet binnen 10 seconden voelen:

> "Mijn website wordt echt beheerd. Ik hoef nergens achteraan."

## UX-regels

- Maximaal drie primaire acties per pagina.
- Belangrijkste informatie altijd zichtbaar zonder te scrollen op desktop.
- Mobiel is leidend; desktop is een uitbreiding.
- Geen technische termen zoals SSL, DNS of RLS zonder uitleg.
- Elke pagina bevat een duidelijke call-to-action.
- Max AI verschijnt contextueel en helpt proactief, maar neemt de interface nooit over.
- De klant moet binnen tien seconden begrijpen:
  - hoe zijn website ervoor staat;
  - of actie nodig is;
  - hoe hij eenvoudig hulp krijgt.

## Productprincipes

Epic 1 wordt niet ontworpen als een beheerpaneel, maar als een digitale accountmanager.

Bij iedere ontwerpkeuze geldt:

- Minder klikken is beter dan meer functies.
- Proactieve hulp is beter dan reactieve informatie.
- Acties zijn belangrijker dan statistieken.
- Vertrouwen is belangrijker dan technische details.
- Rust en overzicht winnen altijd van een volle interface.
- De klant hoeft nooit te zoeken naar de volgende stap.
- Max Webstudio begeleidt de klant alsof er een persoonlijke accountmanager meekijkt.

## Informatiearchitectuur

Epic 1 bestaat uit acht klantgerichte gebieden:

1. Vandaag / overzicht
2. Dashboard
3. Mijn Website
4. Projectstatus
5. Wijzigingsverzoeken
6. Berichten
7. Facturen/offertes
8. Notificaties

Max AI is geen losse pagina binnen Epic 1. Max AI is een begeleidende laag door het hele portaal.

## 1. Vandaag / Overzicht

### Doel

De klant direct laten zien of alles goed gaat en welke actie vandaag nodig is.

### Belangrijkste gebruikersvraag

"Moet ik vandaag iets doen?"

### Gewenste informatie

- Website online/offline status.
- Hosting actief/in behandeling.
- Veiligheid/status in begrijpelijke taal.
- Laatste uitgevoerde actie door Max Webstudio.
- Openstaande wijzigingsverzoeken.
- Nieuwe berichten.
- Openstaande facturen.
- Een concrete groeikans of Max-tip.

### Primaire call-to-action

`Vraag wijziging aan`

### Secundaire acties

- `Bekijk website`
- `Lees berichten`
- `Bekijk facturen`

### Tekstueel wireframe

```text
Goedemorgen Max

Vandaag

[Statuskaart]
Je website is online.
Hosting actief.
Laatste controle: vandaag.

[Actiekaart]
1 openstaande factuur.
2 nieuwe berichten.
1 wijzigingsverzoek in behandeling.

[Max zegt]
Je homepage kan sterker worden met een klantreview.

[Vraag wijziging aan] [Bekijk website] [Lees berichten]
```

### Mobiele aandachtspunten

- Eerst de statuskaart, daarna acties.
- CTA's onder elkaar.
- Max-tip compact als korte kaart, niet als grote chat.
- Geen tabellen.

### Data nu

- Staging/demo klantdata.
- LocalStorage fallback.
- Supabase read-layer waar veilig beschikbaar.

### Data later

- Customers.
- Websites.
- Projects.
- Invoices.
- Client portal messages.
- Client portal notifications.
- Change requests.
- Audit/monitoring summaries.

### Toekomstige Max AI-integratie

Max vat de dag samen:

> "Alles draait goed. Alleen je factuur voor onderhoud staat nog open."

Max mag adviseren, maar geen facturen wijzigen, betalingen uitvoeren of statusupdates verzinnen.

## 2. Dashboard

### Doel

Een rustig startpunt bieden met overzicht, vertrouwen en snelle toegang tot de belangrijkste taken.

### Belangrijkste gebruikersvraag

"Hoe staat mijn samenwerking met Max Webstudio ervoor?"

### Gewenste informatie

- Websitegezondheid.
- Openstaande acties.
- Laatste update.
- Financiele status in gewone taal.
- Project- of onderhoudsfase.
- Snelle acties.

### Primaire call-to-action

`Bekijk Mijn Website`

### Secundaire acties

- `Nieuwe wijziging`
- `Bericht sturen`
- `Facturen bekijken`

### Tekstueel wireframe

```text
Welkom terug

[Mijn website]
Online, veilig en actief beheerd.

[Actie nodig]
Geen dringende acties.

[Laatste update]
Max Webstudio heeft vandaag je website gecontroleerd.

[Snelle acties]
Nieuwe wijziging
Bericht sturen
Facturen

[Max zegt]
Wil je meer aanvragen? Voeg een review toe aan je homepage.
```

### Mobiele aandachtspunten

- Geen zijbalk als primaire navigatie.
- Gebruik verticale secties met duidelijke labels.
- Belangrijkste actie bovenaan.

### Data nu

- Demo/staging klantcontext.
- Bestaande project-, website-, factuur- en notificatiegegevens.

### Data later

- Supabase customers, websites, projects, invoices, messages, notifications.

### Toekomstige Max AI-integratie

Max geeft een korte proactieve samenvatting en kan doorklikken naar relevante acties.

## 3. Mijn Website

### Doel

De klant laten begrijpen hoe zijn website ervoor staat, zonder technische details te hoeven kennen.

### Belangrijkste gebruikersvraag

"Is mijn website gezond?"

### Gewenste informatie

- Online status.
- Domeinnaam.
- Hostingstatus.
- Beveiligingsstatus in begrijpelijke taal.
- Snelheidsindicatie.
- SEO-score of SEO-status.
- Laatste backup.
- Laatste controle.
- Laatste update.

### Primaire call-to-action

`Open website`

### Secundaire acties

- `Vraag wijziging aan`
- `Bekijk laatste controle`
- `Vraag hulp`

### Tekstueel wireframe

```text
Mijn Website

[Websitekaart]
Status: Online
Domein: mijnbedrijf.nl
Beveiliging: Actief
Hosting: Actief
Laatste backup: vandaag
Laatste controle: vandaag

[Gezondheid]
Snelheid: Goed
SEO: Kan sterker
Onderhoud: Actief

[Acties]
Open website
Vraag wijziging aan

[Max zegt]
Je website draait goed. Voor meer vertrouwen kun je klantreviews toevoegen.
```

### Mobiele aandachtspunten

- Statuslabels kort houden.
- Technische termen vertalen:
  - SSL wordt "Beveiliging".
  - Hosting wordt "Websitehosting".
  - Backup wordt "Herstelpunt".
- Acties sticky onderaan alleen als dat niet botst met globale sticky CTA's.

### Data nu

- Websites.
- Projects.
- Files waar relevant.
- Demo statusdata.

### Data later

- Website health checks.
- Hosting/backup monitoring.
- Storage metadata.
- Audit summaries.

### Toekomstige Max AI-integratie

Max kan uitleggen wat een status betekent en advies geven, maar mag geen hosting-, domein- of beveiligingsinstellingen aanpassen.

## 4. Projectstatus

### Doel

Projectvoortgang begrijpelijk maken en verwachtingen managen.

### Belangrijkste gebruikersvraag

"Wat is de volgende stap in mijn project?"

### Gewenste informatie

- Voortgang in fases.
- Huidige fase.
- Wat is afgerond.
- Wat wacht op Max Webstudio.
- Wat wacht op de klant.
- Laatste update.
- Verwachte volgende stap.

### Primaire call-to-action

`Bekijk volgende stap`

### Secundaire acties

- `Bericht sturen`
- `Bestand aanleveren`
- `Wijziging aanvragen`

### Tekstueel wireframe

```text
Projectstatus

[Voortgang]
Ontwerp        afgerond
Ontwikkeling   afgerond
SEO            bezig
Hosting        gepland
Livegang       volgende stap

[Huidige status]
We zijn bezig met SEO en laatste controle.

[Wat jij kunt doen]
Lever je logo aan.

[Max zegt]
Zodra je logo binnen is, kan de laatste visuele controle starten.
```

### Mobiele aandachtspunten

- Fases als verticale timeline.
- Geen brede progress-tabellen.
- "Wat jij kunt doen" altijd boven technische details.

### Data nu

- Projects.
- Change requests.
- Messages.
- Files.

### Data later

- Supabase projects.
- Project activity log.
- Client portal messages.
- File/storage metadata.

### Toekomstige Max AI-integratie

Max kan status uitleggen, een project samenvatten en aangeven wat nog nodig is. Max mag projectstatus niet zelfstandig wijzigen zonder interne workflow.

## 5. Wijzigingsverzoeken

### Doel

Wijzigingen aanvragen zonder dat de klant hoeft te bedenken hoe hij dit technisch moet omschrijven.

### Belangrijkste gebruikersvraag

"Hoe vraag ik makkelijk een aanpassing aan?"

### Gewenste informatie

- Type wijziging.
- Korte uitleg.
- Optionele website/pagina.
- Prioriteit.
- Status van eerdere verzoeken.
- Verwachte reactie.

### Primaire call-to-action

`Nieuwe wijziging aanvragen`

### Secundaire acties

- `Bekijk open verzoeken`
- `Bericht sturen`

### Tekstueel wireframe

```text
Wijzigingsverzoeken

Wat wil je aanpassen?

( ) Tekst aanpassen
( ) Foto vervangen
( ) Nieuwe pagina
( ) SEO verbeteren
( ) Iets anders

Vertel kort wat je wilt.

Prioriteit:
Normaal / Spoed

[Verstuur wijziging]

Open verzoeken
- Homepage tekst aanpassen: in behandeling
- Nieuwe foto plaatsen: afgerond
```

### Mobiele aandachtspunten

- Keuzes als grote tapbare opties.
- Eerst keuze, daarna details.
- Formulier maximaal een paar velden tegelijk.
- Uploads pas later toevoegen als Storage volledig productieklaar is.

### Data nu

- Change requests.
- Staging/demo write bridge.
- Local/demo fallback.

### Data later

- Supabase change_requests.
- Storage attachments.
- Audit logs.
- Admin workflow.

### Toekomstige Max AI-integratie

Max kan de tekst van het verzoek helpen formuleren en samenvatten. Max mag verzoeken niet zelfstandig goedkeuren of uitvoeren.

## 6. Berichten

### Doel

Communicatie voelen als een rustig gesprek met Max Webstudio, niet als een e-maillijst.

### Belangrijkste gebruikersvraag

"Heeft Max Webstudio iets voor mij teruggekoppeld?"

### Gewenste informatie

- Nieuwe berichten.
- Gesprekscontext.
- Status van acties.
- Korte mogelijkheid om te reageren.

### Primaire call-to-action

`Bericht sturen`

### Secundaire acties

- `Bekijk wijziging`
- `Bekijk project`

### Tekstueel wireframe

```text
Berichten

Max Webstudio
Vandaag
"Je wijziging is afgerond. Bekijk het resultaat hier."

Jij
"Ziet er goed uit, dank je!"

[Typ je bericht]
```

### Mobiele aandachtspunten

- Chat-achtige layout.
- Kort en scannable.
- Input onderaan, maar niet storend.
- Geen e-mailachtige tabellen.

### Data nu

- Client portal messages.
- Demo/staging write support.

### Data later

- Supabase client_portal_messages.
- Notifications.
- Audit logs.
- Resend e-mailnotificaties na expliciete integratiefase.

### Toekomstige Max AI-integratie

Max kan een gesprek samenvatten of helpen een bericht op te stellen. Max mag geen toezeggingen doen over planning of prijzen zonder menselijke goedkeuring.

## 7. Facturen en Offertes

### Doel

Financiele informatie begrijpelijk en actiegericht tonen.

### Belangrijkste gebruikersvraag

"Moet ik nog iets betalen of goedkeuren?"

### Gewenste informatie

- Openstaande facturen.
- Betaalde facturen.
- Offertes die actie vragen.
- Vervaldatum.
- Bedrag.
- Uitleg in gewone taal.

### Primaire call-to-action

`Bekijk openstaand`

### Secundaire acties

- `Download factuur`
- `Stel vraag`
- `Bekijk offerte`

### Tekstueel wireframe

```text
Facturen en offertes

[Openstaand]
Onderhoud juli
€ 19,95
Betaal voor 14 juli
[Bekijk factuur]

[Betaald]
Hosting juni
Betaald op 1 juni

[Offertes]
Nieuwe landingspagina
Wacht op akkoord
[Bekijk offerte]

[Max zegt]
Wil je dat ik deze factuur kort uitleg?
```

### Mobiele aandachtspunten

- Kaarten in plaats van tabellen.
- Bedrag en status duidelijk.
- Geen live betaalknoppen voordat Mollie productie-ready is.

### Data nu

- Quotes.
- Invoices.
- Subscriptions.
- Demo/local fallback.

### Data later

- Supabase quotes, invoices, subscriptions.
- Mollie payment status.
- PDF/storage metadata.
- Resend reminders.

### Toekomstige Max AI-integratie

Max mag facturen uitleggen en samenvatten. Max mag geen bedragen wijzigen, facturen versturen of betalingen uitvoeren.

## 8. Notificaties

### Doel

Alleen aandacht tonen waar de klant iets aan heeft.

### Belangrijkste gebruikersvraag

"Wat vraagt mijn aandacht?"

### Gewenste informatie

- Nieuwe berichten.
- Openstaande klantacties.
- Afgeronde wijzigingen.
- Belangrijke websitechecks.
- Factuurherinneringen.

### Primaire call-to-action

`Bekijk actie`

### Secundaire acties

- `Markeer als gelezen`
- `Vraag hulp`

### Tekstueel wireframe

```text
Notificaties

Vandaag
- Je website is gecontroleerd.
- Je wijziging is afgerond.
- Je onderhoudsfactuur staat klaar.

Deze week
- Backup gemaakt.
- SEO-tip beschikbaar.
```

### Mobiele aandachtspunten

- Notificaties bundelen.
- Geen constante rode badges.
- Kritieke meldingen onderscheiden van tips.

### Data nu

- Client portal notifications.
- Derived notifications uit bestaande portaldata.

### Data later

- Supabase notifications.
- Monitoring events.
- Audit summaries.
- Resend notification status.

### Toekomstige Max AI-integratie

Max kan prioriteren: wat is belangrijk, wat kan later, wat is alleen informatief.

## Max AI als laag door het portaal

Max AI is geen aparte pagina in Epic 1. Max verschijnt contextueel:

- Dashboard: dagelijkse samenvatting.
- Mijn Website: gezondheid uitleggen.
- Projectstatus: volgende stap uitleggen.
- Wijzigingsverzoeken: aanvraag helpen formuleren.
- Berichten: gesprek samenvatten.
- Facturen: factuur uitleggen.
- Notificaties: prioriteit bepalen.

### Wat Max in Epic 1 wel mag

- Uitleg geven.
- Samenvatten.
- Adviseren.
- Een concepttekst voorstellen.
- De klant naar de juiste actie sturen.

### Wat Max in Epic 1 niet mag

- Betalingen uitvoeren.
- Facturen wijzigen.
- Offertes definitief versturen.
- Gebruikers of rollen aanpassen.
- Hosting, domeinen of productieconfiguratie wijzigen.
- Deployments starten.
- Databasewijzigingen uitvoeren.

## Data- en implementatiegrenzen

Epic 1 wordt ontworpen op basis van de bestaande veilige fundamenten:

- Staging/demo Auth flow is bewezen.
- Klantportaal gebruikt demo/local/hybrid data waar passend.
- Productie-klantportaal blijft bewust dicht tot release approval.
- Supabase read/write foundations blijven leidend.
- Geen OpenAI in Epic 1.
- Geen Mollie live payments in Epic 1.
- Geen Storage uploads totdat Storage Security production-ready is.

## Definition of Done

Epic 1 is pas afgerond wanneer een nieuwe klant zonder uitleg kan inloggen en binnen 10 seconden begrijpt:

- hoe zijn website ervoor staat;
- wat Max Webstudio recent heeft gedaan;
- of er actie nodig is;
- hoe hij eenvoudig een wijziging kan aanvragen;
- waar hij hulp kan krijgen.

Als dat lukt zonder handleiding, is Epic 1 geslaagd.

## Aanbevolen bouwvolgorde

1. Vandaag / overzicht als nieuwe portaalstart.
2. Mijn Website als centrale statuspagina.
3. Wijzigingsverzoeken vereenvoudigen naar keuzehulp.
4. Berichten als gesprekservaring.
5. Facturen/offertes actiegerichter maken.
6. Notificaties prioriteren.
7. Max AI contextkaarten toevoegen zonder OpenAI.

Iedere stap moet klein blijven, met bestaande staging/demo data en zonder productie-risico.
