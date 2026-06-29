# Production Architecture

Dit document legt de leidende productiearchitectuur vast voor Max Webstudio. Het doel is voorkomen dat CRM, klantportaal, facturatie, demo-flows en AI-workflows langs elkaar heen groeien.

## Hoofdprincipe

Max Webstudio blijft gefaseerd werken:

1. Demo/local waar dat veilig is voor bouwen en salesdemo's.
2. Supabase testomgeving voor schema, RLS, Auth, Storage en isolatiebewijs.
3. Productie pas na expliciete GO, ingevulde evidence en handmatige goedkeuring.

Er wordt geen productie-SQL uitgevoerd zonder aparte expliciete fase.

## Canonical Productielijn

De leidende productiedatalijn is:

```text
profiles
customers
websites
projects
quotes
quote_lines
invoices
invoice_lines
subscriptions
files
change_requests
```

Deze lijn is leidend voor nieuwe productiefeatures, RLS, klantportaaldata, rapportages en toekomstige AI-workflows.

## Demo En Local

Demo/local blijft toegestaan voor:

- publieke demo-sites
- demo portfolio showcase
- lokale CRM-demo's
- lokale klantportaaldemo
- AI Website Wizard intake-draft
- release readiness UI
- backup/import-export demo
- salesdemonstraties zonder echte klantdata

Local/demo-data mag niet als productiebron worden gezien. Migratie naar Supabase moet per module expliciet gebeuren via provider/repository-laag.

## Naar Supabase

Deze onderdelen moeten uiteindelijk via Supabase lopen:

- customers
- websites
- projects
- quotes en quote_lines
- invoices en invoice_lines
- subscriptions
- files metadata
- change_requests
- profiles/Auth mapping
- klantportaal read-data
- RLS customer isolation

Supabase writes worden alleen ingeschakeld na:

- testproject validatie
- RLS customer A/B bewijs
- rollbackplan
- env-var controle
- release approval

## Legacy

De volgende oude lijnen zijn legacy voor nieuwe productieontwikkeling:

- `customer_websites`
- `customer_invoices`
- `customer_subscriptions`

Deze mogen niet opnieuw als basis worden gebruikt voor nieuwe RLS, klantportaaldata of facturatie. Als bestaande code of documentatie hier nog naar verwijst, moet die verwijzing worden gemarkeerd als legacy of gemigreerd naar de canonical lijn.

## Integraties

Integraties volgen deze volgorde:

1. Resend readiness en templates.
2. Mollie testmodus met webhooks.
3. Supabase Storage voor klantbestanden en facturen.
4. Analytics/cookiebeheer voor publieke site.
5. AI providers pas na stabiele CRM/projectdata.

Geen API keys mogen in frontendcode of documentatie terechtkomen.

## AI Website Wizard

De AI Website Wizard blijft voorlopig:

- local state
- workflow/intake
- preview/readiness
- geen OpenAI-calls
- geen automatische websitegeneratie
- geen databasewrites

Latere AI-fases mogen pas bouwen op gecontroleerde CRM/projectdata en moeten altijd review/approval-stappen bevatten.

## Releasevolgorde Richting Live

1. Public website live/source consistency.
2. Production architecture en module boundaries.
3. Supabase testomgeving validatie afronden.
4. CRM canonical data live maken.
5. Klantportaal live read-data hardmaken.
6. Auth/RLS/route guards hard zetten.
7. Storage en downloads hardmaken.
8. Resend en Mollie test/live validatie.
9. Full release candidate.
10. Productie GO.

