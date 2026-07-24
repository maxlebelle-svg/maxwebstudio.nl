# CP-A release identity recovery

Datum: 2026-07-24
Werkmap: `/private/tmp/maxwebstudio-cp-a-release-identity`
Releasebranch: `release/cp-a-customer-portal-trust-chain`

## Uitkomst

CP-A is geïsoleerd op een schone, traceerbare release-identiteit vanaf basiscommit `fd5f7a8099e4521b4e6d8ff809a6bce9aa56773e`. De bron-worktree zelf is niet opgeschoond, gestasht, gereset of gewijzigd voor niet-CP-A-bestanden. Er is geen deploy uitgevoerd en geen remote database geraakt.

## Inventaris en fileset

- Volledige broninventaris: 857 paden.
- CP-A-noodzakelijk: 13 paden.
- Uitgesloten: 844 paden.
- Releasebewijs toegevoegd: 3 documenten (volledige inventaris, manifest en dit herstelrapport).
- Totaal in de ene releasecommit: 16 bestanden.
- Bestaande ongetrackte audit `docs/CUSTOMER_PORTAL_ULTIMATE_EXPERIENCE_AUDIT_V1.md` is geen runtime- of testafhankelijkheid en blijft uitgesloten.
- Alle Website Factory-, Content Factory-, foundation-, P0-recovery-, gegenereerde en tijdelijke bronbestanden blijven uitgesloten.

Het exacte bestand-voor-bestandbewijs staat in `docs/releases/CP_A_WORKTREE_INVENTORY.md`; de opgenomen hashes en provenance staan in `docs/releases/CP_A_RELEASE_MANIFEST.md`.

## Basis- en patchbeslissing

`fd5f7a80` is gekozen omdat dit de actuele remote staging-releaselijn `origin/codex/rc1-clean-migration-lineage` was en de bestaande stagingkandidaat vertegenwoordigt. Elf CP-A-bronbestanden waren bytegelijk overdraagbaar. De twee gemengde bestanden zijn selectief gepatcht:

1. `functions/admin-preview-publication.js`: alleen approval/checksum-hunks; de onafhankelijke wijziging `published_at: now` is niet opgenomen.
2. `netlify.toml`: alleen de twee CP-A-securityheaderblokken; Content Factory-configuratie is niet opgenomen.

## Migraties

Alle 20 bronmigraties zijn afzonderlijk geclassificeerd. Alleen `20260724120000_cp_a_portal_trust_chain.sql` hoort bij CP-A. De 19 andere migraties zijn foundation/P0/lead-intake/e-mailwerk of zijn al in de basis aanwezig. De CP-A-migratieversie bestond niet in de basisboom.

- CP-A-migratiechecksum: `757d304cd9200baf438e0968f00508cfbecb56648aeefcd5486516734c007a84`.
- Verwachte checksum: gelijk.
- Remote toegepast: nee.
- Productie toegepast: nee.
- Staging toegepast: nee.

## Validatie

| Gate | Release-worktree | Basis-nulmeting | Beoordeling |
| --- | ---: | ---: | --- |
| JavaScript syntax, gewijzigde Functions | 4/4 | n.v.t. | PASS |
| Gerichte CP-A-tests | 5/5 | n.v.t. | PASS |
| Brede portal/preview/customer-regressieset | 76/76 | n.v.t. | PASS |
| Volledige getrackte suite | 251/261 | 246/256 | 5 nieuwe CP-A-tests geslaagd; exact dezelfde 10 bestaande failures |
| PostgreSQL compile | PASS | n.v.t. | 3 tabellen, 3 RPC’s, policies en grants aangemaakt |
| Transactionele SQL-fixture | PASS | n.v.t. | owner/conflict/idempotency/immutability/exact-één-event; rollback |
| Migratiechecksum | PASS | n.v.t. | exact verwacht |
| `git diff --check` | PASS | n.v.t. | geen whitespacefouten |

De 10 volledige-suitefailures zijn byte-identiek in aantal en naam aan de basis-nulmeting:

1. `read phases remain sequential and emit one safe started/completed pair`
2. `successful retry reuses one build, one preview, one checksum and one event`
3. `generate_preview retry without previewUrl preserves the promoted journey URL`
4. `changed input creates version 2 while a failed version 3 promotion preserves it`
5. `concurrent identical builds converge on one build and one active preview`
6. `generate_preview does not publish changed briefing when promotion fails`
7. `backend reserves by fingerprint, persists checksum before promotion and uses the RPC response`
8. `canonical JSON and package checksums ignore object key order`
9. `identical logical requests have one fingerprint and changed output input does not`
10. `secrets and transport-only retry data never enter the fingerprint`

Deze failures horen bij reeds bestaande Website Factory/testlijn-mismatches in basis `fd5f7a80`; de CP-A-release voegt vijf geslaagde tests en nul failures toe.

## Read-only doelbewijs

| Omgeving | Netlify | Branch | Supabase |
| --- | --- | --- | --- |
| staging | `maxwebstudio-staging`, site ID `67b2b8af-83fc-4c61-9cd8-2f78842b7615`, `maxwebstudio-staging.netlify.app` | `codex/rc1-clean-migration-lineage` | `maxwebstudio-test`, `xlxpuuycigeqhgxqtzni` |
| productie | `maxwebstudionl`, site ID `5507913e-64a7-4b1f-b469-45e9c123cbc3`, `maxwebstudio.nl` | `main` | `maxwebstudio`, `yxxahurphdbblkuxoeje` |

Staging Netlify bevestigt bovendien de niet-geheime variabele `SUPABASE_PROJECT_ID=xlxpuuycigeqhgxqtzni`. Secrets zijn niet onthuld, gelogd of gedocumenteerd. De lokale releasebranch wijkt af van beide ingestelde Netlify-productiebranches en kan zonder push of branchwijziging niets deployen.

## Veiligheidsverklaring

- Deploy uitgevoerd: nee.
- Remote migration uitgevoerd: nee.
- Stagingaccounts aangemaakt: nee.
- E-mail verzonden: nee.
- Productie gewijzigd: nee.
- Productiedatabase gewijzigd: nee.
- Staging gewijzigd: nee.
- Secrets getoond of vastgelegd: nee.

De releasecommit wordt als één commit gemaakt met bericht `fix(customer-portal): secure preview approval and quote trust chain`. De letterlijke SHA kan niet in de inhoud van diezelfde commit worden ingebed; de branch-tip is de canonieke zelfreferentie en de post-commit SHA wordt in de overdracht gerapporteerd.

PASS_CP_A_RELEASE_IDENTITY_READY
