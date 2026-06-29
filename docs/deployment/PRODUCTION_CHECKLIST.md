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
## Fase 14.2 - Release decision gate

Voor GO moet het volgende kloppen:

- alle deployment blockers zijn `approved` of `not_applicable`
- approved blockers hebben reviewer/approver registratie
- geen blocker staat op `pending`, `in_review` of `rejected`
- alle verplichte evidencevelden zijn ingevuld
- rollbackplan is goedgekeurd
- testresultaten zijn gekoppeld via evidence references
- release decision JSON of Markdown is geëxporteerd voor het besluit

Developer Mode bevat hiervoor:

- blocker evidencevelden
- approval history
- release decision JSON export
- release decision Markdown

Deze acties voeren geen deployment uit.
