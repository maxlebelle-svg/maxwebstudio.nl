# F0-d — leads_unique_normalized_domain_idx Drift Review

Status: **AUTHORITATIVE DECISION: UNIQUE INDEX IS NOT TARGET STATE**

## Evidence

Runtime bevat de index niet. Runtime bevat wel:

- `leads_normalized_domain_idx`: non-unique btree op `normalized_domain`;
- predicate: `normalized_domain IS NOT NULL AND normalized_domain <> ''`.

De F0-b/F0-c-bootstrap bevat daarnaast:

- `leads_unique_normalized_domain_idx`;
- unique btree op één kolom `normalized_domain`;
- dezelfde non-null/non-blank predicate;
- standaard PostgreSQL null-behandeling is niet relevant omdat nullen buiten de partial index vallen.

Herkomst is `20260710160200_central_lead_lifecycle_deduplication.sql`. Die migration maakt de unieke index alleen wanneer de aanwezige data op dat moment geen dubbel normalized domain heeft. Op een lege bootstrapdatabase is die conditie altijd waar; in runtime is de index aantoonbaar afwezig, waarschijnlijk omdat duplicaten bestonden of later een afwijking ontstond. Alleen het ontbreken is hard bewezen; de historische reden is inferentie.

## Functionele beoordeling

Een domein is een deduplicatiesignaal, geen universele leadidentiteit. Meerdere contacten, vestigingen, campagnes of herhaalde aanvragen kunnen hetzelfde rootdomain hebben. Uniekheid kan legitieme leadintake blokkeren en verschuift backend-deduplicatielogica naar een harde databasefout.

## Besluit

De non-unique `leads_normalized_domain_idx` is authoritative. De unieke index moet vóór bootstrapapproval uit de final-state baseline worden verwijderd in een afzonderlijk geautoriseerde baseline-revisie. Bestaande runtime heeft geen drop nodig. Als de baseline vóór correctie wordt bevroren, is een kleine common correctiemigration nodig die uitsluitend bij een exact overeenkomende indexdefinitie verwijdert en bij afwijking stopt.

Latere datapreflight moet gegroepeerd per niet-lege `normalized_domain` het aantal leads, verschillende bedrijven/klanten, statussen, bronnen en actieve records tonen en groepen met meer dan één record afzonderlijk beoordelen. Er is in F0-d geen dataquery uitgevoerd en geen SQL gewijzigd.
