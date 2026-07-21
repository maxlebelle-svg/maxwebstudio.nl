# P0 Lead Intake Abuse-Control — Local Foundation Report

Datum: 2026-07-21

Scope: uitsluitend lokale ontwerp-, authoring- en validatiefase
Status: `PASS_P0_ABUSE_CONTROL_LOCAL_FOUNDATION_INTEGRATION_APPROVAL_REQUIRED`

## Besluit

De duurzame abuse-controlfoundation is lokaal ontworpen, geauthord en op zowel een bestaande als een schone bootstraplijn bewezen. De foundation mag in een volgende, afzonderlijk goed te keuren lokale fase worden geïntegreerd met de overige drie P0-hardeningpunten. Dit besluit autoriseert geen staging, productie of deployment.

## Gewijzigde bestanden

### Productiecontract

- `supabase-common/migrations/20260721040000_lead_intake_abuse_control.sql` — canonieke append-only migratie.
- `supabase/migrations/20260721040000_lead_intake_abuse_control.sql` — mechanische existing-materialisatie.
- `supabase-bootstrap/supabase/migrations/20260721040000_lead_intake_abuse_control.sql` — mechanische bootstrapmaterialisatie.
- `supabase-common/migrations/COMMON_MIGRATION_MANIFEST.json` — versie, grootte en checksum.
- `functions/services/leadIntakeAbuseControl.js` — lokale, nog niet door `send-lead.js` aangeroepen HMAC-/RPC-interface.
- `.env.example` en `.env.local.example` — uitsluitend lege namen voor de huidige en vorige HMAC-secret.

### Validatie

- `tests/p0-lead-intake-abuse-control.test.js` — byte-, privacy-, HMAC- en interface-tests.
- `tests/fixtures/p0-abuse-control-functional.sql` — databasegedrag, cleanup en rolmatrix.
- `scripts/p0-abuse-control-local-validation.zsh` — twee tijdelijke lokale PostgreSQL-lijnen en concurrencytests.
- `tests/release-readiness-r2b2-internal-helper-acl.test.js` — behoudt de exacte eerste drie R2-migraties, maar staat latere append-only common migrations toe.

### Evidence

- dit rapport;
- `docs/customer-journey/P0_ABUSE_CONTROL_LOCAL_FOUNDATION_EVIDENCE.json`.

Geen offerte-, betaal-, publicatie-, AI- of klantportaalbestand is voor deze foundation aangepast.

## Datamodel en veldmotivatie

Private tabel: `public.lead_intake_abuse_requests`.

| Veld | Doel | Privacy |
| --- | --- | --- |
| `scope` | Vaste versie van de limiterregel. | Alleen `public_lead_intake_v1`; geen klantdata. |
| `fingerprint_hmac` | Groepeert verzoeken voor de 15-minuten- en 24-uurslimiet. | HMAC-SHA-256; geen IP of user-agent in opslag. |
| `idempotency_hmac` | Herkent dezelfde intake zonder opnieuw te tellen. | Domeingescheiden HMAC; plaintext key wordt niet opgeslagen. |
| `first_seen_at` | Databaseklok voor beide rolling windows. | Operationele timestamp. |
| `last_seen_at` | Laatste geaccepteerde replay; verlengt retentie niet. | Operationele timestamp. |
| `expires_at` | Logische en fysieke cleanupgrens. | Exact 48 uur na `first_seen_at`. |

De tabel bevat geen identity-, serial- of payloadkolom. De samengestelde primary key is `(scope, idempotency_hmac)`. Indexen bestaan alleen voor fingerprint/windowselectie en expirycleanup.

## HMAC- en fingerprintstrategie

De server gebruikt minimaal 32 bytes secretmateriaal:

- `LEAD_ABUSE_HMAC_SECRET` — huidige secret;
- `LEAD_ABUSE_HMAC_SECRET_PREVIOUS` — optionele tijdelijke vorige secret tijdens rotatie.

Fingerprintmateriaal:

```text
lead-abuse:fingerprint:v1 | netwerkprefix | user-agentklasse
```

