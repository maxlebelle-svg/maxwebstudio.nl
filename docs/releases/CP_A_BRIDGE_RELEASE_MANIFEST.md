# CP-A bridge release manifest

Datum: 2026-07-24
Release: `CP_A_BRIDGE_MIGRATION_AND_STAGING_RELEASE_BRIDGE`

## Release-identiteit

| Veld | Waarde |
| --- | --- |
| Branch | `release/cp-a-bridge-and-trust-chain` |
| Basiscommit | `fd5f7a8099e4521b4e6d8ff809a6bce9aa56773e` |
| Bestaande CP-A-commit | `40797df3793b2a85942ef9fef0ca24ba1c33ec91` |
| Bridgecommit | `cc504b79324bedf525c51390c0515c63be376e1e` |
| Finale releasecommit | de branch-tip die dit manifest toevoegt; de post-commit SHA staat in de overdracht |
| PR-source | `release/cp-a-bridge-and-trust-chain` |
| PR-target | `codex/rc1-clean-migration-lineage` |

De releasebranch is rechtstreeks gemaakt vanaf CP-A-commit `40797df3`; die commit heeft basis `fd5f7a80`. Er is niet gemerged, gerebased of herschreven. Een commit kan zijn eigen SHA niet in zijn eigen inhoud opnemen; daarom is de finale branch-tip de canonieke zelfreferentie.

## Inbegrepen fileset

De finale release voegt ten opzichte van CP-A-commit `40797df3` exact vijf unieke paden toe of wijzigt deze:

1. `supabase/migrations/20260724110000_bridge_preview_publication_portal_review.sql`
2. `tests/cp-a-bridge-migration.test.js`
3. `tests/fixtures/cp-a-bridge-migration-functional.sql`
4. `docs/releases/CP_A_BRIDGE_RELEASE_MANIFEST.md`
5. `docs/CP_A_BRIDGE_MIGRATION_AND_STAGING_RELEASE_BRIDGE.md`

Uitgesloten zijn alle Content Factory-wijzigingen, niet-CP-A-migraties, lokale blokkerrapporten uit eerdere worktrees, accounts, testdata voor remote omgevingen, configuratiewijzigingen en secrets. De bestaande 16 CP-A-bestanden komen uitsluitend via commit `40797df3` mee.

Finale diffstat ten opzichte van `40797df3`: `5 files changed, 906 insertions(+)`.

## Migraties en checksums

| Volgorde | Migratie | SHA-256 |
| ---: | --- | --- |
| 1 | `supabase/migrations/20260724110000_bridge_preview_publication_portal_review.sql` | `22628ef185d4f78a8dd96eefd9aee68022e2010f9f5143c7d13df0be4ea6fa50` |
| 2 | `supabase/migrations/20260724120000_cp_a_portal_trust_chain.sql` | `a418a8b05b03879f572c0ebd5862acd2ce36d3eae8e35db6aefbd5fa7c7586c2` |

De vrije timestamp `20260724110000` dwingt de volgorde bridge → CP-A af en ligt na de reeds geregistreerde Factory-migratie `20260719170000`.

De bridgechecksum bleef ongewijzigd. De CP-A-checksum veranderde vóór de eerste geslaagde remote toepassing van `757d304cd9200baf438e0968f00508cfbecb56648aeefcd5486516734c007a84` naar `a418a8b05b03879f572c0ebd5862acd2ce36d3eae8e35db6aefbd5fa7c7586c2`. Enige runtime-SQL-diff: `public.digest` → `extensions.digest`; checksumsemantiek, security-definer-searchpaths en grants bleven gelijk.

## Verwachte schemaobjecten

- 21 nullable portal-reviewkolommen op `public.website_preview_versions`;
- vijf gevalideerde foreign keys met `ON DELETE SET NULL`;
- één gevalideerde status-checkconstraint;
- acht definitie-gecontroleerde btree-indexes;
- behoud van bestaande Factory-unique/checkconstraints;
- behoud van RLS en de bestaande deny-policy;
- geen grants, policies, functies, backfill of directe klantwrites door de bridge.

