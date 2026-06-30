# Sprint 3A - Audit & Observability Foundation

Status: `FOUNDATION READY / GEEN PRODUCTIE / GEEN SQL`

Datum: 2026-06-30

## Doel

Sprint 3A legt de basis voor audit logging en observability binnen Max Webstudio.

Deze fase maakt nog geen productie-audittrail actief. De output is een veilig ontwerp, een lokale foundationservice en Developer Mode-readiness zodat de volgende infrastructurele stappen gecontroleerd kunnen worden gebouwd.

## Scope

Auditwaardige acties vanaf Sprint 1 en Sprint 2:

| Actie | Entiteit | Risico | Auditstatus |
| --- | --- | --- | --- |
| CRM-taak aanmaken | `crm_tasks` | laag | voorbereid |
| Leadnotitie toevoegen | `leads` | laag | voorbereid |
| Wijzigingsverzoek aanmaken | `change_requests` | laag | voorbereid |
| Klantportaalbericht aanmaken | `client_portal_messages` | laag | voorbereid |
| Projectstatus wijzigen | `projects` | middel | voorbereid |
| Klantcontactgegevens wijzigen | `customers` | middel | voorbereid |
| Website operationeel wijzigen | `websites` | middel | voorbereid |

## Audit Event Model

Een audit event bevat minimaal:

- `timestamp`
- `actor`
- `role`
- `customer`
- `project`
- `entity`
- `entityId`
- `action`
- `outcome`
- `environment`
- `providerMode`
- `requestId`
- `metadata`

## Verboden Auditdata

Nooit loggen:

- wachtwoorden;
- tokens;
- API keys;
- service role keys;
- volledige prompts;
- volledige betaalgegevens;
- secrets;
- base64/file content;
- volledige request headers;
- volledige klantberichten wanneer die gevoelige informatie kunnen bevatten.

## Observability Model

De eerste observability-taxonomie bestaat uit:

- `write_success`
- `write_failure`
- `rls_denied`
- `fallback_activated`
- `gate_blocked`
- `validation_failed`
- `readback_verified`
- `security_spoof_blocked`

Deze events zijn bedoeld om later in Developer Mode, release evidence en monitoring zichtbaar te maken waar writes slagen, falen of bewust worden geblokkeerd.

## Foundation Service

Toegevoegd:

- `public/src/services/auditObservabilityService.js`

De service kan:

- audit events lokaal opbouwen;
- gevoelige velden redacteren;
- observability events lokaal registreren;
- een readinessstatus teruggeven voor Developer Mode;
- een beperkte localStorage-eventlijst bijhouden voor demo/evidence.

LocalStorage keys:

- `maxwebstudioAuditObservabilityEvents`
- `maxwebstudioLastAuditObservabilityStatus`

Belangrijk:

- dit is geen productie-audittrail;
- dit schrijft niet naar Supabase;
- dit gebruikt geen server-side service role;
- dit vervangt geen toekomstige `audit_logs`-insert via veilige backend.

## Developer Mode

Developer Mode toont nu:

- Sprint 3A-status;
- aantal auditwaardige acties;
- observability eventtypes;
- lokale storage key;
- verboden velden;
- server-side auditstatus;
- productie audit write-status.

## Productiebeleid

Productie blijft dicht.

Nog nodig voor echte productie-audit:

1. server-side audit adapter of Netlify Function;
2. insert-only writes naar `audit_logs`;
3. RLS/permissions voor interne read access;
4. request/correlation id vanuit backend;
5. evidence dat audit failures de primaire write niet onveilig maken;
6. monitoring/alerting op audit/write failures.

## Sprint 3A Resultaat

Status: `PASS ALS FOUNDATION`

Niet uitgevoerd:

- geen SQL;
- geen Supabase writes;
- geen productie-aanpassing;
- geen Storage;
- geen OpenAI;
- geen monitoringdienst.

Volgende logische stap:

- Sprint 3B: server-side audit logging MVP of Storage security foundation, afhankelijk van releaseprioriteit.
