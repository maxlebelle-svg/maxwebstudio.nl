# Sprint 3 - Production Readiness

Status: `GESTART / SPRINT 3A-3C FOUNDATION READY`

Datum: 2026-06-30

## Doel

Sprint 3 maakt Max Webstudio productie-gereed.

De sprint bouwt geen nieuwe eindgebruikersfeatures. De focus ligt op infrastructuur, controle, bewijsvoering en veilige productievoorwaarden voordat production writes, high-risk finance flows, Storage uploads en Max AI-functionaliteit worden vrijgegeven.

Sprint 3 is de laatste infrastructuursprint voor de Max AI Experience.

## Context

Afgerond:

- Sprint 1 Low-risk Writes: `PASS`.
- Sprint 2 Operationele Workflow Writes: `PASS`.
- Supabase staging foundation: `PASS`.
- Read layer: `PASS`.
- Gated write layer op staging: `PASS`.
- Productie-write-mode: `NO-GO`.

Belangrijk:

- Staging is bewezen.
- RLS en customer isolation zijn bewezen.
- Production writes blijven dicht.
- Patches `008` t/m `012` zijn alleen staging-toegepast en vereisen release approval voor productie.

## Sprint Acceptance Criteria

Sprint 3 is pas afgerond wanneer:

- server-side audit logging voor gated writes is ontworpen en minimaal als MVP werkend/staging-bewezen is;
- Storage-strategie en klantisolatie voor bestanden zijn voorbereid of gevalideerd volgens sprintscope;
- monitoring/observability voor errors, write failures en security-events is vastgelegd en waar mogelijk geïmplementeerd;
- backup- en restore-evidence concreet is vastgelegd;
- release approvals en production gates zijn aangescherpt;
- environment hardening voor development, staging en production is gedocumenteerd en gecontroleerd;
- productie-write-mode dicht blijft tot expliciete release approval;
- Sprint 3 Review is uitgevoerd.

## Sprint Backlog

| ID | Onderdeel | Prioriteit | Type | Doel | Afhankelijkheden | Output |
| --- | --- | --- | --- | --- | --- | --- |
| 3A | Audit & Observability Foundation | P0 | Foundation | Auditmodel, lokale service en observability-taxonomie voorbereiden zonder secrets | `audit_logs`, gated writes, RLS | `docs/SPRINT_3A_AUDIT_OBSERVABILITY_FOUNDATION.md` + lokale foundationservice |
| 3B | Storage Security Foundation | P0 | Foundation | Veilige bestandsopslag voorbereiden met klantisolatie | Supabase Storage, files table, RLS | `docs/SPRINT_3B_STORAGE_SECURITY_FOUNDATION.md` + readinessservice |
| 3C | Release Governance Foundation | P0 | Foundation | Production gates, approvals en rollback aanscherpen | Deployment bundle, blockers, release decision | `docs/SPRINT_3C_RELEASE_GOVERNANCE_FOUNDATION.md` + readinessservice |
| 3D | Monitoring & Backups Foundation | P1 | Foundation | Fouten, write failures, backups en restore evidence voorbereiden | Audit logging, Storage plan | Monitoring checklist/statuspaneel + backup/restore evidence-template |
| 3E | Release governance hardening | P0 | Proces + readiness | Governance aanscherpen na monitoring/backups evidence | Deployment bundle, blockers, release decision | Updated gates/checklists/NO-GO regels |
| 3F | Environment hardening | P0 | Controle + docs | Development, staging en production strikt scheiden | `.env` templates, Netlify contexts, Supabase projects | Env matrix, risk review, missing actions |
| 3G | Sprint 3 Review | P0 | Review | Officieel vaststellen wat production-ready is | 3A-3F | Sprint reviewdocument |

## 1. Audit Logging

Sprint 3A heeft de audit- en observability-foundation voorbereid.

Vastgelegd in:

- `docs/SPRINT_3A_AUDIT_OBSERVABILITY_FOUNDATION.md`

Toegevoegd:

- `public/src/services/auditObservabilityService.js`
- Developer Mode-kaart `Audit & Observability Foundation`

Belangrijk: dit is nog geen productie-audittrail. Server-side insert-only logging naar `audit_logs` blijft de volgende stap voordat production writes open mogen.

### Strategie

Audit logging wordt server-side leidend zodra productie-writes worden toegestaan.

Frontend/local statusmeldingen blijven nuttig voor UX en Developer Mode, maar zijn geen betrouwbare productie-audittrail.

