# CP-A production reconstruction manifest

## Identiteit

| Veld | Waarde |
|---|---|
| Main base | `0bb0ea74884652f1297d9d9a19c02108c0095688` |
| Stagingbron | `92660ea259d22afe6a048700443f62ec194a0ac6` |
| Gemeenschappelijke ancestor | `cf68b33a6ddd08fa84c059619d4db368a5de39c9` |
| Branch | `release/cp-a-production-reconstruction` |
| Release-payload HEAD vóór evidencecommit | `e5ca41e2` |
| Finale kandidaat-HEAD | HEAD van deze branch na de commit die dit manifest bevat; exact gerapporteerd bij handoff |
| Main-only commits onderzocht | 169 |
| Staging-only commits onderzocht | 38 |

## Commits

| Commit | Scope |
|---|---|
| `8df000c5` | Forward-only productieprerequisite, publication bridge, CP-A trust chain en quality repair |
| `76a65ab3` | Opaque preview, exacte preview-identiteit, immutable approval en server-side quote acceptance |
| `e5ca41e2` | Canonieke invoices/subscriptions voor admin, klant, journey en Website Factory |
| afsluitende commit | Tests, PostgreSQL-fixtures, validatiescript, rapport en manifest |

## Filesetclassificatie

| Bestanden | Reden | Contract | Afhankelijkheid |
|---|---|---|---|
| 4 bestanden onder `supabase/migrations/202607241{05,10,20,30}*` | Productieschema mist bewezen contractdelen | Canoniek schema, bridge, trust chain, quality | Bestaande customers/projects/websites/profiles/auth en `owns_customer` |
| Preview/quote Netlify-functions (4) | Server-side identiteit en decisions | ID/checksum, actor, idempotentie, trust-event | Supabase RPC en service role server-side |
| Portal/preview/offerte HTML (4) en `netlify.toml` | Veilige clientcontracten | Opaque sandbox, CSP, expliciete approval/acceptance | Geauthenticeerde endpoints |
| `_canonical-finance.js`, `client-finance-context.js` en 24 finance/runtimebestanden | Eén canonieke serverstate | `invoices`, `subscriptions`, veilige empty states | Canonieke prerequisite |
| 12 test-, fixture- en validatiebestanden | Regressie- en migratiebewijs | Security, migratie, finance en Website Factory | Lokale Node/PostgreSQL-runtime |
| 2 documentatiebestanden | Releasebewijs en hercertificatieplan | Traceerbaarheid | Geen runtimeafhankelijkheid |

De precieze fileset en diffstat zijn reproduceerbaar met `git diff --stat 0bb0ea74884652f1297d9d9a19c02108c0095688..HEAD`. Vóór de evidencecommit omvatte de functionele reconstructie 49 bestanden met 3.478 toevoegingen en 1.273 verwijderingen; de grote afname komt hoofdzakelijk door het consolideren van dubbele finance-mapping.

## Migraties en checksums

| Volgorde | Migratie | SHA-256 |
|---:|---|---|
| 1 | `20260724105000_cp_a_production_canonical_prerequisites.sql` | `692369142ece78741d1b1e2b109b4db8e1add98c431ef0216e3ca6b2f7387a3d` |
| 2 | `20260724110000_bridge_preview_publication_portal_review.sql` | `22628ef185d4f78a8dd96eefd9aee68022e2010f9f5143c7d13df0be4ea6fa50` |
| 3 | `20260724120000_cp_a_portal_trust_chain.sql` | `a418a8b05b03879f572c0ebd5862acd2ce36d3eae8e35db6aefbd5fa7c7586c2` |
| 4 | `20260724130000_repair_preview_quality_report_schema_drift.sql` | `8acaf3f1f3678f71411155b61d9111d4a559cf8ffc6ab36b19b2e47860bfab71` |

De drie historische `customer_invoices`-rijen zijn 3/3 read-only beoordeeld en blijven behouden. Datamigratie is voor deze release niet nodig en wegens ontbrekende betrouwbare relaties juist onveilig. Geen bestaande migratie is herschreven.

## Testbewijs

| Poort | Resultaat |
|---|---:|
| Main-baseline | 1.171/1.171 |
| Kandidaatgericht | 57/57 |
| Volledige suite | 1.228/1.228 |
| PostgreSQL | 10/10 |
| Semantische equivalentie | 14/14 |
| Nieuwe failures/security-/Website Factory-regressies | 0 |
| Syntax, HTML-parse, diffcontrole, secret scan | geslaagd |
| Actieve legacy-financequeries | 0 |

## Uitgesloten stagingfiles

Uitgesloten zijn alle Content Factory-bronnen en gegenereerde assets, Social Studio, P0 lead/staging-smoke evidence en implementatie, demo/Website Factory historische migraties, algemene site- en leadwijzigingen, `.env*` voorbeelden, stagingrelease-documentatie en alle tijdelijke credential/fixture-artefacten. Deze groepen horen niet bij het CP-A-contract of zijn op main door een andere productielineage afgedekt.

## Mutatie- en werktreestatus

- Branch gepusht: nee.
- PR gemaakt: nee.
- Staging gewijzigd: nee.
- Stagingdatabase gewijzigd: nee.
- Productie gewijzigd: nee.
- Productiedatabase gewijzigd: nee.
- Deploy uitgevoerd: nee.
- E-mails of betalingen: nee.
- Remote migraties: nee.
- Alleen read-only productie-inspectie: ja.
- Worktree moet bij handoff schoon zijn.
