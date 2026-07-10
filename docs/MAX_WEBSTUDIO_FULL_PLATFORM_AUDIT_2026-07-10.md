# Max Webstudio - volledige platform-, klantreis- en bedrijfsaudit

Datum: 2026-07-10
Scope: lokale repo-audit van frontend, functies, Supabase-scripts, documentatie en technische scans.
Niet gedaan: live betalingen, live e-mails, nieuwe gebruikers, echte websites publiceren, secrets tonen of grote productwijzigingen maken.

## 0. Auditbasis

Gebruikte bronnen:

- `public/` als live frontend volgens `netlify.toml`
- `functions/` als Netlify Functions backend
- `supabase/` en `docs/supabase-*.sql` als database- en migratiebron
- `docs/AI_CONTEXT.md`, `docs/PRODUCTION_ARCHITECTURE.md`, `docs/PROJECT_STATE.md`, `docs/LEADFINDER.md`, `docs/CLIENT_PORTAL.md`, `docs/AUTOMATIONS.md`, `docs/MOLLIE_SUBSCRIPTIONS.md`, `docs/SECURITY.md`
- Statische scans op JavaScript, HTML inline scripts, secrets, routes, adminbescherming, grote bestanden en lokale links

Belangrijke beperking: zonder live credentials, browser-login en productie-databasecontrole kan geen enkele externe flow definitief als volledig productie-groen worden verklaard. Waar iets alleen in UI, documentatie, draft-migratie of demo/localStorage bestaat, staat dat expliciet als oranje, grijs of blauw.

## 1. Managementsamenvatting

1. Max Webstudio heeft al veel echte bouwstenen: publieke site, adminmodules, leadbeheer, Supabase Auth-voorbereiding, Mollie-functies, Resend-mailing, klantportaal, onboarding, change requests en een Website Factory.
2. Het platform is nog geen volledig automatische end-to-end fabriek van lead naar live website zonder handmatige controle.
3. De sterkste productielijn is momenteel: publieke website -> lead/order/contact -> adminopvolging -> gecontroleerde betaling/provisioning -> klantcommunicatie.
4. De centrale lead lifecycle is recent het meest concreet gemaakt, met backend-logica voor deduplicatie en lifecycle-velden. Deze moet wel aantoonbaar op de juiste live omgeving gedeployed zijn.
5. Er zijn meerdere parallelle routes voor dezelfde kernprocessen: betaling, onboarding, klantdata, facturen en klantportaal.
6. Het grootste bedrijfsrisico is niet dat er niets staat, maar dat er te veel half-gekoppelde systemen naast elkaar staan.
7. Supabase is deels canoniek, deels historisch en deels draft. Veel belangrijke tabellen staan nog in `migration-drafts` of losse SQL-documenten.
8. Mollie is server-side goed voorbereid, maar er zijn twee betaalpaden: `create-payment.js` en `commercial-order.js`. Dat kan betalingen buiten de volledige CRM/orderflow veroorzaken.
9. Klantaccount en RLS zijn voorbereid, maar deze audit kan klantisolatie niet volledig groen verklaren. De documentatie bevat ook historische blokkades en nieuwere "ready/live pass" statussen door elkaar.
10. Veel adminpagina's zijn extreem groot en lijken gedeelde code te dupliceren. Dat verhoogt regressierisico en maakt onderhoud traag.
11. De centrale routeguard dekt niet alle adminpagina's af. Sommige pagina's kunnen eigen bescherming hebben, maar centraal bewijs ontbreekt voor 23 van 29 adminroutes.
12. Publieke endpoints voor leads, onboarding, betaling en website-analyse hebben extra rate limiting en abuse-bescherming nodig voordat ze hard productieproof zijn.
13. Website Factory is conceptueel krachtig, maar hangt aan draft-tabellen en handmatige deployment/publicatie. Het is nog geen bewezen automatische publicatiemachine.
14. Publicatie, DNS, hosting, facturatie en onderhoud blijven grotendeels handmatige of semi-handmatige bedrijfsprocessen.
15. Onboarding bestaat in een oude publieke route met tijdelijke opslag en een nieuwere authenticated customer-onboarding flow. Die moeten worden samengevoegd.
16. Change requests zijn relatief concreet, maar moeten sterker worden gekoppeld aan versiebeheer, klantnotificaties, facturatie en projectstatus.
17. Secrets-scan vond geen duidelijke secrets in de repo. De getoonde Supabase/Mollie/Resend waarden moeten buiten git blijven.
18. De publieke conversiesite lijkt bruikbaar, maar de volledige mobiele/visuele live validatie is niet uitgevoerd in deze audit.
19. De beste volgende sprint is P0-hardening: deploybewijs, adminbescherming, 1 canonieke betaal/orderflow, RLS-bewijs en 1 klantdatamodel.
20. Conclusie: goede basis, nog niet "autonoom bedrijfssysteem". Met 4 tot 6 gerichte sprints kan dit naar een veel betrouwbaarder productieplatform.

