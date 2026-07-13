# Customer Journey & Mail Automation — Fase 1 inventarisatie

Datum: 13 juli 2026
Status: read-only code-inventarisatie en architectuurvoorstel; geen productie- of databasemutaties uitgevoerd

## 1. Scope en bewijsniveau

Deze inventarisatie beschrijft de huidige mail-, timeline-, betaal-, preview-, portal- en automationcode in de repository. De bevindingen zijn gebaseerd op de Netlify Functions, frontendservices, SQL-drafts en bestaande productievalidatierapporten.

Belangrijke begrenzing: de SQL-bestanden in `supabase/` en `docs/` zijn deels drafts en vormen geen bewijs dat iedere tabel, constraint of RLS-policy al exact zo in productie staat. De bestaande rapporten bevestigen bovendien dat customer-A/B RLS, Mollie-webhookconcurrency en een volledige testorder nog niet live bewezen zijn. Daarom mag Fase 2 uitsluitend additieve, idempotente migratiedrafts opleveren; uitvoeren vereist eerst een echte schema-preflight en een expliciete testdatabase- of SQL Editor-route.

Drie lokale bestanden waren macOS-cloudplaceholders en niet lokaal leesbaar. De exacte versies van `functions/resend-webhook.js` en `functions/services/timelineService.js` zijn daarom read-only uit de geconfigureerde GitHub-origin gelezen. Er is niets naar GitHub geschreven.

## 2. Huidige centrale bouwstenen

| Onderdeel | Huidige bron | Gedrag | Hergebruik |
|---|---|---|---|
| Resend-verzending | `functions/services/resendMailService.js` | Eén server-side `sendTrackedEmail`; gebruikt `EMAIL_PROVIDER`, `RESEND_API_KEY` en `FROM_EMAIL`; maakt en actualiseert `email_logs`; mail- en logfouten worden afgevangen | Behouden als provider-adapter achter een nieuwe outboxworker |
| Compatibiliteitswrapper | `functions/email.js` | `sendEmail` delegeert rechtstreeks naar `sendTrackedEmail` | Behouden zodat legacy callers niet hoeven te wijzigen |
| Maillog | `functions/services/mailLogService.js` en draft `023_email_logs_mail_center.sql` | Logt bodies, templategegevens, relaties, provider-ID, status en metadata | Behouden als historische/CRM-weergave; uitbreiden of koppelen aan executions |
| Timeline | `functions/services/timelineService.js` en draft `024_customer_timeline_activity_feed.sql` | Append-achtige events met klant/lead, module, severity en metadata; optionele `dedupeKey` | Behouden als presentation/auditfeed; business events niet uitsluitend hierin modelleren |
| Resend-events | `functions/resend-webhook.js` | Mappt sent, delivered, delayed, bounced, complained, opened en clicked naar `email_logs` en timeline | Handler vervangen/omhullen met signature-verificatie en een idempotente event-inbox, achter feature flag |
| Mail Center | `public/admin-mail-center.html`, `functions/admin-email-logs.js` | Admin kan logs filteren, details zien en een mail handmatig opnieuw sturen | Hergebruiken als basis voor execution-detail; retry moet later via outbox lopen |
| Mail Studio | `public/admin-email-studio.html`, `functions/admin-mail-studio-send.js` | Handmatige adminmail met server-side autorisatie en vaste HTML-kwaliteitschecks | Behouden als persoonlijke/handmatige mailflow, duidelijk gescheiden van automations |
| Automation UI | `public/admin-max-automations.html` | No-code canvas, templates, versies en runs uitsluitend in `localStorage`; expliciet simulatie | Niet als productie-engine gebruiken; later read-only koppelen aan serverdata |
| Productcatalogus | `functions/product-catalog.js` | Uitgebreide server-side catalogus met codes, prijzen, deposits, recurring bedragen en dependencies | Enige bron voor journey-productkoppeling en commerciële bedragen |
| Molliepakketconfig | `functions/mollie-products.js` | Tweede, kleinere website/care-prijslijst | Duplicatie afbouwen, maar pas na regressietests; journeydefinities mogen deze prijzen niet kopiëren |
| Portaaldata | `public/src/services/clientWebsiteProjectContextService.js` | Leest eigen websites/projecten via Supabase Auth/RLS en geeft `progress` door | Uitbreiden met een aparte read-only journey-progress endpoint/service en nette fallback |

