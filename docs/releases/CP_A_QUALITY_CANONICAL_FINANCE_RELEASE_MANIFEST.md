# CP-A quality and canonical finance release manifest

Datum: 24 juli 2026

## Identiteit

- Branch: `release/cp-a-quality-and-canonical-finance`
- Basiscommit: `5adb120833f9acf277cf1d2df9252ad46d398d95`
- Releasecommit: commit die dit manifest bevat; verifieer met `git rev-parse HEAD` en de releasehandoff.
- Target voor later: `codex/rc1-clean-migration-lineage`
- Push: nee
- PR: nee

## Release-inhoud

1. Canonieke server-side financeadapter en klantviewmodel.
2. Migratie van actieve klant-, admin-, invoice-, subscription-, order- en webhookruntime naar `invoices`, `invoice_lines` en `subscriptions`.
3. Financecontract-, IDOR- en no-side-effecttests.
4. Ongewijzigde forward-only `quality_report`-repair en contracttests.
5. Architectuur- en hervattingsrapport.

Compatibilityview: nee.
Nieuwe finance-databaseobjecten: nee.

## Quality repair

- Pad: `supabase/migrations/20260724130000_repair_preview_quality_report_schema_drift.sql`
- SHA-256: `8acaf3f1f3678f71411155b61d9111d4a559cf8ffc6ab36b19b2e47860bfab71`
- Contract: `website_preview_versions.quality_report jsonb null`, zonder default
- RLS/grants/data-backfill: geen

## Validatie

- Financecontract/IDOR: 19/19
- Gecombineerd gericht: 37/37
- Quality repair: 4/4
- PostgreSQL: compile, rijbehoud, herhaling en fail-closed geslaagd
- Volledige suite: 283/293
- Basiscommit-suite: 260/270
- Bestaande failures: 10 identieke Website Factory-failures
- Nieuwe failures: 0
- Secret scan: geen treffers
- E-mails: nee
- Betalingen/providercalls: nee

## Veiligheidsgrenzen

- Staging gewijzigd: nee
- Stagingdatabase gewijzigd: nee
- Productie gewijzigd: nee
- Productiedatabase gewijzigd: nee
- Remote migration: nee
- Deploy: nee
- Fixtures/testaccounts/credentials: ongewijzigd
- Bestaande migrations: ongewijzigd
- Legacy financeview/tabel: niet gemaakt

## Uitgesloten

- Alle overige lokale featurewijzigingen buiten de geïsoleerde worktree.
- Productiehistoriedatamigratie van de drie legacyfacturen.
- Stagingapply/deploy/acceptatie.
- E-mail- en betaaluitvoering.

De exacte fileset en diffstat worden na de releasecommit met Git geverifieerd en in de handoff gerapporteerd.

PASS_CANONICAL_CUSTOMER_FINANCE_RELEASE_READY
