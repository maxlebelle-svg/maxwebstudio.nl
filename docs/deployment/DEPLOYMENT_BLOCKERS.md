# Deployment Blockers

Status: alle blockers starten als `pending`. Codex mag geen approvals faken.

## Wat betekent NO-GO

`NO-GO` betekent dat productie-deployment, live RLS of provider switch niet verantwoord is. De code mag voorbereid zijn, maar bewijs en handmatige goedkeuring ontbreken nog.

## Wat betekent GO

`GO` mag alleen wanneer iedere blocker `approved` of `not_applicable` is, met evidence en waar nodig een approver.

## Statussen

- `pending`: nog niet opgepakt
- `in_review`: bewijs wordt beoordeeld
- `approved`: handmatig goedgekeurd
- `rejected`: afgekeurd, deployment blijft geblokkeerd
- `not_applicable`: bewust niet van toepassing, met reden

## Blockers

| ID | Waarom | Resolved wanneer | Evidence | Wie mag goedkeuren |
| --- | --- | --- | --- | --- |
| `backup_confirmed` | Zonder backup is rollback onzeker. | Backup is gemaakt en vindbaar. | backup bestandsnaam, datum, locatie/notitie | eigenaar/technisch verantwoordelijke |
| `rls_review_approved` | RLS kan datalekken veroorzaken bij fouten. | RLS draft is gereviewd. | reviewer, datum, opmerkingen | technisch verantwoordelijke |
| `rls_test_log_completed` | Policies moeten bewezen werken in test. | Testlog is ingevuld met pass/fail. | verwijzing naar log, samenvatting | tester + eigenaar |
| `auth_test_completed` | Auth/roles bepalen toegang. | Login/profile/role tests zijn uitgevoerd. | datum, rollen, issues | technisch verantwoordelijke |
| `customer_isolation_test_completed` | Klant A/B isolatie is kritisch. | A/B, demo en anonymous scenario's pass. | datum, scenarioresultaat | eigenaar/technisch verantwoordelijke |
| `rollback_plan_approved` | Rollback moet vooraf duidelijk zijn. | Procedure is expliciet goedgekeurd. | approvedBy, datum, opmerkingen | eigenaar |
| `legacy_customer_tables_mitigated` | Legacy `customer_*` mag niet terug in live-flow. | Mitigatie is gekozen en gedocumenteerd. | verwijzing naar consolidated plan/mapping | technisch verantwoordelijke |
| `env_vars_verified` | Verkeerde env vars kunnen productie breken. | Namen/omgevingen zijn gecontroleerd zonder secrets op te slaan. | checklist, datum, omgeving | eigenaar/technisch verantwoordelijke |

## Bewijsregels

- Geen secrets in evidence.
- Geen API keys, tokens of wachtwoorden opslaan.
- Evidence is tekst/notitie in Developer Mode of documentverwijzing.
- Approved/rejected vraagt handmatige bevestiging.
## Fase 14.2 - Evidence en manual approval flow

Elke blocker gebruikt nu een blocker-specifiek evidence schema. Codex mag blockers niet automatisch goedkeuren.

Statusflow:

- `pending`
- `in_review`
- `approved`
- `rejected`
- `not_applicable`

Regels:

- `approved` vereist alle verplichte evidencevelden.
- `approved` vereist een reviewer/approver.
- `rejected` vereist een reden.
- `not_applicable` vereist een reden.
- reset naar `pending` vereist een reden.
- GO kan alleen wanneer alle blockers `approved` of `not_applicable` zijn.

Evidencevelden:

| Blocker | Verplichte velden |
| --- | --- |
| backup_confirmed | backupName, backupDate, backupLocation, verifiedBy, notes |
| rls_review_approved | reviewer, reviewDate, reviewedDocs, findings, approvalNotes |
| rls_test_log_completed | testLogReference, testDate, passCount, failCount, blockedCount, summary |
| auth_test_completed | testDate, rolesTested, loginFlowResult, profileMappingResult, issues |
| customer_isolation_test_completed | testDate, customerAScenario, customerBScenario, demoScenario, anonymousScenario, resultSummary |
| rollback_plan_approved | approver, approvalDate, rollbackPlanVersion, rollbackNotes |
| legacy_customer_tables_mitigated | mitigationDecision, reviewedFiles, riskAcceptedBy, mitigationNotes |
| env_vars_verified | environmentName, verifiedBy, verificationDate, checkedVariables, missingVariables, notes |

Audit trail:

- createdAt
- updatedAt
- statusChangedAt
- statusChangedBy
- evidenceUpdatedAt
- evidenceUpdatedBy
- approvalHistory[]

Elke history entry bewaart `fromStatus`, `toStatus`, `by`, `at`, `reason` en een evidence snapshot. Noteer nooit secrets in evidence, notes of reason.