## 3. Afzender- en configuratie-inventarisatie

De centrale fallback is `info@maxwebstudio.nl` via `company-settings.js`. De werkelijke prioriteit is nu echter per call verschillend:

1. expliciet `input.from`;
2. `FROM_EMAIL`;
3. `companySettings.primaryEmail` (`info@maxwebstudio.nl`).

Daarnaast bestaan `LEAD_FROM_EMAIL`, `CUSTOMER_INVITE_FROM_EMAIL`, `EMPLOYEE_INVITE_FROM_EMAIL` en `CUSTOMER_UPDATE_FROM_EMAIL`. `admin-website-package-email` gebruikt optioneel `REPLY_TO_EMAIL`; het leadformulier gebruikt het leadadres als Reply-To voor de interne notificatie. De meeste automatische klantmails stellen geen persoonlijke Reply-To in.

Risico's:

- automatische mails zijn niet hard afgedwongen als `Max Webstudio <info@maxwebstudio.nl>`;
- toegestane From- en Reply-To-adressen worden niet centraal gevalideerd;
- `platform-health.js` controleert `RESEND_FROM_EMAIL`, terwijl de verzendservice `FROM_EMAIL` gebruikt;
- er is nog geen server-side contactpersoonmodel met naam, functie, zakelijk mailadres, telefoon en profielfoto;
- een waarde in een omgeving kan legacyflows onbedoeld een persoonlijke technische From geven.

Veilige strategie: voeg later een `mailSenderPolicy` toe. Automations krijgen altijd de centrale From; alleen handmatige, geautoriseerde Mail Studio-flows mogen een allowlisted persoonlijke From gebruiken. Een verantwoordelijke medewerker wordt standaard Reply-To en inhoudelijk contactpersoon.

## 4. Huidige mailflows

Alle onderstaande mails lopen via `sendEmail`/`sendTrackedEmail`, tenzij anders vermeld. Daardoor bestaat voor normale calls een poging tot `email_logs`; enkele oudere calls vullen template- en relatievelden niet in.

