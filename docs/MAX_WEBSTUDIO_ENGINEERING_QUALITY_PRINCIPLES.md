# Max Webstudio Engineering & Quality Principles

Status: **Normatief**  
Versie: **1.0.0**  
Eigenaar: **Max Webstudio**  
Toepassing: Website Factory, Content Engine, Business Intelligence, Design Engine, Social Studio en toekomstige publicatiekanalen.

## 1. Doel

Dit document bepaalt wanneer een wijziging of gegenereerde uiting betrouwbaar genoeg is om aan een echte klant te tonen of te publiceren. De principes gelden voor mensen, services en AI-agents die content, design, bedrijfsdata of software produceren.

De hoogste regel is:

> Een demo mag nooit overtuigender lijken dan de beschikbare feiten rechtvaardigen.

Een commercieel sterk resultaat is alleen geslaagd wanneer het ook technisch correct, herleidbaar, menselijk goedgekeurd en feitelijk verantwoord is.

## 2. Niet-onderhandelbare beginselen

1. **Truth before persuasion.** Feitelijke betrouwbaarheid gaat altijd vóór conversie, stijl of verkoopkracht.
2. **Eén bron van waarheid.** Website, social, SEO, blogs, nieuwsbrieven en Google Bedrijfsprofiel gebruiken dezelfde genormaliseerde content en provenance.
3. **Scheiding van feiten en creatie.** Bedrijfsfeiten, marketingtekst, placeholders en AI-voorstellen zijn verschillende datatypen en mogen niet stilzwijgend in elkaar overgaan.
4. **Fail closed.** Bij ontbrekend, conflicterend, verouderd of onvoldoende betrouwbaar bewijs wordt een claim geblokkeerd of expliciet als voorstel gemarkeerd.
5. **Menselijke verantwoordelijkheid.** Een AI-score kan nooit zelfstandig publicatie of klantgeschiktheid goedkeuren.
6. **Reproduceerbaarheid.** Dezelfde input, versie en seed leveren dezelfde compositie op, inclusief vastgelegde fallbackkeuzes.
7. **Veilige evolutie.** V1 blijft beschikbaar als fallback totdat V2 aantoonbaar en herhaaldelijk aan alle releasegates voldoet.
8. **Geen kwaliteitsgemiddelden die fouten verbergen.** Eén ernstige fout in één Gold Set-case kan niet worden gecompenseerd door hoge scores elders.

## 3. No Hallucination Gate

De No Hallucination Gate is de hoogste releasevoorwaarde en kan niet worden overruled door een technische, commerciële of menselijke totaalscore.

### 3.1 Vereiste

Iedere feitelijke uitspraak moet:

- herleidbaar zijn naar een toegestane bron;
- passen binnen toestemming en publicatiestatus;
- voldoende actueel en betrouwbaar zijn;
- óf expliciet herkenbaar blijven als voorstel, placeholder of AI-content die niet als feit gepubliceerd mag worden.

### 3.2 Toegestaan

- Een hero professioneler formuleren op basis van bekende bedrijfsinformatie.
- Bestaande tekst herschrijven zonder nieuwe feiten toe te voegen.
- Een logische dienstenstructuur voorstellen en als voorstel markeren.
- Fotografieprompts maken die branche, stijl en merkpersoonlijkheid uitbeelden.
- SEO- en regiocontent maken op basis van bevestigde diensten en locaties.
- Generieke voordelen formuleren die geen specifieke bedrijfsclaim impliceren.

### 3.3 Verboden zonder verifieerbare bron en publicatierechten

- Reviews, klantnamen of reviewratings verzinnen.
- Projecten, cases, resultaten of portfolio-items verzinnen.
- Certificeringen, keurmerken, partners of lidmaatschappen verzinnen.
- Een oprichtingsjaar, aantal ervaringsjaren of familiehistorie verzinnen.
- Aantallen klanten, projecten, medewerkers of locaties verzinnen.
- Prijzen, garanties, openingstijden of beschikbaarheid onbevestigd publiceren.
- Superlatieven zoals “nummer 1”, “marktleider” of “beste” als feit presenteren.
- AI-afleidingen promoveren tot bedrijfsfeit zonder verificatie.

### 3.4 Uitkomst

De gate kent uitsluitend:

- `pass`: alle gepubliceerde feiten hebben voldoende bewijs en rechten;
- `blocked`: minimaal één claim mist bewijs, actualiteit, toestemming of een toegestane publicatiestatus.

Er bestaat geen waarschuwing waarmee een geblokkeerde claim alsnog automatisch mag worden gepubliceerd.

## 4. Contenttypen en publicatieregels

| Type | Voorbeeld | Standaard publiceerbaar |
| --- | --- | --- |
| Bedrijfsfeit | “Gevestigd in Kampen” | Alleen na provenancebesluit |
| Marketingformulering | “Persoonlijk advies, helder geregeld” | Ja, als dit geen onbewezen feit impliceert |
| AI-voorstel | Voorgestelde nieuwe dienst | Nee, eerst menselijke of klantverificatie |
| Placeholder | Voorbeeldreview of tijdelijk project | Nooit als echt feit |
| Interne bibliotheekcontent | Branche-FAQ of generieke CTA | Ja, mits passend en niet misleidend |
| Creatief asset | AI-foto of illustratie | Alleen met correcte rol en zonder gefingeerd bewijs |

AI-fotografie mag sfeer en stijl ondersteunen, maar mag niet als bewijs van een echt team, project, pand, certificaat of klantresultaat worden gepresenteerd.

## 5. Provenance-contract

Ieder bedrijfsfeit of publicatiegevoelig gegeven gebruikt minimaal het volgende model:

```text
value
source
source_type
source_url
confidence_score
verification_status
observed_at
last_verified_at
publication_status
consent_basis
decision_reason
decision_notes
decided_by
decided_at
```

### 5.1 Toegestane `source_type`-waarden

- `official_api`
- `customer_connected`
- `customer_uploaded`
- `website_discovered`
- `manual_entry`
- `ai_generated`
- `internal_library`

### 5.2 Operationele basisregels

- `official_api`: mag synchroniseren binnen bronvoorwaarden; publicatie vereist nog steeds actualiteit en toepasselijke toestemming.
- `customer_connected`: hoge bronwaarde, binnen de expliciet verleende scope.
- `customer_uploaded`: niet automatisch overschrijven zonder toestemming.
- `website_discovered`: eerst verifiëren voordat een risicodragend bedrijfsfeit wordt gepubliceerd.
- `manual_entry`: beslissing en verantwoordelijke vastleggen.
- `ai_generated`: nooit zelfstandig als bedrijfsfeit publiceren.
- `internal_library`: bruikbaar voor generieke marketingcontent, niet als bewijs over het bedrijf.

### 5.3 Besluitredenen

`decision_reason` gebruikt gecontroleerde codes. Minimaal ondersteund:

- `official_source_verified`
- `customer_approved`
- `customer_consent_missing`
- `confidence_below_threshold`
- `source_conflict`
- `source_outdated`
- `ai_generated_fact_blocked`
- `manual_review_required`

`decision_notes` mag context toevoegen, maar vervangt nooit de gecontroleerde code.

### 5.4 Confidence is geen toestemming

`confidence_score` drukt vertrouwen in juistheid uit. Het verleent geen toestemming, bewijst geen actualiteit en maakt een gegeven niet automatisch publiceerbaar. Publicatie wordt afzonderlijk bepaald door bronsoort, verificatie, actualiteit, toestemming en publicatiestatus.

## 6. Gold Set

De Gold Set bestaat uit 20–30 representatieve referentiebedrijven met vaste input, seed en verwachte dimensies. De set dekt minimaal verschillende branches, subspecialisaties, stijlen, persoonlijkheden, thema’s en contentdoelen.

Per case worden minimaal beoordeeld:

- hero;
- diensten;
- CTA-intentie;
- SEO;
- fotografie en fotografieprompts;
- layout, kleuren en typografie;
- conversie en leesbaarheid;
- branche- en specialisatiespecificiteit;
- onderscheid ten opzichte van andere demo’s;
- determinisme en renderercompatibiliteit;
- blokkade van niet-geverifieerde claims.

Een wijziging mag geen gecertificeerde case verslechteren. Iedere afwijking bevat evidence, eigenaar, besluit en zo nodig een herstelactie.

## 7. Commerciële beoordeling

De Gold Set bevat naast technische controles een menselijke commerciële beoordeling:

- Is de eerste indruk professioneel?
- Wekt de demo passend vertrouwen?
- Is de gewenste actie direct duidelijk?
- Voelt de website branchespecifiek?
- Is de demo zichtbaar onderscheidend?
- Past de premium-uitstraling bij het verkoopbare product?

Deze beoordeling wordt gemotiveerd. Een numerieke score zonder toelichting is geen releasebewijs.

## 8. Customer Success Gate

Vóór shadow release beantwoordt een verantwoordelijke beoordelaar per Gold Set-case:

1. Zou ik deze demo vandaag naar een echte klant sturen?
2. Zou ik hem met trots in een verkoopgesprek openen?
3. Voelt hij als een maatwerkwebsite?
4. Bevat hij geen opvallende AI-fouten?
5. Verwacht ik redelijkerwijs dat de klant hiervoor wil betalen?

Alle antwoorden moeten `ja` zijn. Een `nee` blokkeert de release en vereist:

- een vaste reden;
- een eigenaar;
- een herstelactie;
- een nieuwe beoordeling na herstel.

## 9. Verplichte releaseketen

```text
Library / Adapter / Renderer wijziging
        ↓
Unit tests
        ↓
Contracttests
        ↓
Gold Set technische regressie
        ↓
Gold Set commerciële beoordeling
        ↓
Customer Success Gate
        ↓
No Hallucination Gate
        ↓
Shadow release
        ↓
Staging
        ↓
Production
```

Geen stap mag worden overgeslagen. Iedere gate levert versiebeheerbare evidence. Productieactivering vereist expliciete goedkeuring en gebeurt nooit alleen omdat tests technisch groen zijn.

## 10. Business Intelligence-toelatingsregel

Business Intelligence wordt pas ontwikkeld bovenop de Content Factory nadat de Gold Set gecertificeerd en de Library bevroren is.

```text
Gold Set Certified
        ↓
Library Freeze
        ↓
Business Intelligence Development
        ↓
Gold Set opnieuw uitvoeren
        ↓
BI-impact aantoonbaar gelijk of beter
        ↓
Customer Success + No Hallucination opnieuw PASS
        ↓
Pas dan productie
```

Business Intelligence is een verbeterlaag en mag geen zwakke Content Library maskeren. Een rijker profiel dat nieuwe onzekerheid, onjuiste claims of visuele achteruitgang introduceert, blokkeert de release.

## 11. Platformgrenzen

Max Webstudio bestaat uit vijf samenwerkende, onafhankelijk testbare engines:

1. **Website Factory** — renderen, preview, bewerken, exporteren en publiceren.
2. **Content Engine** — centrale contentcompositie voor alle kanalen.
3. **Business Intelligence** — verzamelen, normaliseren, verifiëren en besluiten over bedrijfsdata.
4. **Design Engine** — stijl, layout, tokens, componentvarianten en assetrichting.
5. **Social Studio** — kanaalspecifieke distributie en planning.

Alle engines gebruiken dezelfde Content Library, provenance-regels en waarheidsgates. Een engine mag geen eigen parallelle waarheid creëren of geblokkeerde informatie alsnog publiceren.

## 12. Verantwoordelijkheid van ontwikkelaars en AI-agents

Iedere bijdrager moet:

- bestaande provenance en blokkades behouden;
- onzekerheid expliciet maken;
- geen ontbrekende feiten invullen op basis van waarschijnlijkheid;
- v1/fallbackgedrag beschermen tijdens gecontroleerde migraties;
- tests en evidence aanpassen wanneer gedrag verandert;
- stoppen en escaleren wanneer bron, toestemming of releasebevoegdheid ontbreekt;
- geen productieactivering of publicatie afleiden uit een technische implementatieopdracht.

Een verzoek om content “overtuigender” te maken heft deze regels nooit op.

## 13. Definitie van releasewaardig

Een wijziging is pas releasewaardig wanneer:

- code- en contracttests slagen;
- de technische Gold Set niet achteruitgaat;
- de commerciële beoordeling slaagt;
- de Customer Success Gate voor iedere case slaagt;
- de No Hallucination Gate zonder uitzondering slaagt;
- evidence, versies, seeds, fallbacks en beslissingen zijn vastgelegd;
- shadow en staging geen nieuwe regressies tonen;
- een bevoegde mens productie expliciet goedkeurt.

Alles daaronder is experimenteel, shadow-only of geblokkeerd.
