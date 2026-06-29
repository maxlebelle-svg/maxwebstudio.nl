# Customer Isolation Checklist

Status: verplicht vóór deployment GO.

## Klantisolatie

- [ ] Customer A ziet alleen Customer A.
- [ ] Customer B ziet alleen Customer B.
- [ ] Customer A ziet geen Customer B websites.
- [ ] Customer A ziet geen Customer B projecten.
- [ ] Customer A ziet geen Customer B offertes.
- [ ] Customer A ziet geen Customer B facturen.
- [ ] Customer A ziet geen Customer B abonnementen.
- [ ] Customer A ziet geen Customer B bestanden.

## Demo en anonymous

- [ ] Demo user ziet alleen demo.
- [ ] Demo user ziet geen productie.
- [ ] Anonymous ziet geen klantdata.

## Medewerkerrollen

- [ ] Admin ziet alles.
- [ ] Sales ziet alleen passende salesonderdelen.
- [ ] Support ziet alleen supportonderdelen.
- [ ] Developer ziet technische onderdelen, geen klantbetaling-mutaties.

## Klantportaal

- [ ] Klantportaal mismatch toont geen andere klantdata.
- [ ] Interne notities blijven verborgen.
- [ ] Activity/import logs blijven verborgen.
- [ ] Betaalproviderdetails blijven verborgen.
