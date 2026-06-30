# Sprint 3B - Storage Security Foundation

Status: `FOUNDATION READY / GEEN UPLOADS / GEEN SQL`

Datum: 2026-06-30

## Doel

Sprint 3B legt de veilige opslagarchitectuur vast voordat echte uploads, Supabase Storage-buckets of productie-downloads worden vrijgegeven.

Deze fase bouwt geen nieuwe uploadfunctie. De output is een bucketstrategie, toegangsmodel, signed URL-beleid, Max AI-bestandsgrenzen en Developer Mode-readiness.

## Productlaag

Sprint 3B hoort bij:

`Trust Infrastructure`

Het doel is vertrouwen:

- bestanden zijn niet publiek browsebaar;
- klanten zien alleen eigen bestanden;
- interne rollen hebben minimale toegang;
- signed URLs verlopen kort;
- Max AI mag bestanden niet zelfstandig delen, verwijderen of publiceren.

## Bucketstrategie

| Bucket | Doel | Privacy | Productiekritisch |
| --- | --- | --- | --- |
| `customer-files` | Logo's, foto's, teksten en projectdocumenten | private | ja |
| `website-assets` | Websitebeelden, geoptimaliseerde assets en toekomstige AI-assets | private by default | ja |
| `contracts` | Contracten en juridische documenten | private | ja |
| `invoices` | Factuur-PDF's en betaalgerelateerde documenten | private | ja |
| `ai-assets` | AI-briefings, conceptbeelden en generator-assets | private | later |
| `demo-assets` | Publieke demo- en sales-assets zonder klantdata | public of private demo-only | nee |
| `internal-documents` | Interne documenten en auditbijlagen | private internal | ja |

Historische buckets:

- `change-request-files`
- `invoice-pdfs`

Deze blijven legacy/context totdat de canonical bucketstrategie expliciet wordt gemigreerd.

## Rollen En Toegang

| Rol | Upload | Download | Grens |
| --- | --- | --- | --- |
| customer | `customer-files` | eigen `customer-files` | alleen eigen customer/project/website |
| admin | alle private buckets behalve demo-limieten | alle relevante buckets | via server-side endpoint + audit |
| support | `customer-files` | `customer-files`, `website-assets` | geen finance/contracts zonder hogere rol |
| developer | `website-assets`, `demo-assets` | `website-assets`, `demo-assets` | geen klantdocumenten tenzij procesmatig nodig |
| sales | `demo-assets` | `demo-assets`, beperkte website-assets | geen echte klantbestanden |
| demo_user | geen | `demo-assets` | alleen demo data |

## Bestandsbeleid

Toegestaan:

- jpg
- jpeg
- png
- webp
- pdf
- docx
- txt
- md
- csv

Geblokkeerd:

- exe
- dmg
- pkg
- sh
- bat
- cmd
- js
- html
- php

MVP-limieten:

- maximaal 10 MB per bestand;
- maximaal 5 bestanden per request;
- executable uploads niet toegestaan;
- virus/malware scan blijft toekomstige productievoorwaarde.

## Signed URLs

Regels:

- private bestanden krijgen geen permanente publieke URL;
- signed download URL: maximaal 5 minuten;
- signed upload URL: maximaal 5 minuten;
- URLs worden alleen server-side gemaakt;
- download/upload wordt vooraf gevalideerd op rol en ownership;
- elk file event moet later audit logging krijgen.

## File Metadata

`files` blijft de metadata-laag.

Minimale metadata:

- `id`
- `customer_id`
- `website_id`
- `project_id`
- `storage_bucket`
- `storage_path`
- `filename`
- `mime_type`
- `category`
- `status`
- `created_by`
- `created_at`
- `updated_at`
- `metadata`

Nooit opslaan in metadata:

- signed URLs;
- service role keys;
- tokens;
- base64-content;
- volledige providerpayloads.

## Max AI Bestandsgrenzen

Max AI mag later:

- bestanden uitleggen;
- veilige bestanden samenvatten;
- contentstructuur of briefing helpen voorbereiden;
- ontbrekende assets signaleren.

Max AI mag nooit zelfstandig:

- bestanden verwijderen;
- bestanden publiceren;
- signed URLs delen;
- contracten of facturen definitief juridisch/financieel beoordelen;
- private bestanden naar een AI-provider sturen zonder consent, masking en server-side beleid.

## Readiness Service

Toegevoegd:

- `public/src/services/storageSecurityReadinessService.js`

Developer Mode toont:

- Sprint 3B-status;
- bucketstrategie;
- file policy;
- signed URL policy;
- Max AI file policy;
- open blockers.

## Bewust Niet Gedaan

- Geen SQL uitgevoerd.
- Geen Supabase Storage bucket aangemaakt.
- Geen upload/download endpoint toegevoegd.
- Geen productie gewijzigd.
- Geen echte klantdata gebruikt.
- Geen OpenAI/Mollie/Resend gekoppeld.

## Volgende Stap

Aanbevolen vervolg binnen Sprint 3B:

1. Staging-only Storage migration/policy draft voorbereiden.
2. Signed URL endpoint ontwerp maken.
3. Customer A/B file isolation testen op staging.
4. File events koppelen aan server-side audit logging.
5. Daarna pas echte uploadflow bouwen.
