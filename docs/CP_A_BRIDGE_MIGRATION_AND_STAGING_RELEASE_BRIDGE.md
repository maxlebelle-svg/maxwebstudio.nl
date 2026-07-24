# CP-A bridge migration and staging release bridge

Datum: 2026-07-24
Werkmap: `/private/tmp/maxwebstudio-cp-a-bridge-release`

## 1. Executive summary

De historische preview-portaalmigratie is op staging geregistreerd maar heeft haar enige `DO`-blok vroegtijdig verlaten, omdat `public.website_preview_versions` toen nog niet bestond. De later aangemaakte Factory-tabel mist daardoor alle 21 portal-reviewkolommen, vijf foreign keys, één statusconstraint en acht indexes. Productie heeft deze objecten al volledig; staging niet.

De oplossing is een nieuwe, forward-only bridge op timestamp `20260724110000`. Zij vergelijkt bestaande objecten op definitie, voegt alleen aantoonbaar ontbrekende objecten toe, laat onbewijsbare ownership `NULL`, valideert FK-data en faalt transactioneel bij iedere incompatibele staat. Daarna volgt de ongewijzigde CP-A-migratie op `20260724120000`.

Een schone lokale releasebranch bevat CP-A-commit `40797df3`, bridgecommit `cc504b79` en uitsluitend bridgebewijs. Er is niets gepusht, gedeployed of remote gemigreerd. De PR-route naar `codex/rc1-clean-migration-lineage` bestaat, maar de standaard Netlify Deploy Preview is nog niet geschikt voor authenticated CP-A.1 omdat de server-side Supabase-sleutel in de Deploy Preview-context leeg is.

## 2. Bewezen historische migratiegap

`20260711133000_preview_publication_portal_review.sql` controleert als eerste `to_regclass('public.website_preview_versions')`. Bij afwezigheid volgt een notice en `return`; alle daaropvolgende `ALTER TABLE`, FK-, check- en indexstatements worden dan overgeslagen. Staging registreert deze versie als uitgevoerd. De Factory-tabel is pas door `20260719170000_create_website_factory_core.sql` aangemaakt, zonder herhaling van de oudere portal-reviewstappen.

Actuele read-only schema-inspectie bewees:

- staging: historische migratie en Factory-migratie geregistreerd, CP-A niet geregistreerd;
- staging: de Factory-tabel en alle vijf FK-targettabellen bestaan;
- staging: alle 21 bedoelde portal-reviewkolommen ontbreken;
- staging: twee bestaande previewrows; zonder aanwezige `customer_id` kan geen klantownership bewezen worden;
- productie: alle 21 kolommen, vijf FK’s, statuscheck en acht indexes bestaan met de historische definities;
- beide omgevingen: RLS staat aan; staging behoudt de bestaande deny-policy voor `anon` en `authenticated`;
- productie en staging zijn uitsluitend read-only geïnspecteerd.

## 3. Werkelijke schema-afwijkingen

| Object | Historisch bedoeld | Staging werkelijk | Productie werkelijk | Nodig voor CP-A | Status |
| --- | --- | --- | --- | ---: | --- |
| `website_preview_versions.customer_id` | nullable `uuid` | ontbreekt | aanwezig | ja | bridge |
| `project_id` | nullable `uuid` | ontbreekt | aanwezig | ja | bridge |
| `website_id` | nullable `uuid` | ontbreekt | aanwezig | ja | bridge |
| publicatievelden | `title`, summaries, veilig pad, publish-flags/tijden/actor | alle ontbreken | alle aanwezig | deels/direct | bridge |
| reviewvelden | deadline, feedback/approval/notify-flags, status, feedback JSON | alle ontbreken | alle aanwezig | ja | bridge |
| approval/metadata | approvaltijd/actor en twee JSON-objecten | alle ontbreken | alle aanwezig | ja | bridge |
| `updated_at` | nullable `timestamptz`, default `now()` | ontbreekt | aanwezig | indirect | bridge |
| vijf foreign keys | customer/project/website/profile/auth-user; delete set null | ontbreken | aanwezig en gevalideerd | ja | bridge |
| portal-statuscheck | zes toegestane statussen plus `NULL` | ontbreekt | aanwezig | ja | bridge |
| acht portal-indexes | ownership/publication/version lookup | ontbreken | aanwezig | ja | bridge |
| Factory uniques/checks | build job, journey/version, token en payloadchecks | aanwezig | aanwezig | basis | behouden |
| RLS/policy | RLS aan; geen directe clienttoegang | aanwezig | aanwezig | ja | behouden |
| views | geen historische bridge-view | geen gap gevonden | geen gap gevonden | nee | geen actie |
| app/RPC-afhankelijkheid | adminpublicatie, klantpreview en CP-A approval lezen ownership/publicatiestatus | code aanwezig | schema ontbreekt | schema aanwezig | ja | bridge vereist |

