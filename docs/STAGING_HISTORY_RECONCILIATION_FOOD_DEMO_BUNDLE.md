# Staging history reconciliation — Food Demo Bundle

Datum: 29 juli 2026  
Fase: repositoryhistory hersteld; normale staging-dry-run nog uit te voeren
Target: `maxwebstudio-test` / `xlxpuuycigeqhgxqtzni` / `eu-west-1` / `ACTIVE_HEALTHY`  
Productie: `yxxahurphdbblkuxoeje`, uitgesloten  
Silverado Food Demo Cloud: `obprooubcbnfgouytvrw`, uitgesloten en ongewijzigd

Tussenstatus: `RECONCILED_EXACT_BYTES_PENDING_TARGET_LOCKED_DRY_RUN`

## Kandidaatset

| Volgorde | Migratie | SHA-256 | Bytes | Objecten | Rijmutaties |
| --- | --- | --- | ---: | --- | --- |
| 1 | `20260729120000_factory_hub_projects.sql` | `070243fb04f11a2828950e64074684332ac4549666ae37a0324ea000bdc11638` | 2175 | tabel `factory_projects`; twee indexen; RLS zonder clientpolicies; service-rolegrant | geen |
| 2 | `20260729170000_food_demo_bundles.sql` | `010c01ffc9c2ac2cd01d85196a93c27d2a8cf5dde5ac5d629350ef7a620b56e2` | 7845 | vier tabellen; indexen; append-only triggerfunctie en trigger; rate-limitfunctie; RLS; grants | geen |

Beide migraties zijn forward-only schemawijzigingen zonder seed, Auth-aanroep, Storage-aanroep of provideractie. De migratie zelf schrijft geen bedrijfsrijen. De tweede migratie definieert wel een rate-limitfunctie die pas bij een latere expliciete verzendactie uitsluitend haar eigen tellerstabel muteert. De tweede migratie vereist de eerste via de foreign key naar `factory_projects`.

## Volledige migratiematrix

`Beide` betekent dat dezelfde versie lokaal en in de providerhistory staat. De CLI bewijst op dit niveau alleen versie-identiteit, niet byte-identiteit van historische SQL. Er is geen aangetoonde categorie “zelfde timestamp, andere inhoud”; inhoudsgelijkheid van gedeelde oude versies blijft onbewezen en is geen reden om history te repareren.

