# CP_A_P0_CUSTOMER_PORTAL_TRUST_CHAIN_REMEDIATION

Datum: 24 juli 2026
Bronaudit: `docs/CUSTOMER_PORTAL_ULTIMATE_EXPERIENCE_AUDIT_V1.md`
Scope: uitsluitend CP-001, CP-002 en CP-003
Productie gewijzigd: nee

## 1. Root-causebevestiging

### P0-A — preview-isolatie

- Oorzaak: `public/preview.html` plaatste door de server samengestelde klantcode in `iframe.srcdoc` zonder `sandbox`.
- Getroffen route: `/preview.html?version=<uuid>`; de thumbnailroute gebruikte al een geneste sandbox, maar stond meer capabilities toe dan nodig.
- Getroffen bestanden: `public/preview.html`, `public/preview-embed.html`, `functions/client-preview-render.js`, `netlify.toml`.
- Risico vóór fix: same-origin packagecode kon parent-DOM, portalopslag en mogelijk bearercredentials bereiken, topnavigatie proberen te wijzigen of onverwachte netwerkrequests uitvoeren.

### P0-B — niet-versiegebonden goedkeuring

- Oorzaak: de volledige preview stuurde `{ action: "approve_preview" }` naar de generieke demo-journeyroute zonder `previewVersionId` of checksum. De portaalroute wijzigde bovendien mutable velden op `website_preview_versions` in plaats van een apart besluitrecord te maken.
- Getroffen routes: `/preview.html`, `/klantportaal.html#website-review`, `/.netlify/functions/client-preview-versions`.
- Getroffen modellen: `website_preview_versions`; er bestond geen immutable approvalmodel.
- Risico vóór fix: een akkoord kon aan een generieke projectstate hangen en door een latere versie ten onrechte als actueel worden geïnterpreteerd.

### P0-C — browser-only offerteacceptatie

- Oorzaak: `public/offerte.html` las `maxwebstudioQuotes` uit `localStorage` en schreef status, actor en tijdstip uitsluitend terug naar die browser.
- Getroffen route: `/offerte.html?quoteId=<uuid>`.
- Getroffen modellen: `quotes`, `quote_lines`; er bestond geen immutable acceptatierecord.
- Risico vóór fix: acceptatie was manipuleerbaar, niet tenantgebonden, verdween buiten dezelfde browsercontext en kon niet betrouwbaar door admin of audit worden gebruikt.

## 2. Implementatieoverzicht

### P0-A

- `public/preview.html` en `public/preview-embed.html` gebruiken nu uitsluitend `sandbox="allow-scripts"`.
- `allow-same-origin`, forms, pop-ups, downloads, modals en topnavigatie zijn niet toegestaan.
- Zonder `allow-same-origin` krijgt de uitgevoerde preview een unieke opaque origin. Dit is een echte browser-originbarrière, ook wanneer het vertrouwde wrapperdocument vanaf dezelfde host komt.
- `functions/client-preview-render.js` voegt aan elk Factory- en ZIP-package dezelfde CSP toe: onder meer `default-src 'none'`, `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'`, `object-src 'none'` en `base-uri 'none'`.
- Inline scripts blijven toegestaan voor realistische statische interactie. Externe scripts en alle fetch/XHR/WebSocketverbindingen worden door CSP geblokkeerd.
- `javascript:`, `vbscript:` en HTML-data-URL’s worden uit navigatieattributen verwijderd.
- Niet-interne links worden in de preview onderschept; hashinteractie en scrollen blijven werken.
- Parent en thumbnail gebruiken `no-referrer` en een lege capability-allowlist voor camera, microfoon, geolocatie, clipboard, payment en fullscreen.
- `netlify.toml` bevat specifieke no-store-, CSP-, frame-ancestor- en Permissions-Policyheaders voor de previewwrappers.

### P0-B

