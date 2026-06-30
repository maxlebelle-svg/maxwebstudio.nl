# Sprint 3C - Release Governance Foundation

Status: `FOUNDATION READY / GEEN DEPLOYMENT / GEEN PRODUCTIE`

Datum: 2026-06-30

## Doel

Sprint 3C legt de release governance vast voordat productie-automatisering, deploymentknoppen of production write-mode worden vrijgegeven.

Deze fase is de controlekamer van Max Webstudio.

## Productlaag

Sprint 3C hoort bij:

`Trust Infrastructure`

Het doel is vertrouwen:

- niets gaat ongecontroleerd live;
- releasebesluiten zijn herleidbaar;
- blockers blijven leidend;
- rollback is vooraf goedgekeurd;
- Max AI kan later uitleggen waarom iets wel of niet live mag.

## Release Rollen

| Rol | Mag wel | Mag niet |
| --- | --- | --- |
| developer | code voorbereiden, staging valideren, evidence aanleveren | eigen release zelfstandig goedkeuren |
| admin | business impact beoordelen, klantcommunicatie voorbereiden, release window akkoord geven | security blockers negeren |
| release approver | GO/NO-GO besluit nemen, evidence controleren, rollback approval bevestigen | goedkeuren zonder verplichte evidence |
| support | klantimpact monitoren, supportnotities voorbereiden | deployment starten |
| production operator | goedgekeurde release uitvoeren, rollback uitvoeren na approval | scope wijzigen tijdens execution |

## Release Flow

```text
Development
↓
Staging
↓
Evidence
↓
Approval
↓
Production
```

Geen stap mag worden overgeslagen.

## Verplichte Evidence

Voor productie-GO is minimaal nodig:

- staging tests;
- RLS validatie;
- write validatie;
- security checks;
- rollback bevestigd;
- release checklist;
- deployment blockers reviewed/approved;
- production environment check zonder secretwaarden;
- git commit/release reference;
- post-release checkplan.

## Automatische NO-GO

Release blijft `NO-GO` bij:

- open blocker;
- mislukte stagingtest;
- ontbrekende audit evidence;
- ontbrekende rollback approval;
- ontbrekende release approval;
- productieconfig mismatch;
- secrets of API keys in diff/logs;
- customer isolation niet bewezen;
- RLS regressie;
- production writes zonder expliciete approval.

## Rollback Governance

Rollback mag alleen gestart worden door:

- release approver;
- production operator met expliciete approval.

Rollback is verplicht bij:

- klantdata zichtbaar voor verkeerde klant;
- RLS blokkeert kritieke flows;
- facturen/offertes tonen verkeerde data;
- production deploy veroorzaakt kritieke fout;
- rollback is expliciet gevraagd door release approver.

Vast te leggen evidence:

- release id/commit;
- incidenttijd;
- impact;
- rollbackbesluit;
- uitgevoerde rollbackstappen;
- post-rollback checks.

## Developer Mode

Toegevoegd:

- `public/src/services/releaseGovernanceReadinessService.js`
- Developer Mode-kaart `Release Governance Foundation`

Developer Mode toont:

- releaseflow;
- approval coverage;
- evidence coverage;
- open blockers;
- GO/NO-GO;
- release readiness;
- deployment automation status.

## Max AI Uitlegregels

Max AI moet deze governance later respecteren en uitleggen.

Voorbeelden:

- waarom iets nog niet live mag;
- waarom een deployment geblokkeerd is;
- waarom menselijke goedkeuring nodig is;
- welke veilige vervolgstap mogelijk is.

Max AI mag nooit zelfstandig:

- een deployment starten;
- een release goedkeuren;
- rollback uitvoeren;
- blockers overschrijven;
- productieconfiguratie wijzigen.

## Bewust Niet Gedaan

- Geen deployment gebouwd.
- Geen productie gewijzigd.
- Geen SQL uitgevoerd.
- Geen nieuwe writes toegevoegd.
- Geen OpenAI gekoppeld.
- Geen Storage-implementatie gebouwd.

## Volgende Stap

Aanbevolen vervolg:

1. Release governance koppelen aan Sprint 3 Review.
2. Monitoring & Backups foundation uitvoeren.
3. Daarna pas bepalen of production write-mode naar release candidate mag.
