# P0 Lead Intake — Local Integration Hardening Report

Datum: 2026-07-21

Scope: uitsluitend lokale integratie, tests en evidence
Status: `PASS_P0_LOCAL_INTEGRATION_STAGING_REVIEW_REQUIRED`

## Oordeel

De vier oorspronkelijke P0-blockers zijn gezamenlijk lokaal opgelost: abuse-control is vóór opslag gekoppeld, create-timeouts hebben een begrensde read-only reconciliation zonder create-retry, browser- en servervalidatie spiegelen het bewezen RPC-contract en de echte handler heeft volledige scenario- en call-countdekking. Dit opent uitsluitend een afzonderlijke code-review en read-only staging-readinessanalyse. Het autoriseert geen staging-apply, productie, commit, push of deploy.

## Gewijzigde bestanden

- `functions/send-lead.js` — geordende requestflow, limiterkoppeling, timeout/reconciliation, veilige responses, dependency-injectie en KPI-classificatie.
- `public/index.html` — exacte veldlimieten en een verborgen honeypot.
- `public/script.js` — identieke Unicodebewuste grenzen, maximale requestgrootte, stabiele retryreferentie en lokale opslag pas na serveracceptatie.
- `tests/p0-lead-intake-handler.test.js` — echte handleruitkomsten, statussen en dependency-callcounts.
- `tests/public-lead-intake-persistence.test.js` — RPC-mapping en publieke formulierregressies.
- dit rapport en `P0_LEAD_INTAKE_LOCAL_INTEGRATION_EVIDENCE.json`.

Er zijn geen migratiebytes, databaseobjecten, ACL's, policies, P1–P5-functies of overige klantreiscomponenten aangepast.

## Exacte requestflow

1. Alleen `POST` accepteren.
2. De ruwe UTF-8-body vóór parsing begrenzen op 131.072 bytes.
3. JSON veilig parsen en alleen een object accepteren.
4. `_gotcha` honeypot controleren; een hit stopt zonder secrets of dependencies te gebruiken.
5. Het volledige applicatie- en RPC-contract valideren zonder truncatie.
6. Eén deterministische `lead-intake:v1:<uuid>`-referentie voor het hele verzoek bepalen.
7. Een PII-vrije HMAC-fingerprint en requestreferentie vormen met uitsluitend serversecrets.
8. De atomische `mws_check_lead_intake_abuse_v1` aanroepen.
9. Limiet of fingerprintconflict stopt vóór create, timeline en e-mail.
10. `mws_create_lead_transactional_v1` exact eenmaal aanroepen met een vaste timeout van 8 seconden.
11. Alleen bij een geworpen transport-/timeoutfout of een ambigue onleesbare succesresponse `mws_get_lead_intake_result_v1` met dezelfde key aanroepen, met een timeout van 3 seconden.
12. HTTP-validatie-, permissie- en andere definitieve create-responses nooit reconciliëren.
13. Alleen een actieve `status=resolved` reconciliation met lead-ID als opslagbewijs accepteren.
14. Timeline en e-mail uitsluitend na bewezen opslag uitvoeren. Een normale idempotente replay slaat deze side effects over.
15. Notificatiefalen levert `202 success=true` met `notificationDegraded`; opslagfalen blijft een veilige fout.

## Limiterintegratie

De bestaande helper en checksum-vergrendelde migratie worden ongewijzigd gebruikt. De caller levert geen limieten. De handler gebruikt alleen `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LEAD_ABUSE_HMAC_SECRET` en optioneel `LEAD_ABUSE_HMAC_SECRET_PREVIOUS` aan serverzijde. Er is geen in-memory, file- of degraded fallback.

Limiterfalen is fail-closed (`503`). Een geldige limietblokkade is een generieke `429`. Honeypot- en limiterblokkades hebben lokaal exact nul create-, reconciliation-, timeline- en providercalls.

## Timeout en reconciliation

De create-call wordt nooit herhaald. De lokale matrix bewijst voor created, duplicate en replayachtige reconciliation:

```text
limiter calls       1
create calls        1
reconciliation      1
create retries      0
```

Een lege, mislukte, verlopen of `lead_deleted` reconciliation is onvoldoende bewijs en stopt vóór timeline/e-mail. Classificaties zijn `reconciledCreated` wanneer de oorspronkelijke intake een nieuwe lead was en `reconciledDuplicate` wanneer die een bestaande lead resolveerde. Een gewone RPC-replay is `idempotentReplay`.

## Validatiecontract

