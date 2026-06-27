# Component Library

Dit document beschrijft de bestaande componenten en patronen. Gebruik deze als basis voordat er nieuwe componenten worden bedacht.

## Header

Bestaat uit:

- `.site-header`
- `.brand`
- `.brand-mark`
- `.main-nav`
- `.header-cta`

Let op:

- Header staat handmatig in meerdere HTML-bestanden.
- Mobiele navigatie wordt momenteel verborgen onder 980px.
- Een toekomstige verbetering is een toegankelijke mobiele navigatie.

## Buttons

Patronen:

- `.button.primary`
- `.button.secondary`
- `.header-cta`
- `.contact-button`

Gebruik buttons voor acties en links voor navigatie.

## Hero

Homepage hero:

- `.hero`
- `.hero-copy`
- `.hero-visual`
- `.hero-badge`
- `.hero-actions`
- `.hero-stats`
- `.proof-strip`

Subpagina hero:

- `.page-hero`

## Sections

Algemene contentsecties gebruiken:

- `.section`
- `.section-heading`
- `.section-kicker`

Nieuwe pagina's moeten dit patroon volgen.

## Pricing

Pakketten:

- `.pricing-grid`
- `.price-card`
- `.featured`

Onderhoud:

- `.maintenance-grid`
- `.maintenance-plan`
- `.featured-care`

Pricing mag niet worden aangepast zonder goedkeuring.

## Checkout

Belangrijke componenten:

- `.payment-configurator`
- `.config-panel`
- `.choice-grid`
- `.choice-card`
- `.checkout-summary-card`
- `.payment-trust`

Frontend toont prijzen, maar backend in `/functions/mollie-products.js` is leidend.

## Onboarding Wizard

Belangrijke componenten:

- `.intake-shell`
- `.intake-sidebar`
- `.intake-progress`
- `.intake-step-list`
- `.intake-card`
- `.intake-step`
- `.intake-grid`
- `.choice-cards`
- `.upload-box`
- `.upsell-box`
- `.price-indications`
- `.intake-summary`

De wizard is een belangrijke conversie- en intakecomponent. Wijzigingen moeten zorgvuldig getest worden.

## Contact

Contactpatronen:

- Calendly button
- WhatsApp link
- `tel:` link
- homepage lead form
- sticky contact bar

Het homepage lead form gebruikt interne demo-opslag en is kandidaat voor backend-integratie.

## Footer

Bestaat uit:

- `.site-footer`
- `.footer-contact`
- `.footer-links`

Footer staat handmatig in de homepage. Subpagina's hebben meestal geen volledige footer.