| Versie | Lokale naam / remote status | Classificatie |
| --- | --- | --- |
| `00000000000000` | authoritative baseline | alleen lokaal; bootstrap/baseline, bewust niet als stagingmigratie aanbieden |
| `20260710160200` | central lead lifecycle deduplication | beide |
| `20260710170500` | sales assignment/calling/follow-up | beide |
| `20260711133000` | preview publication portal review | beide |
| `20260712123000` | relationship asset library | beide |
| `20260712170000` | relationship asset policy hardening | beide |
| `20260713173000` | customer journey automation foundations | alleen lokaal; automation-featurelijn |
| `20260713190000` | feedback received test outbox | alleen lokaal; test-automationfeaturelijn |
| `20260713200000` | preview approved test outbox | alleen lokaal; test-automationfeaturelijn |
| `20260713200100` | preview outbox idempotency verification | alleen lokaal; test-automationfeaturelijn |
| `20260713210000` | payment paid test outbox | alleen lokaal; test-automationfeaturelijn |
| `20260713220000` | website live test outbox | alleen lokaal; test-automationfeaturelijn |
| `20260714120000` | production lead lifecycle reconciliation | alleen lokaal; productie-reconciliatielijn, uitgesloten |
| `20260714173000` | lead demo account invitations | alleen lokaal; legacy invitation-featurelijn |
| `20260714190000` | lead source sales attribution | alleen lokaal; sales-featurelijn |
| `20260717143000` | retryable website build jobs | alleen lokaal; Website Factory-featurelijn |
| `20260718110000` | public preview slugs | alleen lokaal; preview-featurelijn |
| `20260718120000` | business event foundation | beide; lokale SQL byte-for-byte hersteld uit Git |
| `20260718190000` | public preview publications | alleen lokaal; preview-featurelijn |
| `20260718222000` | social event contracts | beide; lokale SQL byte-for-byte hersteld uit Git |
| `20260719160000` | demo journey workflow | beide; lokale SQL byte-for-byte hersteld uit Git |
| `20260719170000` | Website Factory core | beide; lokale SQL byte-for-byte hersteld uit Git |
| `20260719180000` | Website Factory preview promotion | beide; lokale SQL byte-for-byte hersteld uit Git |
| `20260719190000` | demo invitation delivery | beide; lokale SQL byte-for-byte hersteld uit Git |
| `20260720160000` | lead event foundation | beide; lokale SQL byte-for-byte hersteld uit `original_verified` Git-blob |
| `20260720200000` | transactional lead intake RPC | beide; lokale SQL byte-for-byte hersteld uit `original_verified` Git-blob |
| `20260721010000` | harden role helper search paths | beide |
| `20260721020000` | restrict policy helper execute ACL | beide |
| `20260721030000` | restrict internal helper execute ACL | beide |
| `20260721040000` | lead intake abuse control | beide |
| `20260721050000` | staging smoke nonce replay protection | beide |
| `20260722120000` | P0 reconcile business events | alleen lokaal; P0-reconciliatielijn |
| `20260722121000` | P0 reconcile transactional lead intake | alleen lokaal; P0-reconciliatielijn |
| `20260722122000` | P0 reconcile security hardening | alleen lokaal; P0-reconciliatielijn |
| `20260722123000` | P0 reconcile lead intake abuse | alleen lokaal; P0-reconciliatielijn |
| `20260722124000` | P0 harden sales-manager lead policy | alleen lokaal; P0-reconciliatielijn |
| `20260722125000` | P0 correct production poststate | beide |
| `20260722126000` | P0 correct production leads policies | beide |
| `20260722130000` | P0 recover business events | alleen lokaal; recoverylijn |
| `20260722131000` | P0 recover transactional lead intake | alleen lokaal; recoverylijn |
| `20260722132000` | P0 recover security hardening | alleen lokaal; recoverylijn |
| `20260722133000` | P0 recover lead intake abuse | alleen lokaal; recoverylijn |
| `20260722134000` | remove verified staging smoke objects | alleen lokaal; staging-cleanuplijn |
| `20260722135000` | recover sales-manager lead policy | alleen lokaal; recoverylijn |
| `20260722136000` | email logs additive compatibility | alleen lokaal; mail-governancelijn; tabel/index materieel aanwezig |
| `20260724105000` | CP-A production canonical prerequisites | alleen lokaal; productie-prerequisite, uitgesloten |
| `20260724110000` | bridge preview publication portal review | beide |
| `20260724120000` | CP-A portal trust chain | beide |
| `20260724130000` | repair preview quality schema drift | beide |
| `20260726100000` | DCA-0 token-safe invitation foundation | alleen lokaal; DCA-featurelijn; tabellen materieel aanwezig |
| `20260726130000` | DCA-1 personal start resolver | alleen lokaal; DCA-featurelijn; objecten materieel aanwezig |
| `20260726150000` | DCA-1 fragment token exchange | alleen lokaal; DCA-featurelijn; tabellen materieel aanwezig |
| `20260726190000` | CX2 magic-link activation | alleen lokaal; CX2-featurelijn; tabel materieel aanwezig |
| `20260726193000` | CX2 callback recovery | alleen lokaal; CX2-featurelijn |
| `20260726200000` | partner profile role/status foundation | beide |
| `20260726201000` | partner onboarding gate foundation | beide |
| `20260726202000` | partner training content | beide |
| `20260726203000` | partner assessment certification | beide |
| `20260726204000` | partner canonical commission | beide |
| `20260726205000` | partner certification activation | beide |
| `20260726210000` | staff/ZZP dossier foundation | beide |
| `20260727090000` | staff SignHost foundation | beide |
| `20260727120000` | SignHost smoke test | beide |
| `20260728134000` | partner existing-user activation | alleen lokaal; partner-featurelijn, bewust niet kandidaat |
| `20260728160000` | Food v1 data foundation | alleen lokaal; uitsluitend Food Demo Cloud-featurelijn, uitgesloten |
| `20260728161000` | Food v1 tenant security | alleen lokaal; uitsluitend Food Demo Cloud-featurelijn, uitgesloten |
| `20260728162000` | Food v1 API support | alleen lokaal; uitsluitend Food Demo Cloud-featurelijn, uitgesloten |
| `20260728163000` | Food v1 storefront confirmation | alleen lokaal; uitsluitend Food Demo Cloud-featurelijn, uitgesloten |
| `20260728210000` | Food online demo reset | alleen lokaal; uitsluitend Food Demo Cloud-featurelijn, uitgesloten |
| `20260728211000` | Food service-role order ACL hardening | alleen lokaal; uitsluitend Food Demo Cloud-featurelijn, uitgesloten |
| `20260729120000` | Factory Hub projects | kandidaat 1; alleen lokaal; object ontbreekt remote |
| `20260729170000` | Food Demo Bundles | kandidaat 2; alleen lokaal; objecten ontbreken remote |