- Nieuwe tabel `website_preview_approvals` bewaart customer, project, website, preview-ID, versienummer, packagechecksum, actor, tijdstip, statementversie en statement snapshot.
- Goedkeuring loopt uitsluitend via `record_website_preview_approval(...)`, een begrensde `security definer`-functie die alleen `service_role` mag uitvoeren.
- De Function bepaalt authuser en customer server-side; clientvelden voor customer/actor worden niet vertrouwd.
- De database vergrendelt de previewrij, valideert customer/project/website, `published_to_portal`, `is_active`, `allow_approval`, succesvolle status en `package_checksum`.
- De bestaande Factorygarantie blijft gelden: previewpackage en checksum moeten exact bij een geslaagde build horen.
- Een optimistic concurrency guard vergelijkt de door de pagina bekeken checksum met de actuele serverchecksum. Mismatch wordt HTTP 409.
- Exact dezelfde approval is idempotent; een andere goedgekeurde versie voor hetzelfde project wordt historisch `superseded` en nooit overgeschreven.
- Generieke `approve_preview`-fallbacks zijn uit beide klantinterfaces verwijderd/geblokkeerd.
- Klant- en adminresponses leiden `currentVersionIsApproved` af uit exact dezelfde preview-ID en checksum. Een actieve nieuwe versie erft geen oud akkoord.

### P0-C

- Nieuwe Function `functions/client-quote.js` levert alleen de offerte van de geauthenticeerde customer, inclusief serverregels, versie, checksum en bestaande acceptatie.
- `public/offerte.html` gebruikt geen offerte- of acceptatiedata meer uit `localStorage`; browseropslag wordt alleen nog gelezen om de bestaande authsessie te vinden.
- Nieuwe tabel `quote_acceptances` bewaart quote/customer/project, actor, quoteversie, checksum, bedragen, valuta, tijdstip, statement en immutable snapshot.
- `quotes.quote_version` wordt database-side verhoogd bij inhouds- of regelwijzigingen.
- `cp_a_quote_checksum(uuid)` hasht een deterministische JSONB-representatie van de quote en de geordende regels.
- `record_quote_acceptance(...)` vergrendelt de quote, valideert owner, status `sent`, geldigheidsdatum, vervanging/archivering, versie en checksum, en schrijft acceptatie plus statusupdate atomair.
- Een geaccepteerde quote, acceptatiedatum en offerteregels kunnen daarna niet inhoudelijk worden aangepast of teruggezet.
- Dubbele submits leveren hetzelfde record terug. Clientbedragen en clientcustomer-ID’s worden niet naar de mutatie vertrouwd.
- De flow start geen betaling, maakt geen factuur en verstuurt geen e-mail.

### Gewijzigde en nieuwe bestanden

- Preview: `functions/client-preview-render.js`, `public/preview.html`, `public/preview-embed.html`, `netlify.toml`.
- Goedkeuring: `functions/client-preview-versions.js`, `functions/admin-preview-publication.js`, `public/klantportaal.html`, `public/preview.html`.
- Offerte: nieuw `functions/client-quote.js`, herschreven `public/offerte.html`.
- Database: nieuw `supabase/migrations/20260724120000_cp_a_portal_trust_chain.sql`.
- Tests: nieuw `tests/cp-a-portal-trust-chain.test.js` en `tests/fixtures/cp-a-portal-trust-chain-functional.sql`.

## 3. Previewbeveiligingsmodel

| Onderdeel | Contract |
| --- | --- |
| Portal-origin | Max Webstudio application-origin; bevat de geauthenticeerde wrapper en beareropslag |
| Preview-uitvoer-origin | Unieke opaque sandbox-origin door het ontbreken van `allow-same-origin`; deelt geen portal-origin of storage principal |
| Sandbox | Alleen `allow-scripts` |
| CSP package | `default-src none`; geen connect, forms, frames, objects, base of workers; alleen inline script/style en beperkte HTTPS/data media-assets |
| Permissions Policy | Camera, microfoon, geolocatie, clipboard, payment en fullscreen uit |
| Links | Alleen interne hashinteractie; gevaarlijke protocols worden verwijderd en externe navigatie wordt onderschept |
| Parentnavigatie | Niet toegestaan; geen `allow-top-navigation` |
| Credentials | Niet in previewpayload; package ontvangt uitsluitend HTML/CSS/assets, geen bearer of klantmetadata |
| `postMessage` | Er is bewust geen messagecontract of parent-listener. Alle messages, origins en schema’s worden daardoor genegeerd |
| Factory/ZIP | Beide gaan door `renderPackageHtml` en krijgen dezelfde CSP en sandbox |
| Publieke preview | De oude generieke/public approval is niet toegestaan; alleen een geauthenticeerde, gepubliceerde UUID-versie kan worden goedgekeurd |

Een apart hostname zoals `preview.maxwebstudio.nl` is niet vereist om deze originbarrière te realiseren: de HTML sandbox zonder `allow-same-origin` forceert volgens het browsermodel een unieke opaque origin. Een dedicated host kan later als extra defense-in-depth worden toegevoegd zonder het approvalcontract te wijzigen.

