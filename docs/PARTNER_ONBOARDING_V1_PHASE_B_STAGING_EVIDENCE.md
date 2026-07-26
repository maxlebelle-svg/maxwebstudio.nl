# Partner Onboarding V1 — Phase B staging evidence

## Terminal status

`STOPPED_PARTNER_ONBOARDING_V1_PHASE_B_STAGING_ACCESS_AND_DEPLOY_UNAVAILABLE`

Vastgelegd op 2026-07-26 (Europe/Amsterdam). Productie is niet gewijzigd.

## Kandidaat

- Branch: `codex/partner-onboarding-v1`
- Remote: `origin/codex/partner-onboarding-v1`
- Implementatie-anker: `531b6a5de57493668d66eb0c0f049c328084f15f`
- Basis vóór Partner Onboarding V1: `3160b2df`
- Omvang kandidaat: 41 bestanden, 3.770 toevoegingen en 14 verwijderingen

Commits in uitvoeringsvolgorde:

1. `472c7988` — canonieke partnerrol en statusfundering
2. `2136d195` — server-side onboardinggate
3. `1ab44c4c` — versieerbare training en wizard
4. `ff15ea96` — assessment en certificering
5. `d6e2fbe1` — canoniek commissiemodel
6. `9fd2f3d1` — oorspronkelijke staging NO-GO
7. `531b6a5d` — certificering losgekoppeld van activering, beheercontrole en PDF

## Opgeleverde functionele scope

- Eén canonieke rol `partner` en afzonderlijke onboarding-/toegangsstatussen.
- Server-side gate die actuele documentacceptatie, geldig certificaat en actieve partnerstatus vereist.
- Versiebeheerde Nederlandstalige training, onboardingwizard en assessment met fail/pass-paden.
- Certificering die uitsluitend `certified` oplevert; alleen een bevoegde beheerder kan daarna activeren of schorsen.
- Persoonlijk PDF-certificaat met uniek ID, versies, ondertekenaar, verificatiepad en disclaimer.
- Versiebeheerde opdrachtovereenkomst; iedere nieuw gepubliceerde verplichte versie vereist exacte heracceptatie.
- Canonieke commissiebron met auditbare statussen; geen payout- of providerkoppeling geactiveerd.
- Beheerinterface voor status, recente auditgebeurtenis, activeren en schorsen.

Zie de [rol- en statusmatrix](./PARTNER_ONBOARDING_V1_PHASE_B_STATUS_MATRIX.md) en het [canonieke financiële model](./PARTNER_FINANCE_CANONICAL_MODEL.md).

## Migratiechecksums

| Migratie | SHA-256 |
|---|---|
| `20260726110000_partner_profile_role_status_foundation.sql` | `f403a6cf141ac7a9c236987adf7f9107b39600b10c69264a9f23c747279250aa` |
| `20260726120000_partner_onboarding_gate_foundation.sql` | `c89539f3c55a8590731e719f87dc60f6652d6ffcb1e9c3362333b478d6311eaf` |
| `20260726130000_partner_training_content_v1.sql` | `e55f4a383b857f4105ec818c60ae9b9dc4e0f1598add55a8160798a0f8a577e0` |
| `20260726140000_partner_assessment_certification.sql` | `cdd1bd61a28cf03473a5e1709e67744f5cfe130011222633aea168344f860e4f` |
| `20260726150000_partner_canonical_commission.sql` | `957f7e21d50aaec44f6c5f6d5f47b4b3ca4ed2d54fe711476363884ea88283ac` |
| `20260726160000_partner_certification_activation_control.sql` | `23c20e5a76ed2b05990c9c125c638535e2d03e9b5918355fc2357bec201a1fdf` |

## Lokale verificatie

| Controle | Uitkomst |
|---|---|
| Gerichte partner-, gate-, assessment-, commissie-, PDF- en releasecontroles | PASS — 48/48 |
| Volledige repositorysuite | 477/484 PASS; 7 bestaande exact-match governancecontroles falen op historisch bevroren migratielijsten/statuswaarden |
| Nieuwe partnercontroles binnen volledige suite | PASS |
| Diffcontrole | PASS — geen whitespacefouten in de kandidaat |
| PDF-structuur | PASS — PDF 1.4, één A4-landscapepagina, geen JavaScript |
| PDF-rendercontrole | PASS — lokaal gerenderd en visueel gecontroleerd zonder overlap of afkapping |
| PDF-tekstcontrole | PASS — persoonsgegevens met Nederlandse tekens, ID, versies, ondertekenaar, verificatie-URL en disclaimer uitleesbaar |

