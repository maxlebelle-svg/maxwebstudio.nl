# Max Webstudio Production Deployment Bundle

Status: voorbereiding. Deze bundle voert niets uit.

Doel: één centrale routekaart voor het opbouwen van een Supabase testomgeving en later productie.

## Deployment volgorde

| Stap | Doel | Afhankelijkheden | Rollback |
| --- | --- | --- | --- |
| 1. Schema | Canonical tabellen aanmaken | `supabase/schema.sql`, `docs/SUPABASE_CANONICAL_SCHEMA.md` | database backup/restore of testproject reset |
| 2. Canonical patches | Extra velden harmoniseren | `docs/SUPABASE_PATCH_PLAN.md` | alleen via backup; geen losse rollback SQL |
| 3. Auth | Supabase Auth en profiles voorbereiden | `docs/AUTH.md`, `docs/AUTH_CLAIMS_STRATEGY.md` | Auth-config terugzetten, testusers verwijderen |
| 4. Profiles | Rollen, profile/customer-koppeling | schema + Auth | backup terugzetten, testprofiles verwijderen |
| 5. Testdata | Synthetische testrecords | `docs/RLS_TEST_DATA_PLAN.md` | testproject resetten |
| 6. RLS | Policies testen, niet blind live zetten | `docs/RLS_DRY_RUN_PLAN.md`, `docs/supabase-rls-canonical-draft.sql` | backup/restore, policies handmatig reviewen |
| 7. Storage | Private buckets voorbereiden | `04_STORAGE.md`, bestaande storage docs | bucket/policies handmatig terugdraaien na backup |
| 8. Functions | Netlify Functions controleren | `05_FUNCTIONS.md` | deploy rollback in Netlify/Git |
| 9. Mollie | Betaalconfig testen | `06_MOLLIE.md`, testmodus | Mollie keys/webhooks terugzetten |
| 10. Resend | E-mailconfig testen | `07_RESEND.md` | env vars/templates terugzetten |
| 11. Monitoring | Logs, alerts en health checks | `08_POST_DEPLOY_CHECKS.md` | alerts uitschakelen |
| 12. Productiechecks | Preflight en Go/No-Go | `PRODUCTION_CHECKLIST.md` | No-Go als iets ontbreekt |
| 13. Live | Productie openzetten | alle vorige stappen pass | rollbackplan uitvoeren |

## Harde regels

- Geen SQL uitvoeren vanuit Codex.
- Geen productie-RLS zonder testlog.
- Geen legacy `customer_*` tabellen voor nieuwe productiefeatures.
- Geen service role key in frontend.
- Geen Go zonder backup, rollbackplan en preflight.

## Belangrijkste referenties

- `docs/SUPABASE_SQL_INDEX.md`
- `docs/SUPABASE_EXECUTION_PLAN.md`
- `docs/RLS_PREFLIGHT_CHECKLIST.md`
- `docs/RLS_TEST_LOG_TEMPLATE.md`
- `docs/deployment/ROLLBACK_PLAN.md`
