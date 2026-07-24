# CP-A digest schema fix

Datum: 2026-07-24
Werktitel: `CP_A_DIGEST_SCHEMA_FIX`

## 1. Executive summary

De CP-A-migratie was noch op staging noch op productie toegepast. De eerdere stagingpoging was volledig transactioneel teruggedraaid. Daarom is gekozen voor strategie A: de bestaande, nog nergens toegepaste migratie minimaal corrigeren. Exact één runtime-SQL-aanroep veranderde van `public.digest` naar `extensions.digest`; de bridge en alle checksumsemantiek bleven ongewijzigd.

De gecorrigeerde migratie slaagt in een geïsoleerde PostgreSQL 17-validatie met `pgcrypto` onder schema `extensions`. Alle 10 database-scenario’s, 9 bridge-tests, 5 CP-A-tests en 76 portaalregressies slagen. De volledige suite blijft 260/270 met exact dezelfde 10 bekende failures en nul nieuwe failures. Er is niets gepusht, remote gemigreerd, gedeployed of in PR #4 gewijzigd.

## 2. Remote toepassingsbewijs

| Controle | Staging `xlxpuuycigeqhgxqtzni` | Productie `yxxahurphdbblkuxoeje` | Status |
|---|---:|---:|---|
| migratierecord `20260724120000` | 0 | 0 | PASS |
| CP-A-tabellen | 0 | 0 | PASS |
| `quotes.quote_version` | afwezig | afwezig | PASS |
| CP-A-functies | 0 | 0 | PASS |
| CP-A-triggers | 0 | 0 | PASS |
| CP-A-policies | 0 | 0 | PASS |
| pgcrypto-schema | `extensions` | `extensions` | PASS |
| digestfuncties | uitsluitend `extensions.digest(bytea,text)` en `extensions.digest(text,text)` | gelijk | PASS |
| bridge-migratierecord | 1 | 0 | PASS |

Targetbranch, `main`, PR-head en vaste stagingdeploy bleven read-only onveranderd. Dit bewijs maakt optie A ondubbelzinnig veilig; er is geen nieuwe fixmigratie nodig.

## 3. Root cause

`public.cp_a_quote_checksum` heeft bewust een beperkte `search_path = pg_catalog, public`. De functiedefinitie riep `public.digest` expliciet aan. Supabase installeert `pgcrypto` in `extensions`, waardoor PostgreSQL de functie bij `CREATE FUNCTION` niet kon resolven en fout `42883` gaf.

De CP-A-migratie bevatte exact één `public.digest`-aanroep. Elders in de repository gebruikt de reeds toegepaste social-eventmigratie correct `extensions.digest`. De oudere demo-invitationmigratie bevat meerdere historische `public.digest`-kwalificaties, maar is al remote toegepast en valt buiten deze checksum-vergrendelde correctierelease; haar bytes zijn niet herschreven.

## 4. Gekozen migratiestrategie

Gekozen: **bestaande migratie corrigeren**.

Reden: versie `20260724120000` is in beide remote histories afwezig en geen enkel CP-A-object is aanwezig. Een extra forward-only fixmigratie zou niets kunnen repareren, omdat de oorspronkelijke migratie vóór objectcreatie faalt. De correctie blijft fail-closed: wanneer `extensions.digest(bytea,text)` ontbreekt, faalt de functiedefinitie duidelijk. Er is geen brede `search_path`, dynamische SQL, wrapper, fallback of extra grant toegevoegd.

## 5. Exacte codewijziging

```diff
-  select encode(public.digest(convert_to(jsonb_build_object(
+  select encode(extensions.digest(convert_to(jsonb_build_object(
```

Ongewijzigd bleven `encode`, `convert_to`, JSON-opbouw/casts, functievolatiliteit, security-definerfuncties, beperkte search paths, owners, RLS, policies, triggers, immutability en grants. Een bestaande gerichte test vergrendelt nu `extensions.digest(convert_to(` en verbiedt `public.digest(` in de CP-A-migratie.

## 6. Oude en nieuwe checksum

- oude CP-A-checksum: `757d304cd9200baf438e0968f00508cfbecb56648aeefcd5486516734c007a84`
- nieuwe CP-A-checksum: `a418a8b05b03879f572c0ebd5862acd2ce36d3eae8e35db6aefbd5fa7c7586c2`
- bridgechecksum: `22628ef185d4f78a8dd96eefd9aee68022e2010f9f5143c7d13df0be4ea6fa50` — ongewijzigd
- testbestandchecksum na guard: `4ceb4177707d283d9628a601ba5931126829c23c264ea18df66bb721568f05aa`

## 7. Lokale validatie

