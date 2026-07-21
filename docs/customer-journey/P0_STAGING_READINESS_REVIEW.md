# P0 Lead Intake — Code Review en Staging Readiness

Datum: 2026-07-21

Scope: volledige P0-code-review en uitsluitend read-only staging-readinessinspectie
Status: `STOPPED_P0_STAGING_READINESS_GAPS`

## Oordeel

De databasekant van staging is exact voorbereid voor de checksum-vergrendelde P0-foundationmigratie: versie `20260721040000` ontbreekt, alle voorgangers staan exact eenmaal in history, de kandidaatobjecten bestaan nog niet en de relevante R2-, lead-, policy-, trigger- en securitycatalogus wijkt niet af van de bewezen prestate. Een geïsoleerde dry-run selecteert uitsluitend deze ene migratie.

P0 is desondanks niet gereed voor staging-executie. De code-review vond twee inhoudelijke blockers. Daarnaast kan het staging-applicatiedoel niet worden vergrendeld, ontbreekt bewijs van het vereiste actuele HMAC-secret en kan een applicatiedeploy vanuit de huidige sterk vervuilde worktree niet veilig tot uitsluitend P0 worden geïsoleerd.

Er is niets toegepast of gedeployed. Deze review autoriseert geen database-apply, stagingdeploy, smoke-test, productiecontact, commit of push.

## Reviewbereik

De beoordeling omvatte de volledige P0-foundation en -integratie:

- configuratievoorbeelden: `.env.example`, `.env.local.example`;
- abuse-controlhelper: `functions/services/leadIntakeAbuseControl.js`;
- de drie byte-identieke kopieën van `20260721040000_lead_intake_abuse_control.sql` en het bootstrapmanifest;
- de foundationtests, SQL-fixture en lokale validator;
- `functions/send-lead.js`, `public/index.html` en `public/script.js`;
- de handler- en publieke formulierregressietests;
- lokale foundation- en integratierapporten met evidence;
- de eerdere aanpassing aan `tests/release-readiness-r2b2-internal-helper-acl.test.js` voor latere append-only migraties.

Tijdens deze review zijn geen applicatiecode, migraties of tests gewijzigd. Alleen dit rapport en het bijbehorende evidencebestand zijn toegevoegd.

## Bevindingen

| Ernst | Bevinding | Gevolg | Vereiste vóór nieuwe readinessreview |
| --- | --- | --- | --- |
| BLOCKER | Browser-`maxlength` telt UTF-16-code-units; JavaScriptvalidatie en PostgreSQL `char_length` tellen Unicode-codepoints. Astrale tekens, zoals emoji, bereiken daardoor in de browser eerder de limiet. | De gedocumenteerde exacte Unicodepariteit is onjuist en geldige backendwaarden kunnen door de browser worden geblokkeerd. | Gebruik één werkelijk codepointbewust browsercontract en voeg browsergerichte astrale-grenstests toe. |
| BLOCKER | `getCompanySettings()` wordt na bewezen opslag buiten de notification-degradatieafhandeling uitgevoerd. | Een configuratie/providerexception wordt als `storageFailed` geretourneerd, hoewel de lead al veilig is opgeslagen. | Breng alle post-storage notificatieconfiguratie en providers onder dezelfde degradatiegrens en bewijs het met een handlerscenario. |
| BLOCKER | `.netlify/state.json` bevat geen `siteId`; het exacte staging-applicatiedoel en de remote runtimeconfiguratie zijn daarom niet verifieerbaar. Het actuele HMAC-secret is in de beschikbare stagingconfiguratie niet aanwezig/bewezen. | Een stagingdeploy kan niet aantoonbaar naar het juiste niet-productiedoel en de abuse-controlruntime kan fail-closed stoppen. | Vergrendel het exacte staging-site-ID, bewijs runtime/headers/Node-ondersteuning en bewijs uitsluitend secret-aanwezigheid en server-only plaatsing zonder waarden te tonen. |
| BLOCKER | De worktree bevat veel P0-onafhankelijke wijzigingen en artefacten. | Een applicatiedeploy kan momenteel niet aantoonbaar tot de goedgekeurde P0-diff worden beperkt. | Bouw een schoon, reproduceerbaar P0-only branch/artifact en voer daarop opnieuw code-review en diffcontrole uit. |
| ACCEPTED RESIDUAL | De catalogusinspectie gebruikte `postgres`; `transaction_read_only` was `off`. De principal is dus niet intrinsiek read-only. | Governancebewijs berust op de vooraf geïnspecteerde SELECT-only statements, niet op een database-enforced read-only principal. | Gebruik bij voorkeur een technisch read-only auditprincipal of read-only transaction voor volgende inspecties. Deze inspectie bevatte geen write-statement. |
| ACCEPTED RESIDUAL | Een normaal idempotent replay herhaalt notificaties bewust niet. Een processtop na commit maar vóór timeline/e-mail herstelt die side effects niet. | De lead en het business-event gaan niet verloren, maar een notificatie kan herstel vereisen. | Overweeg later een transactional outbox/recoveryworker; dit blokkeert de betrouwbare opslag niet. |
| NON-BLOCKING | De `persistLead`-wrapper blijft hoofdzakelijk voor tests/compatibiliteit bestaan en is niet het primaire handlerpad. | Kleine onderhoudslast; geen huidige runtimefout. | Later opruimen wanneer compatibiliteit dit toelaat. |