- IPv4 wordt tijdelijk naar `/24` verlaagd.
- IPv6 wordt tijdelijk naar `/56` verlaagd.
- Alleen de vertrouwde Netlify-header `x-nf-client-connection-ip` wordt geaccepteerd; een caller-supplied `x-forwarded-for` niet.
- De user-agent wordt vóór HMAC teruggebracht tot browserfamilie (`edge`, `firefox`, `chrome`, `safari`, `automation`, `other`) en apparaatklasse (`mobile`, `desktop`).
- Ruwe inputs leven alleen in function-memory en worden niet gelogd of naar PostgreSQL gestuurd.

Idempotencyreferenties gebruiken een afzonderlijk domein:

```text
lead-abuse:idempotency:v1 | opaque lead-intake key
```

De KPI-requestreferentie gebruikt nog een derde domein en wordt ingekort tot 96 bits. Hierdoor zijn fingerprint, limiter-idempotency en operationele requestreferentie niet onderling uitwisselbaar.

Bij secretrotatie stuurt de server huidige en vorige HMAC-uitkomsten mee. De database telt beide fingerprints samen en herkent zowel de huidige als vorige idempotency-HMAC. Na maximaal 48 uur kan de vorige secret worden verwijderd. Een sterke secret voorkomt praktische offline enumeratie van de beperkte IP-prefixruimte; de opgeslagen HMAC blijft juridisch en technisch pseudonieme operationele data, geen anonieme data.

## RPC-contract

```text
public.mws_check_lead_intake_abuse_v1(
  p_scope text,
  p_fingerprint_hmac text,
  p_idempotency_hmac text,
  p_previous_fingerprint_hmac text default null,
  p_previous_idempotency_hmac text default null
) returns jsonb
```

Vaste regels in de function body:

- maximaal 5 unieke toegestane aanvragen in een rolling window van 15 minuten;
- maximaal 20 unieke toegestane aanvragen in een rolling window van 24 uur;
- exact scope `public_lead_intake_v1`;
- maximaal 48 uur ledgerretentie;
- caller kan geen limiet, tijdstip of expiry aanleveren.

Versieerbare beslissingen:

- `unique_allowed`;
- `replay_allowed`;
- `idempotency_fingerprint_conflict`;
- `short_window_limited`;
- `daily_window_limited`.

Iedere response bevat `version`, `allowed`, `decision`, `replay`, `uniqueCounted` en veilige teller-/retrymetadata. Er wordt geen PII teruggegeven.

## Idempotency en concurrency

1. De RPC neemt eerst advisory transaction locks op de huidige en eventuele vorige idempotency-HMAC, in lexicografische volgorde.
2. Daarna worden locks op de huidige en eventuele vorige fingerprint genomen.
3. Dezelfde referentie en dezelfde huidige/vorige fingerprint wordt als replay toegestaan zonder nieuwe rij of tellerverhoging.
4. Dezelfde referentie met een niet-herkende fingerprint wordt fail-closed geweigerd.
5. Nieuwe requests worden pas na beide limietcontroles ingevoegd.
6. Er is geen create-lead-call en geen blinde create-retry in deze foundation.

Parallel bewijs:

- zes verschillende requests op één fingerprint: exact vijf toegestaan, één geblokkeerd, vijf rijen;
- acht gelijktijdige calls met dezelfde referentie: alle acht toegestaan als initieel/replay, exact één `unique_allowed`, exact één rij.

Als de latere leadopslag na een toegestane limiterbeslissing faalt, blijft de reservering bestaan. Een retry met dezelfde idempotencyreferentie passeert zonder opnieuw te tellen. Een nieuwe referentie telt als een nieuwe unieke poging. Dit voorkomt rollbackraces tussen twee afzonderlijke transacties.

## ACL, RLS en securitydiff