## 2. Volledige klantreis

| Stap | Status | Wat werkt | Wat mist of onzeker is | Advies |
| --- | --- | --- | --- | --- |
| 1. Lead vinden | Oranje | Admin leadgenerator, centrale lead lifecycle, website-analyse, leadvelden en deduplicatie bestaan. | Google/extern enrichment, opt-out governance, automatische taakcreatie en live deploymentbewijs zijn niet volledig zeker. | Maak `leads` de enige bron en koppel elke leadbron aan dezelfde lifecycle. |
| 2. Contact opnemen / bellen | Oranje | Leadstatus, notities, call/follow-up velden en sales-UI bestaan. | Geen bewezen telefonie-integratie, geen harde verplichting voor "volgende actie", agenda-integratie deels niet gekoppeld. | Na elke call verplicht een uitkomst, volgende actie en deadline opslaan. |
| 3. Wensen en briefing | Oranje | Onboardingformulieren, customer-onboarding backend, intakevelden, projectmetadata en mails bestaan. | Oude publieke onboarding gebruikt tijdelijke opslag; wizard/local flows lopen naast productieflow. | Kies 1 briefingmodel en laat lead/order/customer/project dezelfde intake hergebruiken. |
| 4. Websiteanalyse / demo maken | Oranje/Blauw | Website scan, demo journey en Website Factory backend bestaan. | Factory-tabellen staan deels in draft-migraties; geen bewezen echte AI-generatie of automatische live sitebouw. | Factory eerst als gecontroleerde admin-pipeline productierijp maken. |
| 5. Preview delen | Oranje | `preview.html`, demo preview en factory previewversies bestaan conceptueel. | Secure preview links, expiry, view tracking en automatische opvolging zijn niet hard bewezen. | Voeg preview tokens, viewed-events en follow-up taken toe. |
| 6. Follow-up | Oranje | E-mailfuncties, timeline events, tasks/concepts en salesvelden bestaan. | Geen sluitende SLA of automatische opvolging per klantfase. | Maak follow-up rules per status: preview sent, viewed, accepted, payment pending. |
| 7. Verkoop / opdracht | Oranje | `commercial-order.js` bevat server-side pakketten, terms, klant/profiel/invoice en Mollie checkout. | Parallel publiek betaalpad `create-payment.js` kan buiten de volledige orderflow lopen. | Maak `commercial-order` canoniek en deactiveer of herleid oude betaalroute. |
| 8. Ordervoorwaarden / akkoord | Oranje | Terms acceptance wordt in commercial order meegenomen. | Bewijsopslag, versie van voorwaarden en klantzichtbaarheid zijn niet overal bewezen. | Sla voorwaardenversie, IP/tijdstip en orderdocument op bij de order. |
| 9. Betaling | Blauw/Oranje | Mollie payment, webhook, subscription en retry-functies bestaan. | Live betaling niet getest; dubbele tabellen en idempotency-risico's blijven. | Test Mollie end-to-end in sandbox/live met webhook bewijs en dubbele POST-test. |
| 10. Account aanmaken | Oranje/Blauw | Supabase Auth, account activation, invite/reset en klantprofiel bestaan. | Centrale routeguard en RLS/customer isolation niet volledig bewezen in deze audit. | Maak RLS-testset met klant A/B bewijs verplicht voor release. |
| 11. Onboarding | Oranje | Authenticated `customer-onboarding.js` is sterk opgezet met metadata, files en pipeline-start. | Oude `submit-onboarding.js` gebruikt `/tmp`/tijdelijke opslag en mailt vooral door. | Migreer publieke onboarding naar dezelfde authenticated/durable flow. |
| 12. Productie | Oranje/Grijs | Website Factory jobs, quality checks, packages en launch/revision actions bestaan. | Automatische sitegeneratie, GitHub/Netlify deploy, DNS en rollback zijn niet volledig gekoppeld. | Definieer launch pipeline met checklists, artifacts, versie en deploymentbewijs. |
| 13. Feedback / regenereren | Oranje | Change requests, factory revision actions en klantcommunicatie bestaan. | Geen bewezen versie-lock tussen feedback, preview en live publicatie. | Maak feedback altijd gekoppeld aan previewversie/projectversie. |
| 14. Goedkeuring | Oranje | Approval/status concepten bestaan in factory en projectflows. | Formeel akkoord, audit trail en publicatie-lock zijn niet overal hard. | Voeg approval event toe dat publicatie pas daarna vrijgeeft. |
| 15. Publicatie | Rood/Oranje | Domain center, project/adminflows en launch UI bestaan. | Echte publicatie naar Netlify/GitHub/DNS/SSL niet end-to-end bewezen. | Houd publicatie voorlopig handmatig met checklist, later automatiseren. |
| 16. Beheer, facturatie, onderhoud en upsell | Oranje/Grijs | Billing, Mollie subscriptions, change requests, health/maintenance dashboards bestaan deels. | Automatische maandfacturen, boekhouding, onderhoudsrapporten, upsell engine en reviews zijn niet sluitend. | Bouw na core-flow een care/retentie-laag op canonical subscription data. |

