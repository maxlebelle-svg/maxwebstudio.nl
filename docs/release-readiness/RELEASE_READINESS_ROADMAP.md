# Release Readiness — R1–R6 Roadmap

Status: **R1 COMPLETE / R2-A COMPLETE / R2-B1 CLOSED / R2-B2 CLOSED / R2-B COMPLETE**

Foundation F0 is afgesloten met `FOUNDATION COMPLETE`. Deze werkstroom behandelt uitsluitend implementatie en omgevingsgereedheid. Zij heropent de Foundation-architectuur niet en wijzigt geen historische migrationbytes.

## Fasering en gates

### R1 — Existing Environment Reconciliation

Doel: per bestaande omgeving read-only vaststellen welke verschillen werkelijk aanwezig zijn en alleen goedgekeurde, kleine append-only reconciliations ontwerpen.

Resultaat: compleet. 32 runtime-targetitems, 15 securityitems en 15 functionele objectgroepen zijn zonder ongeclassificeerde verschillen geïnventariseerd. Tien kleine releasegroepen, elf onuitgevoerde read-only preflights, een dependencygraph en test-/rollbackplannen zijn vastgelegd. Groep A is de aanbevolen eerste implementatiekandidaat, maar SQL is nog niet goedgekeurd.

Gate naar R2:

- exacte environment inventory en schemafingerprints;
- preflight, lock-/impactanalyse, rollback/compensatie en postconditions per categorie;
- expliciete goedkeuring voordat reconciliation-SQL wordt geschreven of toegepast;
- geen historische migrationwijzigingen of synthetische historyrepair.

### R2 — Approved Reconciliations and Lead Index Correction

Doel: afzonderlijk goedgekeurde kleine reconciliations ontwerpen en lokaal testen. Startkandidaat is function security hardening (groep A), gevolgd door execute-ACLs (B). `leads_unique_normalized_domain_idx` blijft een afzonderlijke R2-groep met eigen approval en bewezen non-unique targettoestand.

R2-A stopte vóór migrationversion en SQL wegens ontbrekende actuele bodies/strict flags. R2-A.1 heeft die gate met een begrensde read-only catalogusread tegen uitsluitend `maxwebstudio-test` gesloten: exact acht unieke identities, definities, bodies, strict flags, metadata, ACLs en dependencies zijn vastgelegd; alle acht zijn authoring-ready. Dit geeft alleen recht op een afzonderlijk authoringbesluit. Groepen B–D, migrationversion, SQL en remote toepassing blijven uitgesloten.

Het afzonderlijke authoringbesluit is inmiddels lokaal uitgevoerd. Common migration `20260721010000_harden_role_helper_search_paths.sql` behoudt alle acht runtimebodies byte-exact en wijzigt uitsluitend `search_path=public` naar `search_path=pg_catalog`. Canonical/existing/bootstrapkopieën zijn 3.578 bytes met SHA-256 `fd787e93077783963d87879d6f9fba32395949fe572ef94609101293c91af966`. Existing- en bootstraplijnen, tweede runs, functionele rollbackfixtures, policycallers en security-invarianten zijn groen. Remote/staginguitvoering is niet goedgekeurd.

R2-A.2 heeft daarna uitsluitend read-only de stagingpreconditions opnieuw bewezen tegen `maxwebstudio-test` (`xlxpuuycigeqhgxqtzni`). De 13 verwachte history-identiteiten zijn aanwezig, versie `20260721010000` is afwezig, alle acht functionele fingerprints matchen R2-A.1 exact en staan nog op `search_path=public`, en alle 70 policycallers zijn onveranderd. Dependencies, security-before-snapshot, smoketestlock en rollback-readiness zijn compleet. Status is `PASS_EXECUTION_READY`, maar de migrationapply blijft geblokkeerd tot afzonderlijke expliciete goedkeuring.

