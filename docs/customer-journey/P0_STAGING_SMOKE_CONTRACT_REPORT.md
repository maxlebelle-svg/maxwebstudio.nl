# P0 staging-smokecontract

## Eindstatus

```text
PASS_P0_STAGING_SMOKE_CONTRACT_READY
```

Vastgelegd op `2026-07-21T19:09:57Z`. Dit resultaat is uitsluitend lokaal. Er is niets gepusht, gedeployed of op staging of productie geconfigureerd.

## Gekozen mechanisme

De P0-leadhandler ondersteunt een optionele, server-side geauthenticeerde staging-smoke. Suppressie wordt alleen actief wanneer alle volgende voorwaarden tegelijk waar zijn:

1. `OUTBOUND_PROVIDER_MODE=suppress`;
2. Netlify `SITE_ID` is exact `67b2b8af-83fc-4c61-9cd8-2f78842b7615`;
3. `SUPABASE_PROJECT_ID` is exact `xlxpuuycigeqhgxqtzni`;
4. `P0_STAGING_SMOKE_HMAC_SECRET` bevat minimaal 32 bytes secretmateriaal;
5. requestheader `x-mws-p0-smoke-auth` bevat een geldige HMAC-SHA-256-handtekening.

De header heeft vorm `v1:<unix-seconden>:<nonce>:<signature>`. De signature bindt protocolversie, timestamp, een 16–64 tekens nonce en SHA-256 van de exacte ruwe requestbody. De tijdsafwijking mag maximaal 300 seconden zijn en de vergelijking is constant-time. De header en het secret staan niet in frontendcode, publieke HTML of responses.

Een suppressiemodus op een andere site of ander Supabaseproject retourneert fail-closed `503`, ook zonder smokeheader. Een aanwezige maar ongeldige, verlopen of niet-ingeschakelde smokeheader retourneert `403` vóór limiter, database, timeline en provider. Zonder suppressievariabele en zonder smokeheader blijft het bestaande gedrag inhoudelijk en responsematig ongewijzigd.

## Outbound-inventarisatie

De P0-flow bevat exact twee potentiële externe deliveries, beide via dezelfde `sendEmail`-afhankelijkheid:

| Delivery | Callsite | Activering | Werkelijke provider |
| --- | --- | --- | --- |
| Admin-leadnotificatie | `functions/send-lead.js`, `runPostStorageNotifications()` | na bewezen niet-replay opslag | Resend via `functions/services/resendMailService.js` |
| Klantbevestiging | `functions/send-lead.js`, `sendCustomerConfirmation()` | na succesvolle of gecontroleerd suppressed admin-delivery | Resend via dezelfde service |

Aanvullende inventarisatie:

- WhatsApp: uitsluitend een `wa.me`-link in de e-mailbody; geen request of berichtactie;
- sms: geen callsite;
- CRM/webhook: geen callsite in P0;
- achtergrondqueue/deliveryjob: geen callsite;
- providerretry: geen scheduler of job in P0;
- reconciliation: uitsluitend Supabase-read na een ambigue create-uitkomst en start zelf geen delivery;
- timeline: interne Supabasewrite, geen outbound-provider.

## Suppressiegedrag

Bij een geldig geauthenticeerd smokeverzoek wordt de centrale `sendEmail`-grens vervangen door een no-op. Daardoor ontstaan:

- nul calls naar `api.resend.com`;
- nul e-maillogs uit `sendTrackedEmail`;
- nul provider-message-ID's;
- nul deliveryjobs;
- nul retries;
- twee gecontroleerde suppressed-resultaten: adminnotificatie en klantbevestiging.

Iedere no-op logt uitsluitend veilige metadata: `provider=resend`, `reason=staging_smoke`, templatekey en de booleans `deliveryJobCreated=false` en `retryScheduled=false`. De response bevat `providerSuppressed=true`, `suppressedProviders=["resend"]`, `suppressionReason=staging_smoke` en `suppressedDeliveryCount=2`.