| Flow | Trigger en voorwaarden | Functie/template | Afzender / Reply-To | Logging en deduplicatie | Belangrijkste tekortkoming |
|---|---|---|---|---|---|
| Interne leadnotificatie | Geldig publiek aanvraagformulier | `send-lead.js`; `lead_notification` | `LEAD_FROM_EMAIL`/`FROM_EMAIL`; Reply-To lead | Maillog + timeline `lead_created` | Hoofdactie retourneert 502 als interne mail faalt; aanvraag is niet eerst duurzaam als business event/outbox vastgelegd |
| Aanvraagbevestiging klant | Na succesvolle interne leadmail | `send-lead.js`; `lead_customer_confirmation` | `LEAD_FROM_EMAIL`/`FROM_EMAIL` | Maillog; fout wordt afgevangen | Geen idempotency key; klantbevestiging wordt niet geprobeerd wanneer interne mail faalt |
| Publieke onboarding intake intern | Geldige intake | `submit-onboarding.js`; `project_intake_admin` | centrale fallback | Maillog, bijlagenmetadata | Synchrone verzending; geen outbox/retry |
| Publieke onboarding bevestiging | Dezelfde intake | `submit-onboarding.js`; `project_intake_customer_confirmation` | centrale fallback | Maillog | Geen eventgedreven deduplicatie |
| Ingelogde onboarding reviewmelding | Onboarding wordt ingediend/klaar voor review | `customer-onboarding.js`; `onboarding_ready_for_review` | centrale fallback | Maillog met klant/projectrelaties waar aanwezig | Promise-batch zonder duurzame side-effectstatus |
| Ingelogde onboarding klantbevestiging | Dezelfde succesvolle onboardingactie | `customer-onboarding.js`; `onboarding_customer_confirmation` | centrale fallback | Maillog | Geen unieke triggerguard |
| Welkomst-/activatiemail bij admin-onboarding | Admin maakt/koppelt klant en genereert activatielink | `admin-customer-onboarding.js`; `customer_onboarding_welcome` | `CUSTOMER_INVITE_FROM_EMAIL`/`FROM_EMAIL` | Maillog + timeline na succes | Geen outbox; account/project kan bestaan terwijl mail ontbreekt zonder herstelrecord |
| Losse welkomstmail | Geautoriseerde adminactie | `admin-customer-welcome-email.js`; `customer_welcome` | `CUSTOMER_INVITE_FROM_EMAIL`/`FROM_EMAIL` | Maillog | Handmatige preview/sendlogica overlapt onboarding-welkomstmail |
| Medewerkeruitnodiging | Admin maakt medewerker en activatielink | `admin-invite-user.js`; geen templateKey | `EMPLOYEE_INVITE_FROM_EMAIL`/`FROM_EMAIL` | Generiek maillog | Geen template-identiteit/versie; valt buiten customer journey maar moet sender policy delen |
| Wachtwoordreset | Geldig resetverzoek en Supabase-link gegenereerd | `client-password-reset.js`; `client-password-reset` | centrale fallback | Maillog; response voorkomt accountenumeratie | Geen expliciete suppression/dedup window, terecht geen journeyvoortgang |
| Wijzigingsverzoek intern | Verzoek is succesvol opgeslagen | `submit-change-request.js`; `change_request_admin` | centrale fallback | Maillog + timeline | Side effect synchroon, geen recovery-outbox |
| Wijzigingsverzoek bevestiging | Dezelfde opgeslagen aanvraag | `submit-change-request.js`; `change_request_customer_confirmation` | centrale fallback | Maillog | Geen idempotente execution per request |
| Handmatige factuurmail | Admin kiest `invoice_sent`, reminder, paid of expired | `admin-invoice-email.js`; type is templateKey | centrale fallback | Maillog, invoice timestampveld en timeline | Timestamp wordt pas na verzending gezet; gelijktijdige requests kunnen dubbel sturen; retry niet centraal gepland |
| Automatische betaalbevestiging | Alleen Mollie-status `paid` en `paid_email_sent_at` leeg | `mollie-webhook.js`; oudere call zonder templateKey | centrale fallback | Generiek maillog; daarna invoice timestamp + timeline | Check/send/patch is niet atomisch; dubbele gelijktijdige webhooks kunnen dubbel mailen |
| Nieuwe commerciële opdracht welkom | Betaalde `commercial_order` en klant/project gefinaliseerd | `mollie-webhook.js`; `commercial_order_welcome` | centrale fallback | Maillog met klant/project | Fulfillment en mail zitten in webhookpad; geen herstelbare outbox bij gedeeltelijk succes |
| Mislukte abonnementsbetaling | Mollie retryconditie en `retry_last_email_sent_at` leeg | `mollie-webhook.js`; oudere call zonder templateKey | centrale fallback | Maillog + subscription timestamp | Zelfde concurrencyrisico; payment update en mailherstel zijn gekoppeld |
| Handmatige subscription retry | Geautoriseerde adminactie | `admin-subscription-retry.js`; `subscription_retry` | centrale fallback | Maillog + retryvelden | Nieuwe mail bij iedere bewuste adminactie is mogelijk; geen execution/approvalrecord |
| Websitepakket gewijzigd | Geautoriseerde admin send na preview | `admin-website-package-email.js`; `website_package_change` | customer/update env; optionele Reply-To | Maillog + timeline | Persoonlijke afzenderpolicy niet centraal; timing “scheduled” plant geen echte server-side actie |
| Demo journey mail | Admin kiest `send_email`, approvalcheck slaagt | `demo-journey.js`; geen templateKey | centrale fallback | Generiek maillog + `last_email_*` op demo journey + demo-event | Eén laatste status, geen executionhistorie/idempotency; overlapt previewmails |
| Demo upsellvoorstel | Admin kiest expliciet send en heeft items | `demo-journey.js`; geen templateKey | centrale fallback | Generiek maillog + workflowmetadata | Geen centrale templateversie of execution-ID |
| Website Factory mail | Factoryactie roept `sendFactoryEmail` aan | `website-factory.js`; dynamische templateKey/type | centrale fallback | Maillog + factory timeline | Directe verzending vanuit grote domeinfunctie; ownership per type niet centraal |
| Previewpublicatie | Geldige previewversie wordt zichtbaar in portaal | `admin-preview-publication.js` | geen mail | Alleen `notify_customer` metadata en timeline `preview_shared` | “Notify customer” verstuurt zelf geen aantoonbare mail; preview-ready mail zit verspreid in demo/factorylogica |
| Previewfeedback | Feedback idempotent opgeslagen | `client-preview-versions.js` | geen klantbevestigingsmail | Timeline en admin-notificatie via dedupeKey | Gewenste MVP-bevestiging ontbreekt; side effects hebben geen outbox |
| Previewgoedkeuring | Approval wordt idempotent opgeslagen | `client-preview-versions.js` | geen mail | Timeline `preview_approved` | Gewenste bevestiging/volgende stap ontbreekt; betaalconditie is niet centraal beschikbaar |
| Website live | Diverse status-/factory-events bestaan | verspreid | geen eenduidige automatische livegangmail | Timeline kan `website_live` bevatten | Geen bewezen centrale live-trigger en geen eenduidige stopvoorwaarde |
| Mail Studio | Bewuste geautoriseerde admin-send | `admin-mail-studio-send.js`; payloadtemplate | payload Reply-To, centrale default From | Volledig maillog | Hoort handmatig te blijven; niet mengen met transactionele automations |
| Mail Center retry | Admin retryt bestaand log | `admin-email-logs.js`; kopieert oude content | kopieert oude From en Reply-To | Nieuw maillog met verwijzing in metadata | Geen idempotency/approval; kan een reeds afgeleverde mail opnieuw sturen |