R2-A.3 heeft na expliciete goedkeuring exact één stagingapply uitgevoerd. De checksumgevalideerde execution view en dry-run boden uitsluitend `20260721010000`; het commando is eenmaal uitgevoerd met exitcode 0 en zonder retry. Remote history bevat nu exact één nieuwe row. De acht bodies en alle overige metadata bleven gelijk, alle acht search paths zijn `pg_catalog`, securitymetadata en 70 policycallers zijn ongewijzigd en 10/10 gecontroleerde smoketests zijn groen zonder blijvende data of externe effecten. R2-A staging is daarmee `PASS`; iedere volgende reconciliationgroep houdt een afzonderlijke approvalgate.

R2-B heeft vervolgens uitsluitend read-only de function EXECUTE-ACL's van alle 60 stagingfuncties gecatalogiseerd. Veertien functies hebben nog PUBLIC EXECUTE: acht policyhelpers met expliciete authenticated- en service_role-grants en zes interne trigger-/normalizerhelpers met een expliciete service_role-grant. Alle callers zijn gemapt, onbekende callers zijn 0 en geïsoleerde lokale roltests bewijzen authenticated policy-evaluatie, anon/no-grant-denial, SECURITY DEFINER-ketens, triggerinvocatie en volledige rollback. De aanbevolen kleine groepen B1 en B2 zijn `AUTHORING_READY`; de overige 46 functies en default privileges vereisen geen wijziging. Er is geen ACL-SQL of migrationversion gemaakt en geen remote write uitgevoerd. Een afzonderlijke expliciete authoringgoedkeuring blijft vereist.

R2-B1 is na expliciete authoringgoedkeuring lokaal afgerond met common migration `20260721020000_restrict_policy_helper_execute_acl.sql` (2.443 bytes, SHA-256 `c75f1796e52d8c2bd8a06994cb692c72f9f794adbb93d76cee4ccedd6f01e570`). Exact acht policyhelpers verliezen PUBLIC EXECUTE en behouden expliciet authenticated, service_role en owner. De drie kopieën zijn byte-identiek; existing- en bootstraplijnen, tweede runs, 72 policy-edges/70 policies, anon-denial, authenticated/service_role-flows en securitydiff zijn groen. B2 bleef onaangetast. Stagingexecution blijft geblokkeerd tot een afzonderlijk besluit.

Na afzonderlijke staginggoedkeuring is R2-B1 exact eenmaal toegepast op `maxwebstudio-test` (`xlxpuuycigeqhgxqtzni`). De candidate-only dry-run bood uitsluitend versie `20260721020000`; de apply eindigde met exitcode 0 zonder retry. History groeide exact van 14 naar 15 met één row van 24 statements. Alle acht target-ACL's zijn exact, vier role-smokes en tien policy/RLS-smokes zijn groen, 72 edges/70 policies bleven gelijk en de volledige securitydiff toont uitsluitend de geplande ACL/PUBLIC/anon-wijziging. B2 en 33 public-tabeltellingen bleven gelijk. Status is `PASS_STAGING_VALIDATED_PRODUCTION_APPROVAL_REQUIRED`.

De daaropvolgende uitsluitend-lezen production-readinessgate bevestigde productie als `maxwebstudio` (`yxxahurphdbblkuxoeje`) maar stopte direct: productiehistory bevat versie `20260721020000` al met de verwachte naam en 24 statements. Daarmee ontbreekt de vereiste pre-applytoestand. Er zijn twee production reads en nul writes/applies uitgevoerd; ACL-, policy-, B2-, security- en row-countcontroles zijn na de verplichte stop niet voortgezet. Er is geen productie-executieplan gemaakt. Status: `STOPPED_PRODUCTION_NOT_READY`.

Een daarna afzonderlijk geautoriseerd read-only reconciliationonderzoek heeft vastgesteld dat productie feitelijk al volledig op de R2-B1-poststate staat. Alle 24 historystatements matchen de checksum-vergrendelde lokale migration, de acht ACL's en functie-fingerprints matchen staging, policies blijven 72/70, alle 60 functie-ACL's en bredere securitycatalogi zijn gelijk en B2 is onaangetast. Er is geen productieactie nodig. Alleen de audit-attributie blijft onvolledig: de historytabel bewaart geen timestamp of actor en commit-timestamptracking staat uit. Status: `PASS_PRODUCTION_ALREADY_AT_R2B1_POSTSTATE_HISTORY_ORIGIN_UNATTRIBUTABLE`.

