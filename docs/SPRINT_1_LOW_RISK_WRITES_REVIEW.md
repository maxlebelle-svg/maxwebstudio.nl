# Sprint 1 Review - Low-risk Writes

Status: `AFGEROND / STAGING GEVALIDEERD / PRODUCTIE DICHT`

Datum: 2026-06-30

## Doel

Sprint 1 heeft de eerste gecontroleerde Supabase write-MVP's gevalideerd zonder productie-write-mode te openen.

De focus lag op lage-risico writes:

- geen factuurbedragen;
- geen betalingen;
- geen abonnementmutaties;
- geen rollen/auth-mutaties;
- geen storage uploads;
- geen AI-acties;
- geen productieproject.

Elke write is gated, heeft local/demo fallback en is op staging getest met RLS/security evidence.

## Eindstatus

| Module | Supabase tabel | Servicebestand | Feature gate | Fallback key | Staging | Security/RLS |
| --- | --- | --- | --- | --- | --- | --- |
| CRM Tasks | `crm_tasks` | `public/src/services/crmTaskWriteService.js` | `maxwebstudioCrmTaskWriteEnabled=true` + `supabase-write-test` | `maxwebstudioCrmTasks` | PASS | Anonymous/no-profile geblokkeerd; sales write/read bewezen |
| Lead Notes | `leads` | `public/src/services/leadNoteWriteService.js` | `maxwebstudioLeadNoteWriteEnabled=true` + `supabase-write-test` | `maxwebstudioLeadFinderLeads` | PASS | Alleen `notes`, `updated_at`, metadata; customer/no-profile/anonymous geblokkeerd |
| Change Requests | `change_requests` | `public/src/services/changeRequestWriteService.js` | `maxwebstudioChangeRequestWriteEnabled=true` + `supabase-write-test` | `maxwebstudioChangeRequests` | PASS | Customer ownership en spoofing geblokkeerd via patch `008` |
| Client Portal Messages | `client_portal_messages` | `public/src/services/clientPortalMessageWriteService.js` | `maxwebstudioClientPortalMessageWriteEnabled=true` + `supabase-write-test` | `maxwebstudioClientPortalMessages` | PASS | Customer/sender ownership en spoofing geblokkeerd via patch `009` |

## Staging Evidence

| Fase | Evidence run | Resultaat |
| --- | --- | --- |
| 35A.1 CRM Tasks | `phase-35a1-1782774691838` | PASS |
| 35B.1 Lead Notes | `phase-35b1-rerun-1782775482334` | PASS |
| 35C Change Requests | `phase-35c-rerun-1782798584503` | PASS |
| 35D Client Portal Messages | `phase-35d-1782800213876` | PASS |

## Security Bevindingen

Sprint 1 heeft twee echte RLS-aandachtspunten gevonden en opgelost op staging:

1. `change_requests` stond customer_id-spoofing toe wanneer een klant zijn eigen `auth_user_id` combineerde met een ander `customer_id`.
   - Opgelost met `supabase/migration-drafts/008_change_request_customer_ownership.sql`.

2. `client_portal_messages` had een bredere owner-insert policy dan wenselijk voor sender identity.
   - Opgelost met `supabase/migration-drafts/009_client_portal_message_customer_ownership.sql`.

Beide patches zijn op staging uitgevoerd en daarna opnieuw gevalideerd.

## Productiebeleid

Productie-write-mode blijft `NO-GO`.

Redenen:

- server-side audit logging is nog niet actief;
- patches `008` en `009` zijn staging-bewezen, maar nog niet production-approved;
- production environment approvals zijn nog niet afgerond;
- write-governance voor medium-risk writes moet eerst worden vastgesteld;
- rollback/archivering voor production writes moet per module worden bevestigd.

## Wat Nu Supabase-ready Is

Read-only/hybrid:

- customers;
- websites;
- projects;
- quotes;
- quote_lines;
- invoices;
- invoice_lines;
- subscriptions;
- files;
- change_requests;
- client_portal_messages;
- client_portal_notifications;
- crm_tasks;
- leads.

Gated write-ready op staging:

- `crm_tasks` create;
- `leads.notes` append;
- `change_requests` create;
- `client_portal_messages` create.

## Wat Nog Niet Write-ready Is

Medium-risk:

- customers updates;
- websites updates;
- projects status/fase/voortgang updates.

High-risk:

- quotes;
- quote_lines;
- invoices;
- invoice_lines;
- subscriptions.

Restricted:

- roles/profiles/auth;
- payments/Mollie;
- audit logs;
- deployments;
- Supabase schema/RLS/config;
- files/storage uploads;
- AI-acties die productiegegevens wijzigen.

## Benodigd Voor Sprint 2

Voordat Sprint 2 start:

1. Kies exact welke medium-risk write als eerste komt.
2. Leg per write de ownership-regels en RLS-policy vast.
3. Voeg server-side audit logging strategie toe.
4. Bepaal conflictstrategie voor hybrid/local versus Supabase data.
5. Bevestig dat production-write-mode dicht blijft.
6. Maak per write een stagingvalidatieplan met spoofing, no-profile, anonymous en rollback/fallback.

Aanbevolen Sprint 2-volgorde:

1. `projects` status/fase/voortgang update.
2. `websites` status/notities/onderhoudsvelden update.
3. `customers` beperkte contactvelden update.

Niet starten met finance writes totdat Sprint 2 is afgerond en audit logging actief is.

## Conclusie

Sprint 1 is succesvol afgerond.

Max Webstudio heeft nu bewezen dat low-risk writes gecontroleerd kunnen worden toegevoegd met:

- expliciete feature gates;
- local/demo fallback;
- staging evidence;
- RLS/security checks;
- spoofing checks;
- production write-mode dicht.

De volgende stap is geen nieuwe write, maar Sprint 2-planning met medium-risk governance.
