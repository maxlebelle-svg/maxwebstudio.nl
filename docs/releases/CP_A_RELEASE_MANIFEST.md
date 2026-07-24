# CP-A release manifest

Datum: 2026-07-24
Releasebranch: `release/cp-a-customer-portal-trust-chain`
Basiscommit: `fd5f7a8099e4521b4e6d8ff809a6bce9aa56773e`
Releasecommit: deze ene commit op de releasebranch; de post-commit SHA staat in de overdracht. Een commit kan zijn eigen SHA cryptografisch niet in zijn eigen inhoud opnemen.
Commitbericht: `fix(customer-portal): secure preview approval and quote trust chain`

## Doel en herkomst

Deze manifest is opgebouwd vanuit de vuile bron-worktree op `codex/content-factory-v1` bij `3c116d3280eeca7b236afc16409b1d9155cf5b2a`. Alle 857 gewijzigde of nieuwe bronpaden zijn individueel geclassificeerd in `docs/releases/CP_A_WORKTREE_INVENTORY.md`: 13 CP-A-noodzakelijk en 844 uitgesloten.

De basis `fd5f7a80` is de actuele remote staging-releaselijn en exact de commit die vóór deze isolatie als stagingkandidaat bestond. De CP-A-bestanden zijn als afzonderlijke patches overgezet. Twee gemengde bestanden zijn hunk-gescheiden:

- `functions/admin-preview-publication.js`: de niet-CP-A-wijziging die `published_at` altijd opnieuw zette is uitgesloten.
- `netlify.toml`: alleen de CP-A-securityheaders voor `/preview.html` en `/preview-embed.html` zijn opgenomen; Content Factory-hunks zijn uitgesloten.

## Inbegrepen fileset

| Bestand | Herkomst | Reden | SHA-256 vóór releasecommit |
| --- | --- | --- | --- |
| `functions/admin-preview-publication.js` | CP-A-hunks uit bron-worktree | checksumgebonden approvalstatus in admin | `08150ee42766f2acb11dd2d1addf4b0e05931961e84e133064949a8f9e22d61e` |
| `functions/client-preview-render.js` | CP-A-patch | opaque-origin renderer en no-network CSP | `6b36f031c2f339e92eaba2243002892b10c458d45d3147a50cbfd2b3b7dae938` |
| `functions/client-preview-versions.js` | CP-A-patch | owner-bound, checksumgebonden previewapproval | `3ba9274f2a824aeec844d72259010ff252d553afcc3cf24d8f3c80a2be3f0421` |
| `functions/client-quote.js` | nieuw CP-A-bestand | owner-bound, versie- en checksumgebonden offerteacceptatie | `8fb853cb52b41ddef83cd4398f8f0a06c9eb70ff277c29e7adf04046a3e8d470` |
| `netlify.toml` | alleen CP-A-headerhunk | browsergrens voor preview en embed | `c31a0b05b70f45c3e35801ace07251fdd84e786e52b67b32fe2ca946f83ad7db` |
| `public/klantportaal.html` | CP-A-patch | veilige klantflow en approvalstatus | `2a0d218b08c9a3d24a8c3c5e2ded266e327632eefb80bd32a3c76c4f60c2a9e5` |
| `public/offerte.html` | CP-A-patch | servergebonden offerteacceptatie-UX | `d104fbd22db41405f96b495fe8cf918e16b7da2b5624ad84cce5b749538bed86` |
| `public/preview.html` | CP-A-patch | veilige parent-shell | `0c2e13fc092a0eaf92e09692d3b03ac4f37f9cd54e76376b6be8d24288eb8a30` |
| `public/preview-embed.html` | nieuw CP-A-bestand | geïsoleerde previewrendering | `39609f6278a721907854ed94314071f813a2b94306cc0721e8a7c656ce7d1654` |
| `supabase/migrations/20260724120000_cp_a_portal_trust_chain.sql` | nieuw CP-A-bestand; vóór eerste remote toepassing lokaal gecorrigeerd voor het bewezen Supabase-extensieschema | append-only trust chain, RLS en RPC’s | `a418a8b05b03879f572c0ebd5862acd2ce36d3eae8e35db6aefbd5fa7c7586c2` |
| `tests/cp-a-portal-trust-chain.test.js` | nieuw CP-A-bestand | gerichte security-, trust-chain- en expliciete `extensions.digest`-regressiedekking | `4ceb4177707d283d9628a601ba5931126829c23c264ea18df66bb721568f05aa` |
| `tests/fixtures/cp-a-portal-trust-chain-functional.sql` | nieuw CP-A-bestand | transactionele databasefixture | `7a47ea13dd1d26e6a37c7063a5947347a617bc9b889f9b0435dbe5a1fb664392` |
| `docs/CP_A_P0_CUSTOMER_PORTAL_TRUST_CHAIN_REMEDIATION.md` | bestaand CP-A-bewijs | implementatie- en dreigingsbewijs | `603a885445c327582495a8efe0b4e25848052e7eab44dadfdc23e69f7caf267e` |
| `docs/releases/CP_A_WORKTREE_INVENTORY.md` | gegenereerd releasebewijs | volledige 857-padclassificatie | `4a52df7f0e78847615397192d1f8bb53fdc71cdafda3fa1724959ae55b6a9264` |
| `docs/releases/CP_A_RELEASE_MANIFEST.md` | nieuw releasebewijs | deze fileset, provenance en checksums | zelfdocumenterend; geen zelfchecksum |
| `docs/CP_A_RELEASE_IDENTITY_RECOVERY.md` | nieuw releasebewijs | validatie, doelbewijs en beslissing | opgenomen in dezelfde releasecommit |

