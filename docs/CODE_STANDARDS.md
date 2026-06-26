# Code Standards

Deze standaarden gelden voor toekomstige wijzigingen.

## Algemene Regels

- Maak kleine wijzigingen.
- Gebruik bestaande patronen.
- Respecteer de huidige structuur.
- Installeer geen libraries zonder toestemming.
- Maak geen grote refactors zonder toestemming.
- Verwijder niets zonder expliciete opdracht.
- Test altijd de relevante flow na wijziging.

## Live Frontend

- `/public` is leidend voor live frontend-wijzigingen.
- Root-bestanden kunnen duplicaten zijn.
- Wijzig root-bestanden alleen als dat expliciet gevraagd wordt of als er een afgesproken sync-strategie is.

## HTML

Elke nieuwe pagina bevat:

- `title`
- `meta description`
- exact een duidelijke H1
- logische headingstructuur
- interne links
- alt-teksten voor afbeeldingen
- consistente header/navigatie
- consistente CTA's

## CSS

- Gebruik bestaande CSS variables.
- Houd 8px border-radius als standaard voor cards/buttons.
- Vermijd losse kleuren wanneer een token bestaat.
- Vermijd overbodige nieuwe componentvarianten.
- Houd responsive gedrag expliciet.
- Controleer mobiel en desktop.

## JavaScript

- Gebruik vanilla JavaScript tenzij anders goedgekeurd.
- Houd scripts klein en gericht.
- Vermijd dubbele data tussen frontend en backend waar mogelijk.
- Bouw DOM veilig op wanneer data uit formulieren komt.
- Voeg geen externe scripts toe zonder reden en goedkeuring.

## Functions

- Geen API keys hardcoden.
- Gebruik environment variables.
- Valideer input server-side.
- Log geen gevoelige data onnodig.
- Geef veilige foutmeldingen terug.
- Houd betaalbedragen server-side leidend.

## Data

Persoonsgegevens moeten zorgvuldig behandeld worden.

Let extra op:

- naam
- e-mail
- telefoonnummer
- bedrijfsgegevens
- intake-antwoorden
- betaalstatussen
- uploads

## Rapportage Na Werk

Na iedere opdracht rapporteert Codex:

- samenvatting
- gewijzigde bestanden
- impact
- controlepunten
- risico's
- suggesties voor verbetering