Legenda: Groen = volledig werkend; Oranje = gedeeltelijk werkend; Rood = ontbreekt/kritiek stuk kapot; Grijs = UI/mock/prep; Blauw = werkt alleen met externe configuratie of live bewijs.

## 3. Systeemmatrix

| Systeem | Status | Productierijp? | Bewijs / opmerkingen |
| --- | --- | --- | --- |
| Publieke marketingwebsite | Oranje | Gedeeltelijk | Veel pagina's, legal pages, portfolio en CTA's aanwezig. Visuele live/browsercheck niet gedaan. |
| Lead capture | Oranje | Gedeeltelijk | `send-lead.js` en nieuwere admin lead lifecycle bestaan. Rate limiting en bronconsolidatie ontbreken. |
| Admin leadbeheer | Oranje | Gedeeltelijk | `admin-leads.js`, lifecycle, dedupe service. Live deploymentbewijs blijft belangrijk. |
| Leadfinder | Grijs/Oranje | Beperkt | Documentatie noemt local/demo en geen volledige scraping/API-automatisering. |
| Website-analyse | Oranje | Gedeeltelijk | Publieke scanfunctie bestaat; abuse/SSRF/rate-limit risico moet omlaag. |
| Sales/CRM dashboard | Oranje | Gedeeltelijk | Zeer rijk, maar groot/duplicatief en met veel demo/local onderdelen. |
| Taken/follow-up | Oranje/Grijs | Beperkt | Velden en UI bestaan, maar automatische afdwinging en SLA ontbreken. |
| Klantprofielen | Oranje | Gedeeltelijk | Supabase profiel/customer flows bestaan, maar legacy/canoniek loopt naast elkaar. |
| Offertes | Oranje | Gedeeltelijk | Admin/UI en orderconcepten aanwezig; volledige akkoord- en versieflow onduidelijk. |
| Commercial order | Oranje | Bijna, na hardening | Sterke server-side orderfunctie, maar idempotency en canonical invoices moeten scherper. |
| Publieke betaling | Oranje/Rood | Niet als canoniek | `create-payment.js` maakt Mollie payment zonder volledige duurzame ordercontext. |
| Mollie webhook | Blauw/Oranje | Gedeeltelijk | Server-side fetch en statusupdates bestaan; live webhooktest en dubbele event-test nodig. |
| Abonnementen | Oranje/Blauw | Gedeeltelijk | Subscription functies en admin acties bestaan; automatische facturatie/boekhouding niet sluitend. |
| Resend/e-mail | Oranje/Blauw | Gedeeltelijk | Mailservice en logging bestaan; `email_logs` lijkt draft-afhankelijk. |
| Klantportaal | Oranje/Blauw | Gedeeltelijk | Auth/config/account profile aanwezig; routeguard/RLS bewijs niet volledig. |
| Oude client dashboard | Grijs | Niet canoniek | `client-dashboard.html` lijkt legacy/prototype naast `klantportaal.html`. |
| Publieke onboarding | Oranje/Rood | Niet canoniek | `submit-onboarding.js` gebruikt tijdelijke opslag. |
| Authenticated onboarding | Oranje | Gedeeltelijk | `customer-onboarding.js` is veel sterker, met project/customer metadata en pipeline hooks. |
| Website Factory | Oranje/Blauw | Gedeeltelijk | Backend is serieus, maar hangt aan draft-migraties en geen bewezen deploy naar live. |
| Demo journey | Oranje | Gedeeltelijk | Demo/preview events bestaan; productie-koppeling moet strakker. |
| Change requests | Oranje | Gedeeltelijk | Supabase/e-mail flow aanwezig; versie, facturatie en notificatie moeten sterker. |
| Domain/hosting center | Grijs/Oranje | Beperkt | Adminconcepten bestaan; echte DNS/SSL/publicatie niet bewezen. |
| Files/storage | Oranje | Gedeeltelijk | Uploadvalidatie in nieuwe flows; oude intake gebruikt tijdelijke opslag. |
| Timeline/audit | Oranje | Gedeeltelijk | Timeline events en activity logs bestaan, maar tabelschema is verspreid. |
| Analytics/business metrics | Grijs/Oranje | Beperkt | Dashboards bestaan; datakwaliteit afhankelijk van consolidatie. |
| Security/RLS | Oranje/Blauw | Niet volledig bewezen | Auth is voorbereid, maar routeguard coverage en RLS-bewijs zijn P0/P1. |