## Actieve interne flow en writes

De smoke breekt de handler niet vroegtijdig af. De volgende onderdelen blijven actief:

1. payload- en veldvalidatie;
2. HMAC-gebaseerde abuse-identificatie;
3. limiter-RPC en limiterledger;
4. transactionele leadopslag;
5. lead-idempotency en immutable `lead.created`-business-event;
6. reconciliation bij een ambigue create-uitkomst;
7. timeline-event na bewezen opslag.

Smokeleads krijgen `environment=test` en server-side metadata `stagingSmoke=true`, `providerMode=suppress` en `suppressionReason=staging_smoke`. Het timeline-event krijgt dezelfde smokeclassificatie. De honeypot blijft vóór smokeauth, limiter, database, timeline en provider stoppen.

## Cleanupstrategie

Elke toekomstige smoke gebruikt een unieke `lead-p0-staging-smoke-<epoch>` request-ID en een adres onder `example.test`. De response levert de concrete `leadId` voor nacontrole.

- Geen e-maillog, providerrecord, deliveryjob of retry hoeft te worden opgeruimd: die worden niet aangemaakt.
- De limiterledger valt onder de bestaande retentie en bounded cleanup-RPC.
- Lead, idempotencyrow, business-event en timeline vormen aantoonbare stagingtestdata. Omdat business-events append-only zijn, worden die niet stil verwijderd.
- Een latere staginggate kan de mutable lead/timeline-data met exact request-ID/lead-ID gecontroleerd archiveren of verwijderen; de append-only en retentiegebonden auditrows blijven als testgeclassificeerde evidence bestaan.

## Vereiste stagingconfiguratie voor een latere gate

```text
OUTBOUND_PROVIDER_MODE=suppress
P0_STAGING_SMOKE_HMAC_SECRET=<cryptografisch willekeurig, minimaal 32 bytes>
```

Beide variabelen moeten uitsluitend server-side voor Functions/Runtime op `maxwebstudio-staging` worden gezet. Het secret mag niet in een bestand, commit, log, screenshot of rapport terechtkomen. `SITE_ID` en `SUPABASE_PROJECT_ID` worden daarnaast server-side tegen de hard locked stagingidentiteiten gecontroleerd.

## Testresultaten

- smokecontracttests: 11/11 PASS;
- gerichte smoke- plus P0-suite: 69/69 PASS;
- volledige geïsoleerde suite: 256/256 PASS;
- JavaScript-syntax: PASS;
- shellsyntax: PASS;
- HTML5-parse: PASS;
- `git diff --check`: PASS;
- frontend-lekcontrole voor header/secret: PASS;
- secretscan: PASS.

De tests bewijzen onder meer normale providerwerking zonder smokeauth, geldige suppressie, ongeldige en verlopen auth, bodybinding, nul provider-HTTP-calls, nul deliveryjobs/retries, actieve database/timelineflow, honeypotprecedence en productie-target-fail-closed gedrag.

## Gewijzigde bestanden

De incrementele smokecontractwijziging boven op de eerder vergrendelde P0-release raakt zeven bestanden:

- `.env.example`;
- `.env.local.example`;
- `functions/send-lead.js`;
- `functions/services/p0StagingSmokeControl.js`;
- `tests/p0-staging-smoke-contract.test.js`;
- `docs/customer-journey/P0_STAGING_SMOKE_CONTRACT_REPORT.md`;
- `docs/customer-journey/evidence/p0-staging-smoke-contract/P0_STAGING_SMOKE_CONTRACT_EVIDENCE.json`.

De volledige lokale commit vanaf stagingbasis bevat de eerdere 22 P0-bestanden plus deze vier nieuwe smokecontract/evidencebestanden: 26 bestanden totaal. Publieke smokeauthcode is niet toegevoegd.

## Volgende gate

De lokale commit is uitsluitend gereed voor een nieuwe read-only readinessreview. Voor configuratie, push en deploy zijn afzonderlijke expliciete autorisaties nodig.
