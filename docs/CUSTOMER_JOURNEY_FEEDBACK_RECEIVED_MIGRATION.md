# Fase 7 — `feedback.received` ownership en testmigratie

Datum: 13 juli 2026
Status: geïmplementeerd, standaard uit, uitsluitend expliciete testklanten

## Implementatieanalyse

### Canonieke feedbackflow

De canonieke klantfeedbackroute staat in `functions/client-preview-versions.js`, actie `feedback`. De route verifieert de ingelogde klant, accepteert uitsluitend de huidige gepubliceerde previewversie en slaat de feedback eerst op in `website_preview_versions.feedback_items`. Een feedbackitem krijgt een blijvende UUID. De bestaande request-idempotency gebruikt een aangeleverde `idempotencyKey`, met als fallback een hash van previewversie, auth-user en feedbacktekst.

Na opslag wordt de previewstatus `feedback_received`. Daarna herstelt `ensureFeedbackSideEffects` idempotent de vereiste neveneffecten:

- één `change_requests`-record per previewversie en feedback-ID;
- één klanttimeline-event met stabiele dedupekey;
- één interne adminnotificatie met een afzonderlijke stabiele dedupekey.

Ook een herhaalde feedbackrequest doorloopt deze herstelstap, zonder een tweede feedbackitem te maken. Pas nadat deze neveneffecten aanwezig of herstelbaar zijn, wordt `preview.feedback_received` aangeboden aan de Journey Engine. Journey-, progress- of mailfouten veranderen het succesvolle feedbackantwoord niet.

### Andere feedbackroutes die buiten scope blijven

- `submit-change-request.js` is een algemene wijzigingsverzoekflow met eigen interne mail en bestaande klantbevestiging. Deze route is niet gekoppeld.
- `demo-journey.js` bevat een afzonderlijke demo-/salesjourney en blijft ongewijzigd.
- Previewgoedkeuring, onderhoudsselectie en Mollie-testbetaling blijven afzonderlijke acties in `client-preview-versions.js` en zijn niet gekoppeld.
- Screenshots/bestandsreferenties blijven onderdeel van het bestaande feedbackrecord; zij worden niet naar automationmetadata of het mailtemplate gekopieerd.

Het Fase 1-rapport stelde vast dat de canonieke previewfeedbackflow nog geen klantbevestigingsmail had. De bestaande owner voor deze specifieke communicatie is daarom `legacy` als veilige no-op: niet-geselecteerde klanten krijgen geen nieuw of gewijzigd bericht. Bestaande interne notificaties blijven wel actief.

## Canoniek event en stabiele identiteit

Business event: `preview.feedback_received`
Effect: `email.feedback_received`
Template: `journey.feedback_received.v1`

De event- en outboxkeys worden deterministisch afgeleid van:

- customer-id;
- previewversion-id;
- blijvende feedbackrecord-id;
- effecttype `email.feedback_received`;
- templateversie 1.

Er wordt geen timestamp of willekeurige nieuwe UUID in de deduplicatiescope gebruikt. De al bestaande unieke constraints op eventkey, outbox-idempotencykey en event/effect maken de producent retry-safe. Een vervolgfeedbackitem krijgt door zijn eigen feedback-ID één afzonderlijk event; hetzelfde item op retry niet. Feedback op een volgende previewversie krijgt eveneens een andere key.

De eventpayload bevat alleen veilige referenties, een niet-omkeerbare korte feedbackfingerprint, server-side categorie, begrensd aantal, side-effectstatus en voortgang vóór/na. Volledige feedbacktekst, screenshot, recipient en providerpayload worden niet in eventmetadata of structured logs gezet.

## Ownershipcontract

`functions/journey/feedbackReceived/ownershipResolver.js` kiest exact één eigenaar:

- `none` wanneer geen ontvanger bestaat;
- `legacy` zolang centrale flags, opslag, dedicated allowlist, actieve testinstance, transition of preflightvalidatie ontbreken;
- `journey` alleen voor een actieve `test`-instance met `metadata.testOnly: true` en `metadata.feedbackReceivedEmailOwner: "journey"`.

Journey-eigenaarschap vereist tegelijk:

- een matchende `JOURNEY_ENGINE_ENABLED`;
- een matchende `JOURNEY_EMAIL_AUTOMATION_ENABLED`;
- de customer-id in de afzonderlijke `JOURNEY_FEEDBACK_RECEIVED_TEST_CUSTOMERS`;
- een reeds bestaande testjourney;
- geldige recipient policy, versie-1-template en veilige CTA.

De beveiligde super-adminactie `enable_feedback_received_test` kan alleen op een reeds bestaande actieve `testOnly`-instance de feedbackowner inschakelen. De actie maakt geen reguliere journey-instance aan. Preview-ready en feedback-received hebben bewust verschillende allowlists.