| Gate | Resultaat |
|---|---:|
| pgcrypto onder `extensions` | PASS |
| expliciete digest-aanroep | PASS |
| bridge + fixture | PASS |
| CP-A transactionele compile/commit | PASS |
| geforceerde fout volledige rollback | PASS |
| bridge → CP-A | PASS |
| duplicate directe run veilig geweigerd zonder drift | PASS |
| stabiele 64-hex checksum | PASS |
| approval + quoteacceptancefixture | PASS |
| least privilege / geen PUBLIC EXECUTE | PASS |
| PostgreSQL-scenario’s | 10/10 |
| bridge-tests | 9/9 |
| CP-A-tests | 5/5 |
| portaalregressies | 76/76 |
| volledige suite | 260/270 |
| bekende failures | dezelfde 10 |
| nieuwe failures | 0 |
| gewijzigde Function-syntax | PASS |
| `git diff --check` | PASS vóór documentcommit; finale controle vereist |

De databasevalidatie gebruikte uitsluitend tijdelijke lokale PostgreSQL-clusters met een Unix socket en `listen_addresses=''`. Bekende remote databasevariabelen werden uit de testprocessen verwijderd. Alle tijdelijke clusters en logs zijn opgeruimd.

## 8. Nieuwe releasecommit

- branch: `release/cp-a-bridge-and-trust-chain`
- oude release-HEAD: `e34910934b60a4006eb5c285946782d01f0ea370`
- commitbericht: `fix(migrations): resolve pgcrypto digest from extensions schema`
- nieuwe release-HEAD: de ene lokale commit die dit rapport bevat; de exacte post-commit SHA staat in de overdracht, omdat een commit zijn eigen SHA niet in zijn eigen inhoud kan opnemen
- history rewrite: nee
- force-push: nee
- branch gepusht: nee

## 9. PR #4 updateplan

PR #4 blijft dezelfde source- en targetbranch gebruiken. Bij afzonderlijke toestemming moet de bestaande beschrijving worden aangevuld met:

1. root cause: Supabase `pgcrypto` staat in `extensions`;
2. bewijs van volledige transactionele rollback en remote afwezigheid;
3. oude en nieuwe CP-A-checksum;
4. nieuwe releasebranch-tip;
5. PostgreSQL 10/10, bridge 9/9, CP-A 5/5, regressies 76/76 en volledige suite 260/270;
6. exact dezelfde 10 bekende failures en 0 nieuwe failures;
7. hervattingsvolgorde: push → PR-update/checks → CP-A-preflight → CP-A apply → poststate → fast-forward-only → vaste stagingdeploy → CP-A.1.

De PR is in deze opdracht niet remote gewijzigd.

## 10. Hervattingsvoorwaarden

- push uitsluitend de nieuwe branch-tip zonder force;
- verifieer dat target nog exact `fd5f7a8099e4521b4e6d8ff809a6bce9aa56773e` is;
- actualiseer uitsluitend PR #4 en wacht op groene checks;
- bevestig opnieuw dat staging geen CP-A-record/object bevat en de bridge exact één keer geregistreerd is;
- pas uitsluitend de gecorrigeerde CP-A-migratie toe;
- valideer tabellen, kolom, functies, triggers, policies, RLS en ACL’s vóór branchintegratie;
- fast-forward target alleen naar de dan gerapporteerde nieuwe release-HEAD;
- deploy en CP-A.1 pas daarna;
- productie blijft buiten scope.

## Verplicht resultatenoverzicht

- gekozen strategie: bestaande migratie corrigeren
- oude CP-A-checksum: `757d304cd9200baf438e0968f00508cfbecb56648aeefcd5486516734c007a84`
- nieuwe CP-A-checksum: `a418a8b05b03879f572c0ebd5862acd2ce36d3eae8e35db6aefbd5fa7c7586c2`
- bridgechecksum: `22628ef185d4f78a8dd96eefd9aee68022e2010f9f5143c7d13df0be4ea6fa50`
- oude release-HEAD: `e34910934b60a4006eb5c285946782d01f0ea370`
- nieuwe release-HEAD: post-commit branch-tip, exact gerapporteerd in de overdracht
- worktree schoon: na commit te bevestigen
- bridge-tests: 9/9
- PostgreSQL-scenario’s: 10/10
- CP-A-tests: 5/5
- regressies: 76/76
- volledige suite: 260/270
- nieuwe failures: 0
- branch gepusht: nee
- PR gewijzigd: nee
- staging gewijzigd in deze opdracht: nee
- stagingdatabase gewijzigd in deze opdracht: nee
- productie gewijzigd: nee
- productiedatabase gewijzigd: nee
- externe businessacties uitgevoerd: nee

PASS_CP_A_DIGEST_SCHEMA_FIX_READY