## 4. Goedkeuringscontract

- Opgeslagen: preview-ID, version number, immutable Factory `package_checksum`, customer, project, website, profile actor, auth actor, server timestamp, statementversie en statement snapshot.
- Geldig wanneer: approval `active` is, preview-ID gelijk is en approvalchecksum gelijk is aan de actuele packagechecksum.
- Nieuwe actieve versie: niet goedgekeurd; oud akkoord blijft historisch zichtbaar.
- Nieuwe goedkeuring binnen hetzelfde project: oude actieve approval wordt `superseded` met timestamp.
- Checksumwijziging of gelijktijdige versieactivatie: transactionele lock en conflict; client moet opnieuw laden.
- Idempotency: unieke `(customer_id, preview_version_id)` en `(customer_id, idempotency_key)` plus duplicate-return.
- Audittrail: exact één `customer_portal_trust_events`-record met eventtype, actor, customer, project, entiteit, versie, checksum, resultaat en veilige metadata.
- Directe clientwrites: geen insert/update/delete grants; alleen owner-read via RLS.

## 5. Offerteacceptatiecontract

- Bron van waarheid: `quotes` + `quote_lines` + `quote_acceptances`; nooit frontendstate.
- Versiebinding: database-managed `quote_version` plus SHA-256 over offerte-identiteit, inhoud, bedragen en geordende regels.
- Acceptabel: eigen quote, status `sent`, niet verlopen, niet verwijderd/gearchiveerd/vervangen en eventueel project van dezelfde customer.
- Bedrag/customer/actor/tijdstip: uitsluitend server/database-side vastgesteld.
- Idempotency: één acceptatie per quote en één idempotencykey per customer; retry retourneert hetzelfde record en maakt geen tweede event.
- Na acceptatie: quote wordt atomair `accepted`; content, regels, status, acceptatiedatum en trust-ID zijn beschermd tegen terugzetten.
- Gewijzigde versie/checksum: HTTP 409 en geen write.
- Audittrail: exact één `quote_accepted` trust-event in dezelfde transactie.
- Externe gevolgen: geen betaling, factuur of e-mail.

## 6. Databasewijzigingen

| Migratie | Object | Wijziging | RLS | Rollback-/forwardstrategie |
| --- | --- | --- | --- | --- |
| `20260724120000_cp_a_portal_trust_chain.sql` | `website_preview_approvals` | Immutable versie/checksumapproval, lifecycle en unieke actieve projectapproval | Owner-read; geen directe clientmutaties | Niet down-migreren; bij herstel nieuwe forward-only migratie en records bewaren |
| dezelfde | `quote_acceptances` | Immutable offerteacceptatie en amountsnapshot | Owner-read; geen directe clientmutaties | Niet verwijderen; Function/UI eventueel uitschakelen en forward herstellen |
| dezelfde | `customer_portal_trust_events` | Append-only exact-één beslisaudit | Owner-read; geen directe clientmutaties | Auditrecords altijd behouden |
| dezelfde | `quotes.quote_version` + triggers | Automatische versieophoging en post-acceptance immutability | Bestaande quote-RLS blijft | Alleen forward corrigeren; acceptaties blijven leidend |
| dezelfde | drie RPC’s | Checksum en twee atomische servermutaties | Alleen `service_role` execute | Revoke/disable via forward migration indien nodig |

- Nieuwe migraties: 1.
- Bestaande migraties gewijzigd: 0.
- Nieuwe/gewijzigde RLS-policies: 3 nieuwe owner-readpolicies.
- De authoritative baseline en bestaande migratiebytes zijn niet herschreven.

## 7. Testresultaten

| Gate | Resultaat |
| --- | --- |
| Gerichte CP-A-tests | 5/5 |
| Gecombineerde CP-A + bestaande renderer | 6/6 |
| Bredere portal/preview/assetregressie | 67/67 |
| Tijdelijke PostgreSQL compile | PASS; 3 tabellen en 3 RPC’s aanwezig |
| Transactionele PostgreSQL-fixture | PASS; owner, conflict, idempotency, immutable status/content en exact-één events |
| JavaScript syntax | PASS voor alle gewijzigde Functions en testcode |
| Whitespace/diffcontrole | PASS |
| Lokale UI desktop/mobiel | PASS; veilige loginfallback, geen overflow, geen nieuwe consolewarnings |
| Volledige suite vóór CP-A in actuele werkmap | 484/491, 7 failures |
| Volledige suite na CP-A | 489/496, 7 failures |
| Nieuwe failures | 0 |