| Gegeven | Server | Browser | Broncontract |
| --- | ---: | ---: | --- |
| naam | 240 tekens | `maxlength=240` | `name` |
| bedrijfsnaam | 240 tekens | `maxlength=240` | `company` |
| telefoon | 80 tekens | `maxlength=80` | `phone` |
| e-mail | 320 tekens | `maxlength=320` | `email` |
| bericht/notities | 4.000 tekens | `maxlength=4000` | `notes` |
| bron | 120 tekens | vaste browserwaarde | `source` |
| externe request-ID | 255 tekens | gegenereerde waarde | `external_source_id` |
| metadata | 65.536 UTF-8-bytes | begrensde vaste structuur | `metadata` |
| volledige RPC-payload | 131.072 UTF-8-bytes | requestbody maximaal 131.072 bytes | `p_lead` |

Lengtes gebruiken Unicode-codepoints, gelijk aan PostgreSQL `char_length`; tests bewijzen grens-1, grens en grens+1 met ASCII en multibytewaarden. Er wordt nergens stil getrunceerd.

## Handler-testmatrix

De gerichte P0-suite bewijst onder meer:

- new, duplicate en idempotent replay;
- rate-limit, honeypot en geldige limiter-replay;
- definitieve create-fout zonder reconciliation;
- timeout met created-, duplicate- en replayreconciliation;
- lege, mislukte, verlopen en verwijderde reconciliation;
- ontbrekende URL, service-role key en HMAC-secret;
- limiterstoring zonder fallback;
- provider `sent:false` en providerexception na opslag;
- alle veldgrenzen, ongeldige e-mail, malformed JSON, oversized body en verkeerde methode;
- nul downstreamcalls bij storage- of abusefailure;
- PII-vrije logging en veilige requestreferenties;
- alle vereiste KPI-classificaties.

## KPI-classificatie

De operationele logger schrijft alleen `lead_intake_outcome`, een classificatie, een 96-bit PII-vrije requestreferentie en vaste technische labels. Ondersteund:

```text
created
duplicate
idempotentReplay
reconciledCreated
reconciledDuplicate
validationRejected
abuseRejected
storageFailed
notificationDegraded
```

Naam, bedrijf, e-mail, telefoon, IP, user-agent, bericht en payload worden niet operationeel gelogd.

## Lokale database- en regressieresultaten

Foundationmigration (ongewijzigd):

```text
20260721040000_lead_intake_abuse_control.sql
12199 bytes
SHA-256 9e6747d25c8e98b637c8bb6500e381dfeeacc605dd830b422a1a68ecea35415a
```

- canonical, existing en bootstrap byte-identiek;
- clean bootstrap en existing-upgrade: PASS;
- tweede runs: up-to-date;
- SQL-RPC-, rol-, privacy-, cleanup- en secretrotatietests: PASS;
- concurrency: 5 allowed / 1 limited / 5 rows;
- replayconcurrency: 8 allowed / 1 unique / 1 row;
- gerichte P0-tests: 43 / 43 PASS;
- volledige repositorysuite: 359 / 364 PASS.

De vijf failures zijn exact de reeds bekende Foundation-governanceverwachtingen en zijn niet aangepast:

1. `R1 is complete and R2 remains approval-gated without SQL authority`;
2. `F0-d created no reconciliation identity; later approved common work is separately attributable`;
3. `authoritative baseline checksum is immutable and later common bytes remain separately controlled`;
4. `baseline remains exact and bootstrap contains the baseline plus approved common migrations`;
5. `F0-h created no reconciliation SQL; later R2-A common work remains non-remote`.

## Cleanup en scopebewijs

Alle lokale databasefixtures zijn verwijderd en beide tijdelijke PostgreSQL-clusters zijn gestopt en verwijderd. De validator rapporteerde `remote_contact=false`. Er is geen staging- of productiecontact, remote databaseactie, commit, push of deployment uitgevoerd. De gecontroleerde diff bevat geen offerte-, betaal-, AI-, publicatie- of klantportaalwijziging uit deze werkstroom.

## Resterende staging-reviewpunten

- Bevestig read-only dat Netlify in de echte runtime `x-nf-client-connection-ip` levert zoals verondersteld.
- Bevestig uitsluitend de aanwezigheid en server-only plaatsing van sterke HMAC-secrets; secretwaarden mogen niet worden uitgelezen of gelogd.
- Bevestig dat de functionruntime Node's `AbortSignal.timeout` ondersteunt.
- Bevestig via een later afzonderlijk geautoriseerde staging-smoke de PostgREST-responsevorm en operationele logging.
- Fysieke cleanup zonder leadverkeer blijft afhankelijk van een later afzonderlijk te autoriseren scheduler; opportunistische cleanup is wel lokaal bewezen.

## Eindstatus

```text
PASS_P0_LOCAL_INTEGRATION_STAGING_REVIEW_REQUIRED
```

Deze status geeft uitsluitend toestemming om een nieuwe code-review en read-only staging-readinessanalyse te overwegen. Zij geeft geen toestemming voor staging-apply, productie of deployment.