## 4. Kritieke problemen

### P0 - direct oplossen voor echte end-to-end productie

| Probleem | Impact | Bewijs | Oplossingsrichting |
| --- | --- | --- | --- |
| Laatste code/deploystatus niet hard bewezen | Live omgeving kan achterlopen op lokale fixes, vooral rond centrale lead lifecycle. | Eerdere push/deploypoging was geblokkeerd door GitHub-auth/permissions. | Herstel GitHub toegang, push correcte branch, controleer Netlify deploy en voer live smoke tests uit. |
| Adminroutebescherming is niet centraal compleet | Interne dashboards kunnen mogelijk zonder juiste centrale guard bereikbaar zijn als pagina's geen eigen guard afdwingen. | 23 van 29 `admin-*.html` routes ontbreken in `public/src/config/protectedRoutes.js`. | Voeg alle adminroutes toe aan centrale protectielijst en valideer met unauthenticated browsercheck. |
| Twee betaalroutes naast elkaar | Betalingen kunnen buiten CRM/order/account/project-flow vallen. | `functions/create-payment.js` naast `functions/commercial-order.js`. | Maak `commercial-order.js` de enige checkout-ingang; oude route blokkeren, doorverwijzen of alleen intern sandbox houden. |
| Geen enkele klantwaarheid | Duplicaten en statusconflicten tussen customers, profiles, invoices, subscriptions, localStorage en metadata. | Canonieke tabellen in docs, legacy `customer_*`, draftmigraties en local/demo storage naast elkaar. | Kies 1 datamodel en migreer alle kernflows daarheen. |
| RLS/customer-isolatie niet volledig bewezen | Klant A mag nooit data van klant B kunnen zien; dit moet aantoonbaar zijn. | Docs bevatten zowel historische NO-GO's als nieuwere ready-statussen; lokale audit kan live RLS niet bewijzen. | Maak vaste A/B RLS-test, bewaar bewijs in deployment checklist en CI/manual release. |

