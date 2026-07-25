# CP-A production release reconstruction

Status: lokaal gereconstrueerd; nog niet gepusht, uitgerold of op een remote database toegepast.

## Release-identiteit en methode

- Productie-lineagebasis: `0bb0ea74884652f1297d9d9a19c02108c0095688`.
- Bewezen stagingbron: `92660ea259d22afe6a048700443f62ec194a0ac6`.
- Gemeenschappelijke ancestor: `cf68b33a6ddd08fa84c059619d4db368a5de39c9`.
- Nieuwe branch: `release/cp-a-production-reconstruction`.
- Divergentie bij opdrachtstart: 169 commits alleen op de productie-lineage en 38 alleen op de stagingkandidaat.
- Methode: actuele productie-lineage behouden en uitsluitend het bewezen CP-A-contract semantisch reconstrueren. Er is geen branchmerge en geen serie van 38 blinde cherry-picks uitgevoerd.

De stagingwijzigingen die als bronbewijs dienden waren `cc504b79` (bridge), `40797df3` (trust chain), `5adb1208` (digest-resolutie), `cd3c87fb` (canonieke finance en quality repair) en `3169b50` (preview-identiteit). Conflicten zijn tegen de nieuwere main-architectuur opgelost; main-bestanden zijn niet blind vervangen.

## Bewezen releasecontract

| Contract | Stagingbewijs | Main op de basis | Actie in kandidaat |
|---|---|---|---|
| Opaque previewsandbox | Geauthenticeerde acceptance en statische tests | Preview bestond zonder volledig CP-A-sandboxcontract | Sandbox zonder `allow-same-origin`, forms, popups of top-navigation; restrictieve CSP |
| Preview-identiteit | ID/checksum/created_at/quality_report bewezen | Geen `package_checksum` in productieschema | Serverresponse en publicatie aan exacte identiteit gebonden; ontbrekende checksum faalt gesloten |
| Immutable approval | A/B/admin acceptance, idempotentie en isolatie | Mutabele statusvelden/side-effects | Server-side RPC, actor uit sessie, exact ID + checksum, immutable record en trust-event |
| Quote acceptance | Server-side acceptance 1/1 | Geen CP-A quote endpoint of acceptancemodel | Transactionele, versie/checksum- en customergebonden RPC; geen automatische betaling |
| Trust events | Preview- en quote-event bewezen | Niet aanwezig | Begrensde immutable trust-eventtabel en exact-once constraints |
| Publication bridge | Op staging toegepast en getest | Velden niet volledig gegarandeerd | Forward-only bridge met pre- en postconditions |
| `quality_report` | Repair en acceptance bewezen | Productieobject heeft kolom al | Idempotente repair houdt `jsonb`, nullable, zonder default aan |
| Canonieke finance | Admin/klant-consistentie en regressies bewezen | Actieve runtime gebruikte deels `customer_*` | Alle actieve queries naar `invoices` en `subscriptions`; gedeelde normalisatiehelper |
| Cross-customer autorisatie | A/B-isolatie 4/4 | Bestaande ownershipfunctie beschikbaar | RLS, server-side customerbinding en RPC-validatie |

## Bestands- en codevergelijking

| Bestanden | Main-functionaliteit | Staging-functionaliteit | Conflict en minimale reconstructie |
|---|---|---|---|
| `functions/client-preview-render.js`, `admin-preview-publication.js` | Nieuwere main-publicatieflow | Identiteit en veilige renderresponse | Main-flow behouden; checksum, quality en server-resolved identiteit toegevoegd |
| `functions/client-preview-versions.js` | Feedback, journey-side-effects en afzonderlijke testbetaling | Immutable approval-RPC | Main-feedback en expliciete betaalactie behouden; alleen approve-route vervangen door het fail-closed RPC-contract |
| `functions/client-quote.js` | Ontbrak | Server-side quote acceptance | Nieuw begrensd endpoint toegevoegd |
| `public/preview.html`, `preview-embed.html`, `klantportaal.html`, `offerte.html` | Nieuwere portal-UX | Sandbox en exacte approval/quote-identiteit | UI behouden waar nieuwer; securityparameters en exacte API-contracten ingevoegd |
| `netlify.toml` | Bestaande headers/routes | Preview-specifieke CSP/frame policy | Specifieke no-store/frame policy toegevoegd zonder globale headers te verzwakken |
| Admin- en klantfinancebestanden | Gemengd legacy/canoniek model | Canonieke tabellen | Queries semantisch omgezet met `_canonical-finance.js`; veilige empty states behouden |
| Journey repositories en `website-factory.js` | Nieuwere main-only flows | Niet volledig in stagingpatch betrokken | Main-flows behouden; resterende actieve legacyqueries omgezet en packagechecksum bij generatie toegevoegd |
| Migraties | Productie-lineage tot `20260722136000` | Bridge, CP-A, quality repair | Nieuwe prerequisite voor ontbrekende canonieke objecten; bewezen stagingmigraties ongewijzigd als nieuwe versies opgenomen |

