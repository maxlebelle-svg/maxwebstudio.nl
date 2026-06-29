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

## Fase 14.4A - Next actions voor Supabase test setup

Status: `blocked_pending_supabase_test_setup`

Voordat Fase 14.4B uitgevoerd kan worden:

1. Maak een apart Supabase testproject aan.
2. Leg vast dat het project niet de productieomgeving is.
3. Vul lokale of Netlify test-env-vars in zonder ze te committen.
4. Bevestig dat `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY` naar test wijzen.
5. Maak Supabase CLI of een goedgekeurde alternatieve execution route beschikbaar.
6. Voer daarna pas schema/Auth/RLS/Storage tests uit.

Blockers die hierdoor nog open blijven:

- `env_vars_verified`
- `auth_test_completed`
- `rls_test_log_completed`
- `customer_isolation_test_completed`

Nieuwe evidence mag alleen verwijzen naar testproject, screenshots/logsamenvattingen en checkliststatus. Noteer nooit keys of wachtwoorden.

## Fase 14.4B - Echte testomgeving evidence

Status: `NO-GO / BLOCKED`

Uitgevoerd:

- `supabase/schema.sql` is door gebruiker succesvol uitgevoerd op het Supabase testproject.
- `supabase/rls-policies.sql` is door gebruiker succesvol uitgevoerd op het Supabase testproject.
- Auth Admin API kon 2 testgebruikers aanmaken.
- Storage testbucket kon worden aangemaakt/hergebruikt.
- Storage upload, signed URL en private public-endpoint blokkade zijn geslaagd.

Open blockers:

| Blocker | Status | Evidence | Volgende actie |
| --- | --- | --- | --- |
| `env_vars_verified` | in_review | `.env.local` aanwezig, testflags actief, `.gitignore` sluit `.env.local` uit | Handmatig bevestigen dat Supabase URL/project id naar testproject wijzen |
| `auth_test_completed` | blocked | Auth Admin user creation PASS | Login/session/profile mapping opnieuw testen na database grants |
| `rls_test_log_completed` | blocked | RLS policies uitgevoerd, maar RLS-testrecords konden niet worden geplaatst | Grants toevoegen en RLS A/B test opnieuw draaien |
| `customer_isolation_test_completed` | blocked | Customer A/B users bestaan, maar isolatie niet uitvoerbaar | Testrecords plaatsen en A/B isolatie opnieuw testen |
| Storage evidence | in_review | Bucket/upload/signed URL/private endpoint PASS | Handmatig reviewen of bucketconfig past bij productieplan |

Belangrijkste technische blocker:

- `POST /rest/v1/profiles` met service role gaf `403 permission denied for table profiles`.
- Supabase gaf als hint: `GRANT SELECT, INSERT ON public.profiles TO service_role;`
- Hierdoor zijn database/RLS/customer-isolation tests nog niet betrouwbaar uitvoerbaar.

Geen blocker is automatisch approved.

## Fase 14.4C - Permission patch voorbereid

Status: `PATCH PREPARED / NOT EXECUTED`

Patchbestand:

- `supabase/service-role-grants.sql`

Doel:

- PostgREST-grants toevoegen voor de canonical tabellen.
- Service role backend/admin/testflows toestaan via de REST API.
- `anon` en `authenticated` genoeg tabeltoegang geven zodat RLS policies de daadwerkelijke toegang kunnen bepalen.

Scope:

- Alleen canonical tabellen uit `supabase/schema.sql`.
- Geen legacy `customer_*` tabellen.
- Geen data-mutaties.
- Geen productie-execution.

Volgende actie:

1. Review `supabase/service-role-grants.sql`.
2. Voer de patch alleen uit op het Supabase testproject.
3. Herhaal Fase 14.4B.
4. Zet blockers pas in review/approved na echte Customer A/B evidence.

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
