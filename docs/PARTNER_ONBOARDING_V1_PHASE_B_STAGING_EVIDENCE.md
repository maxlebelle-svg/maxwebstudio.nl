# Partner Onboarding V1 — Phase B staging evidence

## Terminal status

`PASS_PARTNER_ONBOARDING_V1_PHASE_B_STAGING_READY`

Vastgelegd op 2026-07-26 (Europe/Amsterdam). Productie is niet gewijzigd.

## Kandidaat en deploy

- Integratiebasis: stagingcommit `c4b69f05c92f91a61123de660a484621dd5ae511`.
- Stagingbranch: `codex/partner-onboarding-v1-staging-ready`.
- Gedeployde commit: `915d6cef39aab8ee7ae1dc249eb8b77eec307009`.
- Netlify-project: `maxwebstudio-staging`.
- Deploy-ID: `6a66762af9e9fa28c0452ed3`.
- Staging-URL: `https://maxwebstudio-staging.netlify.app`.
- Supabase-project: `maxwebstudio-test`, ref `xlxpuuycigeqhgxqtzni`.
- De eerdere HTTP 401 op de lokale Supabasepreflight kwam door verouderde lokale sleutels. De bestaande geauthenticeerde CLI-sessie en het dashboard bevestigden daarna dezelfde stagingprojectref.

De stagingbranch is opgebouwd door de acht bestaande Partner Onboarding-commits op de actuele stagingbasis te integreren. Er is geen nieuwe parallelle implementatie gebouwd en er is niet naar `main` gemerged.

## Migratiechecksums

| Migratie | Bytes | SHA-256 |
|---|---:|---|
| `20260726200000_partner_profile_role_status_foundation.sql` | 7.924 | `049f511b70b440733e0f5f00bb0b7fb5b2c184e9eb0fd8ff8fd637dc84d1fbb3` |
| `20260726201000_partner_onboarding_gate_foundation.sql` | 24.684 | `9d40311b0b524f4a5d7a991f7ca1797aecefcfbcc1210fabf1ff724d5a760142` |
| `20260726202000_partner_training_content_v1.sql` | 15.440 | `93cd4659e12125b888236f35b3aba2fe3536e39a1ca8bc23c1c16184aeffaf35` |
| `20260726203000_partner_assessment_certification.sql` | 23.997 | `bbc41f47e566027bdcc5260c5e3b0e79433fca857437901f7383bf24f7f14af6` |
| `20260726204000_partner_canonical_commission.sql` | 32.605 | `875ca6e6e4d7610a8d6d11f5d00b764019c3b20c5dec815c5459633299ceb79b` |
| `20260726205000_partner_certification_activation_control.sql` | 15.881 | `173a28ec8c4049184bf55467fb718e7f7afcb6f94800f56794e8003b65a25caf` |

Alle versies zijn uniek ten opzichte van de actuele staginglijn, staan in het productmigratiemanifest en zijn remote als toegepast geregistreerd.

## Before/after-databasebewijs

Preflight vóór writes:

- 33 profielen; 0 onbekende rollen en 0 onbekende statussen.
- Vereiste tabellen `profiles`, `leads`, `quotes`, `invoices` en `invoice_lines` aanwezig.
- `leads.assigned_user_id` aanwezig.
- 5 legacy `sales`-rollen; 4 leads en 0 invoices.
- Geen bestaande `partner_*`-tabellen.

Poststate:

- 17 partnertabellen, geen enkele zonder RLS.
- 20 partnerpolicies en 25 partnerfuncties.
- Gepubliceerd: 1 training, 1 assessment, 1 commissieplanversie en 4 documentversies.
- 0 legacy `sales`; 5 canonieke `sales_partner`.
- 0 partnerprofielen/onboardings en dus geen impliciete activering.
- 0 payment-events en 0 ledgerregels.

De eerste B1-poging faalde binnen de transactiewrapper op de oude rolconstraint en werd volledig teruggerold. De constraintvervanging is daarna correct geordend, regressiegetest, opnieuw gechecksummed en succesvol toegepast.

## Validatiebewijs

| Controle | Uitkomst |
|---|---|
| Volledige repositorysuite | PASS — 1.437/1.437 |
| Gerichte migratie-/governancetests na live fix | PASS — 8/8 |
| Diffcontrole | PASS — geen whitespacefouten |
| Stagingdeploy | PASS — 114 functies, 539 bestanden, 18 redirects en 18 headers zonder deployfout |
| Publieke partnerpagina's | PASS — drie relevante routes HTTP 200 |
| Anonieme functietoegang | PASS — drie beveiligde functies HTTP 401 |
| Database/RLS-poststate | PASS — alle partnertabellen met RLS |
| Transactionele E2E | PASS — fail/pass, certificering, beheeractivering, schorsing en heracceptatiegate |
| E2E-rollback | PASS — alle tijdelijke fixturedata weer 0 |
| PDF-structuur/render/tekst | PASS — PDF 1.4, één A4-landscapepagina, geen overlap of afkapping |
| Visuele stagingcontrole | PASS — onboarding en fail-closed beheerlogin leesbaar zonder layoutproblemen |

E2E-resultaat: score 0 faalde, score 100 slaagde, activering vóór certificering werd geblokkeerd, certificaat werd gemaakt, beheeractivering en schorsing werkten, een verouderde documentacceptatieset werd geblokkeerd en 16 audit-events ontstonden. De proef draaide zonder echte e-mail, betaling, payout, webhook of externe provider en eindigde met rollback.

## Governancebesluiten

- Operationele partnergate blijft fail-closed via de server-side accountprofiel-/partnergate en de centrale admin-authbridge.
- Certificering en activering zijn afzonderlijke servertransities; alleen een actieve admin/super-admin kan activeren of schorsen.
- Iedere nieuwe gepubliceerde verplichte documentversie maakt de eerdere acceptatieset onvoldoende.
- Canonieke commissie gebruikt uitsluitend de nieuwe immutable payment-/ledgerbron; deze stagingfase activeert geen payment producer of payout.
- De zes migraties zijn als één checksummed productrelease gecatalogiseerd.
- `admin-partners.html` is bewust als standalone beheerpagina geclassificeerd.

## Rollback en beperkingen

- Deployrollback: publiceer in het stagingproject opnieuw de vorige bewezen deploy `6a665e74582ba1000890900a` op commit `c4b69f0`.
- Databaserollback is niet destructief geautomatiseerd. Bij een stagingterugzetting eerst impact/snapshot beoordelen en daarna een afzonderlijke compensatiemigratie gebruiken; migratiehistorie niet los van schema repareren.
- De bestaande remote/lokale migratiehistorie bevat oudere drift buiten Partner Onboarding. Daarom zijn uitsluitend de zes afgebakende Partner Onboarding-transacties uitgevoerd en geregistreerd; overige migraties zijn niet toegepast of gerepareerd.
- De overeenkomst blijft `legal_review_required`; definitieve digitale wederzijdse ondertekening is een afzonderlijk juridisch/releaseonderdeel.
- Geen productie-deploy, productiemigratie, echte e-mail, betaling of provideractie is uitgevoerd.

## Productieplan

Productie blijft NO-GO. Vereist zijn afzonderlijke expliciete goedkeuring, productieprojectidentiteit, before-snapshot, unieke migratiepreflight, juridische goedkeuring van de overeenkomst, gecontroleerde deploy, authenticated smoke en een beoordeeld compensatieplan. Tot die tijd niet mergen naar `main` en niet naar productie deployen.
