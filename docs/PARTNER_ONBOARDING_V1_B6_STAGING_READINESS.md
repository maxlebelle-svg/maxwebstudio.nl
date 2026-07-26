# Partner Onboarding V1 — B6 staging readiness

Datum: 2026-07-26  
Branch: `codex/partner-onboarding-v1`  
Status: **NO-GO / STAGING CERTIFICATION NOT COMPLETED**

## Checkpoints

| Checkpoint | Commit | Resultaat |
| --- | --- | --- |
| B1 canonieke rollen/statussen | `472c7988` | lokaal gericht groen |
| B2 server-side onboardinggate | `2136d195` | lokaal gericht groen |
| B3 wizard en trainingsinhoud | `1ab44c4c` | lokaal gericht groen |
| B4 toets en certificering | `ff15ea96` | lokaal gericht groen |
| B5 canonieke commissie | `d6e2fbe1` | lokaal gericht groen |

## Lokale verificatie

- Gerichte partner-, P0- en leadregressies: **39/39 geslaagd** vóór het B5-checkpoint.
- Volledige repositorysuite: **468/475 geslaagd; 7 mislukt**.
- De zeven failures komen uit bestaande Foundation/Release-Readiness-governancechecks. Ze verwachten verouderde fasestatussen of een oudere exacte migratieset en signaleren onder meer de al aanwezige ongecatalogiseerde `20260722120000_p0_reconcile_business_events.sql`.
- Server- en browser-JavaScript van de nieuwe modules passeert `node --check`.
- `git diff --check` is schoon voor de checkpointbestanden.
- Lokale PostgreSQL-status: geen database op `/tmp:5432`; daardoor zijn de vijf nieuwe migraties niet werkelijk toegepast.
- Geen echte e-mail, uitnodiging, betaling, refund, webhook of externe ondertekenprovider is aangeroepen.
- Geen staging- of productiedeployment is uitgevoerd.

## Verplichte migratievolgorde

1. `20260726110000_partner_profile_role_status_foundation.sql`
2. `20260726120000_partner_onboarding_gate_foundation.sql`
3. `20260726130000_partner_training_content_v1.sql`
4. `20260726140000_partner_assessment_certification.sql`
5. `20260726150000_partner_canonical_commission.sql`

Alle vijf zijn forward-only en transactioneel. Toepassen vereist een geïsoleerde stagingdatabase, databasepreflight, rollback door transactiefalen, RLS-rolsmokes en testfixtures zonder echte personen of betalingen.

## Openstaande releaseblokkades

1. De migraties en RLS-policies zijn nog niet op een disposable of stagingdatabase uitgevoerd.
2. De zeven bestaande governance-tests zijn niet groen en mogen niet stilzwijgend worden herschreven.
3. De bestaande Mollieflow schrijft `customer_invoices`. B5 weigert die legacybron terecht; een gevalideerde canonieke `invoices`-payment producer/webhook moet vóór commissieproductie worden aangesloten.
4. De browserbinding voor echte desktop/mobiele visuele smoke was in deze sessie niet beschikbaar.
5. De documentbevestiging is bewust géén digitaal ondertekende opdrachtovereenkomst. Juridische templateversies, herauthenticatie/OTP, wederzijdse ondertekening, immutable agreement snapshot, private PDF, SHA-256 van de definitieve bytes en beveiligde download/e-mailkopie zijn nog niet gebouwd of gecertificeerd.
6. Een volledige end-to-end stagingflow met testpartner, onvoldoende/voldoende toets, activatie, intrekking, betaalde canonieke factuur, dubbele webhook en refund/chargeback ontbreekt nog.

## Releaseadvies

**Niet mergen naar main en niet deployen naar productie.** De featurebranch is geschikt voor database- en securityreview, maar niet voor release. Hervat B6 pas met expliciete stagingtoegang of een disposable lokale Supabaseomgeving en een afzonderlijk besluit over de contract-/ondertekenmodule en de canonieke financecutover.