## Migratie-inventaris en productiecontract

De lineagevergelijking bevat twintig nieuwe main-only migraties, tien nieuwe staging-only migraties en één gedeelde migratie met afwijkende inhoud (`20260712123000_relationship_asset_library.sql`). De twintig main-only versies blijven door de nieuwe basis volledig behouden. De tien staging-only versies zijn niet als historische reeks meegenomen; alleen de drie CP-A-relevante versies zijn inhoudelijk geselecteerd.

Read-only productie-inspectie op projectref `yxxahurphdbblkuxoeje` bevestigde de volgende objectstaat. Er zijn geen credentials, klantidentiteiten of tokens vastgelegd.

| Object/migratie | Productie aanwezig | History aanwezig | Actie nodig | Nieuwe forward-only migratie |
|---|---:|---:|---|---:|
| `customers`, `profiles`, `projects`, `websites` | ja | ja | alleen preflight | nee |
| `website_preview_versions` | ja, 97 rijen | ja | nullable checksumkolom toevoegen; geen backfill | ja, prerequisite |
| `website_preview_versions.quality_report` | ja | repair nog niet in productiehistory | definitie idempotent verifiëren | ja, repair |
| `quotes`, `quote_lines` | nee | nee | canoniek model creëren | ja, prerequisite |
| `invoices`, `invoice_lines` | nee | nee | canoniek model creëren | ja, prerequisite |
| `subscriptions` | nee | nee | canoniek model creëren | ja, prerequisite |
| `customer_invoices` | ja, 3 rijen | legacy | behouden; geen automatische kopie | nee |
| `customer_subscriptions` | ja, 0 rijen | legacy | behouden | nee |
| preview publication bridgevelden | gedeeltelijk/verwacht | nee | fail-closed aanvullen en valideren | ja, bridge |
| approvals, quote acceptances, trust events en RPC's | nee | nee | CP-A-contract creëren | ja, trust chain |
| `extensions.digest(bytea,text)` | vereist en door bestaande productie-lineagemigratie gepreflight | ja | correcte schemaresolutie gebruiken | opgenomen in trust chain |

De prerequisite accepteert ontbrekende canonieke tabellen, maar stopt transactioneel bij een gedeeltelijke of incompatibele bestaande definitie. Er is geen compatibilityview, willekeurige backfill, drop, truncate of delete.

## Drie historische productierijen

De drie rijen zijn read-only beoordeeld in `public.customer_invoices`. Alle drie hebben legacy-status `paid`; de bedragen zijn respectievelijk 598,95, 1.360,04 en 181,50. De legacy tabel heeft geen betrouwbare valuta-, auth/profile-, project-, payment-, factuurnummer- of PDF-koppeling waarmee zonder aanname een canonieke factuur kan worden gemaakt.

- Doelmodel bij een latere, expliciete datamigratie: `public.invoices` plus alleen aantoonbare relaties.
- Canonieke runtime leest deze drie rijen na de release niet automatisch.
- Datamigratie nu: nee. De rijen blijven onaangeraakt en veilig beschikbaar voor een afzonderlijke reconciliation.
- Productierisico: historische facturen kunnen tijdelijk niet in de nieuwe canonieke klantweergave staan; duplicatierisico is juist vermeden door niet te gokken.
- Later plan: bepaal per rij een stabiele bronidentiteit, valuta en customer/projectrelatie; voer een idempotente insert met bronmetadata uit; controleer aantallen en totalen; gebruik bij fout een forward-fix, nooit een destructieve rollback.

## Lokale validatie

| Controle | Resultaat |
|---|---:|
| Exacte main-baseline | 1.171/1.171 |
| Kandidaatgerichte CP-A/finance/migratietests | 57/57 |
| Volledige kandidaatsuite | 1.228/1.228 |
| PostgreSQL-scenario's | 10/10 |
| Nieuwe failures | 0 |
| JavaScript-syntax | geslaagd |
| Gewijzigde HTML parse | geslaagd |
| Diff/whitespacecontrole | geslaagd |
| Secret scan | geen credentialmateriaal gevonden |
| Actieve runtimequery naar `customer_invoices`/`customer_subscriptions` | 0 |
| Website Factory-regressies | 0 |

Er is geen apart build-, lint- of typescript-script in `package.json`; syntax-, HTML-parse- en de volledige testsuite zijn daarom de toepasbare lokale buildkwaliteitspoorten.

De PostgreSQL-set valideert: productieachtige prestate, iedere migratie in volgorde, volledige volgorde, drie legacyrijen ongewijzigd, veilige herhaling van prerequisite/bridge/quality, functionele approval-idempotentie en isolatie, gedeeltelijk bestaand schema, incompatibel checksumtype, transactionele rollback, RLS en grants. CP-A zelf is bewust een eenmalige create-migratie en wordt niet dubbel uitgevoerd.

## Semantische equivalentie