## Migratieclassificatie

Geen migratie is toegepast. De 20 ongetrackte migratiebestanden uit de bron-worktree zijn als volgt beoordeeld.

| Migratie | Classificatie | Nodig voor CP-A | Actie |
| --- | --- | ---: | --- |
| `00000000000000_authoritative_baseline.sql` | baseline/foundation | nee | uitsluiten |
| `20260721010000_harden_role_helper_search_paths.sql` | security foundation | nee | uitsluiten |
| `20260721020000_restrict_policy_helper_execute_acl.sql` | security foundation | nee | uitsluiten |
| `20260721030000_restrict_internal_helper_execute_acl.sql` | security foundation | nee | uitsluiten |
| `20260721040000_lead_intake_abuse_control.sql` | lead-intake P0; reeds aanwezig in basiscommit | nee | niet opnieuw overzetten |
| `20260722120000_p0_reconcile_business_events.sql` | P0-reconciliatie | nee | uitsluiten |
| `20260722121000_p0_reconcile_transactional_lead_intake.sql` | P0-reconciliatie | nee | uitsluiten |
| `20260722122000_p0_reconcile_security_hardening.sql` | P0-reconciliatie | nee | uitsluiten |
| `20260722123000_p0_reconcile_lead_intake_abuse_control.sql` | P0-reconciliatie | nee | uitsluiten |
| `20260722124000_p0_harden_sales_manager_lead_policy.sql` | sales-policy P0 | nee | uitsluiten |
| `20260722125000_p0_correct_production_poststate.sql` | productie-poststate P0 | nee | uitsluiten |
| `20260722126000_p0_correct_production_leads_policies.sql` | productie-policy P0 | nee | uitsluiten |
| `20260722130000_p0_recover_business_events.sql` | P0-recovery | nee | uitsluiten |
| `20260722131000_p0_recover_transactional_lead_intake.sql` | P0-recovery | nee | uitsluiten |
| `20260722132000_p0_recover_security_hardening.sql` | P0-recovery | nee | uitsluiten |
| `20260722133000_p0_recover_lead_intake_abuse_control.sql` | P0-recovery | nee | uitsluiten |
| `20260722134000_p0_remove_verified_staging_smoke_objects.sql` | P0-staging cleanup | nee | uitsluiten |
| `20260722135000_p0_recover_sales_manager_lead_policy.sql` | P0-recovery | nee | uitsluiten |
| `20260722136000_p0_email_logs_additive_compatibility.sql` | e-mailcompatibiliteit P0 | nee | uitsluiten |
| `20260724120000_cp_a_portal_trust_chain.sql` | CP-A trust chain | ja | opnemen |

De CP-A-versie kwam niet voor in de basisboom; er is dus geen dubbele migratie-identiteit. De migratie compileerde zelfstandig tegen de vereiste bestaande contracten en de transactionele fixture slaagde. Geen van de overige 19 bronmigraties is een CP-A-afhankelijkheid.

Voor de eerste remote toepassing bewees een stagingpoging een volledig teruggerolde schemaresolutiefout: Supabase installeert `pgcrypto` in `extensions`, niet in `public`. Read-only catalogusbewijs bevestigde daarna dat versie `20260724120000` en alle CP-A-objecten zowel op staging als productie afwezig waren. Daarom is dezelfde nog nergens toegepaste migratie minimaal gecorrigeerd van `public.digest` naar `extensions.digest`. Oude checksum: `757d304cd9200baf438e0968f00508cfbecb56648aeefcd5486516734c007a84`; nieuwe checksum: `a418a8b05b03879f572c0ebd5862acd2ce36d3eae8e35db6aefbd5fa7c7586c2`.

## Release- en doelbewijs

| Omgeving | Netlify project | Site ID | Host | Productiebranch | Supabase project | Projectref |
| --- | --- | --- | --- | --- | --- | --- |
| staging | `maxwebstudio-staging` | `67b2b8af-83fc-4c61-9cd8-2f78842b7615` | `maxwebstudio-staging.netlify.app` | `codex/rc1-clean-migration-lineage` | `maxwebstudio-test` | `xlxpuuycigeqhgxqtzni` |
| productie | `maxwebstudionl` | `5507913e-64a7-4b1f-b469-45e9c123cbc3` | `maxwebstudio.nl` | `main` | `maxwebstudio` | `yxxahurphdbblkuxoeje` |

Netlify staging toont `SUPABASE_PROJECT_ID=xlxpuuycigeqhgxqtzni` voor de productie-deploycontext van die staging-site. Alleen deze niet-geheime referentie is onthuld en daarna weer verborgen. Geen secretwaarde is gelezen of vastgelegd.

De releasebranch is lokaal en is niet gepusht. Netlify volgt een andere branch. Er is geen deploy, remote migration of omgevingswijziging uitgevoerd.