De lokale PostgreSQL-replica heeft na de bridge exact het bedoelde contract. Er is geen remote lokaal-schema als releasebron gebruikt: de actuele staging- en productiecatalogi waren leidend.

## 4. Bridge-migratieontwerp

Pad: `supabase/migrations/20260724110000_bridge_preview_publication_portal_review.sql`
SHA-256: `22628ef185d4f78a8dd96eefd9aee68022e2010f9f5143c7d13df0be4ea6fa50`

De migratie gebruikt één expliciete transactie, lokale lock/statement-timeouts en vier fail-closed lagen:

1. alle relaties en `uuid`-target-ID’s moeten bestaan;
2. reeds aanwezige kolommen moeten exact type, nullability en default matchen;
3. constraints en indexes worden op catalogusdefinitie vergeleken, niet alleen op naam;
4. RLS moet na afloop nog aanstaan.

Nieuwe FK’s worden eerst `NOT VALID` aangemaakt en daarna in dezelfde transactie gevalideerd. Een onverwachte FK op dezelfde bronkolom of een naamcollision faalt. Productie is door het volledige bestaande contract een definitie-validerende no-op; staging krijgt de ontbrekende objecten. De historische migratie en migration history blijven ongewijzigd.

## 5. Data- en backfillstrategie

Er is geen backfill. De bridge bevat geen `UPDATE` of `INSERT` op previewrecords. Alle 21 nieuwe kolommen zijn nullable zoals historisch bedoeld; defaults gelden alleen voor toekomstige inserts of expliciete nieuwe waarden. De twee bestaande staging-previewrows zouden dus behouden blijven en `customer_id = NULL` krijgen. Getroffen/gekoppelde bestaande records: nul. Records met een bestaande, geldige customerrelatie blijven in het betreffende testschema onveranderd. Onbewijsbaar ownership wordt nooit aan de “eerste customer” of een andere gegokte bron gekoppeld.

## 6. Constraints, indexes, RLS en grants

- FK’s: customer, project, website, publisher profile en approver auth-user; exact `ON DELETE SET NULL`, niet deferrable en gevalideerd.
- Check: `status` is `NULL` of `internal`, `ready_for_review`, `feedback_received`, `revision_in_progress`, `approved`, `archived`.
- Indexes: vijf enkelvoudige en drie samengestelde btree-indexes, inclusief aflopende `published_at`/`version` waar historisch bedoeld.
- Unique constraints: geen nieuwe; de bestaande Factory-uniques blijven onaangeraakt.
- RLS: moet reeds actief zijn en blijft actief; de bestaande deny-policy blijft behouden.
- Grants/policies/functions: de bridge maakt er geen aan en geeft geen `PUBLIC EXECUTE`.

## 7. Lokale migratietests

| # | Scenario | Resultaat |
| ---: | --- | --- |
| 1 | historische versie geregistreerd, doelobjecten ontbreken | PASS |
| 2 | enkele correcte kolommen bestaan al | PASS |
| 3 | volledig correct contract bestaat al | PASS |
| 4 | incompatibele kolom en incompatibele gelijknamige index | PASS, fail closed |
| 5 | twee previewrows zonder customerrelatie | PASS, behouden en `NULL` |
| 6 | previewrows met geldige `customer_id` | PASS, waarden behouden en FK geldig |
| 7 | FK-target `projects` ontbreekt | PASS, fail closed |
| 8 | tweede bridge-uitvoering | PASS, idempotent |
| 9 | bridge gevolgd door CP-A en CP-A-functionele fixture | PASS |
| 10 | fout tijdens preflight/postcondition | PASS, volledige transactionele rollback |

Aanvullend bewezen: geen duplicate columns/indexes/constraints, geen orphans, geen dataverlies, geen nieuwe grants, bridgefixture PASS en CP-A transactionele fixture PASS.

## 8. Nieuwe release-identiteit