| Gedrag | Stagingbewijs | Kandidaatbewijs | Status |
|---|---|---|---|
| Preview-ID | acceptance | gerichte tests | gelijkwaardig |
| Packagechecksum | acceptance | RPC- en migrationtests | gelijkwaardig |
| `created_at` | responsecontract | responsecontracttest | gelijkwaardig |
| `quality_report` | repair 1/1 | jsonb/nullable/no-default test | gelijkwaardig |
| Sandboxflags | browser/static | statische regressietest | gelijkwaardig |
| CSP | browser/static | header- en embedtest | gelijkwaardig |
| Approvalbinding | A/B acceptance | exact ID/checksum RPC-test | gelijkwaardig |
| Approval-idempotentie | dubbelklik/retry | functionele SQL + mocktest | gelijkwaardig |
| Trust-event | acceptance | functionele SQL exact-once | gelijkwaardig |
| Quote acceptance | 1/1 | transactionele RPC-test | gelijkwaardig |
| Canonieke finance | stagingregressies | runtime-search + tests | gelijkwaardig |
| Isolatie | 4/4 | RLS/RPC/cross-customer tests | gelijkwaardig |
| Adminconsistentie | stagingacceptance | gedeeld canoniek servermodel | gelijkwaardig |
| Veilige error states | acceptance | fail-closed tests | gelijkwaardig of strenger |

Totaal: 14/14.

## Uitgesloten staginginhoud

| Groep | Reden voor uitsluiting |
|---|---|
| Content Factory broncode, gegenereerde branchecatalogi en assets | Buiten CP-A-scope; main-functionaliteit mag niet door staginglijn worden vervangen |
| Social Studio code, pagina, migraties en tests | Buiten releasecontract |
| P0 lead-intake/staging-smoke code, fixtures, evidence en migraties | Historische staginglijn; main bevat de geldende nieuwere productielijn |
| Demo Journey/Website Factory core-migraties en deliveryfoundation | Niet opnieuw meenemen; main heeft eigen geldige lineage en functionaliteit |
| `.env*` voorbeelden | Geen configuratieverbreding of secretgerelateerde wijziging nodig |
| Oude CP-A release-, bridge-, staging- en identityrapporten | Stagingdocumentatieruis; dit rapport en manifest zijn canoniek voor deze reconstructie |
| Tijdelijke credentials en stagingfixtures | Niet aanwezig en expliciet verboden |
| Algemene sitebestanden en lead/social tests uit staging | Buiten gerichte reconstructie |

## Staginghercertificatieplan

1. Push uitsluitend `release/cp-a-production-reconstruction` na expliciete toestemming.
2. Maak een draft-PR naar de dan geldende stagingbranch; controleer dat de basis exact de bedoelde lineage is.
3. Laat alle repositorychecks slagen en stop bij iedere nieuwe mismatch.
4. Vergelijk staging migration history en objectstaat read-only met de vier checksums.
5. Pas alleen migraties toe die staging nog mist; voer bestaande bridge/CP-A/quality-versies nooit opnieuw uit wanneer history ze al bevat.
6. Deploy exact de gecommitte kandidaat-HEAD, zonder rebuildwijzigingen.
7. Controleer of bestaande CP-A-testfixtures nog aan het canonieke schema en de nieuwe release-identiteit voldoen; bouw ze alleen opnieuw op als dat bewezen nodig is.
8. Login en sessieherstel Customer A.
9. Login en sessieherstel Customer B.
10. Login en admin-autorisatie met CP-A TEST ADMIN.
11. Controleer preview-ID, checksum, `created_at` en `quality_report`.
12. Controleer sandboxflags, CSP, navigatie-, popup-, form- en paymentblokkades.
13. Voer versiegebonden approval, retry/dubbelklik, nieuwere preview en trust-event uit.
14. Voer server-side quote acceptance inclusief bedragen, btw, valuta, retry en geen automatische betaling uit.
15. Controleer admin/klant op dezelfde canonieke invoices/subscriptions en veilige empty states.
16. Bewijs A→B en B→A isolatie voor preview, approval, quotes en finance.
17. Draai volledige regressies, inclusief portal en Website Factory.
18. Start daarna een nieuwe, beperkte productierelease-review van exact dezelfde commit.

Bestaande stagingaccounts kunnen worden hergebruikt als hun auth-, profile-, customer-, project-, website-, preview- en quotedata nog volledig en test-only zijn. Credentials worden niet in repository, logs of rapporten opgeslagen. Er worden geen e-mails of betalingen uitgevoerd.

## Lokale releasecommits

- `8df000c5` — database/releasecontract.
- `76a65ab3` — preview, approval en quote.
- `e5ca41e2` — canonieke finance en main-runtime-integratie.
- De afsluitende tests/documentatiecommit bevat dit rapport en het manifest.

De exacte finale kandidaat-HEAD is de HEAD van `release/cp-a-production-reconstruction` na de afsluitende commit en wordt in het eindrapport vastgelegd. Dat vermijdt een onmogelijk zelf-refererende commit-hash in dit bestand.