## 5. Templates en content

Templates zijn nu JavaScript-builders verspreid over functions. `template_key` en `template_name` bestaan, maar er is geen centrale template-entiteit, versie, publishstatus of onveranderlijke snapshotreferentie. Sommige oudere calls geven zelfs geen templateKey mee. De Mail Studio controleert wel logo, CTA, footer, responsive CSS en dark mode, maar deze kwaliteitsgate geldt niet voor alle transactionele templates.

Ontbrekend voor de Journey Engine:

- versioneerbare template records en immutable published versions;
- centrale e-mailveilige shell, preheader en tekstversie;
- herbruikbare progressbar met tekstfallback;
- één primaire CTA en gevalideerde `https`/interne URL-policy;
- contactpersoonblok;
- transactioneel/marketing-classificatie en bijbehorend afmeldbeleid;
- render-inputschema en escapingtests tegen template-injectie.

## 6. Timeline, notifications en business events

`customer_timeline_events` is de beste bestaande feed voor admin en klantcontext. De service normaliseert events, beperkt tekstlengtes en ondersteunt een `metadata.dedupeKey`. De deduplicatie bestaat echter uit een SELECT gevolgd door INSERT zonder unieke databaseconstraint. Bij concurrency kunnen dus twee events worden ingevoegd.

De huidige timeline is bovendien niet hetzelfde als een business-eventlog:

- eventnamen gebruiken underscores (`payment_paid`) terwijl het doel domeinnamen met puntnotatie gebruikt (`payment.paid`);
- timeline-eventdata is presentatiegericht en mag worden gearchiveerd/gemarkeerd als gelezen;
- meerdere domeinfuncties schrijven eigen eventnamen en metadata;
- events zonder klant worden automatisch globaal;
- een project-ID heeft geen eigen eerste-klas kolom in de huidige timeline-draft.

`client_portal_notifications` heeft de juiste eigen-klant RLS-richting en velden voor actie, status en due date, maar is geen duurzame automationqueue. Gebruik deze tabel alleen als klantgerichte readmodel-output.

Veilige strategie: introduceer een append-only `journey_events`/business-eventtabel met unieke `event_key`; projecteer daaruit optioneel naar de bestaande timeline en notificationtabellen. Laat bestaande directe timelinewrites intact totdat iedere producer afzonderlijk gemigreerd en getest is.

## 7. Huidige voortgang en statusmodellen

Er is nu geen centrale server-side voortgangsservice.

- Admin berekent projectprogress uit aantallen checklistitems en taken (`calculateProjectProgress`) en overschrijft daarmee een mogelijk expliciete waarde tijdens normalisatie.
- Het klantportaal gebruikt eerst `project.progress`, anders een hardcoded statusmapping (bijvoorbeeld onboarding 16%, development 70%, feedback 82%, testing 90%, live 100%).
- Het klantportaal verhoogt lokaal progress op basis van preview/feedback/approval (ongeveer 78/82/90%).
- De portaalstappen gebruiken opnieuw losse hardcoded thresholds.
- Demo/Website Factory heeft daarnaast eigen buildprogress en intakepercentages.

Daardoor kunnen admin, klantportaal, e-mail en timeline verschillende percentages tonen.

Geïnventariseerde statusconventies uit de additieve schema-drafts:

- customers: `active`, `onboarding`, `paused`, `archived`;
- portal: `prepared`, `invited`, `active`, `disabled`;
- projects: `new`, `onboarding`, `design`, `development`, `feedback`, `testing`, `live`, `maintenance`, `paused`, `archived`;
- websites: `online`, `development`, `maintenance`, `waiting_customer`, `offline`, `archived`;
- invoices: `draft`, `sent`, `paid`, `expired`, `canceled`, `failed`, `archived`;
- subscriptions: `active`, `pending_mandate`, `paused`, `canceled`, `expired`, `archived`;
- preview versions: onder andere `internal`, `ready_for_review`, `feedback_received`, `approved`.

In frontendlegacy bestaan daarnaast Nederlandse aliases. Deze waarden mogen niet worden gewijzigd. Een nieuwe progress-service moet ze read-only via expliciete mappings interpreteren en bij onbekende waarden `needs_review` teruggeven in plaats van 0% te claimen.

## 8. Checkout, betaling, factuur en idempotentie

`create-payment.js` is volgens het productievalidatierapport bewust gesloten met HTTP 410; de geautoriseerde `commercial-order.js` is de canonieke commerciële route. Bedragen komen server-side uit catalogusconfiguratie. `mollie-webhook.js` haalt de status opnieuw bij Mollie op en werkt factuur/subscription bij; een Journey Engine mag dus alleen op het na deze verificatie vastgelegde `paid` feit reageren.

Bestaande beschermingen:

- invoice lookup op `mollie_payment_id`;
- `paid_email_sent_at` en subscription retry timestamps;
- lookups/upserts bij commercial-order fulfillment;
- timeline `dedupeKey`.

Niet afdoende:

- geen atomische event/inbox-claim per Mollie paymentstatus;
- geen unieke idempotencyconstraint voor mail side effects;
- timestampguards zijn check-then-send en dus racegevoelig;
- een crash na provideracceptatie maar vóór databasepatch kan een retry dubbel laten sturen;
- geen provider-idempotency-header/ownershiprecord zichtbaar;
- partial fulfillment heeft geen generiek recoverymechanisme.

## 9. Resend delivery en deliverability