| Veld | Waarde |
| --- | --- |
| Werkmap | `/private/tmp/maxwebstudio-cp-a-bridge-release` |
| Basiscommit | `fd5f7a8099e4521b4e6d8ff809a6bce9aa56773e` |
| CP-A-parent | `40797df3793b2a85942ef9fef0ca24ba1c33ec91` |
| Branch | `release/cp-a-bridge-and-trust-chain` |
| Bridgecommit | `cc504b79324bedf525c51390c0515c63be376e1e` |
| Releasecommit | finale branch-tip; letterlijke SHA in de overdracht |
| Unieke nieuwe/gewijzigde paden boven CP-A | 5 |

Migratievolgorde: `20260724110000_bridge_preview_publication_portal_review.sql` → `20260724120000_cp_a_portal_trust_chain.sql`. Er is geen Content Factory-werk opgenomen.

## 9. Volledige tests

| Gate | Basis | Nieuwe release | Beoordeling |
| --- | ---: | ---: | --- |
| Bridge gericht | n.v.t. | 9/9 | PASS |
| CP-A gericht | 5/5 | 5/5 | PASS |
| Portaalregressies | 76/76 | 76/76 | PASS |
| Volledige suite | 250/260 | 259/269 | 9 nieuwe passes, 0 nieuwe failures |
| PostgreSQL bridge + CP-A | n.v.t. | PASS | compile + beide fixtures |
| Migratieorder/checksums | n.v.t. | PASS | exact |
| JavaScript-syntax | PASS | PASS | geen nieuwe fout |
| Secret scan | n.v.t. | PASS | geen credentials |

De tien bestaande failures zijn exact dezelfde namen als in de basis:

1. `read phases remain sequential and emit one safe started/completed pair`
2. `successful retry reuses one build, one preview, one checksum and one event`
3. `generate_preview retry without previewUrl preserves the promoted journey URL`
4. `changed input creates version 2 while a failed version 3 promotion preserves it`
5. `concurrent identical builds converge on one build and one active preview`
6. `generate_preview does not publish changed briefing when promotion fails`
7. `backend reserves by fingerprint, persists checksum before promotion and uses the RPC response`
8. `canonical JSON and package checksums ignore object key order`
9. `identical logical requests have one fingerprint and changed output input does not`
10. `secrets and transport-only retry data never enter the fingerprint`

Dit zijn bestaande Website Factory/testlijn-mismatches; de bridge verandert geen betrokken runtimebestand.

## 10. Deploy Preview-geschiktheid

Read-only bewijs uit GitHub en Netlify:

- remote: `https://github.com/maxlebelle-svg/maxwebstudio.nl.git`;
- targetbranch bestaat op `fd5f7a8099e4521b4e6d8ff809a6bce9aa56773e`;
- geen classic branch protection en geen repository-ruleset;
- Netlify staging-productiebranch is exact `codex/rc1-clean-migration-lineage`;
- branch deploys: alleen de productiebranch;
- Deploy Previews: iedere PR tegen de productiebranch/branch-deploybranches;
- Functions zijn geconfigureerd en worden door het project ondersteund;
- `SUPABASE_URL`, `SUPABASE_PROJECT_ID` en anonconfig zijn gelijk in alle deploycontexten en wijzen op stagingproject `xlxpuuycigeqhgxqtzni`;
- de server-side `SUPABASE_SERVICE_ROLE_KEY` is alleen gevuld in de Netlify-context **Production** van de staging-site en is **leeg voor Deploy Previews**;
- Deploy Previews ontvangen daarmee geen productie-Supabasecredential, maar `account-profile` en CP-A-functions kunnen zonder de staging service-rolekey niet volledig werken;
- `BASE_URL`, `SITE_URL` en `CLIENT_PORTAL_REDIRECT_URL` zijn contextgelijk en niet aantoonbaar aangepast aan de unieke preview-host;
- CSP staat verbinding met Supabase toe en de preview-embed gebruikt same-origin, wat technisch past bij een Netlify-previewhost;
- Supabase-sessies zijn browser-origin-gebonden; directe login op de preview kan sessieherstel binnen die host ondersteunen, maar redirects/callbacks naar een vaste andere host zijn niet bewezen geschikt.

Verwachte URL: `https://deploy-preview-<PR-NUMMER>--maxwebstudio-staging.netlify.app`.

Conclusie: **Deploy Preview technisch geschikt voor authenticated CP-A.1: nee**. De PR-route zelf is bewezen en kan een buildpreview opleveren, maar authenticated acceptatie moet stoppen totdat de Deploy Preview-context veilig een uitsluitend-staging server-key en preview-correcte redirects heeft, of totdat een afzonderlijk goedgekeurde merge naar de echte staging-productiebranch is gebruikt. In deze opdracht is geen Netlify-config gewijzigd.

