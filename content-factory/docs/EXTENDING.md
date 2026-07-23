# Een branche toevoegen

1. Voeg één `V(...)`-regel toe aan `src/verticals.mjs` met een unieke slug, naam, categorie, specialistenrol, primaire dienst en minimaal drie branchetermen.
2. Voeg alleen een nieuwe categorie toe wanneer tone of voice, doelgroep, visuele stijl, dienstenpatronen, kleuren en typografie wezenlijk afwijken.
3. Voer `npm run build` uit vanuit `content-factory/`.
4. Voer `npm test` en `npm run validate` uit.
5. Controleer de nieuwe branch in `generated/branches/<slug>/` en het assetmanifest handmatig op vakinhoudelijke nuances.

De compiler maakt alle minimumcontent en alle uniforme assetmappen aan. Hierdoor vereist branche 102 geen kopie van honderden handgeschreven records.

## Redactionele regels

- Laat `[BEDRIJFSNAAM]`, `[PLAATS]` en andere placeholders intact in bibliotheekcontent.
- Voorbeeldreviews moeten de disclosure behouden en mogen pas na vervanging door geverifieerde reviews live.
- Certificaten, garanties, prijzen en wettelijke claims mogen nooit generiek worden verzonnen.
- AI-assets moeten voor publicatie worden gecontroleerd op rechten, realisme, vakveiligheid en ongewenste merknamen.
- Lokale SEO-pagina's moeten betekenisvolle unieke informatie krijgen; plaatsnamen wisselen zonder lokale inhoud is onvoldoende.
