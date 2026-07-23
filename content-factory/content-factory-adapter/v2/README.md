# Website Factory Adapter v2

Adapter v2 zet het stabiele, kanaalneutrale Content Library v2-blueprint om naar `websiteFactoryInput`. De adapter is beschikbaar voor integratietests, maar is niet in productie geactiveerd.

```js
import { resolveWebsiteContentV2 } from "@maxwebstudio/content-factory/adapter/v2";

const output = resolveWebsiteContentV2({
  vertical: "installateur",
  specialization: "thuisbatterijen",
  style: "premium",
  brandPersonality: "innovatief",
  theme: "dark",
  goal: "leadgeneratie",
  region: "Utrecht",
  locale: "nl-NL",
  channels: ["website", "social"],
  companyName: "Energie Vooruit",
  package: "premium",
  seed: 11
});
```

De uitvoer bevat:

- het volledige v2-blueprint;
- gespecialiseerde hero, diensten en SEO;
- design-systemtokens voor de renderer;
- fotografieprompts voor de concrete combinatie;
- een bestaande Website Factory-input;
- afzonderlijke Quality Scores voor architectuur en websitecontent;
- expliciete placeholder-, review- en publicatieveiligheid.

Adapter v2 gebruikt Adapter v1 tijdelijk als compatibiliteitsbron voor bewezen contentselectie. De v2-compositie overschrijft stijl, subspecialisatie, messaging-intentie, SEO-richting en fotografie. Deze overgang voorkomt dat productieflows al tijdens de contractvalidatie moeten veranderen.

