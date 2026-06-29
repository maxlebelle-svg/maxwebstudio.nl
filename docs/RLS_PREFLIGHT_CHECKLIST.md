# RLS Preflight Checklist

Status: No-Go totdat alles hieronder handmatig is afgevinkt.

## Database

- [ ] Canonical schema bevestigd.
- [ ] Legacy `customer_*` tabellen niet gebruikt voor nieuwe RLS.
- [ ] Supabase testproject of resetbare branch aangemaakt.
- [ ] Canonical schema in test uitgevoerd.
- [ ] RLS draft gereviewd.
- [ ] RLS draft alleen in test uitgevoerd.

## Testdata

- [ ] Testprofiles aangemaakt.
- [ ] Customer A/B/demo data aangemaakt.
- [ ] Websites/projects/quotes/invoices/subscriptions/files aangemaakt.
- [ ] Quote/invoice lines gekoppeld.
- [ ] Activity/import logs synthetisch aangemaakt.

## Scenario's

- [ ] Admin/super_admin toegang geslaagd.
- [ ] Sales beperkingen geslaagd.
- [ ] Support beperkingen geslaagd.
- [ ] Developer beperkingen geslaagd.
- [ ] Customer A/B isolatie geslaagd.
- [ ] Demo/productie isolatie geslaagd.
- [ ] Anonymous block geslaagd.
- [ ] Klantportaal getest.
- [ ] Offerte/betaallinks getest.

## Operationeel

- [ ] Testlog ingevuld.
- [ ] Rollbackplan klaar.
- [ ] Backup klaar.
- [ ] Execution window gepland.
- [ ] Go/No-Go expliciet besproken.

## Go/No-Go

Zolang één item openstaat, blijft status: No-Go.
