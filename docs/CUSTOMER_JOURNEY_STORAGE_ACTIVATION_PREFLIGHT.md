# Customer Journey Storage Activation — productiepreflight

Datum: 13 juli 2026
Repository-HEAD bij preflight: `d4a75b0`
Conclusie: `safe_to_apply: true`, uitsluitend via de geïsoleerde 025-uitvoerroute uit dit rapport.

## Omgevingsidentificatie

| Controle | Resultaat |
| --- | --- |
| Supabase-project | `maxwebstudio` |
| Project ref | `yxxahurphdbblkuxoeje` |
| Databasehost | `db.yxxahurphdbblkuxoeje.supabase.co` |
| Regio/status | `eu-west-1`, `ACTIVE_HEALTHY` |
| Live `maxwebstudio.nl` auth-config | HTTP 200, `APP_ENV=production`, ref `yxxahurphdbblkuxoeje` |
| Service-role in publieke config | niet aanwezig |
| Lokale server-secrets | niet aanwezig in shell of repository |
| CLI-link tijdens uitvoering | expliciet gekoppeld aan `yxxahurphdbblkuxoeje` |

De Supabase Management API, bestaande productierunbooks en de live publieke auth-config wijzen alle drie naar dezelfde projectref. Het afzonderlijke project `maxwebstudio-test` gebruikt ref `xlxpuuycigeqhgxqtzni` en is niet geselecteerd.

## Back-up en metadata-snapshot

- Laatste afgeronde fysieke productieback-up vóór uitvoering: backup `1102601588`, `2026-07-13T04:15:53.204Z`, status `COMPLETED`.
- WAL-G-back-ups zijn actief; point-in-time recovery is niet ingeschakeld.
- Read-only gegenereerde productietypes zijn tijdelijk opgeslagen met SHA-256 `beb482c76da5894d2b3a7db7b760e61f0bf59f5e1eafa2ec1e59fc4cd38bdfad`.
- Read-only productie-indexstatistieken zijn tijdelijk opgeslagen met SHA-256 `b979cc7b756a6d0b5efb316f3e3a41bb58026d192101437dfea47fbb9c986368`.
- De CLI-schema-export kon niet worden gemaakt omdat de lokale Docker-daemon niet draait. Er is daarom geen onvolledige dump als back-up aangemerkt. Types, tabelstatistieken en indexstatistieken zijn wel succesvol rechtstreeks uit productie gelezen.

## Objectpreflight migration 025

| Object | Voor uitvoering | Verwacht conflict | Veilige actie |
| --- | --- | --- | --- |
| `journey_definitions` | ontbreekt | geen | additief aanmaken |
| `journey_instances` | ontbreekt | geen | additief aanmaken |
| `journey_events` | ontbreekt | geen | additief aanmaken |
| `automation_outbox` | ontbreekt | geen | additief aanmaken |
| `automation_executions` | ontbreekt | geen | additief aanmaken |
| `provider_webhook_events` | ontbreekt | geen | additief aanmaken |
| `record_journey_event_and_enqueue` | ontbreekt | geen | security-definer-RPC aanmaken |
| `claim_automation_outbox` | ontbreekt | geen | begrensde test-only claim-RPC aanmaken |
| 025-indexnamen | ontbreken | geen | `create index if not exists` |
| 025-constraints | ontbreken met tabellen | geen | onderdeel van nieuwe tabellen |
| 025-RLS/policies/grants | ontbreken met tabellen | geen | RLS activeren, service-role-only policy en grants |
| `pgcrypto`/`gen_random_uuid()` | UUID-conventie reeds in productie; migration controleert functie live | geen verwacht | `create extension if not exists pgcrypto` |
| Rollen `anon`, `authenticated`, `service_role` | operationeel in bestaand Supabase-project | geen | geen rolmutatie |

De zes doeltabellen komen niet voor in de productie-tabelstatistieken of gegenereerde types. De RPC-namen komen niet voor in de gegenereerde types. De indexnamen komen niet voor in de productie-indexstatistieken. Er is dus geen zichtbare gedeeltelijke 025-installatie.

## SQL-herbeoordeling

Migration 025:

- is transactioneel (`begin`/`commit`);
- bevat geen `drop`, `truncate`, `delete` of reset;
- gebruikt `create table/index if not exists` en idempotente policycreatie;
- gebruikt `create or replace function` met `security definer` en vaste `search_path`;
- trekt uitvoerrechten van `public`, `anon` en `authenticated` in;
- verleent alleen `service_role` directe tabel- en RPC-rechten;
- valideert event-, entity-, environment-, payload-, effect- en idempotency-input;
- claimt uitsluitend `test`-items van type `email.journey_test` of `email.preview_ready`;
- begrenst batchgrootte tot maximaal twintig en leases tot maximaal vijf minuten;
- gebruikt `for update skip locked` en herstelt uitsluitend verlopen `processing`-leases;
- bevat afsluitende catalogusasserties voor tabellen, RLS, policies, grants, functies, `search_path` en kernindexes. Een mislukte assertie rolt de hele transactie terug.

## Uitvoerstrategie

De remote migration history bevat de bestaande repositorymigraties niet, omdat eerdere productie-SQL buiten de huidige CLI-history is uitgevoerd. Een normale `supabase db push` vanuit de repository zou daardoor oudere migraties opnieuw willen aanbieden en is niet toegestaan.

Daarom wordt een tijdelijke geïsoleerde Supabase-workdir gebruikt die uitsluitend de goedgekeurde 025-migration bevat. Eerst wordt een dry-run uitgevoerd. Daarna wordt alleen 025 gepusht. Voor de tweede idempotentie-uitvoering wordt dezelfde SQL onder een aparte verificatieversie nogmaals aangeboden. Er worden geen oudere repositorymigraties meegenomen.

## Herstelpad

Functionele rollback, zonder data te verwijderen:

1. zet `JOURNEY_ENGINE_ENABLED=off`;
2. zet `JOURNEY_EMAIL_AUTOMATION_ENABLED=off`;
3. zet `JOURNEY_ADMIN_ENABLED=off` waar volledige journey-inzage moet stoppen;
4. gebruik geen producer- of workertrigger;
5. laat de zes additieve tabellen en hun auditdata behouden;
6. herstel de fysieke Supabase-back-up alleen bij aantoonbare bredere databaseschade en na afzonderlijke ownergoedkeuring.

De functies kunnen aanvullend individueel worden gedeactiveerd door `execute` van `service_role` in te trekken. Tabellen worden bij rollback niet automatisch verwijderd.

## Go/no-go

- Projectidentiteit: **PASS**
- Live/public configuratiematch: **PASS**
- Service-role niet publiek: **PASS**
- Targetobjecten afwezig / geen conflict: **PASS**
- Actuele fysieke back-up aanwezig: **PASS**
- Additieve en transactionele SQL: **PASS**
- RLS/grant/search-path fail-closed assertions: **PASS**
- Veilige geïsoleerde uitvoerroute: **PASS**

Eindoordeel vóór live SQL: `safe_to_apply: true`.

## Uitvoeringsresultaat

Status na preflight: **LIVE EN GROEN**.

- `20260713173000_customer_journey_automation_foundations.sql` is succesvol toegepast.
- De byte-identieke SQL is daarna opnieuw succesvol uitgevoerd als `20260713173100_customer_journey_automation_foundations_idempotency_verification.sql`.
- De tweede uitvoering sloeg alle bestaande tabellen en indexes gecontroleerd over en liet alle catalogusasserties opnieuw slagen.
- Gegenereerde productietypes bevatten daarna alle zes tabellen en beide RPC's.
- Live indexstatistieken bevatten de dispatch-, stale-lease-, provider-message- en journeydefinition-indexes.
- De migration-history bevestigt de versies `20260713173000`, `20260713173100` en de afzonderlijke smoketest `20260713173200`.

De CLI meldde na succesvolle commits dat de optionele lokale pg-delta-catalogus niet kon worden gecachet zonder Docker. Dit was geen databasefout en vond plaats nadat iedere migration als voltooid was geregistreerd.

## Synthetische storagesmoketest

`20260713173200_customer_journey_storage_smoke_test.sql` heeft exact één herkenbaar synthetisch testitem gebruikt en transactioneel bewezen:

- eerste event- en outboxregistratie slaagt;
- dezelfde registratie retourneert dezelfde event- en outbox-ID als duplicate;
- claim met batchgrootte één zet status op `processing` en poging op één;
- een verlopen lease wordt door een andere worker veilig herclaimd en verhoogt de poging naar twee;
- een executionrecord wordt vóór afronding vastgelegd;
- een fake provider-message-ID wordt opgeslagen;
- outbox en execution eindigen op `completed`;
- er bestaat uiteindelijk exact één event, één outboxitem en één execution.

Er is geen Resend-aanroep gedaan, geen e-mail verzonden, geen customer/profile/project/invoice/payment gewijzigd en geen productieproducer of scheduler geactiveerd. De synthetische records blijven als herkenbare `testMode`/`dryRun` auditdata behouden.
