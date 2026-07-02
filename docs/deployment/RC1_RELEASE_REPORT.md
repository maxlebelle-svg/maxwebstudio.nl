# RC1 Release Report

Status: `RC1 CANDIDATE / AWAITING FINAL MANUAL VALIDATION`

Datum: 2026-07-02

Dit rapport vat samen waar Max Webstudio staat na de overgang van infrastructuur naar product. Het is geen checklist en voert niets uit. Het geeft de productstatus, bewuste beperkingen en resterende risico's voor RC1.

## Samenvatting

Max Webstudio is technisch en productmatig klaar als release candidate voor de eerste echte klantreis. De publieke website, productie-authenticatie, klantportaalbasis, admin-onboarding, salesflow, offerte-ervaring, factuurervaring en Mollie-testvoorbereiding zijn aanwezig.

RC1 is nog geen definitieve release zolang de laatste handmatige klantreis en Mollie-testbetaling niet groen zijn.

## Wat Is Gebouwd

| Gebied | Status | Omschrijving |
| --- | --- | --- |
| Publieke website | PASS | Website, demo's, contactflow, cookieconsent, privacy/cookiebeleid en analytics consent-layer. |
| Productie database | PASS | Minimale klantportaal-baseline met RLS, policies, indexes en legacy cleanup. |
| Productie login | PASS | Supabase Auth werkt voor productie-login; klantportaal blijft dicht zonder sessie. |
| Klantportaal | PASS | Dashboard, mijn website, wijzigingen, berichten, offertes/facturen, notificaties en Max AI-placeholderlaag. |
| Adminportaal | PASS | Dagelijks dashboard, sales pipeline, klant-aanmaak wizard en provisioningflow. |
| Salesflow | PASS | Lead -> offerte -> akkoord -> klant aanmaken is voorbereid. |
| Offertes | PASS | Professionele offertepagina en akkoordervaring zijn aanwezig. |
| Facturen | PASS | Professionele factuurpagina, printbare ervaring en factuurmail/link zijn aanwezig. |
| Resend | PASS / VERIFY INBOX | Server-side mailflow is voorbereid; inbox-evidence blijft gewenst voor RC1. |
| Mollie | PREFLIGHT PASS | Testmodus wordt afgedwongen; handmatige testbetaling moet nog worden afgerond. |

## Bewust Uitgesteld

- Live Mollie betalingen.
- Automatische incasso en SEPA-mandaten.
- Abonnementen live.
- PDF-generatie backend.
- Volledige sales portal.
- VoIP.
- OpenAI/Max AI echte calls.
- Leadfinder AI-automatisering.
- Storage uploads voor klanten.
- Brede finance/CRM/AI-platformtabellen buiten de minimale productiebaseline.

## Bekende Beperkingen

- RC1 vereist nog een handmatige end-to-end klantreis met een geldig test/klantaccount.
- Mollie is alleen veilig voorbereid in testmodus; betaalstatus `paid` moet nog met een testbetaling worden bewezen.
- Backupstrategie is voor RC1 contextueel beperkt omdat er nog geen bedrijfskritische klantdata in productie hoort te staan.
- Resend-mail kan pas volledig als RC1-evidence gelden na inboxcontrole met een veilige testmail.
- Sommige admin- en klantportaalonderdelen blijven MVP en worden later verder verfijnd.

## Open Risico's

| Risico | Impact | Mitigatie |
| --- | --- | --- |
| Mollie webhook verwerkt testbetaling niet naar `paid` | Factuurstatus blijft handmatig of open | Testbetaling uitvoeren en webhook/fallback evidence vastleggen. |
| Resend-mail komt niet aan of link is fout | Klantactivatie hapert | Testmail naar intern adres en linkcontrole uitvoeren. |
| Eerste klantreis bevat UX-frictie | Klant heeft uitleg nodig | RC1 final validation checklist doorlopen en kleine blockers fixen. |
| Backup/restore nog niet productievolwassen | Herstel is beperkt bij echte klantdata | Voor eerste betalende klanten backupstrategie of betaald Supabase-plan verplicht maken. |

## Klaar Voor Eerste Klanten?

Status: `CONDITIONAL YES`

Max Webstudio is klaar om de eerste klant gecontroleerd door de flow te halen wanneer deze punten groen zijn:

- RC1 final customer journey: PASS.
- Mollie testbetaling: PASS, of bewust niet van toepassing voor de eerste klant.
- Resend inbox verification: PASS of handmatige uitnodiging als tijdelijke fallback.
- Geen klantdata zichtbaar zonder sessie: PASS.
- Owner approval op backup/rollback-context: PASS.

## Aanbevelingen Voor RC2

1. Maak factuur- en offerte-evidence sterker met PDF/download of nette printflow.
2. Voeg compacte admin-overzichten toe voor open offertes, open facturen en opvolgacties.
3. Maak de customer journey meetbaar met veilige eventlogging zonder extra trackingrisico.
4. Rond backup/restore governance af voordat er meerdere betalende klanten actief zijn.
5. Bouw pas daarna verder aan Sales Portal, Leadfinder AI, VoIP en echte Max AI-calls.

## Releasebesluit

RC1 blijft `AWAITING FINAL MANUAL VALIDATION`.

Het releasebesluit mag pas naar `GO` na evidence in:

- `docs/deployment/RELEASE_CANDIDATE_CHECKLIST.md`;
- `docs/deployment/TEST_RESULTS.md`.