| Object | Owner | RLS | PUBLIC | anon | authenticated | service_role |
| --- | --- | --- | --- | --- | --- | --- |
| `lead_intake_abuse_requests` | `postgres` | aan, niet forced | geen | geen | geen | geen directe tabeltoegang |
| `mws_check_lead_intake_abuse_v1(...)` | `postgres` | n.v.t. | geen EXECUTE | geen | geen | EXECUTE |
| `mws_cleanup_lead_intake_abuse_v1(integer)` | `postgres` | n.v.t. | geen EXECUTE | geen | geen | geen; owner-only |

`SECURITY DEFINER` is noodzakelijk omdat `service_role` bewust geen directe tabelrechten krijgt en de volledige read/count/insertbeslissing atomisch binnen één vertrouwde transactie moet plaatsvinden. Beide functies hebben `search_path=pg_catalog` en gebruiken schemagekwalificeerde applicatieobjecten.

Securitydiff:

- één nieuwe tabel;
- drie nieuwe indexen, inclusief de primary-keyindex;
- twee nieuwe functies;
- nul policies;
- één exacte service-role EXECUTE-grant;
- geen schema-, sequence-, wildcard- of default-privilegewijziging;
- geen wijziging van bestaande leads, events, timeline, e-mail, functies, policies, RLS of ACL's.

## Cleanup

De decision-RPC verwijdert per request maximaal 100 verlopen rijen. De owner-only functie verwijdert per call een gevalideerde batch van maximaal 5.000 rijen. Lokale fixtures bewijzen dat expired rows verdwijnen en dat testdata volledig wordt opgeruimd.

Een harde fysieke productiegarantie tijdens perioden zonder leadverkeer vereist later een afzonderlijk geautoriseerde scheduler die de owner-only cleanup uitvoert. In deze fase is geen cron, scheduled function of remote configuratie toegevoegd.

## Lokaal migratiebewijs

Migration:

```text
20260721040000_lead_intake_abuse_control.sql
12199 bytes
SHA-256 9e6747d25c8e98b637c8bb6500e381dfeeacc605dd830b422a1a68ecea35415a
```

De canonical, existing en bootstrapkopieën zijn volledig byte-identiek.

Bootstrapgeschiedenis na apply:

```text
00000000000000
20260721010000
20260721020000
20260721030000
20260721040000
```

Existinggeschiedenis:

```text
voor: 20260721010000, 20260721020000, 20260721030000
na:   20260721010000, 20260721020000, 20260721030000, 20260721040000
```

Beide tweede runs rapporteerden `Local database is up to date`. Alle fixtures zijn teruggedraaid of expliciet verwijderd; de tijdelijke clusters zijn gestopt en verwijderd.

## Testresultaten

```text
Gerichte P0 Node-tests: 10 / 10 PASS
Lokale databasefixture, existing + bootstrap: PASS
Concurrency unieke aanvragen: 5 allowed / 1 limited / 5 rows
Concurrency replay: 8 allowed / 1 unique / 1 row
Volledige repositorysuite: 327 / 332 PASS
```

De vijf failures zijn exact de reeds bekende, niet-P0-gerelateerde Foundation-governanceverwachtingen:

1. `R1 is complete and R2 remains approval-gated without SQL authority`;
2. `F0-d created no reconciliation identity; later approved common work is separately attributable`;
3. `authoritative baseline checksum is immutable and later common bytes remain separately controlled`;
4. `baseline remains exact and bootstrap contains the baseline plus approved common migrations`;
5. `F0-h created no reconciliation SQL; later R2-A common work remains non-remote`.

Ze zijn niet aangepast. De R2-B2-test is uitsluitend toekomstvast gemaakt door de eerste drie migratie-identiteiten te blijven vergrendelen zonder te eisen dat er nooit een latere append-only common migration ontstaat.

Syntaxcontroles voor beide JavaScriptbestanden en het Zsh-validatiescript zijn groen. Beide JSON-bestanden parsen, `git diff --check` is groen en de gerichte secretscan vond geen private keys, JWT's of bekende providerkeypatronen.

## Integratievoorbereiding

`leadIntakeAbuseControl.js` bewijst lokaal:

