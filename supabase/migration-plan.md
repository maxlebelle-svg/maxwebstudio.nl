# Supabase Migratieplan - Max Webstudio

Fase 11.3 bereidt de overstap van `localStorage` naar Supabase voor. Deze bestanden zijn documentatie en schema-voorbereiding; er wordt nog niets automatisch uitgevoerd en de live provider blijft `localStorage`.

## Huidige opslag

| LocalStorage key | Toekomstige tabel | Opmerking |
| --- | --- | --- |
| `maxwebstudioCrmCustomers` / `maxwebstudioCustomers` | `customers` + optioneel `profiles` | CRM-klanten worden leidend; fallback-key eerst dedupliceren. |
| `maxwebstudioLeads` / `maxwebstudioLeadRequests` | `leads` | Publieke aanvragen en CRM-leads normaliseren naar een leadmodel. |
| `maxwebstudioManagedSites` / `maxwebstudioWebsites` | `websites` | `customerId/profileId` koppelen aan `customers.id`. |
| `maxwebstudioProjects` | `projects` | Checklist, taken en timeline blijven voorlopig `jsonb`. |
| `maxwebstudioFiles` | `files` | Link/locatie wordt later `storage_path` wanneer echte upload actief wordt. |
| `maxwebstudioQuotes` | `quotes` + `quote_lines` | `lines[]` opsplitsen naar `quote_lines`. |
| `maxwebstudioInvoices` | `invoices` + `invoice_lines` | `lines[]` opsplitsen naar `invoice_lines`. |
| `maxwebstudioSubscriptions` | `subscriptions` | `lastInvoiceId` en recurring velden koppelen aan `invoices`. |
| `maxwebstudioSettings` | `settings` | Eén workspace-record, metadata voor overige velden. |
| `maxwebstudioDemoEmails` | `demo_emails` | Demo-only met `is_demo = true` en `environment = 'demo'`. |
| `maxwebstudioImportLog` | `import_logs` | Restore/import historiek. |
| `maxwebstudioActivityLog` | `activity_logs` | Audit trail voorbereiding. |

## Belangrijke opsplitsingen

- Offerte- en factuurregels moeten uit `quote.lines` en `invoice.lines` naar aparte line tables.
- Project `checklist`, `tasks` en `timeline` blijven voorlopig `jsonb`, omdat het dashboard lokaal ook met arrays werkt.
- Bestandmetadata blijft in `files`; echte objectopslag volgt later via Supabase Storage.
- Demo-records behouden `is_demo = true` en `environment = 'demo'`.

## Migratiestappen

1. Maak een Supabase testproject aan.
2. Voer `supabase/schema.sql` uit in de testomgeving.
3. Review en test `supabase/rls-policies.sql` met aparte testgebruikers.
4. Draai in het admin-dashboard Developer Mode:
   - data validatie
   - migratie-analyse
   - Supabase readiness check
5. Exporteer lokale data via bestaande JSON export.
6. Transformeer records per mapping:
   - klanten eerst
   - websites/projecten daarna
   - offertes/facturen met line splits
   - abonnementen als laatste
7. Importeer in Supabase testomgeving.
8. Vergelijk record counts met `getSupabaseTableMapping()` en dashboard-readiness.
9. Test RLS met admin, sales, support, customer en demo_user.
10. Pas provider pas in een latere fase om naar Supabase.

## Validatie vooraf

Controleer minimaal:

- ontbrekende `id`
- dubbele `id`
- klanten zonder naam/bedrijf
- websites/projecten/facturen/offertes/abonnementen zonder klantkoppeling
- facturen/offertes zonder regels
- gebroken relaties:
  - quote naar customer
  - invoice naar customer
  - invoice naar source quote
  - website naar customer
  - project naar customer/website
  - subscription naar customer/website
  - file naar customer/project/website

## Rollbackplan

- Zet de provider niet live om voordat testmigratie akkoord is.
- Bewaar JSON export als rollbackbron.
- Houd localStorage demo-flow actief.
- Gebruik Supabase testomgeving voor eerste migraties.
- Bij problemen: provider blijft `localStorage`; verwijder of herstel testdata in Supabase.

## Demo-data scheiding

Demo-data blijft herkenbaar via:

- `is_demo = true`
- `environment = 'demo'`
- demo metadata zoals `demoJourneyId`

Hierdoor kan de salesdemo later naast productie bestaan zonder echte klantdata te vervuilen.

## Import/export rol

De bestaande JSON export/import blijft voorlopig de brug tussen lokale demo en migratievoorbereiding. Later kan dit vervangen worden door een server-side migratiecommand of Supabase Edge Function, maar nu blijft het bewust handmatig en controleerbaar.

## Risico's

- RLS policies zijn voorbereid maar nog niet getest met echte Supabase Auth claims.
- Oude velden gebruiken soms `profileId` en soms `customerId`; migratie moet dit normaliseren.
- Line items moeten zorgvuldig worden uitgesplitst om totalen te behouden.
- Demo en productie mogen niet gemengd worden zonder `environment` en `is_demo`.
- Supabase schema gebruikt nieuwe tabelnamen (`websites`, `quotes`, `invoices`) terwijl oudere docs soms `customer_*` tabellen noemen; latere implementatie moet één naamgevingslijn kiezen.