### Te loggen writes

Minimaal:

- `crm_tasks` create;
- `leads.notes` append;
- `change_requests` create;
- `client_portal_messages` create;
- `projects.status/phase/progress` update;
- `customers.name/email/phone/notes` update;
- `websites.status/care_package/notes/last_checked_at` update.

Later:

- quotes/invoices/subscriptions;
- Storage uploads/downloads;
- AI-generated drafts;
- AI-assisted CRM/project actions.

### Metadata

Wel loggen:

- `actor_profile_id`;
- `actor_role`;
- `entity_type`;
- `entity_id`;
- `action`;
- `environment`;
- `request_id` of `correlation_id`;
- toegestane changed fields;
- oude/nieuwe statuswaarden waar veilig;
- timestamp;
- result: success/failure/blocked/fallback.

Niet loggen:

- API keys;
- access tokens;
- refresh tokens;
- service role keys;
- volledige e-mailinhoud;
- volledige klantberichten met gevoelige inhoud;
- betaalgegevens;
- raw OpenAI prompts met persoonsgegevens;
- bestanden of base64-content;
- wachtwoorden;
- volledige request headers.

### Relatie met `audit_logs`

`audit_logs` wordt de canonical productie-auditlocatie.

Aanbevolen:

- insert-only;
- geen client-side writes;
- server-side function/adapter;
- RLS: alleen interne bevoegde rollen lezen;
- service role of veilige serverfunctie schrijft.

## 2. Storage

Sprint 3B heeft de storage security foundation voorbereid.

Vastgelegd in:

- `docs/SPRINT_3B_STORAGE_SECURITY_FOUNDATION.md`

Toegevoegd:

- `public/src/services/storageSecurityReadinessService.js`
- Developer Mode-kaart `Storage Security Foundation`

Belangrijk: dit is nog geen upload/downloadflow. Supabase Storage buckets, signed URL endpoints en file isolation tests blijven vervolgstappen.

### Strategie

Bestanden worden uiteindelijk opgeslagen in Supabase Storage, maar metadata blijft in `files`.

Storage is restricted totdat klantisolatie, signed URLs en uploadlimieten bewezen zijn.

### Bucketstrategie

Aanbevolen buckets:

- `client-files`: klantbestanden, projectdocumenten, logo's, teksten, foto's;
- `website-assets`: websitebeelden en gegenereerde assets;
- `private-admin-files`: interne contracten, facturen, documenten;
- `demo-assets`: demo/salesmateriaal zonder klantdata.

### RLS en klantisolatie

Vereisten:

- klant ziet alleen bestanden gekoppeld aan eigen `customer_id`;
- interne rollen zien volgens rol/rechten;
- anonymous heeft geen private file access;
- signed URLs verlopen;
- uploads valideren customer/project/website ownership;
- metadata in `files` blijft leidend.

### Upload/downloadflow

MVP-flow:

1. Client vraagt upload aan via server-side endpoint.
2. Endpoint valideert sessie, rol en ownership.
3. Endpoint maakt signed upload/download URL.
4. Metadata wordt opgeslagen in `files`.
5. Audit event wordt aangemaakt.

Nog niet:

- directe public uploads;
- onbeperkte bestandsgrootte;
- executable uploads;
- gevoelige documenten zonder audit.

## 3. Monitoring

### Te monitoren events

- applicatiefouten;
- Supabase read/write failures;
- RLS denials en 0-row blocked writes;
- failed auth/session events;
- Storage upload/download failures;
- Netlify function errors;
- Mollie webhook failures later;
- Resend send failures later;
- AI adapter failures later;
- uptime en response health.

### Alertingstrategie

MVP:

- Developer Mode toont laatste failures.
- Release evidence registreert errorcounts.
- Netlify/Supabase dashboards worden onderdeel van release checklist.

Later:

- externe error monitoring;
- Slack/e-mail alerts;
- uptime checks;
- security alert routing.

## 4. Backups

### Scope

Backups moeten de volgende onderdelen dekken:

- Supabase database;
- Supabase Storage;
- Netlify/env config checklist zonder secret values;
- local/demo export;
- migration drafts en release evidence in git.

### Restoreprocedure

Minimaal vastleggen:

1. backupbron;
2. backupdatum;
3. wie heeft backup geverifieerd;
4. restoredoel: staging eerst;
5. restore testresultaat;
6. rollbackbesluit;
7. productie-impact.

### Testfrequentie

Aanbevolen:

- staging restore test vóór production launch;
- maandelijkse restore check na livegang;
- extra restore test vóór grote schema/releases.

### Disaster recovery

Vastleggen:

- Recovery Time Objective;
- Recovery Point Objective;
- wie beslist over rollback;
- welke data handmatig opnieuw ingevoerd moet worden;
- klantcommunicatie bij incident.

## 5. Release Governance

Sprint 3C heeft de release governance foundation voorbereid.

Vastgelegd in:

- `docs/SPRINT_3C_RELEASE_GOVERNANCE_FOUNDATION.md`

Toegevoegd:

- `public/src/services/releaseGovernanceReadinessService.js`
- Developer Mode-kaart `Release Governance Foundation`

Belangrijk: dit bouwt geen deploymentknoppen of productieautomatisering. Het definieert wie mag goedkeuren, welke evidence nodig is, wanneer NO-GO automatisch blijft gelden en hoe Max AI deze regels later uitlegt.

### Approvals

Voor productie vereist:

- technical approval;
- security/RLS approval;
- backup approval;
- rollback approval;
- business owner approval;
- production env approval.

### Release checklist

Moet groen zijn voor production writes:

- staging evidence PASS;
- RLS/customer isolation PASS;
- spoofing PASS;
- fallback PASS;
- audit logging aanwezig;
- backup/restore evidence aanwezig;
- rollbackplan approved;
- env vars gecontroleerd;
- production keys/context bevestigd;
- no secrets in git.

### Production gates

Production blijft `NO-GO` als:

- server-side audit logging ontbreekt;
- backup niet bewezen is;
- RLS review ontbreekt;
- env vars onzeker zijn;
- rollback niet approved is;
- Storage isolation niet bewezen is;
- release decision niet expliciet GO is.

## 6. Environment Hardening

### Development

Doel:

- lokale fallback;
- local/demo/mock data;
- geen production writes;
- geen echte klantdata verplicht.

### Staging

Doel:

- `maxwebstudio-test`;
- echte migrations;
- echte RLS;
- test-only users/data;
- write validation;
- release evidence.

### Production

Doel:

- `maxwebstudio`;
- alleen approved migrations;
- echte klantdata;
- strict RLS;
- audit logging;
- monitoring;
- backups;
- production gates.

### Strikte scheiding

Gescheiden houden:

- API keys;
- Supabase projects;
- Storage buckets;
- Auth users;
- Netlify deploy contexts;
- Mollie mode;
- Resend sender/domain;
- AI providers;
- monitoring targets.

## Voorgestelde Implementatievolgorde

1. Sprint 3A - Server-side audit logging MVP.
2. Sprint 3B - Release governance hardening voor production write approvals.
3. Sprint 3C - Backup & restore evidence.
4. Sprint 3D - Environment hardening matrix.
5. Sprint 3E - Storage security plan/foundation.
6. Sprint 3F - Monitoring & observability baseline.
7. Sprint 3 Review.

Waarom deze volgorde:

- audit logging moet vóór extra writes komen;
- governance en backups moeten vóór productie-openstelling komen;
- Storage en monitoring bouwen voort op audit/governance;
- Max AI mag pas zichtbaar worden zodra productievoorwaarden beheersbaar zijn.

## Niet In Sprint 3

Niet bouwen:

- nieuwe eindgebruikersfeatures;
- finance writes;
- Mollie live payments;
- Resend live klantflows;
- OpenAI calls;
- Max AI mascotte/UI;
- websitegenerator;
- production schema changes zonder approval;
- production writes zonder releasebesluit.

## Sprint 3 Output

Verwachte deliverables:

- audit logging MVP of audit adapter;
- Storage security foundation of expliciet goedgekeurd vervolgplan;
- monitoring/readiness baseline;
- backup/restore evidence;
- aangescherpte release governance;
- environment hardening matrix;
- Sprint 3 Review.

## Relatie Met Sprint 4

Sprint 4 wordt `Max AI Experience`.

Sprint 4 mag starten wanneer Sprint 3 voldoende heeft bewezen dat:

- production data veilig blijft;
- AI geen ongecontroleerde writes kan doen;
- audit/monitoring basis aanwezig is;
- klantdata en promptdata governance duidelijk zijn;
- rollback/releaseproces werkt.

## Conclusie

Sprint 3 is de overgang van bewezen staging-writes naar production readiness.

Na Sprint 3 verschuift de focus van infrastructuur naar productbeleving: Max AI als centrale digitale medewerker van Max Webstudio.
