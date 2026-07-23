# Content Library v2 — meerlagige compositiearchitectuur

## Besluit

De Content Library modelleert niet langer één groot brancheobject dat alle teksten, stijlen en beelden bevat. De bibliotheek bestaat uit onafhankelijke, versioneerbare dimensies die pas bij een concrete aanvraag deterministisch worden samengevoegd. Het resulterende v2-contract is bevroren als `2.0.0`.

```text
Branche ───────────────┐
Subspecialisatie ──────┤
Visuele stijl ─────────┤
Merkpersoonlijkheid ───┤
Thema, doel en regio ───┼─> Compositieresolver ─> kanaalneutraal blueprint
Contentblok ───────────┤                         ├─> Website Factory-adapter
Kanaal ────────────────┤                         ├─> Social Studio-adapter
Assetslot ─────────────┘                         ├─> Nieuwsbrief-adapter
                                                  └─> Google Bedrijfsprofiel-adapter
```

De resolver materialiseert alleen de gevraagde combinatie. Er worden dus geen bestanden vooraf gekopieerd voor iedere mogelijke combinatie van branche, stijl, persoonlijkheid, kanaal en assetslot.

## Onafhankelijke lagen

### 1. Branche

Bevat alleen branchespecifieke waarheid: naam, categorie, doelgroep, primaire dienst, verwante onderwerpen, basis-tone-of-voice, diensten en vakinhoudelijke beperkingen. Een branche bevat geen definitieve huisstijl of klantpersoonlijkheid.

### 2. Visuele stijl

Definieert vormtaal: typografie, layoutdichtheid, hoeken, schaduwen, iconen, fotografie, kleurgedrag en bewegingsniveau. De eerste catalogus bevat acht herbruikbare stijlfamilies met herkenbare aliassen zoals `premium`, `modern`, `minimalistisch`, `warm`, `industrieel` en `scandinavisch`.

`dark` en `light` zijn bewust een aparte themadimensie. Daardoor hoeft iedere stijl niet dubbel te worden opgeslagen en kan bijvoorbeeld zowel `premium + dark` als `premium + light` bestaan.

### 2a. Subspecialisatie

Een subspecialisatie hangt onder een bestaande hoofdbranche en voegt onderwerpen, fotografieobjecten en SEO-context toe zonder een nieuwe branch te maken. De eerste catalogus bevat 50 subspecialisaties voor tien prioriteitsbranches. Een ongeldige combinatie, zoals `loodgieter + sushi`, wordt fail-closed geweigerd.

### 3. Merkpersoonlijkheid

Definieert hoe het merk spreekt en bewijs opbouwt. De eerste catalogus bevat `familiebedrijf`, `innovatief`, `jong`, `traditioneel`, `lokaal`, `persoonlijk` en `corporate`. Persoonlijkheid beïnvloedt verhaalhoek, bewijsprioriteiten, CTA-stijl, blokvolgorde en fotografie-instructies, maar overschrijft nooit branchefeiten.

### 4. Contentblokken

Content is opgebouwd uit semantische blokken: hero, USP's, diensten, about, CTA, FAQ, reviews, projecten, team, footer, SEO, social, nieuwsbrief en Google Bedrijfsprofiel. Elk blok verklaart:

- zijn rol in de klantreis;
- voor welke kanalen het geschikt is;
- welke invoer verplicht is;
- welke presentatievarianten adapters mogen gebruiken;
- welk publicatiebeleid geldt.

Blokken bevatten geen renderer-HTML. Hierdoor kunnen Website Factory en Social Studio hetzelfde bronblok anders presenteren zonder inhoud te dupliceren.

Hero's bevatten daarnaast messaging-intenties zoals conversie, storytelling, lokaal, prijs, portfolio en emotie. CTA's bevatten actie-intenties zoals afspraak, offerte, bellen, WhatsApp, demo, terugbellen en reserveren. Het contentdoel bepaalt welke intenties voorrang krijgen.

### 5. Fotografie

Fotografie wordt on demand opgebouwd uit:

```text
brancheonderwerp
+ visuele fotografiestijl
+ merkpersoonlijkheidsmodifier
+ light/dark-themarichting
+ assetslot en gebruiksdoel
+ resolutie, verhouding en focuspunt
+ universele negatieve prompt en veiligheidsregels
```

`composePhotographyPrompt()` levert daardoor voor iedere aangevraagde combinatie een eigen prompt, bijvoorbeeld:

- `loodgieter + premium + familiebedrijf + hero`;
- `restaurant + modern + jong + team`;
- `holistisch + warm + persoonlijk + about`.

Alle beeldoutput blijft `planned` totdat generatie, menselijke kwaliteitscontrole, duplicaatcontrole en rechten-/modelreleasecontrole zijn afgerond.

## Kanaalneutraal contract

`public/v2/index.mjs` publiceert twee kernfuncties:

```js
listContentLibraryDimensionsV2()

composeContentLibraryBlueprint({
  vertical: "loodgieter",
  style: "premium",
  brandPersonality: "familiebedrijf",
  theme: "light",
  channels: ["website", "social"],
  seed: 42
})
```

De uitvoer bevat dimensies, designtokens, contentstrategie, relevante blokcontracten, fotografie-recept en ondersteunde consumers. Het object bevat geen productiecode en geen kanaalspecifieke markup.

## Schaalbaarheid

Met 101 branches, 8 stijlen, 7 persoonlijkheden, 2 thema's en 14 blokken zijn theoretisch al 158.368 basiscombinaties mogelijk. Die worden niet als 158.368 bestanden opgeslagen. Alleen de afzonderlijke bronlagen worden onderhouden; de resolver maakt de gewenste combinatie in milliseconden.

Nieuwe uitbreidingen blijven additief:

- branche 102 vereist één nieuwe brancheseed;
- stijl 9 vereist één nieuw stijlprofiel;
- persoonlijkheid 8 vereist één nieuw persoonlijkheidsprofiel;
- een nieuw kanaal vereist blokbindings en een adapter;
- een nieuwe componentvariant wijzigt alleen het betreffende blokcontract.

## Quality Score

De Quality Score is uitlegbaar en regelgebaseerd. Hij meet onder andere volledigheid, specificiteit, kanaalfit, conversiearchitectuur, SEO, leesbaarheid en publicatieveiligheid. Iedere score bevat de onderliggende checks. `ai_confidence` blijft `null/not_measured` totdat een echte model- of menselijke evaluatie beschikbaar is.

## Versies en grenzen

- v1 blijft de bestaande gegenereerde content- en Website Factory-adapter leveren.
- v2 is bevroren als stabiel kanaalneutraal compositiecontract `2.0.0`.
- Adapter v2 is integratiegereed maar niet in productie geactiveerd.
- productie-integratie volgt pas na contractstabilisatie en regressietests.
- er zijn geen databasewijzigingen en geen productiewijzigingen nodig voor dit ontwerp.
- echte bulkcontent en beeldgeneratie zijn vervolgfases, niet onderdeel van de architectuurfase.

## Volgende gecontroleerde fasen

1. Adapter v2 via een aparte integratie achter een featureflag op de bestaande renderer aansluiten.
2. Een vergelijkingstest uitvoeren tussen v1- en v2-demo's.
3. Social Studio-adapter op exact hetzelfde blueprint bouwen.
4. Een kleine gecertificeerde beeldset produceren voor prioriteitsbranches en stijlen.
5. Pas na kwaliteitsmeting de productiequeue gefaseerd opschalen.
