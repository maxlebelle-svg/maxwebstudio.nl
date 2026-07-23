# Content Library v2 — bevroren contract

## Status

- Contract: `2.0.0`
- Status: `stable`
- Publieke ingang: `@maxwebstudio/content-factory/v2`
- Productieactivering: niet actief
- Databasewijzigingen: geen

Vanaf dit punt zijn bestaande veldnamen en betekenissen binnen v2 bevroren. Additieve catalogusitems zijn toegestaan. Een verwijdering, hernoeming of betekeniswijziging van een bestaand verplicht veld vereist v3.

## Invoerdimensies

| Dimensie | Verplicht | Betekenis |
| --- | --- | --- |
| `vertical` | ja | Hoofdbranche uit de bestaande 101 branches |
| `specialization` | nee | Subspecialisatie die alleen binnen de gekozen branche geldig is |
| `style` | nee | Visuele stijlfamilie of bekende alias |
| `brandPersonality` | nee | Merkstem en bewijsstrategie |
| `theme` | nee | `light` of `dark` |
| `goal` | nee | Primair communicatie- en conversiedoel |
| `region` | nee | Lokale context, geen branch of stijl |
| `locale` | nee | In v2 uitsluitend `nl-NL`/`nl` |
| `channels` | nee | Website, social, blog, nieuwsbrief of Google Bedrijfsprofiel |
| `seed` | nee | Deterministische selectievariatie |

## Uitvoergrenzen

Het blueprint levert uitsluitend kanaalneutrale instructies:

- genormaliseerde dimensies;
- designtokens;
- contentstrategie;
- blokcontracten;
- hero- en CTA-intenties;
- fotografie-recept;
- consumer- en adaptermetadata.

Het blueprint bevat geen HTML, templatecode, database-ID's, echte klantreviews of publicatieclaims.

## Fail-closed regels

- Een onbekende branche wordt geweigerd.
- Een subspecialisatie buiten de gekozen branche wordt geweigerd.
- Een onbekende stijl, persoonlijkheid, doel, taal of kanaal wordt geweigerd.
- Voorbeeldreviews blijven niet-publiceerbaar.
- Beeldproductie blijft `planned` tot menselijke, rechten- en kwaliteitscontrole.
- Quality Score rapporteert nooit een verzonnen AI-confidence.

## Compatibiliteit

- v1 blijft beschikbaar voor de bestaande Content Factory-adapter.
- Adapter v2 gebruikt het stabiele v2-blueprint en benut v1 alleen als tijdelijke bron voor bewezen contentselectie.
- Productiecode gebruikt Adapter v2 pas na een afzonderlijke integratie- en regressiefase.

