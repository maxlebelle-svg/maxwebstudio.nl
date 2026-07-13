# Fase 8 — `preview.approved` ownership en testmigratie

Datum: 13 juli 2026
Status: geïmplementeerd, standaard uit, uitsluitend expliciete testklanten

## Bestaande approvalflow

De canonieke websitepreview-approval staat in `functions/client-preview-versions.js`, actie `approve`. De route verifieert de portalsessie, koppelt de gebruiker server-side aan één customer en accepteert uitsluitend diens huidige gepubliceerde previewversie. Zij schrijft eerst `approved_at`, `approved_by_auth_user_id`, status `approved` en begrensde approvalmetadata naar `website_preview_versions`.

Daarna bestaan twee afzonderlijk gededupliceerde side effects: het klant-/projecttimeline-event `preview_approved` en een interne globale notification. Fase 8 maakt beide side effects ook bij een duplicate approval herstelbaar. Een timeline-, notification-, journey-, progress- of mailfout draait de opgeslagen approval niet terug.

De route wijzigt bij approval geen project- of websitestatus en verstuurt momenteel geen klantmail. De bestaande owner voor niet-geselecteerde klanten is daarom `legacy` als no-op. `demo-journey.js` heeft een afzonderlijk demo-approvalmodel; handmatige ZIP-publicatie maakt alleen previewversies; beide blijven buiten scope.

De bestaande acties `select_maintenance` en `create_payment` blijven volledig afzonderlijk. Alleen die laatste kan na een expliciete klantactie en geldige testconfiguratie een testfactuur en Mollie-testbetaling maken. Fase 8 roept deze acties niet aan en maakt zelf geen invoice, payment, order of klant aan.

## Canoniek event en ownership

Event: `preview.approved`

Effect: `email.preview_approved`
Template: `journey.preview_approved.v1`

De stabiele event- en outboxscope bevat customer-id, previewversion-id, de blijvende combinatie van `approved_at` en approverreferentie, effecttype en templateversie. Alleen een korte SHA-256-fingerprint wordt opgeslagen. Timestamp “nu” en een nieuwe UUID maken geen onderdeel uit van de retry-identiteit.

Journey-owner vereist tegelijk de centrale engine- en mailflags, de afzonderlijke `JOURNEY_PREVIEW_APPROVED_TEST_CUSTOMERS`, een reeds bestaande actieve `testOnly`-journey met `previewApprovedEmailOwner: journey`, beschikbare opslag, een veilige financiële resolutie, geldige transition, recipient policy, template en CTA-policy. Flags uit of niet-geselecteerd is een volledige journey-no-op. Na duurzame event/outboxacceptatie is legacyfallback uitgesloten, ook bij pending, retry, failed of ambiguous providerstatus.

De beveiligde super-adminactie `enable_preview_approved_test` kan alleen een reeds bestaande testjourney markeren. Zij maakt geen reguliere instance of klant aan.

## `approvalNextStepResolver` en bronhiërarchie

De resolver is server-side en read-only. De volgorde van bewijs is:

1. `mollie_payment_status=paid` met gekoppelde Mollie-payment-id, zoals door de bestaande webhook vastgelegd;
2. factuurstatus `paid` met `paid_at`;
3. server-side commerciële ordercontext uit factuurnotities en de gevalideerde `websiteCommercialOrder` uit projectmetadata;
4. project-/websitestatus voor expliciet `live` of `online`;
5. ontbrekende of conflicterende data als veilige reviewfallback.

Frontendbedragen, requestlabels, alleen een Mollie-id, client-productdata en losse legacystatussen zijn geen betaalbewijs. De resolver retourneert uitsluitend categorieën voor journeytype, orderbron, paymentstate, invoicestate, amountstate, next-step, klantactie, interne actie, CTA, reason code en confidence/source. Bedragen, betaalproviderpayloads en factuurdetails gaan niet naar eventmetadata of logs.

Ondersteunde veilige uitkomsten:

- volledig betaalde directe checkout: geen betaalverzoek, technische afronding;
- aantoonbare aanbetaling: approval verwerken, geen geïmproviseerde restantfactuur;
- relevante bestaande open factuur met veilige Mollie-route: CTA naar `#facturen`, geen nieuwe factuur;
- gratis preview met commerciële order maar zonder betaling: commerciële bevestiging via de bestaande dienstenroute;
- ontbrekende, meervoudige, geannuleerde of conflicterende financiële data: neutrale interne controle zonder betaal-CTA;
- reeds expliciet live/online: geen aanvullende actie of livegangbelofte.

## Progress

De planner gebruikt de centrale free-previewdefinition en progressservice. `preview_approved` wordt alleen na geldige opgeslagen approval voltooid. De vervolgstap verschilt per resolveruitkomst:

- gratis preview/onbetaald: `commercial_agreement` wordt ready;
- bestaande factuur of aanbetaling: commerciële afspraak voltooid, `payment_confirmed` ready;
- bewijsbaar volledig betaald: commerciële afspraak en payment-confirmation in de journey worden op bestaand bewijs voltooid, `project_handover` ready;
- conflict: commerciële afspraak blocked voor interne controle.

Dit zijn uitsluitend journeystates. De planner schrijft geen invoice-, payment-, order-, project-, website- of Molliestatus en forceert geen website-live-event. Approvalfingerprints dedupliceren progress; optimistic locking maakt conflicts veilig herstelbaar.

## Template en CTA-policy

Testonderwerp: `[TEST] Uw websiteontwerp is goedgekeurd`.

De centrale template levert HTML, plain text en preview text met Max Webstudio-branding, veilige aanhef, preview-/projectlabel, centrale voortgang, fase, conditionele vervolgstap, contactfallback en zakelijke footer. From blijft `Max Webstudio <info@maxwebstudio.nl>` en Reply-To volgt de centrale policy.

Toegestane CTA's worden server-side gekozen en opnieuw door de mailcommandvalidator gecontroleerd:

- klantportaal `#website-review`;
- klantportaal `#facturen` bij precies één relevante open factuur;
- bestaande `diensten.html` voor commerciële bevestiging.

Bij onzekerheid wordt zonder primaire CTA gerenderd. De mail bevat geen bedrag, geïmproviseerde Mollie-link, factuurnummer, livegangbelofte of claim “volledig betaald” zonder bewijs.

## Admin, worker en activatie

De read-only Journey & Mail Automation-weergave toont veilige approvalfingerprint, previewreference, owner/reason, journeytype, next-step, payment-/invoicestate, klant-/interne actie, progress, outbox/execution/providerstatus, templateversie, attempts, foutcategorie en testmodus. Zij selecteert geen recipient, financiële payload of klantdetails.

De additieve migratie `20260713200000_enable_preview_approved_test_outbox.sql` breidt alleen de begrensde testworkerclaim uit met `email.preview_approved`, behoudt vaste `search_path`, service-role-only execution, lease recovery en batchlimiet. Deze Fase 8-migratie is niet automatisch extern toegepast. Er is geen scheduler, backfill, allowlistwaarde, testinstance of echte testmail aangemaakt.