- vertrouwde IP-selectie en coarsening;
- low-cardinality user-agentclassificatie;
- drie domeingescheiden HMAC-toepassingen;
- dual-secretrotatie;
- 3-seconden limiter-RPC-timeout;
- fail-closed generieke fouten zonder provider- of databasegegevens;
- uitsluitend HMAC-referenties in de RPC-body.
- een niet-aangesloten gate-adapter die limiet- en conflictbeslissingen vóór de create-callback stopt, veilige `429`/`409`-fouten geeft en zowel unieke als legitieme replaybeslissingen doorlaat.

De helper wordt bewust nog niet aangeroepen door `send-lead.js`. De volgende lokale integratiefase moet in één reviewbare wijziging de volgorde bewijzen: requestsize, JSON/method, honeypot, contractvalidatie, stabiele key, HMAC, limiter, create-RPC, reconciliation en pas daarna timeline/e-mail.

## Integratieplan voor de overige drie blockers

1. **Create-timeout/reconciliation:** één stabiele key; begrensde create-call; alleen ambigue transportuitkomsten naar `mws_get_lead_intake_result_v1`; nooit create blind herhalen.
2. **Contractvalidatie:** serverlimieten exact spiegelen (`name/company 240`, `phone 80`, `email 320` en overige RPC-limieten); frontend `maxlength`; Unicodegrenzen testen.
3. **Handler-level tests:** dependency injection voor limiter/create/reconcile/timeline/mail; alle eerder vastgelegde HTTP-uitkomsten en call counts testen.
4. **Abuse-integratie:** honeypot vóór HMAC/RPC; requestsize en gedrag; `429` voor limieten; limiterstoring `503`; blokkade veroorzaakt nul create-, timeline- en mailcalls.
5. **KPI:** uitsluitend PII-vrije `requestReference`, classificatie en tellers loggen: `created`, `duplicate`, `idempotentReplay`, `reconciledCreated`, `reconciledDuplicate`, `validationRejected`, `abuseRejected`, `storageFailed`, `notificationDegraded`.

## Compensatiestrategie

Er is geen down migration gemaakt. Een eventuele compensatie is een nieuwe, afzonderlijk goedgekeurde append-only migration die eerst EXECUTE op de decision-RPC intrekt, daarna—alleen wanneer runtimeafhankelijkheid aantoonbaar verwijderd is—de twee nieuwe functies en de private tabel verwijdert. Historische migrationbytes en history blijven onaangeraakt.

## Resterende risico's en gates

- Shared IPv4-/IPv6-prefixen kunnen false positives geven; de grove user-agentklasse beperkt dit maar elimineert het niet.
- Een aanvaller kan IP-prefix en user-agent roteren; de limiter is defense-in-depth, geen identiteitssysteem.
- De vertrouwde Netlify-client-IP-header moet vóór staging in de echte functionruntime worden bevestigd.
- Beide HMAC-secrets moeten als server-only secrets met minimaal 32 bytes entropy worden beheerd; secretwaarden zijn niet aangemaakt.
- Fysieke cleanup zonder verkeer vereist een later geautoriseerde scheduler.
- De foundation is nog niet geïntegreerd in `send-lead.js`; P0 als geheel blijft niet staging-ready.
- De volledige P0-handler-testmatrix hoort bij de volgende integratiefase; deze foundation bewijst alleen het limitercontract en zijn lokale interface.

## Geen remote actie

- stagingcontact: nee;
- productiecontact: nee;
- remote databaseconnectie: nee;
- remote migration apply: nee;
- commit: nee;
- push: nee;
- deploy: nee.

Alle databasevalidatie gebruikte tijdelijke PostgreSQL-clusters op `127.0.0.1` onder `/private/tmp`, met expliciete blokkade van remote Supabase- en database-environmentvariabelen.

## Eindoordeel

```text
PASS_P0_ABUSE_CONTROL_LOCAL_FOUNDATION_INTEGRATION_APPROVAL_REQUIRED
```

Dit PASS opent uitsluitend de mogelijkheid om een nieuwe lokale integratie-hardeningopdracht te geven. Het opent geen stagingrelease.
