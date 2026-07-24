# Preview approval version identity fix

## Uitkomst

De previewrenderroute gebruikte `package_checksum` en `created_at` in het antwoord zonder deze kolommen uit `website_preview_versions` te selecteren. Daardoor ontving `public/preview.html` wel de preview, maar geen volledige servergeleverde versie-identiteit. De bestaande browserguard stopte de approval terecht vóór de API-request.

De minimale fix selecteert beide bestaande kolommen en bouwt `id`, `checksum` en `createdAt` via één fail-closed serverhelper. Een ontbrekende of ongeldige checksum levert een veilige HTTP 409 op; de readroute genereert geen vervangende checksum.

## Contractbewijs

| Veld | Databasebron | Voor fix geselecteerd | Responseveld | Gebruikt door | Status na fix |
| --- | --- | --- | --- | --- | --- |
| `id` | `website_preview_versions.id` | ja | `preview.id` | preview- en approvalbinding | behouden |
| `customer_id` | `website_preview_versions.customer_id` | ja | niet publiek | server-side tenantfilter | behouden |
| `project_id` | `website_preview_versions.project_id` | ja | niet publiek | relatie- en autorisatiecontext | behouden |
| `website_id` | `website_preview_versions.website_id` | ja | niet publiek | relatiecontext | behouden |
| `package_checksum` | `website_preview_versions.package_checksum` | nee | `preview.checksum` | approvalrequest en server-RPC | expliciet geselecteerd en gevalideerd |
| `created_at` | `website_preview_versions.created_at` | nee | `preview.createdAt` | stabiele versie-identiteit | expliciet geselecteerd en vereist |
| `quality_report` | `website_preview_versions.quality_report` | ja | via bestaand previewcontract | kwaliteitsweergave | behouden |
| `generated_package` | `website_preview_versions.generated_package` | ja | gerenderde `preview.html` | Factory- en ZIP-rendering | behouden |

De canonieke migratie definieert `package_checksum text not null` met een 64-teken lowercase SHA-256-check en `created_at timestamptz not null default now()`. Er is geen schemawijziging nodig.

## Exacte codefix

- `functions/client-preview-render.js` selecteert nu `package_checksum` en `created_at`.
- `previewIdentity()` retourneert uitsluitend de servergeleverde `id`, `checksum` en `createdAt`.
- Ontbrekende of ongeldige identiteit faalt gesloten met een veilige fout.
- De route blijft uitsluitend `GET`, klantgebonden en read-only.
- Approvalsemantiek, checksumgeneratie, sandboxing, finance en database zijn niet gewijzigd.

## Lokale validatie

| Testgroep | Resultaat |
| --- | --- |
| Nieuwe versie-identiteitstests | 14/14 |
| Financecontract en IDOR | 19/19 |
| CP-A trust chain | 5/5 |
| Gecombineerd finance-, quality-, CP-A- en previewcontract | 51/51 |
| Volledige suite releasebasis | 282/292 |
| Volledige suite kandidaat | 296/306 |
| Bestaande failures | 10/10 identiek, Website Factory-governance/idempotency |
| Nieuwe failures | 0 |
| JavaScript-syntax en diffcontrole | geslaagd |
| Secret scan gewijzigde code/tests | geen credentials of secrets |

De eerder gedocumenteerde baseline noemde 283/293. Een verse run op exact `cd3c87fb3bf9aaa9530216dc841b1ff5486caf38` telt 282/292. De kandidaat voegt exact 14 geslaagde tests toe en geen failure; de vergelijkbare actuele totalen zijn daarom 296/306.

## Release-identiteit

- Basiscommit: `cd3c87fb3bf9aaa9530216dc841b1ff5486caf38`
- Branch: `release/preview-approval-version-identity-fix`
- Migratie nodig: nee
- Databasewijziging: nee
- Productiewijziging: nee
- E-mails: nee
- Betalingen/providercalls: nee

De definitieve releasecommit, PR, stagingdeploy, browseracceptatie en credentialrotatie worden na gecontroleerde uitvoering in dit rapport aangevuld.

## Stagingacceptatie

Status vóór release: lokaal groen; staginguitvoering nog niet gestart.

BLOCKED_CP_A_STAGING_ACCEPTANCE
