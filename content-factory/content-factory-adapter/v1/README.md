# Content Factory Website Factory Adapter v1

De adapter vertaalt de publieke Content Factory v1-data naar één stabiele website-input. Hij is nog niet aangesloten op een productiepad en voert geen database-, publicatie- of deployactie uit.

## Publiek contract

```js
import { resolveWebsiteContent } from "@maxwebstudio/content-factory/adapter/v1";

const websiteInput = resolveWebsiteContent({
  vertical: "loodgieter",
  companyName: "Jansen Installaties",
  region: "Utrecht",
  tone: "vakkundig, direct en toegankelijk",
  template: "premium-growth-site-v1",
  package: "premium",
  seed: 42,
  phone: "030-1234567",
  email: "info@jansen.example"
});
```

De uitvoer bevat twee lagen:

- het rijke adaptercontract met brand, hero, services, about, USP's, projecten, veilige reviewplaceholders, FAQ, SEO, assets en multichannelcontent;
- `websiteFactoryInput`, aansluitend op de bestaande onboardingvelden `businessName`, `packageType`, `services`, `pages`, `ctas`, `branding`, `texts` en `seo`.

## Garanties

- De adapter importeert alleen `public/v1` en geen compiler- of engine-internals.
- Dezelfde input en seed leveren bytegelijk dezelfde output, inclusief `generatedAt`.
- Een onbekende branche valt terug op `lokale-specialist` en wordt in metadata geregistreerd.
- Ontbrekende bedrijfsgegevens en assets leveren veilige placeholders plus flags.
- Voorbeeldreviews hebben altijd `publishable: false` en worden niet naar `websiteFactoryInput.texts.reviews` gekopieerd.
- De adapter schrijft niets en activeert geen Website Factory-runtime.

## Metadata

`metadata` bevat contract-, bron-, content- en verticalversies, de deterministische seed, template, pakket, gebruikte fallbacks, inputvalidatie en alle placeholderflags.

## Toekomstige activering

Een aparte productie-integratie kan later `websiteFactoryInput` invoeren in de bestaande onboardingpipeline en de rijkere velden gebruiken voor template-rendering. Die activering vereist een afzonderlijke wijziging, regressietests van bestaande preview/ZIP-flows en expliciete releasegoedkeuring.