### P1 - hoog risico, volgende sprint

| Probleem | Impact | Bewijs | Oplossingsrichting |
| --- | --- | --- | --- |
| Adminbestanden zijn extreem groot en duplicatief | Elke wijziging heeft groot regressierisico; performance en onderhoud worden zwaar. | Meerdere adminpagina's bevatten 22k-26k regels; totaal geteld ruim 326k regels. | Shared shell/components/services maken en adminpagina's gefaseerd uitdunnen. |
| Website Factory hangt aan draft schema | Factory kan in productie falen als tabellen ontbreken. | `website_build_jobs`, `website_preview_versions` staan in draft-migratie 019. | Factory-migraties naar echte migration pipeline brengen en live valideren. |
| Publieke endpoints missen harde abuse-limieten | Spam, scanmisbruik, kosten of SSRF-achtige risico's. | `send-lead.js`, `submit-onboarding.js`, `analyze-lead-website.js`, `create-payment.js` zijn publiek. | Rate limit, CAPTCHA/honeypot, allowlists voor scanner, request budgets en monitoring. |
| Oude onboarding gebruikt tijdelijke opslag | Inzendingen kunnen verdwijnen of niet centraal herbruikbaar zijn. | `functions/intake-storage.js` heeft TODO om `/tmp` te vervangen. | Alles naar Supabase Storage/Postgres of Netlify Blobs, gekoppeld aan customer/project. |
| Order/payment idempotency moet strakker | Dubbele POST of webhook replay kan dubbele records/statussen geven. | Orderfunctie maakt betalingen/invoices; webhook verwerkt status op payment id. | Idempotency keys, unique constraints, order state machine en replay tests. |
| Mail logging schema niet zeker live | Belangrijke communicatie kan onvolledig traceerbaar zijn. | `email_logs` staat in draft-migratie 023. | Email log migratie live maken en mail send/retry/readback testen. |
| Follow-up is niet afgedwongen | Leads kunnen stilvallen na call, preview of payment pending. | Veel velden/UI, maar geen harde workflow-gates gezien. | Statusovergangen verplicht koppelen aan owner, next action en deadline. |
| Preview security/tracking onvoldoende bewezen | Klant kan preview verliezen, delen of bekijken zonder opvolging. | Preview en demo bestaan, maar token/expiry/view tracking niet hard bewezen. | Secure preview tokens, expiry, viewed event, reminder en approval event. |

### P2 - belangrijk voor schaalbaarheid

- Consolideer `klantportaal.html` en `client-dashboard.html`.
- Verplaats gedeelde adminlogica uit inline HTML naar modules.
- Maak een echte schema-index: welke tabel is canoniek, legacy of deprecated.
- Voeg automatische link/browsercrawl toe voor publieke en klant-facing routes.
- Maak facturatie- en abonnementsdata canoniek in `invoices`, `invoice_lines`, `subscriptions`.
- Voeg release checklist toe met: migrations applied, RLS A/B pass, Netlify deploy URL, smoke tests, rollback plan.
- Maak customer timeline de centrale auditlaag voor lead, order, payment, onboarding, feedback en support.
- Maak uploadbeleid per bestandstype en per klantfase consistent.