## Autoritatief byteherstel

Alle lokale branches, remote-trackingrefs, tags, reflogs, mergegeschiedenis en leesbare onbereikbare commitlijnen zijn onderzocht. De officiële GitHub-refs zijn vooraf ververst. Per timestamp is precies één inhoudelijke blobvariant gevonden. Er zijn geen concurrerende SQL-kandidaten met dezelfde versie aangetroffen.

| Versie en exact bestand | Broncommit | Bronref | Git blob-ID | SHA-256 |
| --- | --- | --- | --- | --- |
| `20260718120000_business_event_foundation.sql` | `3824157c051fd5872ea6e85596bf076c41879fc6` | `origin/feature/social-studio-mvp` | `2c80d91b5bb2fa29c913477afff787aee29710bf` | `04ebd6bbf9ef5637ec590861d85c47f6a3d8cd08f5ac54e3bdf6935f54ffc6d8` |
| `20260718222000_social_event_contracts.sql` | `ae51332ba057b8b51d051ba1494609a92050e51a` | `origin/feature/social-studio-mvp` | `89af525cd9a8439404c6e9754c1762d713f99399` | `d21fa1d94a11c90b9a803f9cf10e431c914fd5cd8c5a5ca05d254c39e9cbc5e9` |
| `20260719160000_create_demo_journey_workflow.sql` | `f93c5aa1b2f990465c2a0ea2dea0f4185cdd2456` | `origin/codex/rc1-clean-migration-lineage` | `941efab009d3026c3089f6bad316422cd22897fe` | `e7ffcbd86cf666fef7a27ed3cb8013c67f86a1faede12fdb8c02e6fb9b316e5d` |
| `20260719170000_create_website_factory_core.sql` | `cc39797bed618bfc50e7baf0f1ae15fa36a8490d` | `origin/codex/rc1-clean-migration-lineage` | `f6a7ba24501b06674911c42c1ce9a2b498b85329` | `217366e0b0612f05d150fac962ab2904bf0e90bc8f8c2d9672dca1cc8e21922e` |
| `20260719180000_optimize_website_factory_preview_promotion.sql` | `54c322f07af39736f1c8f22a752ebc79b02fad45` | `origin/codex/rc1-clean-migration-lineage` | `97e74c905ab5183a09e0b2897d7d8726703869d4` | `e01ada75fef8bd163a21c55bab017c2b857d8dbf200061fb0e7588fb4cc91c7c` |
| `20260719190000_create_demo_invitation_delivery_foundation.sql` | `5cbc68b54123c0996e512275240f8308d6975e44` | `origin/codex/rc1-clean-migration-lineage` | `ea315de5663d27a314d2931988fcd4e39f2a8477` | `c9915879208e38796331ce9713964eb16c6a089794fb95927b41a1c7ee293568` |
| `20260720160000_lead_event_foundation.sql` | `07c9eb01cd55a38dfa229c1d220b125dad5bb678` | `codex/foundation-governance-baseline-v1` | `c44ce99ae25a19765c57292714dcdcf83f3d8aad` | `d0252a9ed2062da2cdd499030afea01a3b3ac734402568176ed48d4fe434e6ba` |
| `20260720200000_transactional_lead_intake_rpc.sql` | `07c9eb01cd55a38dfa229c1d220b125dad5bb678` | `codex/foundation-governance-baseline-v1` | `67c5357836962e57d1e1bf61e998fbe461d86ac0` | `40397c9d45e2c7dfef7c702837999630343f7fb033fa408119509483c29c6370` |

