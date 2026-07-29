# Staging history reconciliation — Food Demo Bundle

Datum: 29 juli 2026  
Fase: read-only analyse  
Target: `maxwebstudio-test` / `xlxpuuycigeqhgxqtzni` / `eu-west-1` / `ACTIVE_HEALTHY`  
Productie: `yxxahurphdbblkuxoeje`, uitgesloten  
Silverado Food Demo Cloud: `obprooubcbnfgouytvrw`, uitgesloten en ongewijzigd

Eindstatus: `STOPPED_TARGET_LOCKED_MIGRATION_SET_NOT_PROVEN`

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
| `20260718120000` | remote-only | alleen remote; staginghistorie, lokale SQL ontbreekt |
| `20260718190000` | public preview publications | alleen lokaal; preview-featurelijn |
| `20260718222000` | remote-only | alleen remote; staginghistorie, lokale SQL ontbreekt |
| `20260719160000` | remote-only | alleen remote; staginghistorie, lokale SQL ontbreekt |
| `20260719170000` | remote-only | alleen remote; staginghistorie, lokale SQL ontbreekt |
| `20260719180000` | remote-only | alleen remote; staginghistorie, lokale SQL ontbreekt |
| `20260719190000` | remote-only | alleen remote; staginghistorie, lokale SQL ontbreekt |
| `20260720160000` | remote-only | alleen remote; staginghistorie, lokale SQL ontbreekt |
| `20260720200000` | remote-only | alleen remote; staginghistorie, lokale SQL ontbreekt |
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