R2-B1 is vervolgens administratief afgesloten als `R2-B1 CLOSED — PRODUCTION VERIFIED AT EXPECTED POSTSTATE`, met auditnotitie `HISTORY ORIGIN UNATTRIBUTABLE`. De attributiegap blokkeert de inhoudelijke afsluiting niet en wordt losgekoppeld als toekomstige verbetering van migration-executionmetadata. R2-B2 blijft een afzonderlijke scope met een nieuwe lokale bewijsfase en eigen staging-/productiegates. Niet-gerelateerde security- of environment-hygieneobservaties vallen buiten de R2-B1-afsluiting.

R2-B2 is daarna met afzonderlijke authoringgoedkeuring uitsluitend lokaal geïmplementeerd als common migration `20260721030000_restrict_internal_helper_execute_acl.sql` (1.644 bytes, SHA-256 `83a428e28401c63a0b8e2bffc9ba4a6aca54d1fe159556ee9f674b129cf64bad`). Exact zes interne trigger-/normalizerhelpers verliezen PUBLIC EXECUTE en behouden `service_role` en owner. Existing en bootstrap applyen schoon en beide tweede runs zijn clean. Alle 19 `set_updated_at`-triggeredges en beide email-logtriggeredges vuurden na de wijziging op beide lijnen; de prioriteitsupdates op customers, leads, profiles, projects en websites herschreven `updated_at` zonder permission error. Directe service-role-normalizers en de SECURITY DEFINER-keten zijn groen; anon, authenticated en no-grant zijn geweigerd. Alleen de zes bedoelde ACL's wijzigden, fixtures bleven 0. Status: `PASS_LOCAL_IMPLEMENTATION_STAGING_APPROVAL_REQUIRED`. Staging en productie zijn niet benaderd.

De afzonderlijk goedgekeurde verse stagingpreflight is vervolgens volledig read-only uitgevoerd tegen `maxwebstudio-test` (`xlxpuuycigeqhgxqtzni`). History telt 15 rows tot en met R2-B1; kandidaat `20260721030000` ontbreekt en de dry-run biedt uitsluitend die kandidaat aan. Alle zes ACL-/definition-/metadataprestates, de normalizerketen, alle 21 triggeredges, B1 en de brede securitysnapshot matchen zonder drift. Status: `PASS_STAGING_PREFLIGHT_EXECUTION_APPROVAL_REQUIRED`. Apply, productie, commit, push en deploy bleven uitgesloten; stagingexecution vereist een nieuwe expliciete opdracht.

Na die expliciete executiongoedkeuring is de JIT-preflight herhaald en is R2-B2 exact eenmaal toegepast met exitcode 0, zonder retry. History groeide 15→16 met uitsluitend versie `20260721030000` en twaalf overeenkomende statements. De zes ACL-poststates en volledige catalogus-securitydiff zijn exact; B1 en overige functies zijn onveranderd. De verplichte transactionele stagingsmoke stopte daarna met SQLSTATE `42501`, omdat de Management API-login de transaction-local no-grantrol niet mocht aannemen. Er was geen smoke-retry, herstel of compensatie; rollback-audit vond 0 fixtures en tijdelijke objecten. Status: `STOPPED_NO_RETRY`. Productie-readiness blijft gesloten tot een afzonderlijk besluit over een herziene smoke-uitvoering.

De afzonderlijk geautoriseerde herziene smoke stopte vervolgens nog vóór remote principalinspectie: de lokale approval-review liet de read-only query na twee processtartpogingen niet starten. Daardoor is het gekozen catalogusgebaseerde no-grantmechanisme niet uitgevoerd en begon geen transactionele smoke. Migration, history en poststate bleven ongewijzigd. Status: `STOPPED_STAGING_SMOKE_INCOMPLETE`; productie-readiness blijft gesloten.

