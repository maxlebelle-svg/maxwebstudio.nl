# Sprint 2 Review - Operationele Workflow Writes

Status: `AFGEROND / STAGING GEVALIDEERD / PRODUCTIE DICHT`

Datum: 2026-06-30

## Doel

Sprint 2 heeft de eerste medium-risk Supabase writes gevalideerd zonder productie-write-mode te openen.

De focus lag op operationele workflowmutaties:

- projectstatussen bijwerken;
- klantcontactgegevens bijwerken;
- operationele websitevelden bijwerken.

Elke write is gated, heeft local/demo fallback en is op staging getest met RLS/security evidence.

## Eindstatus

| Module | Supabase tabel | Servicebestand | Provider-methode | Feature gate | Fallback key | Staging | Security/RLS |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Project Status Updates | `projects` | `public/src/services/projectStatusWriteService.js` | `supabaseProvider.updateProjectStatus()` | `maxwebstudioProjectStatusWriteEnabled=true` + `supabase-write-test` | `maxwebstudioProjects` | PASS | Support update bewezen; customer/no-profile/anonymous geblokkeerd; customer/extra-field spoofing geblokkeerd |
| Customer Contact Updates | `customers` | `public/src/services/customerContactWriteService.js` | `supabaseProvider.updateCustomerContact()` | `maxwebstudioCustomerContactWriteEnabled=true` + `supabase-write-test` | `maxwebstudioCustomers` + `maxwebstudioCrmCustomers` | PASS | Sales update bewezen; customer/no-profile/anonymous geblokkeerd; status/auth/company spoofing geblokkeerd |
| Website Operational Updates | `websites` | `public/src/services/websiteOperationalWriteService.js` | `supabaseProvider.updateWebsiteOperational()` | `maxwebstudioWebsiteOperationalWriteEnabled=true` + `supabase-write-test` | `maxwebstudioManagedSites` + `maxwebstudioWebsites` | PASS | Developer update bewezen; customer/no-profile/anonymous geblokkeerd; customer/domain/Netlify spoofing geblokkeerd |

## Staging Evidence

| Sprint | Patch | Evidence run | Resultaat |
| --- | --- | --- | --- |
| 2A Project Status Updates | `supabase/migration-drafts/010_project_status_update_grants.sql` | `phase-35-2a-1782801332755` | PASS |
| 2B Customer Contact Updates | `supabase/migration-drafts/011_customer_contact_update_grants.sql` | `sprint-2b-1782814316233` | PASS |
| 2C Website Operational Updates | `supabase/migration-drafts/012_website_operational_update_grants.sql` | `sprint-2c-1782814909471` | PASS |

## Toegestane Write-scopes

### 2A Projects

Alleen:

- `status`
- `phase`
- `progress`
- `updated_at`
- veilige metadata

Niet toegestaan:

- create/delete/archive;
- `customer_id`;
- `website_id`;
- ownership;
- notes/checklist/tasks/timeline;
- finance/files/AI-velden.

### 2B Customers

Alleen:

- `name`
- `email`
- `phone`
- `notes`
- `updated_at`
- veilige metadata

Niet toegestaan:

- create/delete/archive;
- `auth_user_id`;
- `profile_id`;
- ownership;
- rollen/status;
- portal/login;
- finance/subscriptions.

### 2C Websites

Alleen:

- `status`
- `care_package`
- `notes`
- `last_checked_at`
- `updated_at`
- veilige metadata

Niet toegestaan:

- create/delete/archive;
- `customer_id`;
- `profile_id`;
- domein/URL's;
- GitHub/Netlify;
- hosting/deployment configuratie;
- billing/storage/ownershipvelden.

## Security Bevindingen

Sprint 2 bevestigt dat de gekozen write-aanpak werkt:

- column-level grants blokkeren gevoelige velden voordat RLS-policies evalueren;
- RLS blokkeert customer/no-profile updates zonder effectieve mutatie;
- anonymous requests worden geblokkeerd;
- spoofing van ownership, status, auth, domain en deploymentvelden wordt geblokkeerd;
- klantportaal-readback blijft klantveilig.

Bij sommige geblokkeerde authenticated requests geeft PostgREST HTTP 200 met 0 gewijzigde rijen terug. Dit is als PASS beoordeeld wanneer er geen effectieve update heeft plaatsgevonden.

## Productiebeleid

Productie-write-mode blijft `NO-GO`.

Redenen:

- patches `010`, `011` en `012` zijn staging-bewezen, maar nog niet production-approved;
- server-side audit logging ontbreekt nog;
- production release approvals zijn nog niet ingevuld;
- monitoring/backup/release-governance moeten eerst verder worden afgerond.

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
- `client_portal_messages` create;
- `projects.status/phase/progress` update;
- `customers.name/email/phone/notes` update;
- `websites.status/care_package/notes/last_checked_at` update.

## Wat Nog Niet Write-ready Is

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

## Advies Voor Sprint 3

De volgende sprint moet geen nieuwe business-writes toevoegen.

Aanbevolen naam:

`Production Readiness Sprint`

Aanbevolen focus:

1. Server-side audit logging.
2. Storage en file-upload security.
3. Monitoring en observability.
4. Backups en restore evidence.
5. Release approvals en production write-governance.
6. Environment hardening.

Pas daarna zijn high-risk writes zoals finance, subscriptions, payments en AI-acties verstandig.

## Conclusie

Sprint 2 is succesvol afgerond.

Max Webstudio heeft nu bewezen dat medium-risk operationele writes gecontroleerd kunnen worden toegevoegd met:

- expliciete feature gates;
- local/demo fallback;
- staging evidence;
- RLS/security checks;
- spoofing checks;
- column-level grants;
- production write-mode dicht.

De volgende stap is geen nieuwe write, maar de Production Readiness Sprint.
