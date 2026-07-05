# Website Factory Package Specification

## 1. Strategische visie

De Website Factory bouwt geen losse websites, maar websiteproducten. Een verkoper kiest een pakket en de generator vertaalt dat pakket samen met het brancheprofiel naar pagina's, componenten, assets, SEO, animaties en ZIP-structuur.

De kern is:

```text
Website Product -> Package Manifest -> Industry Manifest -> Component Rules -> Generator
```

Zo blijft de Website Factory uitbreidbaar. Nieuwe modules zoals een WhatsApp-knop, reviewmodule, boekingssysteem of AI-chatbot worden componenten die per pakket aan of uit staan.

## 2. Packages

Starter Site EUR 495:
Snel professioneel online.

Business Website EUR 995:
Meer vertrouwen en meer aanvragen.

Premium Growth EUR 1750:
Website als verkoopmachine.

## 3. Package Verschillen

Starter is een compacte onepage met hero, diensten, korte positionering, CTA, contact en footer. Dit pakket is bedoeld om snel professioneel online te zijn zonder uitgebreide modules.

Business voegt meerdere pagina's, portfolio, reviews, FAQ, betere SEO en meer visuele assets toe. Dit pakket verkoopt vertrouwen.

Premium Growth voegt groeimodules toe zoals cases, team, lead magnet, blog/landingpage-voorbereiding, premium animaties, schema en maximale performance-eisen. Dit pakket positioneert de website als verkoopmachine.

## 4. Componenten

Elke website bestaat uit componenten:

- `hero`
- `services`
- `about`
- `portfolio`
- `reviews`
- `faq`
- `cta`
- `contact`
- `footer`
- `team`
- `blog`
- `leadMagnet`
- `floatingWhatsapp`

Een pakket bepaalt of een component actief is. Een branche bepaalt hoe het component klinkt, welke kleur- en assetrichting past en welke CTA logisch is.

## 5. Brancheprofielen

Industry manifests staan in `functions/website-factory/industries/`.

Een brancheprofiel bevat:

- id en naam
- tone of voice
- kleurhints
- hero angles
- services
- trust signals
- CTA-voorbeelden
- asset keywords

De generator gebruikt deze input om dezelfde componenten per branche anders te laten voelen.

## 6. Upgradepad

Een lead kan beginnen met Starter en later worden uitgebreid met losse componenten of een hoger pakket:

```text
Starter + Portfolio + Reviews + FAQ -> Business
Business + Cases + Team + Lead Magnet -> Premium Growth
```

De Website Factory hoeft dan niet opnieuw ontworpen te worden. De config verandert, de generator bouwt opnieuw.

## 7. Acceptatiecriteria Per Package

Starter minimaal:

- homepagina
- hero
- diensten
- CTA
- contact
- footer
- basis SEO

Business minimaal:

- meerdere pagina's
- portfolio
- reviews
- FAQ
- minimaal 4 service/gallery assets indien beschikbaar
- advanced SEO

Premium minimaal:

- premium homepage
- portfolio/cases
- reviews
- FAQ
- team of expertiseblok
- lead magnet of landingpage-voorbereiding
- rijkere assets
- schema/performance voorbereid

## 8. Toekomstige Modules

Voorbereide uitbreidingen:

- WhatsApp Floating Button
- meertaligheid
- boekingssysteem
- AI-chatbot
- review-import
- projectcases
- lead magnet/PDF
- branchegerichte AI-afbeeldingen
- Google Bedrijfsprofiel assets
- social banners
- offerte/PDF-huisstijl

## 9. Veiligheidsprincipe

De Website Factory mag preview, ZIP, assets en `live-upload/` voorbereiden, maar zet niets automatisch live. Publicatie blijft een menselijke controle en een expliciete handeling.
