# Production Checklist

Status: No-Go totdat alle punten zijn afgevinkt.

## Basis

- [ ] Backup gemaakt.
- [ ] Git schoon.
- [ ] Deployment branch/commit bevestigd.
- [ ] Environment variables gecontroleerd.
- [ ] Deployment blockers reviewed.

## Database

- [ ] Schema uitgevoerd.
- [ ] Canonical patches uitgevoerd.
- [ ] Profiles gecontroleerd.
- [ ] Legacy `customer_*` niet actief gebruikt voor nieuwe flow.

## Security

- [ ] RLS getest in testomgeving.
- [ ] Auth getest.
- [ ] Auth test checklist ingevuld.
- [ ] Customer A/B isolatie getest.
- [ ] Customer isolation checklist ingevuld.
- [ ] Demo-user getest.
- [ ] Anonymous block getest.
- [ ] Route guards gecontroleerd.

## Modules

- [ ] Klanten getest.
- [ ] Websites getest.
- [ ] Projecten getest.
- [ ] Offertes getest.
- [ ] Facturen getest.
- [ ] Abonnementen getest.
- [ ] Klantportaal getest.
- [ ] Storage getest.

## Integraties

- [ ] Mollie getest.
- [ ] Resend getest.
- [ ] Netlify Functions getest.
- [ ] Monitoring actief.

## Go/No-Go

- [ ] Testlog ingevuld.
- [ ] Rollbackplan klaar.
- [ ] Rollbackplan expliciet approved.
- [ ] Deployment blockers approved/not_applicable.
- [ ] Execution window gepland.
- [ ] Go expliciet gegeven.
