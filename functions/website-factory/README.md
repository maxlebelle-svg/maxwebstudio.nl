# Website Factory Config

Deze map bevat de productarchitectuur voor de Website Factory.

```text
packages/    Pakketmanifesten: Starter, Business, Premium.
industries/  Branchemanifesten: bouw, horeca, kapper, makelaar, enzovoort.
components/  Componentregels en documentatie.
assets/      Gereserveerde branche-assetmappen voor latere echte beelden.
```

De generator leest deze configuratie via `config-resolver.js`. De bestaande preview- en ZIP-flow blijft werken; de config maakt de output uitbreidbaar zonder grote rewrite.

Veiligheidsregel: deze architectuur bereidt preview en uploadklare bestanden voor, maar publiceert nooit automatisch live.
