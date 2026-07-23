# P0 staging-smoke nonce replay protection

## Status

```text
PASS_P0_NONCE_REPLAY_PROTECTION_LOCAL_STAGING_REVIEW_REQUIRED
```

Vastgelegd op `2026-07-21T20:02:23Z`. Dit resultaat is uitsluitend lokaal. Er is geen staging- of productiecontact geweest en er is niets gecommit, gepusht, gedeployed of op afstand geconfigureerd.

## Architectuur

Replaybescherming gebruikt een afzonderlijke private ledger en één atomische `SECURITY DEFINER`-RPC. De bestaande lead-intake-abusefoundation blijft inhoudelijk en checksummatig ongewijzigd. Een aparte tabel maakt de eenmalige smokenonce-semantiek expliciet en voorkomt dat limiter-idempotency en smokeauth-replay verschillende lifecycle- of retentieregels delen.

De Function verifieert eerst target, secretconfiguratie, timestamp en HMAC over de exacte raw body. Alleen daarna stuurt zij drie afgeleide SHA-256-referenties naar de service-role-RPC:

- `nonce_fingerprint`: domeingescheiden SHA-256 van de nonce;
- `request_binding`: SHA-256 van versie, timestamp, nonce, stagingtarget en raw-bodydigest;
- `target_binding`: vaste SHA-256-referentie voor `maxwebstudio-staging` en `maxwebstudio-test`.

Plaintext nonce, HMAC-header, secret, raw body en PII verlaten deze verificatielaag niet.

## Atomische semantiek

`mws_consume_p0_staging_smoke_nonce_v1` valideert vaste scope, 64-hex-referenties en de vaste targetbinding. Een transaction-scoped advisory lock serialiseert alle contenders voor dezelfde nonce. Daarna geldt:

- eerste binding: `consumed`;
- dezelfde nonce en binding: `replay`;
- dezelfde nonce met andere body/timestampbinding: `binding_conflict`;
- expired state: exact verwijderd, waarna een nieuwe geldige consumptie mogelijk is;
- gelijktijdige callers: exact één winnaar.

Een timeout, transportfout, ambigue uitkomst of malformed response wordt niet herhaald. De smokeflow stopt vóór limiter, leadopslag, reconciliation, business-event, timeline en provider.

## TTL en cleanup

De database-TTL is vast één uur. Dat is langer dan het maximale HMAC-acceptatievenster van vijf minuten en voorkomt dat een geldige replay na clock-skew alsnog kan winnen. Iedere consumptie verwijdert de exact verlopen nonce en daarnaast maximaal 100 andere verlopen rijen. Cleanupwerk per request is daardoor begrensd en vereist geen scheduler.

## Databasebeveiliging

| Object | PUBLIC | anon | authenticated | service_role | postgres |
| --- | --- | --- | --- | --- | --- |
| `p0_staging_smoke_nonces` directe tabeltoegang | geen | geen | geen | geen | owner |
| `mws_consume_p0_staging_smoke_nonce_v1` EXECUTE | geen | geen | geen | ja | owner |

RLS staat aan. De RPC is `SECURITY DEFINER`, eigenaar `postgres`, met vaste `search_path=pg_catalog`. Er zijn geen schema-wide, wildcard- of default-privilegewijzigingen.

## Migratie

```text
Versie: 20260721050000
Bestand: 20260721050000_p0_staging_smoke_nonce_replay_protection.sql
Bytes: 6583
SHA-256: a733d0eefb976524bc69b06487f440310641f19d101cb21b3f9fb2ff58e2819a
Kopieën: canonical, existing en bootstrap byte-identiek
```

De bestaande migratie `20260721040000` bleef 12199 bytes met SHA-256 `9e6747d25c8e98b637c8bb6500e381dfeeacc605dd830b422a1a68ecea35415a`.

Rollback is uitsluitend een later afzonderlijk goed te keuren append-only compensatiemigratie die eerst alle callers van de RPC verwijdert, daarna EXECUTE intrekt en pas vervolgens functie en tabel verwijdert.

## Validatie

- smokecontract inclusief replay: 17/17 PASS;
- gerichte P0-suite: 75/75 PASS;
- volledige geïsoleerde suite: 262/262 PASS;
- clean bootstrap: tweemaal PASS;
- existing-upgrade `040000 → 050000`: tweemaal PASS;
- echte PostgreSQL-concurrency met 10 sessies: 1 consumed, 9 replay, 1 rij;
- sequentiële Function-replay: eerste 200, tweede 403;
- 2 en 10 gelijktijdige Functionrequests: exact 1 succesvolle smokeflow;
- bij replay/conflict: limiter 0 extra, create 0 extra, reconciliation 0, timeline 0 extra, provider 0;
- expired-rowreconsumptie: PASS;
- bounded cleanup van exact 100 rijen: PASS;
- ACL/RLS/search-path/owner: PASS;
- privacykolommen: 0;
- blijvende lokale fixtures na cleanup: 0;
- JavaScript-, shell- en HTML5-syntax: PASS;
- `git diff --check`: PASS;
- frontend-lekcontrole: PASS;
- 70 Function-entrypoints behouden;
- negen eerder risicovolle Functions byte-identiek.

## Release-identiteit

De deploybron blijft een nog niet gecommitteerde, geïsoleerde release-eenheid bovenop stagingbasis `7bdfb15d659a2f9da5d0816732ad19828bcb296d`. Commit `1da026be7edc6258a3ed6762c9bf3d9ceba89078` is historische tussen-evidence en niet langer de definitieve deploybron. De volledige fileset en hashes staan in `P0_RELEASE_UNIT_MANIFEST_NONCE_REPLAY_7BDFB15.json`.

## Volgende gate

Uitsluitend een nieuwe read-only staging-readinessreview mag volgen. Migratie-apply, Netlify-variabelen, commit, push en deploy vereisen elk een nieuwe expliciete autorisatie.
