# Website Factory Adapter v1 — analyse en integratiegrens

## Geanalyseerde bestaande interfaces

De bestaande Website Factory gebruikt:

1. `functions/website-factory/config-resolver.js` voor pakket-, branche- en componentmanifesten.
2. `factoryInput` in `functions/website-factory.js` voor bedrijfsnaam, diensten, pagina's, CTA's, branding, teksten en SEO.
3. `buildWebsitePackage()` in `functions/_website-factory-core.js` voor briefingextractie, brancheprofielen, assets, SEO en het uiteindelijke preview/ZIP-pakket.

De adapter levert daarom `websiteFactoryInput` met dezelfde conceptuele velden, maar wordt bewust nog nergens vanuit `functions/` aangeroepen.

## Veilige integratielaag

```text
Content Factory generated data
        ↓
public/v1 (stabiele leesinterface)
        ↓
content-factory-adapter/v1
        ├── rijk adaptercontract
        └── websiteFactoryInput
                ↓ toekomstig, nog niet actief
        bestaande Website Factory-pipeline
```

Hierdoor kan de interne compiler later veranderen zonder dat de Website Factory-adapter daarvan afhankelijk wordt.

## Fallbackbeleid

- Onbekende of lege branche: `lokale-specialist`.
- Onbekend of leeg pakket: `business`.
- Lege bedrijfsnaam: `Uw bedrijf` plus placeholderflag.
- Lege regio: `Nederland` plus local-SEO-fallbackflag.
- Ontbrekend assetslot: generiek prompt-ready placeholderobject zonder opslagpad.
- Ontbrekende contactgegevens: `null` in contactoutput en expliciete flags.
- Reviews: niet-publiceerbare voorbeeldrecords; de compatibiliteitsinput bevat altijd een lege reviewlijst.

## Niet in scope

- Productiecode activeren of aanpassen.
- Databasewijzigingen.
- Nieuwe content genereren of bestaande 101 branchebibliotheken herschrijven.
- Afbeeldingen produceren of uploaden.
- Preview- of ZIP-flow wijzigen.