De eerste zes blobs komen uit de oorspronkelijke feature-/releasegeschiedenis en hun SHA-256-waarden zijn tevens vastgelegd in `docs/foundation-f0/BASELINE_INCLUSION_MATRIX.json` en `docs/foundation-f0/F0C_MIGRATION_SET_INVENTORY.json` als `verified_unchanged`. Voor de laatste twee legt `docs/foundation-f0/F0G_RECOVERED_BYTE_MANIFEST.json` vast dat de originele bestanden zonder wijziging zijn gekopieerd (`original_verified`, `copiedWithoutModification`) en exact dezelfde eerder gecertificeerde hashes behouden. De afzonderlijke Sprint-1A release-evidence bevestigt dat `20260720200000` vóór toepassing de enige veilige pending migratie was; deze informatie is uitsluitend als verificatie gebruikt, niet om SQL te reconstrueren.

Read-only objectvergelijking sluit aan op de SQL: staging bevat de tabellen voor business events, demo journeys, Website Factory, previewversies, e-maillogs en lead-intake-idempotentie die door deze lijn worden gemaakt of uitgebreid. De Foundation F0-c/F0-g catalogi koppelen dezelfde functies, triggers, policies en kolomtoestand aan dezelfde onveranderde checksums. De actuele providerhistory bevat alle acht versies. De schema-exportpoging bleef read-only maar kon lokaal niet worden voltooid doordat Docker niet actief was; er is geen databasewijziging uitgevoerd.

## Read-only object- en databasis

De providerinspectie toont onder meer:

- `leads`: circa 4 rijen;
- `customers`: circa 15 rijen;
- `profiles`: circa 33 rijen;
- `demo_journeys`: circa 3 rijen;
- `website_preview_versions`: circa 4 rijen;
- `website_build_jobs`: circa 5 rijen;
- DCA-tabellen zoals `lead_demo_invitations`, `client_activation_links` en `client_activation_exchange_sessions` bestaan;
- partner-, staff-, CX2-, portal-, mail- en business-eventtabellen bestaan;
- `factory_projects` bestaat niet;
- geen van `food_demo_bundles`, `food_demo_bundle_dispatches`, `food_demo_bundle_events` of `food_demo_bundle_rate_limits` bestaat.

Daarmee is bewezen dat meerdere lokaal-only migratieversies materieel geheel of gedeeltelijk via een andere staginghistorie zijn gerealiseerd. Ze mogen niet blind opnieuw worden aangeboden.

De beschikbare `.env.staging` service-roleconfiguratie werd read-only beproefd maar door Auth/OpenAPI met `401` afgewezen en Storage met `400`; geen geheim is getoond. Daarom kon geen zelfstandige Auth- of Storage-telling worden vastgelegd. Statische SQL-inspectie bewijst wel dat beide kandidaten geen Auth-, Storage-, seed- of datamutaties bevatten. Er is niets gewijzigd.

## Target-locked uitvoeringsplan

