# Partner Onboarding V1 — B6 staging readiness

Datum: 2026-07-26
Stagingbranch: `codex/partner-onboarding-v1-staging-ready`
Gedeployde commit: `915d6cef39aab8ee7ae1dc249eb8b77eec307009`
Status: **STAGING READY / PRODUCTION NO-GO**

## Stagingcertificering

- Netlify-project: `maxwebstudio-staging`.
- URL: `https://maxwebstudio-staging.netlify.app`.
- Deploy-ID: `6a66762af9e9fa28c0452ed3`; build en publicatie geslaagd in 1 minuut.
- Supabase-stagingproject: `maxwebstudio-test`, projectref `xlxpuuycigeqhgxqtzni`.
- Productieproject en productiedatabase zijn niet gewijzigd.
- Alle zes Partner Onboarding-migraties zijn transactioneel uitgevoerd en in de staginghistorie geregistreerd.
- Volledige repositorysuite: **1.437/1.437 geslaagd**.
- Gerichte governancecontrole na de live gevonden volgordefix: **8/8 geslaagd**.
- Paginaroutes `partner-onboarding.html`, `admin-partners.html` en `account-activeren.html`: HTTP 200.
- Beveiligde functies `partner-onboarding`, `account-profile` en `partner-certificate-pdf`: anoniem HTTP 401.
- Desktopweergaven van onboarding en partnerbeheer zijn visueel gecontroleerd; de fail-closed sessie- en loginstatussen zijn leesbaar en zonder overlap.

## Databasepoststate

- 17 `partner_*`-tabellen, alle met RLS ingeschakeld.
- 20 partner-RLS-policies en 25 partnerfuncties aanwezig.
- Gepubliceerde seeddata: 1 training, 1 assessment, 1 commissieplanversie en 4 vereiste documentversies.
- Vijf historische stagingrollen `sales` zijn canoniek omgezet naar `sales_partner`; geen onbekende rol- of statuswaarden zijn gevonden.
- Geen partner is door de migratie geactiveerd: `partner_profiles=0`, `partner_onboardings=0`.
- Geen betaling of commissieboeking is aangemaakt: `partner_payment_events=0`, `partner_commission_ledger_entries=0`.

## Transactionele E2E en rollback

Met bestaande testidentiteiten is binnen één database-transactie bewezen:

- uitnodiging en accountactivatie;
- alle zeven trainingsstappen en commissieacceptatie;
- onvoldoende toets (0%, geblokkeerd) en voldoende toets (100%, geslaagd);
- document- en overeenkomstacceptatie;
- certificering zonder automatische activering;
- blokkade van activering vóór certificering;
- expliciete beheeractivering en schorsing;
- blokkade van een verouderde acceptatieset na publicatie van een tijdelijke nieuwe documentversie;
- 16 immutable audit-events;
- nul payment- of ledger-events.

De transactie eindigde met `ROLLBACK`. De controle direct daarna bevestigde opnieuw nul partnerprofielen, onboardings, events, certificaten, payments en ledgerregels en vijf ongewijzigd actieve staging-salespartners.

## Verplichte migratievolgorde

1. `20260726200000_partner_profile_role_status_foundation.sql`
2. `20260726201000_partner_onboarding_gate_foundation.sql`
3. `20260726202000_partner_training_content_v1.sql`
4. `20260726203000_partner_assessment_certification.sql`
5. `20260726204000_partner_canonical_commission.sql`
6. `20260726205000_partner_certification_activation_control.sql`

De live stagingpreflight vond één constraintvolgordefout in B1. De oude rolconstraint wordt nu eerst verwijderd, daarna wordt `sales` genormaliseerd en vervolgens wordt de canonieke constraint toegevoegd. De regressietest en checksum zijn overeenkomstig bijgewerkt.

## Productieblokkades

1. De opdrachtovereenkomst blijft expliciet `legal_review_required`; er is nog geen juridisch goedgekeurde, wederzijds digitaal ondertekende overeenkomst met definitieve PDF-bytes.
2. Productie vereist een afzonderlijke projectidentiteitscontrole, snapshot, migratiepreflight, rollbackplan en expliciete goedkeuring.
3. De canonieke commissietabellen zijn bewezen zonder payout; aansluiting van een productie-payment producer/webhook valt buiten deze stagingfase.

## Releaseadvies

Staging is gereed voor interne acceptatie. **Niet mergen naar main en niet deployen naar productie** zonder de bovenstaande afzonderlijke productie- en juridische goedkeuringen.