### P3 - optimalisatie

- Betere dashboard-UX met minder modules per scherm.
- Automatische review/NPS na livegang.
- Maandelijkse onderhoudsrapporten.
- Upsell aanbevelingen op basis van website health, pakket, support en betaalhistorie.
- Performance budget voor grote adminpagina's.
- Tooling om mock/demo features zichtbaar te labelen in admin.

## 5. Ontbrekende schakels in de keten

| Schakel | Huidige situatie | Risico |
| --- | --- | --- |
| Lead source -> centrale lead | Deels aanwezig, maar meerdere bronnen blijven naast elkaar bestaan. | Duplicaten en gemiste opvolging. |
| Lead -> call task | Velden bestaan, maar taak is niet altijd verplicht. | Lead blijft liggen. |
| Call -> briefing | Niet volledig afgedwongen als statusovergang. | Wensen blijven in losse notities. |
| Briefing -> demo/factory input | Nieuwe onboarding kan dit, oude flows niet betrouwbaar. | Factory krijgt incomplete input. |
| Demo -> preview share | Preview bestaat, maar secure tracking is niet bewezen. | Geen zicht op klantinteresse. |
| Preview viewed -> follow-up | Niet hard als automatische rule gezien. | Warm leadmoment wordt gemist. |
| Akkoord -> order/payment | Commercial order kan dit, oude betaling kan eromheen. | Betaalde klant zonder compleet dossier. |
| Payment paid -> account/project/onboarding | Aanwezig in delen, maar afhankelijk van juiste flow. | Klant moet handmatig worden rechtgezet. |
| Onboarding complete -> factory job | Nieuwe flow heeft hooks, oude niet. | Productie start niet automatisch. |
| Feedback -> versie -> approval | Conceptueel aanwezig, maar versie-lock niet hard. | Verwarring over wat live moet. |
| Approval -> publicatie | Geen volledig bewezen Netlify/GitHub/DNS pipeline. | Publicatie blijft handwerk. |
| Live -> onderhoud/factuur/upsell | Deels dashboard en subscription functies. | Retentie en MRR blijven handmatig. |

## 6. Handmatige processen die nu nog nodig blijven

- GitHub push/deploy en Netlify productiecontrole.
- Supabase migraties toepassen en bewijzen.
- RLS/customer-isolatie testen.
- Telefonisch contact en callnotities.
- Controleren of een lead echt geschikt is.
- Briefing aanvullen en vertalen naar productiewerk.
- Preview klaarzetten en klant opvolgen.
- Definitieve publicatie, domein, DNS en SSL controleren.
- Betaling/account/project handmatig herstellen als klant via het verkeerde betaalpad komt.
- Facturatiecontrole, boekhouding en abonnementcorrecties.
- Support/change requests beoordelen en prijzen.
- Klanttevredenheid, reviewverzoek en upsell plannen.

## 7. Dubbele of legacy systemen

| Gebied | Dubbeling | Advies |
| --- | --- | --- |
| Klantportaal | `klantportaal.html` naast `client-dashboard.html` | Kies `klantportaal.html` als canoniek en label de ander legacy of verwijder later gecontroleerd. |
| Betaling | `create-payment.js` naast `commercial-order.js` | Maak commercial order canoniek. |
| Onboarding | `onboarding.html`/`submit-onboarding.js` naast `customer-onboarding.js` | Migreer publieke route naar durable customer onboarding. |
| Data | Canonieke tabellen, legacy `customer_*`, metadata blobs en localStorage | Maak tabelstatussen: canonical, compatibility, deprecated. |
| Admin UI | Veel enorme `admin-*.html` bestanden met gedeelde code | Extract shared shell/components per module. |
| Facturen | `customer_invoices` naast `invoices`/`invoice_lines` | Kies canoniek factuurmodel. |
| Abonnementen | `customer_subscriptions` naast `subscriptions` | Kies canoniek subscriptionmodel. |
| Demo/AI/wizard | Local/demo flows naast productieflows | Demo mag blijven, maar nooit meetellen als productie. |

