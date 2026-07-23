# Website Factory × Content Factory — integratiestap 1

## Status

De Content Factory Adapter v1 kan nu vóór de bestaande Website Factory-renderer worden uitgevoerd. De integratie is standaard uitgeschakeld, schrijft niet naar de database en verandert preview-, ZIP- of publicatiegedrag niet zolang de featureflag uitstaat.

## Datastroom

```text
journey + briefing + package
            ↓
featureflagged bridge
            ↓
resolveWebsiteContent()
            ↓
websiteFactoryInput
            ↓
bestaande buildWebsitePackage()-renderer
```

De bestaande `generate_website_package`- en build-jobroutes gebruiken dezelfde bridge. Er is daardoor één integratiepunt voor directe generatie én opgeslagen previewbuilds.

## Featureflag

De servervariabele `CONTENT_FACTORY_ADAPTER_V1_MODE` ondersteunt:

- `off` — standaard; de adapter wordt niet geladen en de legacy rendererinput blijft bytegelijk ongewijzigd.
- `shadow` — de adapter wordt uitgevoerd en vergeleken met legacy input, maar de renderer ontvangt uitsluitend legacy input.
- `active` — de adapteruitvoer wordt als `websiteFactoryInput` aan de bestaande renderer geleverd.

Een onbekende waarde wordt behandeld als `off`.

## Veilige fallback

Als de adapter in `shadow` of `active` niet kan worden geladen of geen geldige output levert:

- wordt de oorspronkelijke journey en briefing gebruikt;
- blijft `usedByRenderer` false;
- krijgt metadata status `legacy_fallback`;
- wordt reden `adapter_resolution_failed` vastgelegd;
- gaat de bestaande build verder zonder adapterafhankelijkheid.

## Renderercontract

`buildWebsitePackage()` accepteert nu optioneel `factoryInput`. Zonder deze parameter blijft het bestaande gedrag gelijk. Met deze parameter kunnen bedrijfsgegevens, branche, services, hero, USP's, CTA, kleuren, tone of voice en SEO uit de gestandaardiseerde adapterinput komen.

Voorbeeldreviews worden niet aan de renderer doorgegeven. `websiteFactoryInput.texts.reviews` blijft leeg en het beleid blijft `verified_reviews_only`.

## Observability

In `shadow` en `active` wordt compacte metadata toegevoegd aan `generatedPackage.meta.contentFactoryAdapter`, waaronder:

- contract- en bronversie;
- resolved vertical;
- deterministische seed;
- gebruikte modus en fallbackstatus;
- placeholderflags;
- vergelijking van bedrijfsnaam, serviceaantallen, overlap en reviewbeveiliging.

Er wordt geen volledige dubbele Content Factory-output in deze observabilitymetadata opgeslagen.

## Activeringsvolgorde

1. Lokaal en CI: `shadow` voor golden-mastervergelijkingen.
2. Staging: eerst controleren dat de Content Factory runtimebestanden in de function bundle aanwezig zijn.
3. Staging: `shadow`, resultaten voor kernbranches verzamelen.
4. Staging: `active` voor een afgebakende testset.
5. Productie blijft `off` tot afzonderlijke releasegoedkeuring.

Het bundelen van de branchebibliotheek in de Netlify function is bewust nog niet geactiveerd; deze wijziging doet geen deploy en vergroot het productieartefact nog niet.

## Rollback

Zet `CONTENT_FACTORY_ADAPTER_V1_MODE=off` of verwijder de variabele. Hiervoor is geen database-rollback of contentmigratie nodig.