Vóór duurzame acceptatie behoudt `legacy` het bestaande no-mailgedrag. Na een bevestigde outbox-id is `journey` duurzaam eigenaar. Een timeout of andere ambigue fout na de atomische registratie start legacy niet alsnog; pending, retry, failed en `ambiguous_send` blijven volledig binnen de bestaande worker/recoveryroute.

## Feedbackcategorie en template

De server classificeert uitsluitend begrensde bestaande velden `category`, `page` en `section` als algemene feedback, tekst-, beeld-, ontwerp- of technische wijziging, of meerdere wijzigingen. De vrije feedbacktekst wordt niet gebruikt voor de mailinhoud.

Template-eigenschappen:

- exact testonderwerp `[TEST] We hebben uw feedback ontvangen`;
- `Max Webstudio <info@maxwebstudio.nl>` via de centrale mailservice;
- centrale Reply-To-policy met fallback `info@maxwebstudio.nl`;
- HTML, plain text en preview text;
- persoonlijke aanhef met fallback;
- preview-/projectlabel, categorie, betrouwbaar begrensd aantal en datum;
- centrale voortgang, huidige fase en volgende stap;
- e-mailveilige voortgangsbalk;
- primaire, server-side gevalideerde CTA naar `https://maxwebstudio.nl/klantportaal.html#website-review`;
- contactfallback `Team Max Webstudio` en centrale zakelijke footer;
- geen harde doorlooptijdbelofte en geen volledige feedbacktekst.

## Journeyprogress

De progressplanner gebruikt `FREE_PREVIEW_DEFINITION` en `calculateJourneyProgress`. Een geldige eerste of vervolgfeedback markeert `preview_feedback` voltooid, zet `preview_approved` uitsluitend op `ready` en brengt de centrale gewogen voortgang op 70%. De feedback-ID wordt in begrensde journeymetadata geregistreerd om dezelfde progressupdate te dedupliceren.

De planner weigert productie-, inactieve, geblokkeerde en ongeldige transitions en een reeds afgeronde of overgeslagen approval. Approval wordt nooit voltooid, betaling en commerciële overeenkomst blijven onaangeraakt en de website wordt niet live gezet. De progresswrite gebruikt een optimistic `updated_at`-voorwaarde. Een conflict of storing blokkeert feedbackopslag of de reeds geaccepteerde outbox niet en kan via een duplicate producercall veilig opnieuw worden geprobeerd.

## Worker, migratie en admininzage

De additieve migratie `20260713190000_enable_feedback_received_test_outbox.sql` vervangt alleen de bestaande claimfunctie idempotent om ook `email.feedback_received` te accepteren. De functie blijft:

- beperkt tot environment `test`;
- begrensd tot maximaal 20 items;
- beschermd met `FOR UPDATE SKIP LOCKED` en lease recovery;
- `SECURITY DEFINER` met vaste `search_path`;
- alleen uitvoerbaar door `service_role`.

Er zijn geen tabellen, kolommen, policies of gegevens verwijderd.

### Externe activatiestatus

Op 13 juli 2026 is de migratie na een afzonderlijke read-only preflight en expliciete gebruikersbevestiging toegepast op productieproject `maxwebstudio`, projectref `yxxahurphdbblkuxoeje`.

- `20260713190000_enable_feedback_received_test_outbox.sql` — geslaagd;
- `20260713190100_enable_feedback_received_test_outbox_idempotency_verification.sql` — byte-identieke tweede uitvoering geslaagd;
- SHA-256 van beide bestanden: `00a79f90c8b2327433dcc9bc285c423e8144bd3bf5d0ae92d841b71b7a41187e`;
- beide transacties hebben de ingebouwde `SECURITY DEFINER`-, vaste `search_path`-, anon/authenticated-denial- en service-role-grantasserties doorlopen;
- remote migration history bevat beide versies;
- journey-events, outboxitems en executions bleven op hun bestaande aantallen; journey-instances bleven nul;
- er is geen allowlist, testklant, instance, journey, provideractie of mail aangemaakt.

De CLI-waarschuwing na succesvolle uitvoering betrof alleen het niet kunnen cachen van de optionele lokale pg-delta-catalogus omdat Docker niet actief was. Dit vond plaats na de databasecommits en was geen migratie- of schemafout.

De bestaande read-only adminweergave toont voor dit effect eventtype, veilige feedbackfingerprint, previewversion-reference, owner en reden, progress vóór/na, outbox- en executionstatus, providerstatus, pogingen, foutcategorie, templateversie en testmodus. Volledige feedback, recipient en providerpayload worden niet geselecteerd of gerenderd.

## Activatie- en teststatus

De nieuwe allowlistvariabele staat leeg in de voorbeeldconfiguratie. Er is geen echte klant toegevoegd, geen nieuwe scheduler of backfill gemaakt, geen reguliere instance aangemaakt en geen testmail verstuurd. De end-to-endketen is met synthetische fixtures en provider-/repositoryfakes getest. Productieverzending blijft onmogelijk zonder alle centrale flags, de afzonderlijke customer-allowlist, een expliciet ingeschakelde bestaande testjourney en een veilige testrecipient.