De oorspronkelijke audit rapporteerde 430/437. Tussen audit en implementatie bevatte de reeds vuile werkmap extra tests; de directe CP-A-nulmeting was daarom 484/491. Dezelfde zeven pre-existing failures bleven over:

1. `R1 is complete and R2 remains approval-gated without SQL authority`
2. `closure creates no migration or reconciliation SQL`
3. `F0-d created no reconciliation identity; later approved common work is separately attributable`
4. `authoritative baseline checksum is immutable and later common bytes remain separately controlled`
5. `baseline remains exact and bootstrap contains the baseline plus approved common migrations`
6. `F0-h created no reconciliation SQL; later R2-A common work remains non-remote`
7. `canonical, existing and bootstrap materializations are byte-identical`

Deze failures zijn migration-catalogus/governanceverwachtingen die al vóór CP-A faalden. Ze zijn niet kunstmatig aangepast. Root `package.json` ontbreekt; er is daarom geen afzonderlijke root typecheck-, lint- of buildscript. De statische Netlify-site is gevalideerd met Node syntaxchecks, gerichte tests, echte PostgreSQL-compilatie en lokale browserruntime.

## 8. Securitybewijs

| Scenario | Verwacht | Werkelijk | Status | Bewijs |
| --- | --- | --- | --- | --- |
| Parent-DOM lezen | Geblokkeerd | Opaque origin zonder same-origin | PASS | sandboxstatic + browserattribuutcontrole |
| Portal `localStorage`/`sessionStorage` | Geblokkeerd | Andere opaque storage principal | PASS | sandboxcontract; geen token in payload |
| Topnavigatie | Geblokkeerd | Geen top-navigation capability | PASS | CP-A-test |
| `javascript:`-link | Niet uitvoeren | Attribuut herschreven; externe navigatie onderschept | PASS | malicious fixture |
| Preview-API met portalcredentials | Niet mogelijk | `connect-src none`, geen credentials in frame | PASS | CSP-test |
| Onverwachte `postMessage` origin/schema | Negeren | Geen parent-listener of messagecontract | PASS | statische adversarial test |
| Factory versus ZIP | Zelfde grens | Zelfde renderer/CSP/sandbox | PASS | dubbele fixturetest |
| Previewfout | Portal blijft bruikbaar | Veilige fallback, approve disabled | PASS | lokale browsercontrole |
| Klant A → preview B | Niet zichtbaar/goedkeurbaar | 404 vóór mutatie; DB-relatiecheck | PASS | Functiontest + SQL-fixture |
| Stale previewchecksum | Conflict | HTTP 409 / SQLSTATE 40001 | PASS | Functiontest + RPC |
| Dubbele previewapproval | Eén record/event | Duplicate-return | PASS | Node + transactionele fixture |
| Nieuwe previewversie | Oud akkoord niet geldig | ID+checksumafleiding en supersedecontract | PASS | datamodel + regressietest |
| Klant A → quote B | Niet zichtbaar/acceptabel | Ownerfilter/RPC faalt gesloten | PASS | Functiontest |
| Client bedrag/customer manipuleren | Negeren | Niet onderdeel van mutatieinput; serverquote leidend | PASS | request-inspectietest |
| Verlopen/ingetrokken/vervangen | Blokkeren | Status/date/archive/replacementchecks | PASS | SQL-contract |
| Dubbele offerteacceptatie | Eén record/event | Unique constraints en duplicate-return | PASS | Node + transactionele fixture |
| Geaccepteerde offerte terugzetten | Blokkeren | DB-trigger blokkeert status/content/regels | PASS | transactionele fixture |
| Betaling/e-mail | Niet uitvoeren | Beide expliciet false; geen providercall | PASS | Functionresponse en codepad |

## 9. Resterende risico’s

### Resterende P0

- Geen bekende resterende P0 in de lokale implementatie.

### Resterende P1

- De P1’s uit de audit blijven buiten scope, waaronder factuurdetail uit browseropslag, finance partial failure/schema-drift, legacy portaalconsolidatie, feedbacklifecycle, versiecompare, accountmutaties en echte twee-klant stagingcertificatie.

### Bekende beperkingen

