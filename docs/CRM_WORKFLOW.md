# CRM Workflow Readiness

Laatste update: 2026-06-29.

## Doel

De CRM-workflowlaag maakt het admin-dashboard bruikbaar als interne werkplek voor opvolging. Max Webstudio kan hiermee lokale/demo taken vastleggen rond leads, klanten, websites, projecten, offertes, facturen, abonnementen, bestanden en wijzigingsverzoeken.

Deze fase bouwt geen productiebackend en voert geen Supabase SQL uit.

## LocalStorage

Nieuwe key:

- `maxwebstudioCrmTasks`

Deze key bevat interne opvolgacties met:

- `id`
- `title`
- `type`
- `status`
- `priority`
- `customerId`
- `websiteId`
- `projectId`
- `quoteId`
- `invoiceId`
- `subscriptionId`
- `leadId`
- `changeRequestId`
- `dueDate`
- `notes`
- `source`
- `createdAt`
- `updatedAt`
- `completedAt`

## Statusflow

Ondersteunde statussen:

- `nieuw`
- `open`
- `in_behandeling`
- `wacht_op_klant`
- `afgerond`
- `gearchiveerd`

Afgerond en gearchiveerd tellen niet meer als open opvolging.

## Canonical productielijn

De workflowlaag sluit aan op:

- `profiles`
- `customers`
- `websites`
- `projects`
- `quotes`
- `quote_lines`
- `invoices`
- `invoice_lines`
- `subscriptions`
- `files`
- `change_requests`

Nieuwe productiefeatures mogen niet gebaseerd worden op legacy `customer_websites`, `customer_invoices` of `customer_subscriptions`.

## Productievoorbereiding

Voor productie kan `maxwebstudioCrmTasks` later worden gemigreerd naar een canonical taken/activity-laag, bijvoorbeeld:

- `crm_tasks`
- `activity_log`
- `project_tasks`
- of een gecombineerde workflowtabel

Tot die fase blijft deze module local/demo/mock.

## Niet actief

- Geen live Supabase writes.
- Geen Resend-mails.
- Geen Mollie-acties.
- Geen OpenAI-calls.
- Geen externe API's.
- Geen klantportaal-writes.