De huidige webhook ondersteunt functioneel `sent`, `delivered`, `delivery_delayed`, `bounced`, `complained`, `opened` en `clicked`. Het event zoekt het maillog via provider-message-ID, schrijft het laatste event plus maximaal twintig recente events in metadata en maakt voor delivery/open/click/bounce/complaint een timeline-event.

Kritieke bevindingen:

- de webhook verifieert geen Resend/Svix-handtekening;
- er is geen centrale feature flag;
- webhookevents hebben geen eigen tabel en geen unieke provider-event-ID;
- duplicate events kunnen dubbele timeline-events geven wanneer timestamps verschillen of ontbreken;
- één `email_logs.status` wordt steeds overschreven, waardoor bijvoorbeeld `clicked` de aparte delivery/bounce-dimensie niet modelleert;
- delivery delayed wordt als `sent` opgeslagen zonder apart tijdstip/signaal;
- open en click zijn niet als onbetrouwbare engagementsignalen gelabeld in het datamodel;
- recipient suppression na bounce/complaint bestaat niet aantoonbaar;
- de handler retourneert bij interne fouten bewust 200, maar zonder inbox/recovery gaat het event dan verloren.

DNS/SPF/DKIM/DMARC, verified-domain en Return-Path alignment zijn niet betrouwbaar uit de repository te bewijzen en moeten extern read-only worden gecontroleerd. Er mag geen DNS automatisch worden gewijzigd.

## 10. Admin- en klantportaal

Het bestaande Mail Center kan al sent/failed/delivered/bounced/complained/opened/clicked tonen via het ene statusveld, maar mist aparte delivery-/engagementvelden, attempts, schedules, cancellations en dead letters. De bestaande Max Automations-pagina is een lokale simulatie en mag niet als production control plane worden gepresenteerd.

Het klantportaal heeft al bruikbare progresscards, timeline, notificaties, previewacties, factuuracties en fallbackstates. De veiligste UI-route is daarom geen nieuw designsysteem, maar een read-only journey response in deze componenten. Als de flag uitstaat, de endpoint faalt of geen journey bestaat, blijft de huidige projectweergave actief.

## 11. Voorgestelde centrale architectuur

### Scheiding van verantwoordelijkheden

1. **Business event inbox** — immutable feit met unieke `event_key`, bron, entity, payload, occurred/received timestamps en environment. Producers schrijven best-effort na de hoofdtransactie; een failure blokkeert de hoofdactie niet en wordt gestructureerd gelogd.
2. **Journey definitions/versions** — productcode verwijst uitsluitend naar `product-catalog.js`; fases/stappen/gewichten/voorwaarden zijn immutable per gepubliceerde versie.
3. **Journey instances/step state** — één actuele instance per expliciete scope en journeytype, met unieke scopekey, verantwoordelijke, pauzestatus en optionele handmatige overrides.
4. **Progress service** — pure server-side berekening op definition + step states; alle consumers krijgen exact dezelfde response/snapshot.
5. **Automation outbox** — unieke `idempotency_key`, schedule, claim/lease, attempts, next attempt, terminal state en payloadsnapshot.
6. **Automation executions** — één record per daadwerkelijke poging/actie met provider-ID, templateversie en gescheiden send-, delivery- en engagementstatussen.
7. **Provider event inbox** — geverifieerde, idempotente Resend-events met provider-event-ID/payloadhash; projecteert naar execution en bestaande `email_logs`.
8. **Read models** — bestaande timeline, notifications, Mail Center en portals lezen/projecteren zonder bron van waarheid voor automation te zijn.

### Ownershipregel

Legacy blijft eigenaar van elk mailtype tenzij een server-side ownershipmapping voor precies die flow `journey` teruggeeft. Alleen dan mag de journey automation enqueued worden en moet legacy voor die specifieke event/entitycombinatie overslaan. Algemene flags alleen zijn onvoldoende; ownership moet minimaal mailtype, environment en geselecteerde klant/journey kunnen scopen.