De zeven volledige-suitefouten zijn geen door deze partnerflow veroorzaakte runtimefouten. Ze verwachten onder andere dat geen latere migraties bestaan en vergelijken daardoor bewust met oudere, exacte migratielijsten. Zij moeten in een afzonderlijk governancebesluit worden geactualiseerd; deze fase overschrijft ze niet stilzwijgend.

## Stagingbewijs en blokkade

- De kandidaatbranch is succesvol naar GitHub gepusht.
- De ingestelde stagingbasis is `https://maxwebstudio-staging.netlify.app`.
- De nieuwe certificaatfunctie antwoordde daar na de push met HTTP 404.
- De waarschijnlijke Netlify-branchdeploy-URL antwoordde eveneens met HTTP 404.
- De partner-onboardingpagina antwoordde op de ingestelde stagingbasis met HTTP 404.
- In de lokale stagingconfiguratie ontbreken `NETLIFY_SITE_ID` en `NETLIFY_AUTH_TOKEN`; de Netlify CLI is niet beschikbaar.
- Een read-only verzoek naar de geconfigureerde Supabase PostgREST/OpenAPI-interface antwoordde met HTTP 401.
- Er is geen bruikbare lokale PostgreSQL- of containerdatabase aangetroffen.

Daarom zijn migratie-apply, RLS-bevestiging, audit-integriteit, authenticated end-to-end-validatie en rollbackproef niet uitgevoerd. De gate blijft fail-closed en er zijn geen echte mails, betalingen of externe provideracties uitgevoerd.

## Verplichte hervattingsstappen

1. Herstel of verstrek geldige, uitsluitend voor staging bedoelde Supabase-toegang en bevestig de projectidentiteit read-only.
2. Koppel de featurebranch aantoonbaar aan een Netlify branchdeploy, of verstrek de staging-site-ID en een begrensde deploymogelijkheid.
3. Maak vóór iedere write een schema-, historie-, RLS-, functie- en grant-snapshot.
4. Controleer alle zes checksums en voer uitsluitend de unapplied migraties `1100` t/m `1600` in volgorde op staging uit.
5. Verifieer tabellen, constraints, RPC-grants, RLS en audit-events tegen de statusmatrix.
6. Voer authenticated E2E uit met aparte partner- en beheeraccounts: uitnodiging, actuele acceptatie, training, fail/pass-assessment, certificaat-PDF, beheeractivering, servergate, schorsing en heracceptatie na een nieuwe documentversie.
7. Controleer de commissiebron read-only en bewijs dat geen payout of providercall plaatsvindt.
8. Voer een gecontroleerde rollbackproef op staging uit en leg before/after-bewijs vast.
9. Pas daarna mag de terminale status naar `PASS_PARTNER_ONBOARDING_V1_PHASE_B_STAGING_READY` wijzigen. Productie blijft apart goedkeuringsplichtig.

## Rollback

Op dit moment is er niets op staging toegepast; rollback betekent daarom uitsluitend de kandidaatbranch niet promoveren en een eventuele branchdeploy verwijderen of terugzetten naar de vorige stagingbuild. Als de database later wel wordt gewijzigd, is automatische destructieve rollback niet toegestaan: eerst snapshot en impactcontrole, vervolgens een afzonderlijk beoordeelde compensatiemigratie. Tot die validatie blijft toegang standaard geblokkeerd.

## Bekende beperkingen

- SQL-syntaxis en gedrag zijn statisch getest maar nog niet tegen de echte stagingdatabase uitgevoerd.
- Authenticated UI- en RLS-paden zijn nog niet met echte stagingidentiteiten bewezen.
- De overeenkomst is technisch versieerbaar en als concept gemarkeerd; juridische eindredactie blijft vereist.
- Het certificaat is lokaal visueel bewezen, maar nog niet via de gedeployde authenticated functie opgehaald.
- Geen productie-deploy, productiemigratie, echte e-mail, betaling of externe provideractie is onderdeel van deze kandidaat.