- Geen echte geauthenticeerde stagingtest uitgevoerd; daarvoor ontbreken expliciet goedgekeurde veilige credentials.
- Geen productiecatalogus of production RLS gemuteerd/geïnspecteerd.
- Een dedicated previewhostname is nog niet toegevoegd; de huidige securitygrens is de standards-based opaque sandbox-origin.
- Admin toont approvalstate via de aangepaste previewpublicatie-API; bredere adminconsolidatie blijft P1.
- De zeven bestaande repository-governancefailures blokkeren een volledig groene repositorygate, maar zijn geen nieuwe CP-A-regressies.

## 10. Stagingplan

### Deployvolgorde

1. Maak een staging snapshot/back-up en controleer de actuele migratiehistorie read-only.
2. Pas uitsluitend `20260724120000_cp_a_portal_trust_chain.sql` toe op staging.
3. Controleer tabellen, constraints, triggers, grants, policies en RPC-ACL’s.
4. Deploy Functions: `client-preview-render`, `client-preview-versions`, `client-quote`, `admin-preview-publication`.
5. Deploy publieke bestanden en `netlify.toml`.
6. Voer smokes uit; productie blijft gesloten.

### Configuratie

- Geen nieuwe secrets vereist.
- Bestaande server-only `SUPABASE_URL`, `SUPABASE_ANON_KEY` en `SUPABASE_SERVICE_ROLE_KEY` moeten aanwezig blijven.
- Controleer dat previewwrapperheaders niet door een upstream proxy worden overschreven.

### Veilige testrollen

- Klant A: actief profiel/customer, project, website, actieve gepubliceerde preview en geldige `sent` quote.
- Klant B: volledig gescheiden profiel/customer, project, preview en quote.
- Admin: mag beide administratief bekijken, maar niet als klant handelen.
- Optioneel klant C met twee projecten voor projectcontext.

Gebruik synthetische namen/e-mails en geen echte klantrecords. Credentials worden niet in documentatie of fixtures vastgelegd.

### Stagingtestflow

1. Login klant A; open desktop/tablet/mobile preview en controleer interne interactie.
2. Laat malicious fixture parent, storage, topnavigation, netwerk en protocols proberen; alles moet blokkeren.
3. Laat klant A eigen preview goedkeuren; verwacht één approval en één trust-event.
4. Herhaal exact dezelfde request; verwacht duplicate zonder nieuwe rij/event.
5. Activeer versie 2; versie 2 moet niet goedgekeurd zijn en admin moet mismatch tonen.
6. Probeer klant A met IDs van klant B voor GET/POST; verwacht 404/403 en nul writes.
7. Open quote A, accepteer eenmaal en herhaal; verwacht één acceptance, één event en status `accepted`.
8. Wijzig vóór acceptatie versie/checksum in een aparte transactie; verwacht 409.
9. Test expired, archived en replaced quotes; verwacht geen writes.
10. Nieuwe login/andere browser/cachewissen: beide serverstatussen blijven gelijk.
11. Vergelijk admin en klantstate.

### Verwachte writes

- Preview: maximaal één `website_preview_approvals` en één `customer_portal_trust_events` per goedgekeurde versie.
- Quote: maximaal één `quote_acceptances`, één `customer_portal_trust_events` en één statusupdate op `quotes`.
- Niet verwacht: betaling, invoice generation, e-mail, productieaccount, externe providercall.

### Stopcriteria

- Migratiehistorie wijkt af of forward apply is niet exact verklaarbaar.
- RPC execute is beschikbaar voor `anon` of `authenticated`.
- Een cross-customer request geeft data of schrijft iets.
- Sandbox bevat `allow-same-origin`, forms, pop-ups of topnavigation.
- Retry schrijft een tweede decision/event.
- Admin en klant verschillen over versie/checksum/status.

## 11. Definitief oordeel

PASS_CP_A_P0_IMPLEMENTATION_READY_FOR_STAGING

- Opgeloste P0’s: 3
- Resterende P0’s: 0
- Nieuwe migraties: 1
- Gewijzigde policies: 3
- Gerichte CP-A-testscore: 5/5
- Bredere portaaltestscore: 67/67
- Volledige testscore: 489/496; 7 pre-existing governancefailures, 0 nieuwe failures
- Productie gewijzigd: nee
- Productiedatabase gewijzigd: nee
- Betaling uitgevoerd: nee
- E-mail verstuurd: nee
- Offerte geaccepteerd namens echte klant: nee