## 12. Additief benodigde tabellen en constraints

Exacte kolomnamen/FK's moeten na schema-preflight worden bevestigd. Conceptueel zijn minimaal nodig:

- `journey_definitions` — stabiele key, productcode, journeytype, status;
- `journey_definition_versions` — versienummer, immutable config, published/retired timestamps, checksum;
- `journey_instances` — customer/project/order, productcode, definitionversion, state, current step, assignee, environment;
- `journey_step_states` — instance + stepkey, status, completed/reopened/override metadata;
- `journey_events` — append-only business events, unieke `event_key`, source/entity/payload/environment;
- `automation_definitions` en `automation_definition_versions` — trigger, voorwaarden, actie, stopvoorwaarden, templateversion;
- `automation_outbox` — eventrelaties, schedule, lease, attempts, last error en unieke `idempotency_key`;
- `automation_executions` — attempt/result/provider/template snapshot en afzonderlijke statusvelden;
- `email_template_versions` — immutable subject/html/text/preheader/render schema/classificatie;
- `provider_webhook_events` — provider event-ID of payloadhash uniek, signaturestatus, received/processed/error;
- `email_suppressions` — recipient hash/adres, reden bounce/complaint/manual, scope en status;
- optioneel `journey_migration_reviews` — dry-run mapping, confidence, redenen en reviewer.

Elke tabel krijgt `environment`/testmarkering waar relevant, `created_at`, benodigde indexes, RLS enabled en uitsluitend de minimaal noodzakelijke policies. Service role blijft server-side. Customer SELECT mag alleen via own-customer-relaties; definitions, outbox, executions, templates en providerpayloads zijn nooit rechtstreeks klantleesbaar.

Outboxstatussen kunnen additief `pending`, `processing`, `completed`, `failed`, `cancelled`, `dead_letter` gebruiken. `sent` hoort bij mail execution/sendstatus, niet bij iedere side-effectsoort. Omdat dit nieuwe tabellen zijn, worden bestaande statusconstraints niet gewijzigd.

## 13. Feature flags

Benodigde server-side flags:

- `JOURNEY_ENGINE_ENABLED`
- `JOURNEY_PROGRESS_UI_ENABLED`
- `JOURNEY_EMAIL_AUTOMATION_ENABLED`
- `RESEND_EVENT_WEBHOOKS_ENABLED`
- `JOURNEY_ADMIN_ENABLED`

Iedere flag wordt geïnterpreteerd door één server-side policy met modes `off`, `test_only`, `allowlist`, `on`. Allowlist gebruikt UUID's/journeykeys uit serverconfig of een beveiligde configuratietabel, nooit publiek aanpasbare localStorage. Default is `off`. De frontendflag mag alleen zichtbaarheid sturen en geeft nooit schrijfbevoegdheid.

## 14. Veiligste eerste implementatiestap

De kleinste veilige Fase 2 is alleen de foundation, zonder productieproducer of worker:

1. feature-flag parser/policy met default `off` en tests;
2. pure journeydefinition- en progressdomain types/modules met directe checkout en gratis preview als configuratie, prijzen alleen via productcodes;
3. additieve SQL-migratiedraft voor event, instance, step state, outbox, execution en template/provider-eventfundament;
4. repositories die bij ontbrekende schema/configuratie gecontroleerd `unavailable` teruggeven;
5. dry-run schema-/backfillrapportage zonder writes en expliciet `send_emails=false`;
6. nog geen bestaande function aanpassen en geen scheduled worker activeren.

Pas na schema-review en tests volgt een read-only progress endpoint/adminview. De eerste te migreren mailflow hoort `preview.ready` voor uitsluitend herkenbare testklanten te zijn, omdat previewbeschikbaarheid concreet te controleren is en er al portal/timelinecontext bestaat. Migratie vereist eerst een expliciete ownershipmapping en een unieke idempotency key zoals `mail:preview_ready:<previewVersionId>:<templateVersion>`.

