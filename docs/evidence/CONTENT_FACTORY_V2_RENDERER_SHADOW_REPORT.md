# Content Factory v2 renderer shadow report

**PASS_CONTENT_FACTORY_V2_RENDERER_SHADOW_READY**

Scope: lokale side-by-side renderercertificering. Geen productieactivering, databasewijzigingen, productie-write, bulkcontent of bulkfoto's.

## Featureflags

- `WEBSITE_FACTORY_CONTENT_ADAPTER`: standaard `v1`, gecontroleerde test `v2`.
- `WEBSITE_FACTORY_CONTENT_ADAPTER_MODE`: `off`, `shadow` of `active`.
- In `v2 + shadow` rendert v1; v2 wordt alleen opgelost en vergeleken.
- Bij een v2-fout rendert dezelfde build één keer met de voorbereide v1-input.

## Matrix

| Case | Status | Stijl | Persoonlijkheid | Hero | CTA | Quality |
| --- | --- | --- | --- | --- | --- | ---: |
| installateur-thuisbatterijen-premium-dark | PASS | Premium editorial | Innovatief | Thuisbatterijen professioneel geregeld | Vraag een offerte aan | 100 |
| holistisch-warm-light | PASS | Warm & persoonlijk | Persoonlijk expertmerk | Holistische coaching professioneel geregeld | Plan een afspraak | 100 |
| loodgieter-modern-leadgeneratie | PASS | Modern & scherp | Jong bedrijf | Ervaren specialist in lekkage en spoed | Vraag een offerte aan | 100 |
| restaurant-luxe-reserveringen | PASS | Premium editorial | Persoonlijk expertmerk | Sushirestaurant met aandacht voor wat voor u telt | Plan een afspraak | 100 |
| autobedrijf-zakelijk-occasions | PASS | Betrouwbaar vakmanschap | Corporate organisatie | Occasions met aandacht voor wat voor u telt | Vraag een offerte aan | 100 |
| glazenwasser-lokaal-offerte | PASS | Minimalistisch licht | Lokaal betrokken | Glasbewassing in Kampen | Vraag een offerte aan | 100 |

## Dezelfde lead, vier stijlen

| Gevraagd | Opgelost | Design | CSS | Fotografieprompt |
| --- | --- | --- | --- | --- |
| premium | premium-editorial | `2182c8537cd9` | `144ad3f7c8fd` | `ca320b1b3856` |
| warm | warm-persoonlijk | `a55a5c1dfc89` | `3597cab84175` | `3847b726cab3` |
| modern | modern-scherp | `cbd6e8321d3f` | `897a483104bd` | `17523d44cd04` |
| minimalistisch | minimalistisch-licht | `8fbfc8170ee7` | `e889e669ff05` | `25158d190d39` |

Stijlvariatie voor exact dezelfde leadinput: PASS.

## Samenvatting

- Cases: 6/6
- Unieke designsystemen in de branchematrix: 6
- Premium/warm/modern/minimalistisch voor dezelfde lead: PASS
- Gecontroleerde v2 → v1 fallback: PASS
- Determinisme, renderercompatibiliteit, SEO, CTA, reviewblokkade en fotografiepromptbinding: PASS
- AI-confidence: niet gemeten
- Publication ready: false; menselijke review blijft verplicht

Volledige evidence met adapterversies, dimensies, seeds, fallbackkeuzes en SHA-256-signatures staat in `CONTENT_FACTORY_V2_RENDERER_SHADOW_REPORT.json`.