## 8. Securityrapport

### Critical / P0

- Adminroutebescherming is centraal incompleet. Voeg alle adminpagina's toe aan de centrale routeguard en bewijs met browserchecks.
- RLS/customer-isolatie moet opnieuw hard bewezen worden op de live/staging database.
- Betaalroutes moeten worden geconsolideerd zodat elke betaling een order, klant, invoice, timeline en vervolgactie heeft.

### High / P1

- Publieke endpoints hebben rate limiting en abuse control nodig.
- Website-analyse kan misbruikt worden om willekeurige URLs te laten ophalen. Beperk protocollen, interne IP's, redirects, content size en frequentie.
- Legacy `ADMIN_TOKEN` blijft alleen acceptabel als die in productie hard uit staat. Behoud alleen Supabase Auth als primaire admin-toegang.
- Service-role functies moeten altijd server-side blijven en alleen na admin- of user-auth draaien.

### Medium

- E-mail, timeline en audit logging zijn afhankelijk van schema's die deels draft lijken.
- Uploadvalidatie verschilt per flow; maak dit centraal.
- Previewlinks moeten tokenized, scoped en tijdelijk zijn.
- Logs mogen geen PII, tokens, payment details of raw errors lekken.

### Low

- Secret scan vond geen duidelijke secrets in de repo.
- Duplicate-id scan gaf vooral template-string ruis, maar runtime browservalidatie blijft nuttig.
- Grote inline scripts vergroten de kans op security- en regressiefouten.

## 9. UX- en conversierapport

Sterk:

- De publieke site heeft veel conversie-ingangen: contact, offerte, betaling, onboarding, portfolio en juridische pagina's.
- De adminomgeving is ambitieus en dekt bijna alle bedrijfsfuncties conceptueel.
- De klantreis is inhoudelijk goed begrepen: lead, briefing, demo, betaling, onboarding, feedback en onderhoud zijn allemaal aanwezig als modules.

Zwak:

- De adminervaring is waarschijnlijk te breed en te zwaar per scherm.
- Meerdere klant- en adminroutes overlappen, waardoor teamleden kunnen twijfelen waar de waarheid staat.
- Demo/local/mock onderdelen staan dicht op echte flows; dat maakt statusinschatting lastig.
- Klant-facing flows moeten technische termen vermijden. Interne adminpagina's mogen technisch zijn, maar klantportaal, onboarding en preview moeten simpel blijven.
- Mobiele en visuele validatie is in deze audit niet uitgevoerd; die is nodig voordat je conversie echt groen noemt.

Conversieadvies:

1. Maak 1 duidelijke sales pipeline: nieuw -> geschikt -> gebeld -> briefing -> demo -> preview verstuurd -> akkoord -> betaling -> onboarding.
2. Toon per lead maar 1 primaire volgende actie.
3. Laat order/payment alleen starten vanuit een compleet verkoopdossier.
4. Laat klanten na betaling direct landen in account + onboarding, niet in losse losse formulieren.
5. Voeg klantvriendelijke status toe: "We verzamelen je input", "We bouwen je eerste preview", "Klaar voor feedback", "Klaar voor livegang".

## 10. Top 20 automatiseringskansen

