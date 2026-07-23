# Importvoorstel — NIET UITGEVOERD

Dit voorstel is uitsluitend een latere handmatige procedure. Er is nu niets geregistreerd, gekoppeld, geactiveerd, gepusht of gedeployed.

## Harde prerequisites

1. Gold Set-certificering is aantoonbaar afgerond.
2. Een bevoegde reviewer beoordeelt ieder beeld visueel in `review-gallery.html`.
3. Afgekeurde kandidaten worden niet geïmporteerd en blijven buiten iedere actieve library.
4. Goedgekeurde kandidaten krijgen een nieuwe, traceerbare reviewregistratie; deze sprint verzint of simuleert geen review.
5. Checksum en bestand worden vlak voor import opnieuw vergeleken.

## Voorgestelde latere handmatige mapping

- `branch` en `specialization` bepalen uitsluitend de voorgestelde bestemming.
- `asset_slot: hero` kan na goedkeuring worden voorgesteld als hero-bron.
- `asset_slot: service` kan na goedkeuring worden voorgesteld als service-bron.
- `asset_slot: about_team` kan na goedkeuring worden voorgesteld als about- of teambron.
- `asset_slot: detail_ambiance` kan na goedkeuring worden voorgesteld als detail- of ambiance-bron.
- Geen kandidaat-ID wordt automatisch aan een Gold Set-case, manifest, rendererimport of featureflag gekoppeld.

## Niet opgenomen in dit voorstel

- Geen uitvoerbaar importscript.
- Geen library-mutatie.
- Geen adapter- of rendererwijziging.
- Geen productie- of stagingactivatie.
- Geen databaseactie.
- Geen push of deploy.