## 11. PR-plan

1. Na afzonderlijke toestemming de lokale sourcebranch pushen zonder force.
2. Controleren dat remote source-tip gelijk is aan de gerapporteerde finale releasecommit.
3. Een PR openen van `release/cp-a-bridge-and-trust-chain` naar `codex/rc1-clean-migration-lineage`.
4. De PR bevat de bestaande CP-A-commit plus bridgecommit en releasebewijs; boven de target zijn dat de 16 CP-A-paden en exact vijf unieke bridge/releasepaden. Content Factory ontbreekt doordat de sourcebranch rechtstreeks van de geïsoleerde CP-A-commit afstamt.
5. Verplichte checks: 9/9 bridge, 5/5 CP-A, 76/76 regressie, dezelfde tien baselinefailures, PostgreSQL 10/10, checksums/order, secret scan en Netlify build/Functions-bundling.
6. De Netlify-preview moet het bovengenoemde URL-patroon krijgen en alleen stagingproject `xlxpuuycigeqhgxqtzni` gebruiken.
7. Authenticated CP-A.1 niet starten zolang de service-rolekey en redirectpreflight niet groen zijn.
8. Merge, stagingmigratie, productiemigratie, accounts, e-mail en betalingen blijven expliciet verboden zonder nieuwe opdracht.
9. Intrekken is veilig: PR sluiten en de remote sourcebranch later verwijderen; zolang niet gemerged/toegepast verandert geen releaseomgeving of database.

Er is in deze opdracht geen branch gepusht en geen PR gemaakt.

## 12. Release manifest

Het canonieke manifest staat in `docs/releases/CP_A_BRIDGE_RELEASE_MANIFEST.md`. Het fixeert identities, checksums, fileset, targets, gates, stopcriteria en de exact toegestane vervolgstap.

## 13. Resterende risico’s

- De Deploy Preview-context mist de server-side staging-Supabasekey; account/profile- en CP-A-functioncalls falen daar veilig.
- Contextgelijke redirect/base-URL’s kunnen een callback van de unieke previewhost wegsturen.
- Staging bevat twee legacy previewrows zonder bewijsbare klantrelatie; zij blijven bewust ongekoppeld en zijn niet goedkeuringsgeschikt totdat ownership apart bewezen is.
- De bridge is nog niet tegen staging uitgevoerd; de actuele schema-gap blijft remote bestaan.
- Er zijn tien bestaande Website Factory-testfailures. Zij zijn niet veroorzaakt door deze release, maar blijven release-informatie.
- Targetbranch en Netlifyconfig moeten direct vóór een eventuele push/PR opnieuw read-only worden geverifieerd.

## 14. Hervattingsvoorwaarden voor CP-A.1

CP-A.1 mag pas opnieuw beginnen na een read-only preflight die exact de release-SHA’s/checksums, targetbranch, stagingprojectref, schema-poststate, Netlify-contexten, Functions, redirectallowlists, CSP en testaccountisolatie bevestigt. Eerst bridge, daarna CP-A; geen accountcreatie vóór beide schema’s en Functions groen zijn.

## Verplicht resultatenoverzicht

- bridge-migratiepad: `supabase/migrations/20260724110000_bridge_preview_publication_portal_review.sql`
- bridge-migratiechecksum: `22628ef185d4f78a8dd96eefd9aee68022e2010f9f5143c7d13df0be4ea6fa50`
- CP-A-migratiechecksum: `757d304cd9200baf438e0968f00508cfbecb56648aeefcd5486516734c007a84`
- nieuwe releasebranch: `release/cp-a-bridge-and-trust-chain`
- basiscommit: `fd5f7a8099e4521b4e6d8ff809a6bce9aa56773e`
- releasecommit: finale branch-tip, gerapporteerd na commit
- aantal opgenomen bestanden boven CP-A: 5
- worktree schoon: na finale commit te bevestigen
- bridge-tests: 9/9; PostgreSQL-scenario’s 10/10
- CP-A-tests: 5/5
- regressies: 76/76
- volledige suite: 259/269; basis 250/260
- nieuwe failures: 0
- Deploy Preview technisch geschikt: nee
- PR-route bewezen: ja
- branch gepusht: nee
- PR gemaakt: nee
- staging gewijzigd: nee
- stagingdatabase gewijzigd: nee
- productie gewijzigd: nee
- productiedatabase gewijzigd: nee
- externe acties uitgevoerd: nee

PASS_CP_A_BRIDGE_RELEASE_IDENTITY_READY