1. Automatische next-action na elke leadstatuswijziging.
2. Lead deduplicatie met opt-out/blocklist.
3. Lead naar briefing prefill.
4. Call outcome -> automatische mail of taak.
5. Preview ready -> klantmail + admin reminder.
6. Preview viewed -> follow-up taak binnen 24 uur.
7. Akkoord -> order/invoice/payment in 1 transactie.
8. Payment paid -> account invite + project + onboarding.
9. Onboarding incomplete -> automatische reminders.
10. Onboarding complete -> Website Factory job.
11. Factory quality failed -> interne taak.
12. Feedback submitted -> revision task + klantbevestiging.
13. Approval received -> launch checklist.
14. Website live -> onderhoudsabonnement activeren.
15. Failed payment -> retry + admin taak + klantmail.
16. Monthly care report -> automatische klantmail.
17. Domain/SSL expiry monitor.
18. Review request 7 dagen na livegang.
19. NPS/tevredenheidscheck 30 dagen na livegang.
20. Upsell suggestions op basis van pakket, health score, support en MRR.

## 11. Master roadmap

### Sprint 0 - P0 stabilisatie

Doel: voorkomen dat klanten of interne data verkeerd lopen.

- Push/deploy blokkade oplossen en live deploybewijs bewaren.
- Alle adminroutes centraal beschermen.
- `commercial-order.js` aanwijzen als canonieke checkout.
- Oude of losse betaalroute blokkeren of herleiden.
- RLS A/B klantisolatietest opzetten.
- Schema-inventaris maken: canonical, compatibility, draft, deprecated.

### Sprint 1 - Lead to sale

Doel: geen lead meer verliezen.

- Alle leadbronnen naar dezelfde `leads` lifecycle.
- Verplichte owner, status, volgende actie en deadline.
- Call outcome en briefing completeness toevoegen.
- Opt-out en blocklist centraal maken.
- Sales dashboard versimpelen naar pipeline en next action.

### Sprint 2 - Sale to payment

Doel: geen betaling zonder orderdossier.

- Order, invoice, terms en Mollie checkout in 1 canonieke flow.
- Idempotency keys en unieke constraints.
- Webhook replay tests.
- Terms versioning en akkoordbewijs.
- Payment pending/failed/paid follow-up automatiseren.

### Sprint 3 - Payment to account

Doel: betaalde klant krijgt automatisch een veilige werkruimte.

- Payment paid -> profile/customer/project provisioning.
- Account invite en password setup flow testen.
- Klantportaal als enige portalroute.
- RLS A/B test verplicht bij release.
- Klantvriendelijke statuspagina.

### Sprint 4 - Onboarding to factory

Doel: klantinput wordt direct productiewerk.

- Oude onboarding naar duurzame storage migreren.
- Onboarding schema koppelen aan project en factory input.
- Uploads naar Supabase Storage of alternatief met beleid.
- Completeness score en blocking questions.
- Onboarding complete -> factory job.

### Sprint 5 - Factory, preview, feedback, launch

Doel: gecontroleerd bouwen en publiceren.

- Factory draft-migraties naar echte migrations.
- Previewversions met token, expiry en view tracking.
- Feedback per previewversie.
- Approval event voor publicatie.
- Launch checklist met DNS/SSL/Netlify/GitHub bewijs.

### Sprint 6 - Care, billing en groei

Doel: terugkerende omzet en klanttevredenheid.

- Canonieke subscriptions en recurring invoices.
- Failed payment recovery.
- Onderhoudsrapporten.
- Change request pricing en approval.
- Review/NPS flow.
- Upsell engine en MRR dashboard.

## 12. Eindconclusie

Max Webstudio is geen lege demo; er staat veel echte infrastructuur. Tegelijk is het nog geen volledig gesloten productieplatform waarin een lead zonder handmatige controle verandert in een betaalde klant met account, onboarding, gegenereerde website, feedbackronde, publicatie, facturatie, onderhoud en upsell.

De kernkeuze voor de komende periode is consolidatie. Niet meer modules erbij, maar 1 canonieke klantreis afdwingen:

Lead -> call -> briefing -> preview -> akkoord -> order -> betaling -> account -> onboarding -> productie -> feedback -> approval -> live -> onderhoud.

Als de P0's eerst worden opgelost, vooral deploybewijs, adminbescherming, RLS, canonieke betaling en canonieke klantdata, kan de bestaande basis snel veel betrouwbaarder worden.
