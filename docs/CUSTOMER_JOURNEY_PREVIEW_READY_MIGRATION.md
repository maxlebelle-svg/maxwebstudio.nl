# Fase 6 — `preview.ready` ownership en testmigratie

Datum: 13 juli 2026
Status: geïmplementeerd, standaard uit, uitsluitend expliciete testklanten

## Implementatieanalyse

De canonieke bestaande producent staat in `functions/website-factory.js`. Nadat een Website Factory-build een geldige `website_preview_versions`-rij heeft aangemaakt en de previewstatus, reviewstatus, timeline en notificatie zijn opgeslagen, verstuurde `sendPreviewLaunchMail(..., "preview_ready")` rechtstreeks de bestaande mail. Die functie gebruikt de centrale mailservice en blijft ongewijzigd beschikbaar als legacyroute.

De handmatige ZIP-route maakt en publiceert eveneens previewversies, maar verstuurt op dit moment niet via dezelfde `preview_ready`-mailproducent. Daarom is die route bewust niet gekoppeld. Ook `preview_updated`, `launch_started` en `website_live` blijven volledig legacy.

De klantveilige CTA is de bestaande beveiligde route `/preview.html?version=<preview-version-id>`. Interne Netlify Function-render-URL's worden niet in de journeytemplate opgenomen.

## Ownershipcontract

`functions/journey/previewReady/ownershipResolver.js` kiest exact één eigenaar:

- `none` wanneer geen ontvanger bestaat;
- `legacy` zolang flags, opslag, expliciete klantselectie of actieve testinstance ontbreken;
- `journey` alleen voor een actieve instance in environment `test`, met `testOnly: true` en `previewReadyEmailOwner: "journey"`.

Daarbij moeten zowel `JOURNEY_ENGINE_ENABLED` als `JOURNEY_EMAIL_AUTOMATION_ENABLED` via veilige allowlistmodus matchen en moet de customer-id apart in `JOURNEY_PREVIEW_READY_TEST_CUSTOMERS` staan. `test_only` en `on` kunnen mail in een productie-runtime niet activeren.

Template-, recipient- en CTA-validatie vindt vóór eventregistratie plaats. Een definitieve preflightfout gebruikt legacy. Na een RPC-aanroep met een onduidelijke response wordt legacy niet gestart, omdat de atomische RPC het event/outboxitem al kan hebben geaccepteerd. Een bevestigde outbox-id maakt journey duurzaam eigenaar.

## Idempotentie

Event- en outboxkeys gebruiken een SHA-256-scope van:

- customer-id;
- previewversion-id;
- `journey.preview_ready`;
- templateversie 1.

Er staat geen timestamp of willekeurige UUID in de deduplicatiescope. De databaseconstraints op `journey_events.event_key`, `automation_outbox.idempotency_key` en event/effect voorkomen een tweede effect voor dezelfde previewversie.

## Testjourney en bediening

De bestaande beveiligde endpoint `admin-journey-mail-test` heeft een super-adminactie `create_preview_test_journey`. Deze actie:

- accepteert alleen een expliciet geselecteerde UUID uit `JOURNEY_PREVIEW_READY_TEST_CUSTOMERS`;
- schrijft uitsluitend de eigen testdefinition en testinstance;
- gebruikt vaste definitionversion 1 en een stabiele instance key;
- wijzigt geen customer-, project-, profiel-, factuur-, betaal- of previewrecord;
- is idempotent via upsert op definition key/version en instance key.

Verwerking blijft handmatig via de beveiligde super-adminworkertrigger. Er is geen scheduler, publieke trigger of backfill toegevoegd.

## Mailcontract

Template: `journey.preview_ready.v1`
From: `Max Webstudio <info@maxwebstudio.nl>`
Testonderwerp: `[TEST] Uw nieuwe websitepreview staat klaar`

De mail bevat HTML en tekst, branding, veilige aanhef, projectlabel, centrale journeyvoortgang, fase, volgende stap, preview-CTA, feedback-/goedkeuringsuitleg, klantportaallink, contactfallback en zakelijke footer. Reply-To blijft onder de centrale recipient policy.

## Activatiestatus

Alle nieuwe voorbeeldconfiguratie staat leeg of `off`. Er is geen testklant toegevoegd, geen testinstance op productie aangemaakt en geen mail verstuurd. Een echte end-to-endverzending is bewust overgeslagen omdat in deze lokale sessie geen expliciet goedgekeurde testklant plus veilige testrecipientconfiguratie beschikbaar was.

De read-only journey-adminweergave toont voor journey-outboxitems owner, eventtype, previewversion-reference, templateversie, outboxstatus, executionstatus, attempts, datum/tijd, foutcategorie en providerstatus. Een legacykeuze krijgt alleen op het bestaande `preview_ready`-maillog veilige ownership- en previewmetadata en verschijnt daardoor eveneens als `legacy`; ontvangeradressen blijven verborgen.