## 15. Tests die vóór activatie moeten bestaan

### Eerst: karakterisatie van legacy

- homepagelead: interne mailfailure mag een duurzaam opgeslagen aanvraag niet verliezen;
- commercial order en Mollie paid: statusupdate blijft succesvol bij mailfailure;
- dubbele en gelijktijdige Mollie-webhook: maximaal één betaalmail en één fulfillment-event;
- preview publish/view/feedback/approval blijven idempotent en klantgebonden;
- handmatige invoice mail en Mail Center retry behouden adminautorisatie;
- klant A kan projecten, previews, notifications en journeydata van klant B niet lezen;
- huidige statusaliases en onbekende legacywaarden worden vastgelegd.

### Foundation

- flag default off, test-only en allowlistscoping;
- journeyversion immutability en expliciete instanceversie;
- gewichten tellen exact tot 100 en optionele stappen worden correct genormaliseerd;
- directe checkout en gratis preview leveren verschillende verplichte stappen;
- onbekende status geeft fallback/handmatige review, geen foutieve 0%;
- dezelfde eventkey/outbox-idempotency key kan maar eenmaal worden opgeslagen;
- worker claim/lease voorkomt dubbele verwerking onder concurrency;
- crash na provideracceptatie is herstelbaar zonder nieuwe verzending;
- reminder hercontroleert stopconditie en logt `skipped`/`cancelled` reden;
- template escaping, veilige CTA-URL, tekstversie en contactpersoonfallback;
- service-role/secrets verschijnen niet in frontendbundles, responses of logs.

### Resend

- geldige en ongeldige handtekening;
- duplicate provider-event-ID/payloadhash;
- delivery, delayed, bounce, complaint, open en click blijven aparte dimensies;
- late/out-of-order events degraderen bounce/complaint niet naar opened/clicked;
- bounce/complaint maakt suppression en blokkeert nieuwe automationmail;
- open/click wordt in admin als signaal aangeduid, niet als gelezen bewijs.

### Regressie vóór iedere mailownershipswitch

- publieke en admin checkout/commercial order;
- Mollie testbetaling, webhook en bedankpagina;
- accountactivatie, klantlogin, adminlogin en reset;
- onboarding en uploads;
- preview upload/publicatie/weergave/feedback/approval;
- facturen, subscriptions en bestaande mails;
- klanttimeline, admin activity feed en notification center.

## 16. Risicorangschikking

### P0 — eerst oplossen vóór productieactivatie

- ontbrekende Resend-webhookhandtekeningverificatie;
- geen atomische idempotency/outbox voor mails en events;
- mailfailure kan in de leadflow nog het API-resultaat laten falen;
- RLS customer-A/B en Mollie concurrency zijn niet live bewezen;
- production schema kan afwijken van drafts.

### P1

- meerdere, afwijkende voortgangsberekeningen;
- automatische From/Reply-To-policy niet centraal afgedwongen;
- templates niet versieerbaar en sommige mails missen template-identiteit;
- events/statussen worden in één emailstatus samengevouwen;
- lokale Automation UI kan de indruk van een live backend wekken.

### P2

- dubbele prijscatalogus in `mollie-products.js`;
- verspreide Nederlandse/Engelse statusaliases;
- `email_logs` bewaart volledige HTML/text en vereist daarom strikte retentie/toegang;
- DNS/deliverabilityhealth is niet geautomatiseerd of extern bewezen.

## 17. Fasebesluit

Fase 1 is inhoudelijk afgerond. Er zijn voldoende herbruikbare onderdelen om veilig additief door te bouwen, maar niet om bestaande mailcalls nu al te vervangen. De eerstvolgende commit mag uitsluitend foundationcode, migratiedrafts en tests toevoegen met alle flags standaard uit. Productiemails, backfill, schema-uitvoering, DNS en legacyverwijdering vallen expliciet buiten die stap.
