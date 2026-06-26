# Design System

Dit document beschrijft de huidige visuele basis van Max Web Studio.

## Merkgevoel

Max Web Studio moet voelen als:

- professioneel
- snel
- premium
- toegankelijk
- betrouwbaar
- zakelijk zonder kil te worden

Nieuwe onderdelen moeten eruitzien alsof ze altijd onderdeel van de website zijn geweest.

## Kleuren

Huidige CSS tokens in `/public/styles.css`:

- `--ink: #06121f`
- `--muted: #5b6573`
- `--line: #dce4ed`
- `--paper: #f6f8fb`
- `--white: #ffffff`
- `--blue: #155eef`
- `--blue-dark: #0b3fb8`
- `--cyan: #19c2ff`
- `--green: #2bd982`
- `--shadow: 0 24px 70px rgba(6, 18, 31, 0.14)`

Gebruik deze tokens voor nieuwe styling.

## Typografie

Primair lettertype:

- Inter via Google Fonts

Fallback:

- system-ui
- -apple-system
- BlinkMacSystemFont
- Segoe UI
- sans-serif

Stijl:

- stevige headings
- korte duidelijke alinea's
- veel gebruik van 700-900 font weight voor CTA's en labels
- geen negatieve letterspacing

## Spacing En Layout

Patronen:

- brede secties met `clamp()` padding
- cards met 8px border-radius
- grids met `minmax(0, 1fr)`
- duidelijke sectieafstand
- sticky header

Nieuwe secties moeten luchtig blijven, maar niet marketingachtig overdreven worden.

## Buttons

Huidige primaire button:

- blauwe achtergrond
- wit tekst
- stevige font-weight
- hover met lichte lift

Huidige secundaire button:

- witte achtergrond
- donkere tekst
- subtiele border

Gebruik bestaande `.button`, `.primary`, `.secondary` patronen.

## Cards

Cards hebben doorgaans:

- 8px border-radius
- `var(--line)` border
- witte of lichte achtergrond
- subtiele shadow

Vermijd nested cards tenzij er een duidelijke functionele reden is.

## Beeldgebruik

Huidige homepage gebruikt drie case-afbeeldingen in `/public/assets`.

Richtlijnen:

- gebruik relevante echte of conceptuele visuals
- voeg altijd alt-teksten toe
- optimaliseer bestandsgrootte
- voeg waar mogelijk `width`, `height`, `loading` en `decoding` toe

## Animatie

Huidige animaties zijn subtiel:

- hover lifts
- reveal-on-scroll
- slider-overgangen
- Calendly popup lazy load

Nieuwe animaties moeten conversie en duidelijkheid ondersteunen, niet afleiden.