## Read-only stagingbewijs

Vastgesteld stagingproject:

```text
name: maxwebstudio-test
ref:  xlxpuuycigeqhgxqtzni
```

De gekoppelde Supabase-projectref en URL verwijzen naar hetzelfde stagingproject. Productie is niet benaderd.

Databaseprestate, vastgelegd op `2026-07-21T16:10:24.651253Z`:

- migration history bevat 16 regels en eindigt bij `20260721030000`;
- `20260721040000` is afwezig;
- `lead_intake_abuse_requests`, beide kandidaatindexen en beide nieuwe helperfuncties zijn afwezig;
- `mws_create_lead_transactional_v1` en `mws_get_lead_intake_result_v1` behouden exact hun eerder bewezen signature, owner, `SECURITY DEFINER`, `search_path`, ACL en definitiondigest;
- relevante tabellen behouden RLS en hun bewezen ACL's;
- relevante triggers zijn intact;
- policycatalogus: 80 regels, digest `6e9ef1fc7fb2e5b2a0b34830f60c46f4`;
- public-schema ACL en default ACL snapshot zijn ongewijzigd;
- alle acht R2-B1- en zes R2-B2-functies matchen de eerder bewezen definitions, owners, securitymode, search paths en ACL's.

Er zijn uitsluitend catalogi en migration history gelezen; geen applicatierijen.

## Migratie-integriteit en dry-run

```text
version: 20260721040000
bytes:   12199
sha256:  9e6747d25c8e98b637c8bb6500e381dfeeacc605dd830b422a1a68ecea35415a
copies:  3 byte-identiek
```

Een geïsoleerde read-only/dry-runweergave, opgebouwd uit exact de 16 toegepaste histories plus de kandidaat, rapporteerde uitsluitend:

```text
Would push these migrations:
20260721040000_lead_intake_abuse_control.sql
```

De kandidaat voegt alleen de private abuse-controltabel, indexen en functies met RLS en expliciete ACL toe. Zij wijzigt geen bestaande businesslogica, data, policies, default grants, schema grants, storage of frontend. Er is geen apply uitgevoerd.

## Configuratie- en runtime-readiness

Veilig vastgesteld zonder secretwaarden te tonen:

