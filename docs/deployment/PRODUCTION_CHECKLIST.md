# Production Checklist

Status: No-Go totdat alle punten zijn afgevinkt.

## Basis

- [ ] Backup gemaakt.
- [ ] Git schoon.
- [ ] Deployment branch/commit bevestigd.
- [ ] Environment variables gecontroleerd.

## Database

- [ ] Schema uitgevoerd.
- [ ] Canonical patches uitgevoerd.
- [ ] Profiles gecontroleerd.
- [ ] Legacy `customer_*` niet actief gebruikt voor nieuwe flow.

## Security

- [ ] RLS getest in testomgeving.
- [ ] Auth getest.
- [ ] Customer A/B isolatie getest.
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
- [ ] Execution window gepland.
- [ ] Go expliciet gegeven.