Een later afzonderlijk geautoriseerde hervatting kreeg werkende approval. De principalinspectie bewees de bestaande SET ROLE-paden en verklaarde de eerdere `42501`; Mechanisme B werd vóór writes vastgelegd. Eén transactionele smoke bewees anon/authenticated denial, service-role/owner access, catalogusmatig no-grant, normalizer/idempotent replay, alle 21 triggeredges en snapshotbescherming. Rollback en volledige securitydiff zijn groen zonder fixtures. Status: `PASS_STAGING_VALIDATED_PRODUCTION_READINESS_APPROVAL_REQUIRED`; productie blijft afzonderlijk geblokkeerd.

Een vervolgens afzonderlijk geautoriseerde read-only productieanalyse heeft bewezen dat `maxwebstudio` (`yxxahurphdbblkuxoeje`) R2-B2 al exact eenmaal in history bevat en volledig op de verwachte poststate staat. De twaalf opgeslagen statements matchen de checksum-vergrendelde migration; alle zes ACL's bevatten uitsluitend postgres en service_role. De 21 triggeredges, B1, alle overige functies en de relevante securitycatalogus matchen staging. Vier SELECT-uitvoeringen van twee begrensde querytypen leverden dit bewijs; de tweede capture was alleen nodig om een lokale comparatorfout offline te corrigeren. Remote writes, migrationapply, commit, push en deploy bleven 0. Status: `PASS_PRODUCTION_ALREADY_AT_R2B2_POSTSTATE_HISTORY_ORIGIN_UNATTRIBUTABLE`.

R2-B2 is administratief afgesloten als `R2-B2 CLOSED — PRODUCTION VERIFIED AT EXPECTED POSTSTATE`, met auditnotitie `HISTORY ORIGIN UNATTRIBUTABLE`. De historytabel bevat geen actor- of timestampkolom en commit-timestamptracking staat uit, waardoor de oorsprong van de bestaande row niet meer kan worden geattribueerd. Dit is een governancepunt en geen technisch of securitydefect. R2-B is volledig afgesloten; een volgende werkstroom vereist een nieuwe, zelfstandige scope en gates.

Gate naar R3: duplicaat-/datapreflight, queryplan- en lockanalyse, append-only migratie, rollbackstrategie en gevalideerde postcondition.

### R3 — Asset Release

Doel: de geblokkeerde identities `20260719120000` en `20260719150000` afzonderlijk beoordelen en veilig als toekomstige productwijzigingen positioneren.

Gate naar R4: dependency-, rollen-, RLS-, Storage-, data- en versioningbesluit per assetcategorie. Bestaande bytes worden niet herschreven of hernummerd.

### R4 — Common Migration Materialization

Doel: het bewezen dual-rootmodel opnemen in de ontwikkelworkflow met één canonieke common bron en deterministische byte-identieke execution views.

Gate naar R5: validator verplicht vóór iedere run; checksum-, naam-, versie-, symlink-, hidden/temp- en ontbrekende-kopiecontroles groen; tweede lokale runs clean.

### R5 — Staging Validation

Doel: de volledige goedgekeurde R1–R4-keten geïsoleerd op staging uitvoeren en functioneel, schema-, security-, data- en rollbackbewijs verzamelen.

Gate naar R6: volledige stagingrun groen, geen ongeclassificeerde drift, monitoring/backup/rollback aantoonbaar gereed en expliciet releasebesluit.

### R6 — Production Approval

Doel: op basis van het stagingbewijs een afzonderlijk productie-go/no-go-besluit nemen.

Productie blijft NO-GO totdat R6 expliciet is goedgekeurd. Foundation closure of een groene stagingrun verleent op zichzelf geen productieautoriteit.

## Volgorde

`R1 → R2 → R3 → R4 → R5 → R6`

Afwijking van deze volgorde vereist een afzonderlijk gedocumenteerd besluit met aangetoonde onafhankelijkheid van eerdere gates.

## Permanente grenzen

- append-only vanaf het goedgekeurde cutovermodel;
- geen wijziging van historische of recovered migrationbytes;
- geen remote actie zonder fase-specifieke toestemming;
- geen combinatie van reconciliation, index, assets en productmaterialisatie in één mega-migration;
- staging en productie houden afzonderlijke approvals;
- iedere fase behoudt de F0-security-invarianten en externe dual-rootvalidatie.