- staging Supabase-URL: aanwezig en verwijst naar `maxwebstudio-test`;
- staging service-role configuratie: aanwezig in een lokaal stagingbestand, maar niet plausibel als inzetbare sleutel bewezen; een afzonderlijke lokale sleutel bestaat, maar remote runtimeplaatsing is niet verifieerbaar;
- `LEAD_ABUSE_HMAC_SECRET`: niet aanwezig/bewezen;
- `LEAD_ABUSE_HMAC_SECRET_PREVIOUS`: niet aanwezig; dit is alleen vereist tijdens rotatie;
- Netlify staging-sitekoppeling: afwezig;
- `x-nf-client-connection-ip` en ondersteuning voor `AbortSignal.timeout`: niet in de echte stagingruntime verifieerbaar zolang het target niet vastligt.

## Vereist gesplitst uitvoeringsplan

Elke fase vereist een nieuwe, afzonderlijke expliciete toestemming. Een toestemming voor één fase autoriseert de volgende niet.

### A. Database-apply

1. Vergrendel just-in-time projectnaam, ref, migratieversie, bytes en SHA-256.
2. Herhaal history-, kandidaatobject- en volledige security-prestate read-only.
3. Stop bij targetambiguïteit, onverwachte history, objectaanwezigheid, checksumverschil of securitydrift.
4. Voer één dry-run uit; alleen `20260721040000` mag worden geselecteerd.
5. Voer na aparte applytoestemming exact één apply uit, zonder automatische retry.
6. Leg direct daarna history, objecten, definitions, RLS, ACL's, policies, triggers en volledige securitydiff read-only vast.
7. Stop zonder compensatieactie bij een ambigue uitkomst; eerst reconciliëren.

### B. Staging-applicatiedeploy

1. Los eerst alle code- en configuratieblockers op en voer een nieuwe code-review uit.
2. Koppel en vergrendel expliciet het niet-productie Netlify-site-ID.
3. Bewijs zonder waarden te tonen de aanwezigheid en server-only plaatsing van URL, service-role key en huidig HMAC-secret; bewijs de vorige secret alleen indien rotatie actief is.
4. Bevestig de echte runtimeondersteuning en proxy-IP-header.
5. Maak een schoon, reproduceerbaar P0-only deployartefact; vergelijk de inhoud met de goedgekeurde diff.
6. Deploy uitsluitend dat artefact naar staging. Productie blijft gesloten.

### C. Operationele staging-smoke

1. Gebruik één herkenbare, vooraf geregistreerde testlead en expliciete cleanupidentiteit.
2. Bewijs allowed, idempotent replay, limited en honeypot zonder duplicaten of ongeautoriseerde downstreamcalls.
3. Bewijs timeout/reconciliation zonder tweede create-call.
4. Bewijs provider/config-degradatie na opslag met een succesvolle opslagresponse.
5. Controleer exact één lead, Sales Workspace, timeline en e-mail/confirmatiestatus.
6. Verwijder alleen expliciet aangemaakte smoke-artefacten na aparte toestemming.
7. Herhaal de volledige history- en securitydiff en stop bij iedere niet-verklaarde afwijking.

Algemene stopvoorwaarden zijn: target niet exact aantoonbaar, secret-/runtimecheck niet groen, migratie- of checksumafwijking, onverwachte schema/securitydiff, niet-isoleerbare deployinhoud, meer dan één create/apply, ambigue response zonder bewijs, duplicaatlead, cleanupscope niet exact of enig productiecontact.

## Uitgevoerde en verboden acties

- wel: lokale code/diffreview, lokale checksumcontrole, read-only stagingcatalogus/historyinspectie en geïsoleerde dry-run;
- niet: SQL DDL/DML, migration apply, fixturewrites, stagingdeploy, operationele remote smoke, productiecontact, commit, push of deploy;
- tijdelijke query- en dry-runbestanden stonden uitsluitend onder `/private/tmp`;
- de staginginspectie gebruikte uitsluitend vooraf geïnspecteerde SELECT/CTE-statements.

## Eindstatus

```text
STOPPED_P0_STAGING_READINESS_GAPS
```

De databasefoundation is klaar voor een later afzonderlijk goedgekeurde staging-apply, maar de P0-release als geheel is dat nog niet. Na gerichte correctie van de vier blockers is een nieuwe code-review en read-only staging-readinessanalyse vereist.