Een toegestane uitvoering moet provider-supported, target-locked op `xlxpuuycigeqhgxqtzni` en exact als volgt zijn:

1. dry-run toont uitsluitend `20260729120000`, gevolgd door `20260729170000`;
2. baseline van de vijf doel-tabellen, functies, policies, grants en migration history;
3. Factory Hub-migratie toepassen;
4. direct object-, RLS-, grant-, rol-, relatie-isolatie- en Website Factory-controle;
5. Food Demo Bundle-migratie toepassen;
6. dezelfde controles herhalen en exact twee nieuwe historyversies bevestigen;
7. nul wijzigingen aan bestaande rijen, Auth, Storage, seeds, productie of Silverado bevestigen;
8. pas daarna push/deploy overwegen.

Geen history repair, `--include-all`, tijdelijke bestandsverberging of SQL buiten het migratiesysteem is toegestaan.

## Lokale controle-uitkomst

- Git objectidentiteit: **8/8 PASS**; ieder hersteld bestand hashte terug naar exact het hierboven vermelde oorspronkelijke blob-ID.
- Gerichte Food-/Foundation-/checksum-/negatieve migratiegovernance: **32/32 PASS**.
- Brede historische Foundation-set: **59/63 PASS**. De vier falende assertions zijn oude F0-d/F0-f-contracten die expliciet vereisen dat deze teruggevonden historische bestanden afwezig blijven. Dat uitgangspunt is door deze geautoriseerde history-reconciliation bewust achterhaald; de historische tests zijn niet aangepast omdat de toegestane reconciliationcommit uitsluitend de acht SQL-bestanden en dit bewijsrapport mag bevatten.
- `git diff --check`: uit te voeren direct vóór de reconciliationcommit.

De vier historische assertions signaleren geen SQL-byteafwijking: de checksum- en blobcontroles zijn volledig groen. Ze worden transparant als governancevervolgwerk vastgelegd en niet stilzwijgend herschreven binnen deze beperkte commit.

## Provider dry-run en NO-GO

De normale provider-supported opdracht `supabase db push --linked --dry-run` is zonder aanvullende flags uitgevoerd. De dry-run heeft niets toegepast en stopte vóór het berekenen van een pending-set, omdat deze acht remote historyversies lokaal ontbreken:

- `20260718120000`
- `20260718222000`
- `20260719160000`
- `20260719170000`
- `20260719180000`
- `20260719190000`
- `20260720160000`
- `20260720200000`

Daardoor kon niet worden bewezen dat uitsluitend `20260729120000` en `20260729170000` pending zouden zijn. Er is geen repair, pull, include-all, SQL-uitvoering, migratie, deploy of mail uitgevoerd.

De precieze objectattributie van deze acht versies is niet verantwoord vast te stellen zolang hun canonieke SQL lokaal ontbreekt. De read-only tabelinspectie bewijst wel dat preview-, portal-, DCA- en andere stagingobjecten materieel aanwezig zijn, terwijl de Factory-objecten ontbreken. Een versie als “reverted” markeren zou daarom mogelijk bestaande schemawerkelijkheid ontkennen.

### Kleinste veilige structurele oplossing

Maak een afzonderlijke history-reconciliationwijziging die voor elk van de acht remote-only versies de exacte, provider-authentieke SQL en metadata terugbrengt in de lokale migratiemap—zonder die SQL opnieuw uit te voeren en zonder de remote history te wijzigen. Iedere file moet byte-/hashmatig tegen een autoritatieve bron worden bewezen en als reeds toegepast worden behandeld. Als die authentieke inhoud niet beschikbaar is, kies een afzonderlijke, schone stagingomgeving die uitsluitend uit de goedgekeurde bootstrap- en productmanifests wordt opgebouwd; kopieer geen huidige stagingdata impliciet.

Pas daarna mag dezelfde normale dry-run opnieuw worden uitgevoerd. Alleen een resultaat met exact de twee Factory-versies in de juiste volgorde opent fase 3.
