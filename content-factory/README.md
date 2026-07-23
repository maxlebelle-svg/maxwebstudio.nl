# Max Webstudio Content Factory 1.0

Een schaalbare, versieerbare contentbibliotheek waarmee de Website Factory vanuit één branche en een kleine bedrijfsbriefing direct professionele demo-inhoud kan samenstellen. De Content Factory staat volledig los van de productiecode van Release 1.0.

## Omvang van versie 1.0

- 101 branches in 12 categorieën.
- 58.782 inhoudelijke records.
- Per branche minimaal 20 hero-varianten, 100 SEO-zoekwoorden, 100 FAQ's, 50 voorbeeldreviews, 100 socialideeën en 50 blogonderwerpen.
- Per branche 30 CTA's, 30 USP's, 30 projectomschrijvingen, 30 teamprofielen en 30 galerijbeschrijvingen.
- 5.151 exact beschreven beeld-, vector- en videoplaceholders en 5.151 professionele AI-prompts.
- 16 uniforme assetmappen per branche.
- Generator voor homepage, diensten, over ons, contact, FAQ, blogs, SEO, social media, nieuwsbrief en Google Bedrijfsprofiel.

## Mappenstructuur

```text
content-factory/
├── config/requirements.json       harde minimumaantallen en kanalen
├── schemas/                       publieke JSON-contracten
├── src/
│   ├── verticals.mjs              compacte branche-seeds
│   ├── compiler.mjs               content- en assetcompiler
│   ├── validator.mjs              volledigheidsbewaking
│   ├── engine.mjs                 content generation engine
│   └── cli.mjs                    command-line ingang
├── public/v1/                     stabiele publieke leesinterface
├── content-factory-adapter/v1/    versioned Website Factory-adapter
├── generated/
│   ├── catalog.json               centrale lichte index
│   ├── content-library.json       centrale volledige JSON-definitie
│   └── branches/<slug>/           content, assetmanifest en prompts
├── content-library/<slug>/        uniforme, gereserveerde assetmappen
├── tests/                          contract- en integratietests
└── docs/                           architectuur en uitbreidingsregels
```

Iedere branchemap bevat `hero`, `backgrounds`, `team`, `atmosphere`, `gallery`, `services`, `projects`, `reviews`, `about`, `cta`, `icons`, `brand`, `illustrations`, `social`, `logos` en `video`.

## Gebruik

Alle commando's draaien vanuit deze map en gebruiken alleen de ingebouwde Node.js-functionaliteit; installatie van dependencies is niet nodig.

```bash
npm run build
npm run validate
npm test
node src/cli.mjs generate \
  --branch loodgieter \
  --business "Jansen Installaties" \
  --place Utrecht \
  --region Midden-Nederland \
  --output ./output/jansen-installaties
```

De gegenereerde output bestaat uit losse JSON-bestanden per kanaal. Een toekomstige Website Factory-adapter kan deze objecten direct op bestaande templates projecteren.

De eerste veilige adapter is beschikbaar via `@maxwebstudio/content-factory/adapter/v1`. Deze levert zowel een rijk contentcontract als een compatibele `websiteFactoryInput`, maar is bewust nog niet in productiecode geactiveerd. Zie [Website Factory Adapter v1](./content-factory-adapter/v1/README.md).

## Datamodel

Een branch bevat identiteit, omschrijving, tone of voice, doelgroep, kernwoorden, SEO-termen, merkpalet, fonts, iconen, illustraties, logo- en videoplaceholders, hero's, diensten, reviews, FAQ's, CTA's, USP's, projecten, teamprofielen, galerijteksten, socialideeën en blogonderwerpen.

Het assetmanifest legt per beeld exact vast: gebruikstype, onderwerp, opslagpad, bronresolutie, verhouding, uitvoerformaten, focuspunt, alt-tekst, templatebindings, rechtenstatus en de volledige AI-prompt. De prompt bevat stijl, belichting, compositie, camera, kleurgebruik, onderwerp, negatieve prompt en doelcomponent.

## Veilig publiceren

Alle klantnamen, plaatsen en contactgegevens zijn placeholders totdat de engine bedrijfscontext ontvangt. Reviews zijn nadrukkelijk voorbeeldcopy en bevatten een disclosure. Vervang ze vóór publicatie door geverifieerde klantreviews. Controleer daarnaast iedere gegenereerde tekst en ieder toekomstig AI-beeld op juistheid, rechten, toegankelijkheid en branchespecifieke regelgeving.

Zie [ARCHITECTURE.md](./docs/ARCHITECTURE.md) voor de systeemgrenzen en [EXTENDING.md](./docs/EXTENDING.md) om een nieuwe branche toe te voegen.