## Targets

| Omgeving | Netlify | Branch | Supabase projectref | Actie in deze release |
| --- | --- | --- | --- | --- |
| Staging | `maxwebstudio-staging`, site-ID `67b2b8af-83fc-4c61-9cd8-2f78842b7615` | `codex/rc1-clean-migration-lineage` | `xlxpuuycigeqhgxqtzni` | geen |
| Productie | `maxwebstudionl`, site-ID `5507913e-64a7-4b1f-b469-45e9c123cbc3` | `main` | `yxxahurphdbblkuxoeje` | geen; alleen vergelijking |

## Deploy Preview-vereisten

Netlify bouwt Deploy Previews voor pull requests tegen de productiebranch en ondersteunt Functions. De niet-geheime staging-Supabaseconfig is gelijk in alle deploycontexten. De vereiste `SUPABASE_SERVICE_ROLE_KEY` is echter leeg in de context **Deploy Previews**, terwijl `account-profile` en CP-A-functions deze server-side sleutel nodig hebben. Ook zijn de drie basis/redirect-URL-variabelen contextgelijk en dus niet aantoonbaar preview-hostspecifiek. Daarom is een standaard Deploy Preview nu wel een geldige buildroute, maar **niet technisch geschikt voor authenticated CP-A.1**.

Voor CP-A.1 moet vóór gebruik afzonderlijk worden bewezen dat:

- uitsluitend staging-Supabasecredentials in de Deploy Preview-context aanwezig zijn;
- auth/callback-allowlists en redirects de preview-host accepteren;
- Functions op de preview de account- en CP-A-endpoints volledig uitvoeren;
- CSP en same-origin preview-embed op de preview-host blijven werken;
- geen productiecredential of productieprojectref beschikbaar is.

Verwacht URL-patroon: `https://deploy-preview-<PR-NUMMER>--maxwebstudio-staging.netlify.app`.

## Tests

| Gate | Resultaat |
| --- | --- |
| Bridge statisch | 9/9 PASS |
| PostgreSQL-scenario’s | 10/10 PASS met `pgcrypto` expliciet in schema `extensions` |
| Bridge transactionele fixture | PASS |
| Bridge → CP-A compile en CP-A-fixture | PASS |
| CP-A gericht | 5/5 PASS |
| Portaalregressies | 76/76 PASS |
| Volledige suite | 260/270; 10 bekende basisfailures, 0 nieuwe failures |
| Basisnulmeting | 251/261; dezelfde 10 failures |
| Migratievolgorde/checksums | PASS |
| JavaScript-syntax | PASS |
| Secret scan | PASS |
| Finale `git diff --check` | na documentcommit opnieuw vereist |

De tien bekende failures blijven beperkt tot de bestaande Website Factory build/idempotency/testlijn en zijn niet gewijzigd door deze release.

## Stopcriteria

Stop bij targetbranch- of projectrefmismatch, een gewijzigde migratiechecksum, incompatibele bestaande kolom/constraint/index, orphan-FK-data, ontbrekende FK-target, onverwachte grant/policy, een nieuwe testfailure, een Deploy Preview met productieconfig of een Deploy Preview zonder complete authenticated Functions.

Na merge blijven zonder afzonderlijke opdracht expliciet verboden: Netlify-deploy afdwingen, bridge of CP-A op staging/productie toepassen, accounts/fixtures maken, e-mail versturen, betalingen uitvoeren en productie wijzigen.

## Next approved step

Push na afzonderlijke toestemming uitsluitend de nieuwe branch-tip, actualiseer bestaande draft-PR #4 met de nieuwe checksum en rollbackoorzaak, herhaal de CP-A-stagingpreflight en pas alleen de gecorrigeerde CP-A-migratie toe. Integreer en deploy pas na een groene database-poststate. De branch is in deze correctieopdracht niet gepusht en PR #4 is niet remote gewijzigd.
