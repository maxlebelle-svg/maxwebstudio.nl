# Roadmap

Deze roadmap beschrijft de logische doorontwikkeling van Max Web Studio. Grote wijzigingen moeten altijd eerst worden goedgekeurd.

## Fase 1 - Stabiliseren

Doel: de huidige website veilig en beheersbaar maken.

Prioriteiten:

- Documentatie actueel houden.
- Vastleggen dat `/public` de live bron is.
- Beslissen wat er met root-duplicaten gebeurt.
- Sitemap en robots.txt toevoegen.
- Canonical en Open Graph metadata toevoegen.
- Homepageformulier vervangen door echte backend-submit.
- Afbeeldingen optimaliseren.
- Mobiele navigatie verbeteren.

## Fase 2 - Betrouwbare Betaal- En Intakeflow

Doel: betalingen, klantgegevens en onboarding duurzaam verwerken.

Prioriteiten:

- Mollie payment status duurzaam opslaan.
- Payment ID koppelen aan bedankt- en onboarding-flow.
- Intake-opslag vervangen door duurzame opslag.
- Admin-overzicht verbeteren.
- E-mailtemplates professionaliseren.
- Foutmeldingen en opvolging verbeteren.

Mogelijke opslagopties:

- Netlify Blobs
- Supabase
- Postgres
- Airtable of CRM-koppeling

Geen keuze maken of implementeren zonder akkoord.

## Fase 3 - SEO En Conversie

Doel: meer vertrouwen, betere vindbaarheid en hogere conversie.

Prioriteiten:

- Dienstpagina's uitwerken.
- Lokale SEO-pagina's overwegen.
- FAQ schema toevoegen.
- Service schema toevoegen.
- Echte cases en reviews toevoegen.
- CTA-hiërarchie aanscherpen.
- Analytics en conversietracking zorgvuldig implementeren.

## Fase 4 - Design System En Componenten

Doel: sneller nieuwe pagina's bouwen zonder inconsistentie.

Prioriteiten:

- Componentrichtlijnen documenteren.
- Herbruikbare header/footer aanpak bepalen.
- CSS structureren op basis van design tokens en componenten.
- Richtlijnen maken voor buttons, cards, forms, pricing, hero's en CTA's.

Geen CSS-refactor uitvoeren zonder akkoord.

## Fase 5 - Automatisering En Klantportaal

Doel: Max Web Studio schaalbaar maken als softwarebedrijf.

Status:

- Admin Dashboard v1 is toegevoegd als statische preview op `/public/admin-dashboard.html`.
- Deze preview gebruikt alleen placeholder-data en heeft nog geen login, backend of echte koppelingen.
- De pagina is niet prominent gelinkt op de publieke website en bevat `noindex, nofollow`.

Mogelijke onderdelen:

- Klantportaal
- Projectstatussen
- Intakebeheer
- Contract- en offertegeneratie
- Betaalstatusoverzicht
- Onderhoudsabonnementen
- Supportverzoeken
- Automatische reminders

Deze fase vereist aparte technische keuzes en security review.
## Fase 12.9 - Supabase SQL Audit

Status: afgerond als documentatie/auditfase.

Output:

- `SUPABASE_SQL_AUDIT.md`
- `SUPABASE_EXECUTION_PLAN.md`
- `SUPABASE_SQL_INDEX.md`

Belangrijk voor de roadmap:

- Fase 13 start pas na review van de SQL-audit.
- De productiearchitectuur moet kiezen voor een primaire lijn. Aanbevolen: `supabase/schema.sql` met platformtabellen.
- Oude `customer_*` billing/portal scripts moeten worden geconsolideerd voordat Mollie, e-mail en klantportaal live-hardening op productie gaan.

## Fase 13.0 - Supabase Database Consolidation

Status: afgerond als documentatie/consolidatiefase.

Output:

- `SUPABASE_LEGACY_MAPPING.md`
- `SUPABASE_CANONICAL_SCHEMA.md`
- `SUPABASE_CONSOLIDATED_PLAN.md`
- `SUPABASE_PATCH_PLAN.md`

Roadmapbesluit:

- Canonical lijn wordt `profiles -> customers -> websites -> projects -> quotes -> quote_lines -> invoices -> invoice_lines -> subscriptions`.
- Legacy `customer_websites`, `customer_invoices` en `customer_subscriptions` worden niet meer als basis voor nieuwe productiefeatures gebruikt.
- Auth/RLS hardening schuift door naar Fase 13.1 en blijft geblokkeerd tot review van het consolidated plan.
## Fase 13

### 13.1 - Supabase Auth & Profiles Foundation

Afgerond:

- Profile model/repository/service voorbereid.
- Account requests kunnen profile-concepts worden.
- Profile/customer koppeling is lokaal voorbereid.
- Route guard preview is beschikbaar.
- Demo-login blijft werken.

Volgende logische stap:

- 13.2: route guards, rollen en RLS-readiness strakker maken zonder demo-flow te breken.
- 13.3: RLS/security audit voor productiegebruik.

### 13.2 - Route Guards & Access Control Hardening

Afgerond:

- soft route guards actief
- hard route guards voorbereid
- role navigation actief
- action guards actief voor gevaarlijke acties
- customer access guard soft actief
- access audit logging actief

Volgende logische stap:

- 13.3: RLS/security audit, API security en database policies definitief hard maken.

### 13.3 - RLS Policy Hardening & Security Audit

Afgerond als voorbereiding:

- RLS policy matrix voor canonical tabellen.
- Auth claims strategy op basis van `profiles`, `auth_user_id`, rollen en customer ownership.
- Canonical RLS SQL draft zonder live uitvoering.
- Security risk audit met bekende risico's en mitigaties.
- Developer Mode Security & RLS readiness kaart.
- Extra access-control self-tests voor customer/demo/sales/support/developer/anonymous scenario's.

Niet live:

- RLS SQL is niet uitgevoerd.
- Database-level security staat nog niet hard aan als productiegrens.
- Hard route guards zijn niet standaard actief.

Volgende logische stap:

- Review van de RLS draft en daarna gecontroleerde testuitvoering in een Supabase testomgeving voordat productie-RLS live mag.

### 13.4 - Supabase Test Environment & RLS Dry Run Plan

Afgerond als voorbereiding:

- testomgevingstrategie
- RLS dry-run plan
- testscenario's per rol
- testdata plan
- expected access matrix
- preflight checklist
- testlog template
- Developer Mode RLS testomgeving & dry-run kaart

Niet live:

- geen SQL uitgevoerd
- geen productie-database aangepast
- geen provider switch
- geen harde RLS live execution

Volgende logische stap:

- Supabase testproject inrichten, canonical schema + synthetische testdata uitvoeren, RLS-draft daar testen en testlog invullen. Productie blijft No-Go tot die ronde geslaagd is.

### 13.5 - Supabase Deployment Bundle & Production Readiness

Afgerond als professioneel deploymentproces:

- centrale map `/docs/deployment/`
- deployment README met volgorde en rollback per stap
- SQL bundle index
- production checklist
- rollback procedure
- deployment readiness validator
- Developer Mode `Production Deployment` kaart

Niet live:

- geen SQL uitgevoerd
- geen productie aangepast
- geen RLS live gezet
- geen provider switch

Volgende logische stap:

- Deployment bundle reviewen, testomgeving volgens de bundle opbouwen en pas daarna Go/No-Go opnieuw beoordelen.

### 13.6 - Resolve Deployment Blockers Readiness

Afgerond als voorbereiding:

- deployment blocker model
- localStorage readiness-status onder `maxwebstudioDeploymentBlockers`
- handmatige evidence/notitievelden
- Developer Mode blockeracties
- environment variables checklist
- auth test checklist
- customer isolation checklist

Niet live:

- geen SQL uitgevoerd
- geen productie aangepast
- geen blockers automatisch approved

Volgende logische stap:

- blockers handmatig met echte evidence invullen tijdens testomgeving-uitvoering.

### 14.1 - Supabase Test Environment Execution

Afgerond als readiness/testplan laag:

- test environment service
- deployment bundle validator
- SQL execution order validator
- Developer Mode kaarten voor `Test Environment` en `Production Validation`
- test execution plan
- test results registry template

Niet live:

- geen SQL uitgevoerd
- geen productie aangepast
- geen provider switch
- geen Auth/RLS/Storage/Mollie/Resend live gezet

Volgende logische stap:

- testomgeving handmatig uitvoeren volgens `docs/deployment/TEST_EXECUTION_PLAN.md` en resultaten invullen in `docs/deployment/TEST_RESULTS.md`.

### 14.2 - Deployment Blockers Evidence & Manual Approval Flow

Afgerond als release governance:

- evidence schema per blocker
- handmatige approval flow
- audit trail per blocker
- release decision JSON export
- release decision Markdown
- uitgebreid test results template

Niet live:

- geen SQL uitgevoerd
- geen productie aangepast
- geen Auth/RLS/Storage/Mollie/Resend live gezet

Volgende logische stap:

- echte testomgeving-resultaten invullen en per blocker evidence laten reviewen.

### 14.3 - Complete Test Execution

Afgerond als lokale QA/release-test:

- CRM/klanten, websites, projecten, offertes, facturen, abonnementen lokaal getest
- klantportaal sanitized payload getest
- route guard readiness getest
- deployment/security readiness getest
- release-decision export getest
- `TEST_RESULTS.md` ingevuld
- release decision export opgeslagen

Niet live:

- geen SQL uitgevoerd
- geen productie aangepast
- geen Supabase/Auth/RLS/Storage/Mollie/Resend live gezet

Volgende logische stap:

- Fase 14.4 Supabase testomgeving uitvoeren om blockers te sluiten.

### 14.4 - Supabase Test Environment Validation

Uitgevoerd als veilige readiness-gate, maar nog niet inhoudelijk gevalideerd:

- Supabase test-env-vars gecontroleerd zonder secretwaarden te tonen.
- Supabase CLI beschikbaarheid gecontroleerd.
- Release decision 14.4 vastgelegd.
- Geen SQL uitgevoerd.
- Geen productie geraakt.

Resultaat:

- `NO-GO / BLOCKED`
- Supabase testomgevingvariabelen ontbreken.
- Supabase CLI is niet beschikbaar.
- Auth, RLS, klantisolatie en Storage zijn nog niet bewezen.

Volgende logische stap:

- Apart Supabase testproject configureren, test-env-vars toevoegen, execution route bevestigen en Fase 14.4 opnieuw uitvoeren met echte schema/Auth/RLS/Storage evidence.

### 14.4A - Supabase Test Setup

Afgerond als voorbereiding:

- test-env-vars exact gedocumenteerd
- `.env.example` en `.env.local.example` uitgebreid als veilige invultemplates
- checklist voor apart Supabase testproject toegevoegd
- schema/Auth/RLS/Storage testinstructies vastgelegd
- deployment blockers voorzien van concrete next actions

Niet live:

- geen SQL uitgevoerd
- geen productie geraakt
- geen echte klantdata gebruikt
- geen Supabase project gekoppeld

Volgende logische stap:

- Testproject en test-env-vars door Max klaarzetten, daarna Fase 14.4B uitvoeren voor echte Supabase schema/Auth/RLS/Storage validatie.

### 14.5 - Release Candidate Approval Pack

Afgerond als release-governance voorbereiding:

- finale release candidate checklist toegevoegd
- ontbrekende approvals concreet gemaakt
- backup-evidence requirements vastgelegd
- test/productie env-var confirmation requirements vastgelegd
- rollback approval requirements vastgelegd
- storage review requirements vastgelegd
- release decision 14.5 geëxporteerd als Markdown en JSON

Niet live:

- geen productie deploy
- geen productie databasewijziging
- geen echte klantdata
- geen nieuwe features
- geen approvals automatisch gezet

Status:

- `NO-GO / AWAITING MANUAL APPROVAL`

Volgende logische stap:

- handmatige evidence/approvals invullen en daarna pas een finale GO/NO-GO releasebeslissing nemen.

## Fase 15 - Max Webstudio Operating System

### 15.0 - AI Website Wizard Foundation

Afgerond als technische basis:

- AI Website Wizard architectuurdocument toegevoegd
- workflowconfig toegevoegd
- state model toegevoegd
- placeholder service toegevoegd
- lokale state key gereserveerd
- Developer Mode readiness-kaart toegevoegd

Niet live:

- geen OpenAI-calls
- geen logo-generatie
- geen AI-content
- geen websitebouw
- geen SQL
- geen nieuwe dependencies
- geen API keys

Volgende logische stap:

- intake-UI bouwen waarin klant/medewerker bedrijfsinformatie lokaal kan vastleggen.

### 15.1 - AI Website Wizard Intake UI

Afgerond als eerste zichtbare wizardlaag:

- AI Wizard-module toegevoegd aan het admin-dashboard
- lokale intakevelden toegevoegd
- validatie toegevoegd
- progress en stapnavigatie toegevoegd
- read-only preview toegevoegd
- reset/clear draft toegevoegd
- Developer Mode debug toegevoegd
- opslag blijft `maxwebstudioAiWebsiteWizardState`

Niet live:

- geen OpenAI-calls
- geen AI-content
- geen logo-generatie
- geen websitebouw
- geen SQL
- geen nieuwe dependencies
- geen API keys

Volgende logische stap:

- AI intake/briefing-output voorbereiden op basis van de verzamelde lokale wizard-state, nog steeds zonder externe AI-provider of productie-impact.

## Demo Portfolio

### Demo Portfolio Engine

Afgerond als infrastructuur:

- centrale demo-sites registry toegevoegd
- homepage demo-engine toegevoegd naast de bestaande carousel
- premium desktop/mobile placeholder previews toegevoegd
- `public/demo-sites/bouwbedrijf-demo/` voorbereid als eerste demo-map

Niet live:

- geen inhoudelijke demo-site
- geen echte screenshots
- geen demo-backend
- geen database
- geen AI-generatie

Volgende logische stap:

- `bouwbedrijf-demo` inhoudelijk bouwen en daarna in de registry op `live` zetten met een echte `demoUrl` en thumbnails.

### Bouwbedrijf Demo Site

Afgerond als eerste live demo:

- zelfstandige demo-site in `public/demo-sites/bouwbedrijf-demo/`
- premium one-page bouwbedrijfwebsite gebouwd
- registry bijgewerkt naar status `live`
- portfolio-engine toont actieve live demo-knop
- desktop/mobile preview gebruikt bouw-coverbeeld

Niet live/productie:

- geen echte klant
- geen backend
- geen database
- geen AI-calls

Volgende logische stap:

- volgende demo-site toevoegen via dezelfde engine, bijvoorbeeld `restaurant-demo` of `sportschool-demo`.

### Premium Demo Portfolio Showcase

Afgerond als presentatielaag bovenop de bestaande Demo Portfolio Engine:

- demo-cards tonen nu een premium desktop- en mobiele showcase in een horizontale carousel
- carousel ondersteunt pijlen, dots, swipe/trackpad scroll en keyboard arrows
- desktop toont drie cards tegelijk, tablet twee en mobiel een
- registry uitgebreid met scores, metadata, doelgroep, doorlooptijd, devices, highlights en CTA-data
- registry voorbereid op 20 branches
- bouwbedrijf-demo blijft live gekoppeld en wordt commercieel sterker gepresenteerd
- portfolio-intro versterkt met trust stats: 20+ branches, 100% responsive, SEO-klaar en conversiegericht
- CTA's sturen naar de live demo en bestaande aanvraagsectie
- oude dubbele hardcoded demo-carousel verwijderd van de homepage

Niet gewijzigd:

- geen nieuwe demo-site gebouwd
- geen database of Supabase toegevoegd
- geen backend of AI-calls toegevoegd

Volgende geplande demo:

- `restaurant-demo`.

## Fase 15.x - Architectuur & Productie-roadmap

Afgerond als documentatie- en beslisfase:

- `docs/PRODUCTION_ARCHITECTURE.md` toegevoegd.
- `docs/MODULE_BOUNDARIES.md` toegevoegd.
- demo/local, Supabase-productie, legacy en toekomstige AI-grenzen vastgelegd.

Aanbevolen volgorde vanaf nu:

1. Public website live/source consistency en conversie-QA.
2. Supabase testomgeving en release blockers volledig sluiten.
3. CRM canonical data live maken via Supabase providers.
4. Klantportaal live read-data + Auth/RLS hardmaken.
5. Storage, Resend en Mollie test/live-validatie.
6. Release candidate en productie GO.
7. AI Website Wizard pas daarna uitbreiden met echte AI-providerintegraties.
8. Leadfinder en sales automation pas na stabiele productieplatformbasis.

Niet te vroeg bouwen:

- OpenAI-calls.
- live Mollie payments.
- leadfinder met externe databronnen.
- klantportaal live zonder harde Auth/RLS.
- nieuwe SQL uitvoeren zonder aparte expliciete fase.

## Fase 16 - Klantportaal afronden

Afgerond als demo/local/hybrid klantportaaluitbreiding:

- compleet klantdashboard met extra KPI's
- projectstatus met voortgang en tijdlijn
- wijzigingsverzoeken
- berichten
- notificaties
- Supabase/data-readiness per module

Nieuwe localStorage voorbereiding:

- `maxwebstudioChangeRequests`
- `maxwebstudioClientPortalMessages`
- `maxwebstudioClientPortalNotifications`

Volgende logische stappen:

1. Klantportaal testdata/seeder uitbreiden met berichten, notificaties en wijzigingsverzoeken.
2. Daarna live Auth/RLS/customer isolation opnieuw valideren.
3. Daarna Supabase-read voor klantportaalmodules gecontroleerd activeren.

## Fase 17 - CRM Completion & Internal Workflow Readiness

Afgerond als local/demo CRM-workflowuitbreiding:

- admin-dashboard bevat nu een centrale workflowsectie
- interne opvolgacties kunnen worden aangemaakt, gekoppeld en beheerd
- workflowtaken koppelen aan klanten, websites, projecten, offertes, facturen en abonnementen
- statusflow: nieuw, open, in behandeling, wacht op klant, afgerond, gearchiveerd
- KPI's voor open opvolging, hoge prioriteit, achterstallig en komende 7 dagen
- canonical datalijn zichtbaar in het CRM

Nieuwe localStorage voorbereiding:

- `maxwebstudioCrmTasks`

Nog demo/local:

- workflowtaken zijn geen productiebron
- geen Supabase writes
- geen externe API's
- geen live notificaties of e-mailacties

Aanbevolen volgende stappen:

1. CRM-workflow testen met demo-klanten en lopende projecten.
2. Supabase testomgeving opnieuw valideren voordat workflowdata naar productie gaat.
3. Later een canonical `crm_tasks`/`activity_log` productielaag ontwerpen.
4. Daarna pas Leadfinder, AI-acties en live automatiseringen op deze workflow aansluiten.

## Fase 18 - Leadfinder Foundation & Sales Pipeline Readiness

Afgerond als local/demo sales-pipeline foundation:

- admin-dashboard bevat nu een Leadfinder-sectie
- prospects kunnen handmatig worden geregistreerd
- velden voor branche, regio, website-status, leadscore, belstatus en opvolgdatum zijn voorbereid
- filters en zoekfunctie zijn toegevoegd
- leads kunnen notities krijgen en belstatus wijzigen
- leads kunnen een CRM Workflow opvolgtaak aanmaken
- leads kunnen lokaal naar CRM-klantrecords worden geconverteerd

Nieuwe localStorage voorbereiding:

- `maxwebstudioLeadFinderLeads`

Nog demo/local:

- geen scraping
- geen Google Maps API
- geen externe leadbronnen
- geen Supabase writes
- geen AI lead scoring

Aanbevolen volgende stappen:

1. Leadfinder testen met realistische demo-prospects.
2. Daarna bepalen welke salesstatussen en opvolgprocessen leidend worden.
3. Later pas externe leadbronnen, AI lead scoring en sales automation toevoegen.
4. Productie-koppeling pas ontwerpen na Supabase Auth/RLS en canonical CRM-validatie.

## Fase 19 - AI Website Wizard Intake & Draft Engine Readiness

Afgerond als local/demo wizarduitbreiding:

- extra intakevelden voor regio, tone of voice, concurrenten, SEO zoekwoorden en klantdoel
- koppeling aan lokale klanten, websites en projecten
- lokale template/mock-generator voor demo-drafts
- output voor homepage structuur, hero, diensten, over-ons, FAQ's, CTA's, SEO en projectbrief
- Developer Mode toont draft-output readiness

Gebruikte localStorage:

- `maxwebstudioAiWebsiteWizardState`

Nog demo/local:

- geen OpenAI API
- geen API keys
- geen Supabase writes
- geen echte websitegenerator
- geen logo-generatie

Aanbevolen volgende stappen:

1. Demo-drafts testen met bestaande CRM-klanten en projecten.
2. Bepalen welke draft-output straks klantveilig zichtbaar mag worden.
3. Pas na productie Auth/RLS een server-side AI-provideradapter ontwerpen.
4. Daarna AI-output koppelen aan projectbrief, offertevoorstel en website-scaffold.

## Fase 20 - AI Admin Assistant Readiness

Afgerond als local/demo AI-readinesslaag:

- centrale AI Assistent-sectie in het admin-dashboard
- mockacties voor CRM, Leadfinder, offertes, projecten, SEO, klantberichten en wijzigingsverzoeken
- lokale output-preview zonder externe calls
- readiness/blokkades zichtbaar voor echte AI-integratie
- lokale previewgeschiedenis voorbereid

Nieuwe localStorage voorbereiding:

- `maxwebstudioAiAdminAssistantDrafts`

Nog demo/local:

- geen OpenAI API
- geen API keys
- geen server-side AI-provideradapter
- geen productiegegevens
- geen automatische klantcommunicatie

Aanbevolen volgende stappen:

1. Bepalen welke AI-acties als eerste echte server-side adapter krijgen.
2. Promptlogging, consent en rate limiting ontwerpen.
3. Pas na Auth/RLS en privacybesluit echte AI-calls activeren.
4. AI-output altijd eerst als admin-review houden voordat klantcommunicatie wordt verstuurd.

## Fase 21 - Supabase Production Readiness Plan

Afgerond als architectuur/readinessfase:

- alle localStorage keys en demo/local modules geinventariseerd
- mapping gemaakt naar toekomstige Supabase-tabellen
- canonical productielijn bevestigd
- aanvullende productietabellen benoemd voor leads, CRM-taken, klantportaalberichten, notificaties, AI-drafts en audit logs
- per tabel RLS/security-risico's en migratiebron vastgelegd
- gefaseerd migratieplan vastgelegd van Auth/profiles tot RLS/security/audit

Nieuw document:

- `SUPABASE_PRODUCTION_READINESS_PLAN.md`

Nog niet uitgevoerd:

- geen SQL
- geen productieaanpassing
- geen provider switch
- geen API keys
- geen externe integraties

Aanbevolen volgende stappen:

1. Review het readiness plan en bevestig de aanvullende tabellen.
2. Werk daarna het canonical schema/SQL-plan bij in een aparte expliciete fase.
3. Valideer opnieuw in Supabase testomgeving voordat productie-RLS, Storage, Mollie, Resend of AI live gaan.
4. Houd legacy `customer_*` tabellen uitgesloten van nieuwe productiefeatures.

## Fase 22 - Supabase Auth & Profiles Foundation

Afgerond als veilige Auth/profiles voorbereiding:

- Auth-readiness service toegevoegd.
- Developer Mode toont Auth & Profiles foundation status.
- Rollen en pagina-toegang zijn bevestigd.
- `auth.users -> profiles -> customers` is vastgelegd als productiekoppeling.
- Demo-login blijft actief als lokale fallback.

Nog niet live:

- geen SQL
- geen production Auth writes
- geen hard route guards standaard aan
- geen RLS live
- geen secrets/API keys

Aanbevolen volgende stappen:

1. Auth/profiles readiness reviewen.
2. Supabase testgebruikers en profile-koppeling in testomgeving bewijzen.
3. Customer A/B isolation opnieuw testen met echte Auth users.
4. Daarna pas een aparte fase plannen voor hard route guards en production Auth activation.

## Fase 23 - Supabase Schema Draft & RLS Policy Plan

Afgerond als ontwerp/readinessfase:

- conceptschema per canonical en aanvullende productietabel uitgewerkt
- ownershipmodel per tabel vastgelegd
- roltoegang per tabel en per rol aangescherpt
- RLS policy matrix uitgebreid met leads, CRM-taken, klantportaalberichten, notificaties, AI-drafts en audit logs
- audit logging en AI/privacy-aanpak vastgelegd

Nieuw document:

- `SUPABASE_RLS_POLICY_PLAN.md`

Nog niet uitgevoerd:

- geen SQL
- geen schemawijziging
- geen productiegegevens
- geen RLS live
- geen API keys of externe services

Aanbevolen volgende stappen:

1. Review Fase 23 schema/RLS-plan.
2. Vertaal het plan pas daarna naar een expliciete SQL patch/migration draft.
3. Test de SQL uitsluitend in Supabase testomgeving.
4. Herhaal Customer A/B isolation en audit/security checks voordat productie ooit wordt geraakt.

## Fase 24 - Supabase Migration Scripts Draft

Afgerond als draft/readinessfase:

- aparte map `supabase/migration-drafts/`
- schema/tables draft
- indexes draft
- RLS enablement draft
- RLS policies draft
- audit logging foundation draft
- optionele demo seed draft
- reviewchecklist voor schema/RLS/backup/staging/rollback/approval

Nog niet uitgevoerd:

- geen SQL
- geen Supabase CLI
- geen productiegegevens
- geen schemawijziging
- geen runtimewijziging

Aanbevolen volgende stappen:

1. Review de migration drafts bestand voor bestand.
2. Corrigeer eventuele schema/RLS opmerkingen in een aparte reviewfase.
3. Voer daarna alleen in een Supabase testproject uit.
4. Registreer test-evidence en Customer A/B isolation-resultaten.
5. Productie blijft No-Go tot release approval.

## Fase 25 - Staging/Test Supabase Execution Plan

Afgerond als QA/release-planning:

- staging execution plan voor Supabase migration drafts
- checklist voor preflight, SQL draft execution, rollen/isolatie, modulechecks, audit/security en evidence
- rollbackplan voor staging/test
- testresultatenregister voorbereid voor Fase 25 evidence

Nog niet uitgevoerd:

- geen SQL
- geen Supabase CLI
- geen testprojectwijziging
- geen productiegegevens
- geen secrets/API keys

Aanbevolen volgende stappen:

1. Handmatige review van Fase 24 drafts en Fase 25 execution plan.
2. Daarna pas expliciet starten met een echte staging/test execution fase.
3. Alle resultaten vastleggen in `TEST_RESULTS.md` en deployment blockers.
4. Productie blijft No-Go tot staging evidence en approvals compleet zijn.

## Fase 26 - Staging Execution Readiness UI

Afgerond als Developer Mode/readinessfase:

- Supabase Staging Readiness-kaart toegevoegd aan Developer Mode.
- Lokale readiness-service toegevoegd voor migration drafts, staging checklist, rollbackplan, testresultaten, approvals en blockers.
- GO/NO-GO wordt afgeleid uit bestaande deployment blockers en ontbrekende evidence.
- De UI bevestigt expliciet dat SQL, Supabase CLI en productieacties niet zijn uitgevoerd.

Nog niet uitgevoerd:

- geen SQL
- geen Supabase CLI
- geen Supabase calls
- geen testprojectwijziging
- geen productiegegevens
- geen secrets/API keys

Aanbevolen volgende stappen:

1. Vul ontbrekende approvals/evidence in zodra handmatig gereviewd.
2. Voer daarna pas expliciet een echte staging/test execution fase uit.
3. Leg alle staging-resultaten vast in `TEST_RESULTS.md`.
4. Houd productie op NO-GO tot alle kritieke checks groen zijn.

## Fase 27 - Master Roadmap v2.0 & Max AI Experience Architecture

Afgerond als strategische architectuurfase:

- Max AI is vastgelegd als centrale Experience Layer van het volledige platform.
- Master Roadmap v2.0 is toegevoegd.
- User journey en module map zijn toegevoegd.
- AI securitygrenzen zijn aangescherpt.

Nieuwe strategische documenten:

- `MASTER_ROADMAP_V2.md`
- `MAX_AI_ARCHITECTURE.md`
- `MAX_AI_USER_JOURNEY.md`
- `MAX_AI_MODULE_MAP.md`

Roadmapbesluit:

1. Eerst Supabase staging execution en evidence afronden.
2. Daarna Supabase read/write lagen gecontroleerd activeren.
3. Daarna Max AI als public intake MVP zichtbaar maken zonder echte AI-provider.
4. Daarna pas server-side AI adapter en OpenAI MVP.
5. Websitegenerator, voice AI, sales agent en marketing AI blijven V3.

Nog niet uitgevoerd:

- geen codewijziging in runtime
- geen SQL
- geen OpenAI
- geen Supabase wijziging
- geen API keys
- geen externe integraties

Aanbevolen volgende stappen:

1. Review Master Roadmap v2.0.
2. Bevestig dat Max AI de centrale productlaag wordt.
3. Hervat daarna Fase 28: Supabase staging execution met evidence.
4. Bouw pas daarna zichtbare Max AI intake MVP.

## Fase 27.1 - Max AI Brand Guidelines

Afgerond als merk- en productrichtlijn:

- Max AI is beschreven als digitale collega van Max Webstudio.
- Persoonlijkheid, tone of voice en veiligheidsgrenzen zijn vastgelegd.
- Visuele richting voor de toekomstige mascotte is vastgelegd zonder UI of asset toe te voegen.
- Fase 33 blijft het moment waarop Max AI voor bezoekers zichtbaar wordt.

Nieuw document:

- `MAX_AI_BRAND_GUIDELINES.md`

Nog niet uitgevoerd:

- geen code
- geen UI
- geen afbeelding
- geen OpenAI
- geen Supabase
- geen API keys

Aanbevolen volgende stap:

1. Geen extra documentatiefase meer toevoegen.
2. Start daarna Fase 28: Supabase Staging Execution.

## Fase 27.2 - Max AI Persona & Interaction Model

Afgerond als laatste strategische productdocument:

- Max AI is vastgelegd als digitale webdesigner van Max Webstudio.
- De drie rollen zijn vastgelegd: Adviseur, Projectmanager en Collega.
- Het interaction model is vastgelegd: begrijpen, verduidelijken, adviseren, voorbereiden.
- De productbelofte is vastgelegd: "Ik help je van het eerste idee tot de livegang van je website."

Nieuw document:

- `MAX_AI_PERSONA.md`

Nog niet uitgevoerd:

- geen code
- geen UI
- geen afbeelding
- geen OpenAI
- geen Supabase
- geen SQL
- geen API keys

Roadmapbesluit:

Vanaf dit punt worden geen extra strategische visiedocumenten toegevoegd voordat de productie-implementatie hervat wordt.

Volgende fase:

- Fase 28: Supabase Staging Execution.

## Fase 28 - Supabase Staging Execution

Gestart met productieplatform-mindset, maar veilig geblokkeerd voordat SQL werd uitgevoerd.

Preflight:

- `.env.local` aanwezig en door Git genegeerd.
- `APP_ENV=test`.
- `APP_ENVIRONMENT=test`.
- Supabase testconfig aanwezig.
- Supabase CLI ontbreekt.
- Test-only database connection string ontbreekt.

Besluit:

- Geen SQL uitvoeren zonder veilige execution route.
- Productie blijft onaangeraakt.
- Release blijft `NO-GO / BLOCKED`.

Volgende actie:

1. Kies execution route:
   - Supabase CLI installeren/configureren; of
   - test-only database connection string toevoegen; of
   - SQL-drafts handmatig uitvoeren in Supabase SQL Editor met evidence.
2. Hervat Fase 28 vanaf `001_schema_tables.sql`.
3. Leg alle resultaten vast in `TEST_RESULTS.md`.

## Fase 28.1 - Development Environment & Staging Readiness

Afgerond als release-engineering readinessfase.

Uitkomst:

- Huidige status: `NOT_READY`.
- Supabase CLI ontbreekt.
- Test-only database connection string ontbreekt.
- psql is aanwezig maar kan zonder connection string niet veilig worden gebruikt.
- Voorkeursroute is Supabase CLI.
- Fallbackroute is psql met test-only database connection string.

Nieuwe documenten:

- `DEVELOPMENT_STAGING_READINESS.md`
- `deployment/DEVELOPMENT_STAGING_READY_CHECKLIST.md`

Roadmapbesluit:

1. Geen nieuwe productfeatures bouwen voordat staging execution uitvoerbaar is.
2. Eerst tooling of test-only DB-verbinding gereedmaken.
3. Daarna Fase 28 opnieuw uitvoeren.
4. Daarna Fase 28.2: resultaten beoordelen en GO/NO-GO voor datalaag.
5. Pas daarna Fase 29: Supabase Data Layer.

### Hercontrole Supabase CLI

Uitkomst:

- Supabase CLI is aanwezig.
- Versie: `2.108.0`.
- `.env.local` blijft veilig genegeerd.
- Test/staging env-context is aanwezig.
- Geen productie-indicatoren gevonden.
- CLI is gelinkt aan `maxwebstudio-test`.
- Environment is `READY_FOR_STAGING_EXECUTION`.

Resterend aandachtspunt:

- Gebruik `/opt/homebrew/bin/supabase` als expliciet CLI-pad.
- Geen psql fallback nodig zolang de Supabase CLI-route wordt gebruikt.

Volgende actie:

Herstart Fase 28 en voer de migration drafts gecontroleerd uit op het gelinkte test/staging project.

### Rerun resultaat

Uitkomst:

- `001_schema_tables.sql`: PASS.
- `002_indexes.sql`: FAIL.
- Resterende migration drafts: niet uitgevoerd.

Blocker:

- Staging heeft schema drift: `public.leads` mist `lead_score`.
- RLS/customer isolation mag nog niet worden getest op deze driftende basis.

Volgende actie:

1. Geen schema-drift patch maken.
2. Volg `docs/deployment/STAGING_RESET_PLAN.md`.
3. Reset staging of maak een nieuwe schone testbranch na expliciete approval.
4. Herhaal Fase 28 vanaf `001_schema_tables.sql`.
5. Pas daarna Fase 28.2: GO/NO-GO voor datalaag.

### Staging resetplan

Uitkomst:

- Staging reset/nieuwe testbranch is gekozen als voorkeursroute boven drift patches.
- Resetplan documenteert data-impact, export/evidence, resetroute, validatie en rollbackrelatie.
- Fase 28 blijft `NO-GO / BLOCKED` tot handmatige resetapproval en een schone rerun.

Nieuw document:

- `deployment/STAGING_RESET_PLAN.md`

### Staging execution na reset

Uitkomst:

- Staging `public` schema is gereset.
- Alle migration drafts `001` t/m `006` zijn succesvol uitgevoerd.
- Eerdere `lead_score` schema drift is opgelost.
- Structurele validatie is geslaagd: tabellen, indexes, RLS enablement, policies en demo seed.

Nieuwe blocker:

- Customer A/B isolation is nog niet bewezen.
- Runtime rol `authenticated` mist tabelrechten op `public.customers`.
- Release blijft `NO-GO / BLOCKED`.

Volgende actie:

1. Maak een minimale runtime role grants patch/migration.
2. Review grants per tabel/rol.
3. Voer alleen op staging uit na expliciete approval.
4. Herhaal RLS/customer-isolation tests.

## Fase 28.2 - Runtime Role Grants Patch

Status: `STAGING VALIDATED / PRODUCTION NO-GO`

Uitkomst:

- Nieuwe draft migration toegevoegd: `supabase/migration-drafts/007_runtime_role_grants.sql`.
- Patch is bedoeld om PostgreSQL runtime privileges te geven voordat RLS policies kunnen evalueren.
- `anon` krijgt geen directe klantdatatabelrechten.
- `authenticated` krijgt alleen SQL-operaties die vervolgens door RLS worden beperkt.
- `service_role` blijft server-side.
- Audit insert helper blijft service-role-only.

Uitvoering:

- `007_runtime_role_grants.sql` uitgevoerd op uitsluitend `maxwebstudio-test`.
- Customer A/B isolation PASS.
- Demo user isolation PASS.
- Leadfinder blijft intern voor customers.
- Audit logs blijven afgeschermd voor customers.
- Interne basisrollen werken volgens policy.

Besluit:

- Supabase staging database foundation is `GO`.
- Productie blijft `NO-GO` tot production approvals en live-readinesschecks compleet zijn.

Volgende actie:

1. Fase 28.3: formele data-layer GO/NO-GO review; of
2. start Fase 29: Supabase Data Layer, met behoud van hybrid fallback.

## Fase 29 - Supabase Data Layer MVP

Status: `AFGEROND`

Scope:

- Customers read service.
- Websites read service.
- Projects read service.
- Hybrid/local fallback.
- Feature/readiness status via `supabaseDataLayerService`.

Niet in scope:

- Productieproject.
- Echte klantdata.
- Brede writes.
- OpenAI/Mollie/Resend.

Volgende stap:

1. Developer/admin UI later gericht koppelen aan de MVP-service.
2. Daarna klantportaal/CRM stap voor stap op echte data aansluiten.
3. Write-mode pas na expliciete releaseapproval en aanvullende canonical write-mapping.

## Fase 30 - Klantportaal Supabase Read MVP

Status: `AFGEROND`

Scope:

- Klantportaal leest `customers`, `websites` en `projects` via de Supabase Data Layer MVP.
- Readinesskaart toont data-layer mode, modules, write-status en fallback.
- Local/demo fallback blijft intact.

Niet in scope:

- Productieproject.
- Echte klantdata.
- Writes.
- Offertes/facturen/abonnementen volledig live maken.

Volgende stap:

1. CRM/admin gericht aansluiten op dezelfde read-layer.
2. Daarna pas gecontroleerde write-mode voorbereiden.

## Fase 31 - CRM/Admin Supabase Read MVP

Status: `AFGEROND`

Scope:

- Admin/CRM leest `customers`, `websites` en `projects` via de Supabase Data Layer MVP.
- Developer Mode toont data-layer status en fallback.
- Local/demo fallback blijft intact.

Niet in scope:

- Productieproject.
- Echte klantdata.
- Writes.
- Offertes/facturen/abonnementen volledig live maken.

Volgende stap:

1. Data-layer review voor write-readiness voorbereiden.
2. Daarna per module gecontroleerde write-mode plannen.

## Fase 32 - Finance Data Layer MVP

Status: `AFGEROND`

Scope:

- Data-layer read support voor `quotes`, `quote_lines`, `invoices`, `invoice_lines` en `subscriptions`.
- Klantportaal gebruikt de finance read-layer voor offertes, facturen en abonnementen.
- Admin/CRM gebruikt de finance read-layer voor offertes, facturen en abonnementen.
- Local/demo fallback blijft intact.

Niet in scope:

- Productieproject.
- Echte klantdata.
- Writes.
- Mollie live payments.
- Resend/OpenAI.

Volgende stap:

1. Data-layer GO/NO-GO review voor write-readiness.
2. Daarna gecontroleerde write-mode per finance module ontwerpen.

## Fase 33 - Operations Data Layer MVP

Status: `AFGEROND`

Scope:

- Data-layer read support voor `files`, `change_requests`, `client_portal_messages`, `client_portal_notifications` en `crm_tasks`.
- Klantportaal gebruikt de operations read-layer voor bestanden, wijzigingsverzoeken, berichten en notificaties.
- Admin/CRM gebruikt de read-layer voor bestandsmetadata.
- Developer Mode toont operationsmodules binnen de Supabase Data Layer MVP-status.
- Local/demo fallback blijft intact.

Niet in scope:

- Productieproject.
- Echte klantdata.
- Writes.
- Supabase Storage uploads.
- OpenAI/Mollie/Resend.

Volgende stap:

1. Leadfinder-data read-layer voorbereiden of data-layer write-readiness review uitvoeren.
2. Daarna pas gecontroleerde write-mode per module plannen.

## Fase 34 - Leadfinder Data Layer MVP

Status: `AFGEROND`

Scope:

- Data-layer read support voor `leads`.
- Admin/Leadfinder gebruikt de read-layer voor prospects met local/demo fallback.
- Developer Mode toont Leadfinder-bronstatus binnen de Supabase Data Layer MVP-status.
- Lokale opvolgtaken blijven mogelijk vanuit zowel lokale als read-only leads.

Niet in scope:

- Scraping.
- Google Maps API.
- Externe leaddatabronnen.
- Productieproject.
- Echte klantdata.
- Writes.
- OpenAI/Mollie/Resend.

Volgende stap:

1. Read-only datalaag reviewen als geheel.
2. Daarna gecontroleerde write-mode per module ontwerpen.

## Fase 35 - Supabase Write Readiness Plan

Status: `AFGEROND`

Scope:

- Read-only Supabase/hybrid modules geinventariseerd.
- Gefaseerd write-plan vastgelegd voor low-risk, medium-risk, high-risk en restricted writes.
- Per eerste write-MVP vastgelegd: RLS, validatie, audit logging, rollback/fallback, UI-impact en risico.

Aanbevolen eerste write-MVP:

1. `crm_tasks` create.
2. Leadnotitie append.
3. `change_requests` create.
4. `client_portal_messages` create.

Niet in scope:

- Writes activeren.
- SQL uitvoeren.
- Productieproject.
- Echte klantdata.
- OpenAI/Mollie/Resend.

Volgende stap:

1. Fase 35A: gated `crm_tasks` create voorbereiden en eerst op staging bewijzen.
2. Daarna pas andere low-risk writes toevoegen.

## Fase 35A - Low-risk Supabase Write MVP: CRM Tasks

Status: `AFGEROND`

Scope:

- `crm_tasks` create-only write pad toegevoegd.
- CRM Workflow en Leadfinder-opvolgtaken gebruiken een write-aware service met local fallback.
- Feature/readiness gate via `supabase-write-test` en `maxwebstudioCrmTaskWriteEnabled=true`.
- Developer Mode toont laatste CRM task write/fallback status.

Niet in scope:

- Supabase update/delete voor CRM-taken.
- Leadnotities, wijzigingsverzoeken, klantportaalberichten.
- Facturen, betalingen, rollen, storage, AI-mutaties.
- Productieproject of echte klantdata.

Volgende stap:

1. Fase 35B: leadnotitie append voorbereiden als volgende low-risk write.
2. Daarna `change_requests` create en `client_portal_messages` create gefaseerd toevoegen.

## Fase 35A.1 - CRM Task Staging Write Validation

Status: `AFGEROND`

Scope:

- Bestaande Fase 35A CRM task write MVP gevalideerd op staging/test.
- Fallback met gate uit getest.
- RLS-blokkade voor anonymous en authenticated users zonder profile getest.
- Sales-role write en readback getest.

Resultaat:

- `crm_tasks` create-only write MVP is bewezen op staging.
- Productie-write-mode blijft geblokkeerd.
- Testdata is gemarkeerd als demo/test en safe-to-archive.

Volgende stap:

1. Fase 35B: leadnotitie append als volgende low-risk write ontwerpen en gated bouwen.
2. Daarna pas change requests en klantportaalberichten.

## Fase 35B - Low-risk Supabase Write MVP: Lead Notes

Status: `AFGEROND / STAGING GEVALIDEERD`

Scope:

- Leadnotities append-only/veldbeperkt toegevoegd.
- Alleen `notes`, `updated_at` en veilige metadata mogen remote wijzigen.
- Leadfinder detailnotities gebruiken een write-aware service met local fallback.
- Feature/readiness gate via `supabase-write-test` en `maxwebstudioLeadNoteWriteEnabled=true`.

Niet in scope:

- Lead delete.
- Volledige lead overwrite.
- Scraping of externe leadbronnen.
- Productieproject of echte klantdata.
- Facturen, betalingen, rollen, storage, AI-mutaties.

Validatie:

- Local fallback: `PASS`.
- DNS/root cause: `PASS`; eerdere `ENOTFOUND` is opgelost.
- Staging write/RLS: `PASS` met run `phase-35b1-rerun-1782775482334`.
- Allowed fields: alleen `notes`, `updated_at` en veilige metadata.
- Customer/no-profile/anonymous: geblokkeerd of empty result zoals verwacht.
- Testdata: synthetisch, `environment=test`, `is_demo=false`, `safeToArchive=true`.

Volgende stap:

1. Productie-write-mode blijft dicht tot audit/approval.
2. Daarna pas `change_requests` create als volgende low-risk write oppakken.

## Fase 35C - Low-risk Supabase Write MVP: Change Requests

Status: `AFGEROND / STAGING GEVALIDEERD`

Scope:

- Customer create-only wijzigingsverzoeken vanuit het klantportaal.
- Geen update, delete of statuswijziging door customer.
- Local/demo fallback behouden.
- Feature/readiness gate via `supabase-write-test` en `maxwebstudioChangeRequestWriteEnabled=true`.

Validatie:

- Local fallback: `PASS`.
- Eerste stagingrun vond een RLS customer_id-spoofingrisico.
- RLS-patch `008_change_request_customer_ownership.sql` is op staging uitgevoerd.
- Herhaalde staging write/RLS: `PASS` met run `phase-35c-rerun-1782798584503`.
- Eigen customer insert: HTTP 201.
- Spoofing met/zonder `auth_user_id`: HTTP 403.
- Anonymous insert: HTTP 401.
- Customer read isolation: eigen rows 1, andere rows 0.

Volgende stap:

1. Productie-write-mode blijft dicht tot audit/approval.
2. Daarna pas `client_portal_messages` create als laatste Sprint 1 low-risk write oppakken.

## Fase 35D - Low-risk Supabase Write MVP: Client Portal Messages

Status: `AFGEROND / STAGING GEVALIDEERD`

Scope:

- Customer create-only klantportaalberichten.
- Geen update, delete of sender spoofing.
- Local/demo fallback behouden.
- Feature/readiness gate via `supabase-write-test` en `maxwebstudioClientPortalMessageWriteEnabled=true`.

Validatie:

- Local fallback: `PASS`.
- RLS-patch `009_client_portal_message_customer_ownership.sql` is op staging uitgevoerd.
- Staging write/RLS: `PASS` met run `phase-35d-1782800213876`.
- Eigen customer insert: HTTP 201.
- Sender spoofing, customer spoofing, sender profile spoofing en no-profile: HTTP 403.
- Anonymous insert: HTTP 401.
- Customer read isolation: eigen rows 1, andere rows 0.

Sprint 1 resultaat:

- CRM Tasks: afgerond.
- Lead Notes: afgerond.
- Change Requests: afgerond.
- Client Portal Messages: afgerond.

Volgende stap:

1. Korte Sprint Review voor low-risk writes.
2. Daarna pas Sprint 2 medium-risk writes plannen.

## Sprint 1 Review - Low-risk Writes Completion

Status: `AFGEROND`

Samenvatting:

- CRM Tasks: staging PASS.
- Lead Notes: staging PASS.
- Change Requests: staging PASS.
- Client Portal Messages: staging PASS.

Vastgelegd in:

- `docs/SPRINT_1_LOW_RISK_WRITES_REVIEW.md`
- `docs/deployment/TEST_RESULTS.md`
- `docs/deployment/DEPLOYMENT_BLOCKERS.md`
- `docs/SUPABASE_WRITE_READINESS_PLAN.md`

Belangrijk:

- Productie-write-mode blijft dicht.
- Server-side audit logging ontbreekt nog.
- Patches `008` en `009` zijn staging-bewezen, maar productie-uitvoering vereist release approval.
- Sprint 2 mag pas starten na expliciete keuze voor de eerste medium-risk write.

Sprint 2 - Operationele Workflow Writes:

1. `projects` status/fase/voortgang update.
2. `customers` beperkte contactvelden update.
3. `websites` status/notities/onderhoudsvelden update.

## Sprint 2A - Project Status Write MVP

Status: `AFGEROND`

Samenvatting:

- Medium-risk write gestart met de kleinste veilige projectmutatie.
- Alleen `projects.status`, `projects.phase` en `projects.progress` zijn write-enabled.
- Feature gate: `maxwebstudioProjectStatusWriteEnabled=true` + provider mode `supabase-write-test`.
- Local/demo fallback blijft actief.
- Productie-write-mode blijft dicht.

Staging evidence:

- Patch `010_project_status_update_grants.sql` uitgevoerd op staging.
- PASS-run: `phase-35-2a-1782801332755`.
- Support update PASS.
- Customer/no-profile/anonymous blocked of 0 rows changed.
- Spoofing van `customer_id` en extra velden geblokkeerd.
- Klantportaal-read ziet bijgewerkte status.

Volgende stap:

1. Sprint 2 Review uitvoeren.
2. Daarna pas Infrastructure Sprint plannen.
3. Nog niet starten met finance, storage of AI-writes.

## Sprint 2B - Customer Contact Write MVP

Status: `AFGEROND / STAGING GEVALIDEERD`

Samenvatting:

- Medium-risk write voorbereid voor beperkte klantcontactmutaties.
- Alleen `customers.name`, `customers.email`, `customers.phone` en `customers.notes` zijn write-enabled.
- Feature gate: `maxwebstudioCustomerContactWriteEnabled=true` + provider mode `supabase-write-test`.
- Local/demo fallback blijft actief.
- Productie-write-mode blijft dicht.

Staging evidence:

- Patch `011_customer_contact_update_grants.sql` is uitgevoerd op staging.
- Local fallback: `PASS`.
- Staging patch/write/RLS/readback: `PASS`.
- PASS-run: `sprint-2b-1782814316233`.
- Interne sales-role update: HTTP 200.
- Customer/no-profile: effectieve update geblokkeerd met 0 gewijzigde rijen.
- Anonymous: HTTP 401.
- Spoofing van status/auth/company: HTTP 403.

Sprint 2 acceptance:

- 2A Project Status Updates: bewezen.
- 2B Customer Contact Updates: bewezen.
- 2C Website Operational Updates: bewezen.
- Sprint completion is `100%` op basis van bewezen acceptance criteria.

Volgende stap:

1. Voer Sprint 2 Review uit.
2. Houd productie-write-mode dicht.
3. Start daarna pas de Infrastructure Sprint.

## Sprint 2C - Website Operational Write MVP

Status: `AFGEROND / STAGING GEVALIDEERD`

Samenvatting:

- Medium-risk write voorbereid voor beperkte operationele websitevelden.
- Alleen `websites.status`, `websites.care_package`, `websites.notes` en `websites.last_checked_at` zijn write-enabled.
- Feature gate: `maxwebstudioWebsiteOperationalWriteEnabled=true` + provider mode `supabase-write-test`.
- Local/demo fallback blijft actief.
- Productie-write-mode blijft dicht.

Staging evidence:

- Patch `012_website_operational_update_grants.sql` is uitgevoerd op staging.
- Local fallback: `PASS`.
- Staging patch/write/RLS/readback: `PASS`.
- PASS-run: `sprint-2c-1782814909471`.
- Interne developer-role update: HTTP 200.
- Customer/no-profile: effectieve update geblokkeerd met 0 gewijzigde rijen.
- Anonymous: HTTP 401.
- Spoofing van customer/domain/Netlify: HTTP 403.
- Klantportaal-read ziet bijgewerkte website status.

Sprint 2 acceptance:

- 2A Project Status Updates: bewezen.
- 2B Customer Contact Updates: bewezen.
- 2C Website Operational Updates: bewezen.
- Sprint completion is `100%`.

Volgende stap:

1. Sprint 2 Review uitvoeren.
2. Productie-write-mode dicht houden tot release approval.
3. Infrastructure Sprint pas starten na review.

## Sprint 2 Review - Operationele Workflow Writes

Status: `AFGEROND`

Vastgelegd in:

- `docs/SPRINT_2_OPERATIONAL_WORKFLOW_WRITES_REVIEW.md`

Samenvatting:

- 2A Project Status Updates: staging PASS.
- 2B Customer Contact Updates: staging PASS.
- 2C Website Operational Updates: staging PASS.
- Sprint completion: `100%`.
- Productie-write-mode blijft `NO-GO`.

Volgende sprint:

`Sprint 3 - Production Readiness`

Focus:

1. Server-side audit logging.
2. Storage/file-upload security.
3. Monitoring en observability.
4. Backups en restore evidence.
5. Release approvals en production write-governance.
6. Environment hardening.

Niet starten met finance, payments, storage uploads of AI-writes voordat deze production readiness-basis verder is afgerond.

## Hoofdstuk 1 - Platform Foundation

Status: `AFGEROND`

Dit hoofdstuk omvat de technische fundering:

- Supabase staging foundation;
- canonical schema en RLS;
- repository/data layer;
- read-only hybrid modules;
- Sprint 1 Low-risk Writes;
- Sprint 2 Operationele Workflow Writes;
- deployment/readiness proces;
- Max AI architectuur en persona.

## Hoofdstuk 2 - Platform Experience

Status: `GESTART / TRUST INFRASTRUCTURE COMPLETE`

Dit hoofdstuk bouwt richting productie-ervaring en daarna Max AI:

1. Sprint 3 - Trust Infrastructure. `COMPLETE`
2. Sprint 4 - Experience Layer.
3. Sprint 5 - Server-side AI/OpenAI foundation.
4. Sprint 6 - Business Automation.

## Sprint 3 - Trust Infrastructure

Status: `COMPLETE / TRUST INFRASTRUCTURE READY`

Leidend document:

- `docs/SPRINT_3_PRODUCTION_READINESS_PLAN.md`

Doel:

- Max Webstudio productie-gereed maken voordat production writes, Storage uploads, high-risk finance flows of AI-acties worden vrijgegeven.

Backlog:

1. Server-side audit logging MVP.
2. Storage security foundation.
3. Monitoring en observability baseline.
4. Backups en restore evidence.
5. Release governance hardening.
6. Environment hardening.
7. Sprint 3 Review.

Belangrijk:

- Geen nieuwe eindgebruikersfeatures.
- Geen OpenAI/Mollie/Resend live flows.
- Geen production writes zonder expliciete release approval.
- Sprint 4 Max AI Experience start pas na voldoende production readiness.

### Sprint 3A - Audit & Observability Foundation

Status: `FOUNDATION READY`

Output:

- audit logging architectuur;
- observability eventtaxonomie;
- lokale audit/observability-service;
- Developer Mode-readinesskaart;
- documentatie in `docs/SPRINT_3A_AUDIT_OBSERVABILITY_FOUNDATION.md`.

Nog niet live:

- geen SQL;
- geen productie-audittrail;
- geen server-side audit inserts;
- geen externe monitoringdienst.

Volgende stap:

- server-side audit logging MVP of Storage security foundation, met productie-write-mode nog steeds gesloten.

### Sprint 3B - Storage Security Foundation

Status: `FOUNDATION READY`

Output:

- canonical bucketstrategie;
- rolgebaseerde upload/downloadmatrix;
- signed URL-beleid;
- file metadata-regels;
- Max AI-bestandsgrenzen;
- Developer Mode-readinesskaart;
- documentatie in `docs/SPRINT_3B_STORAGE_SECURITY_FOUNDATION.md`.

Nog niet live:

- geen SQL;
- geen Supabase Storage buckets aangemaakt;
- geen upload/download endpoint;
- geen productie-storage.

Volgende stap:

- staging-only Storage migration/policy draft of signed URL endpoint ontwerp, met customer isolation als verplichte acceptance criteria.

### Sprint 3C - Release Governance Foundation

Status: `FOUNDATION READY`

Output:

- release rollen;
- releaseflow Development -> Staging -> Evidence -> Approval -> Production;
- verplichte evidence;
- automatische NO-GO regels;
- rollback governance;
- Max AI release-uitlegregels;
- Developer Mode-readinesskaart;
- documentatie in `docs/SPRINT_3C_RELEASE_GOVERNANCE_FOUNDATION.md`.

Nog niet live:

- geen deployment automation;
- geen productieknoppen;
- geen production writes;
- geen rollback execution.

Volgende stap:

- Sprint 3D Monitoring & Backups foundation, daarna Sprint 3 Review.

### Sprint 3D - Monitoring & Backups Foundation

Status: `FOUNDATION READY`

Output:

- monitoringmodel;
- alertingstrategie;
- automatische NO-GO regels;
- backupstrategie;
- staging/production restoreprocedures;
- Max AI storing/restore-uitlegregels;
- Developer Mode-readinesskaart;
- documentatie in `docs/SPRINT_3D_MONITORING_BACKUPS_FOUNDATION.md`.

Nog niet live:

- geen externe monitoringdienst;
- geen backup/restore automation;
- geen production monitoring;
- geen nieuwe writes.

Volgende stap:

- Sprint 3 Review, daarna bepalen of Max AI Experience kan starten.

### Sprint 3 Review - Trust Infrastructure

Status: `COMPLETE`

Output:

- `docs/SPRINT_3_TRUST_INFRASTRUCTURE_REVIEW.md`
- bevestiging Sprint 3 completion: `100%`
- Trust Infrastructure: `COMPLETE as foundation`
- productie blijft `NO-GO`

Volgende sprint:

`Sprint 4 - Experience Layer`

Aanbevolen volgorde:

1. Max AI Introduction.
2. Website Experience.
3. Website Wizard Experience.
4. Klantportaal Experience.
5. CRM Experience.

Belangrijk:

- Sprint 4 bouwt eerst de ervaring, niet OpenAI.
- OpenAI/server-side AI volgt pas in Sprint 5.

## Max Webstudio Platform Manifest v1.0

Status: `ACTIVE`

Leidend document:

- `docs/MAX_WEBSTUDIO_PLATFORM_MANIFEST.md`

Nieuwe productregel:

> Technologie is niet ons product. De ervaring met Max is ons product.

Productlagen:

1. Foundation - `COMPLETE`.
2. Trust Infrastructure - `COMPLETE AS FOUNDATION`.
3. Experience - `STARTING`.
4. Intelligence - `FUTURE`.
5. Automation - `FUTURE`.

Experience Rule:

- De gebruiker mag niet voelen of hij in CRM, klantportaal, wizard, AI of website zit.
- De gebruiker moet voelen dat hij samenwerkt met Max.

## Sprint 4 - Experience Layer

Status: `STARTED`

Doel:

- de klant ontmoet Max;
- Max wordt de herkenbare interface van de volledige klantreis;
- eerst UX en merkervaring, pas later OpenAI.

### Sprint 4A - Max AI Introduction

Status: `FOUNDATION READY`

Output:

- eerste publieke Max-aanwezigheid als vaste gids op de homepage;
- vaste, wegklikbare Max AI helper als subtiele gids naar de aanvraag;
- compacte Max-launcher wanneer de helper wordt geminimaliseerd;
- manifest vastgelegd in `docs/MAX_WEBSTUDIO_PLATFORM_MANIFEST.md`;
- geen chat, OpenAI, backend, wizard of automatisering.

Belangrijk:

- Max is geen standaard chatbot-widget.
- Max is een herkenbare digitale begeleider die later de website, wizard, klantportaal en CRM-ervaring verbindt.
- Max is geen losse homepage-sectie; de homepage blijft primair gericht op websites, portfolio, pakketten, vertrouwen en conversie.
- De huidige helper gebruikt alleen frontend, CSS-animatie en localStorage voor dismiss.
- De visuele richting is nu een premium 3D-achtige digitale collega, geen klein icoon.
- Dezelfde Max asset/character-structuur moet leidend blijven voor Website Wizard, klantportaal, CRM en toekomstige AI Experience.

### Sprint 4A.1 - Max Helper UX Polish

Status: `COMPLETE`

Output:

- sluiten minimaliseert naar een compacte launcher;
- `Later` minimaliseert naar dezelfde launcher;
- klikken op de launcher opent Max opnieuw;
- localStorage bewaart `minimized` of `open` onder `maxwebstudioMaxAiHelperDismissed`;
- Max heeft een frontend animation state structuur via `data-max-state`;
- CSS-only states zijn voorbereid voor `idle`, `wave`, `thumbs-up`, `thinking`, `celebrate`, `look`, `blink` en `error-safe`;
- `celebrate` is alleen een veilige demo/test helper met CSS-confetti en tekst, nog zonder conversie- of aankooptrigger;
- latere echte lichaamsanimatie vraagt om WebM, animated WebP, Lottie of Rive assets;
- Max blijft character-led en geen chatbot.

Volgende logische stappen:

1. Website Experience.
2. Website Wizard Experience.
3. Klantportaal Experience.
4. CRM Experience.

## Klantportaal v1 - Auth & Portal Implementation Plan

Status: `PLAN ONLY`

Leidend document:

- `docs/CLIENT_PORTAL_V1_IMPLEMENTATION_PLAN.md`

Besluit:

- De echte klantportaalroute wordt `public/login.html` -> `public/klantportaal.html`.
- `public/client-dashboard.html` blijft voorlopig legacy/auth prototype.
- De canonical Supabase-lijn blijft leidend: `auth.users -> profiles -> customers -> websites/projects/finance/operations`.
- Nieuwe productieontwikkeling mag niet terugvallen op legacy `customer_*` tabellen.

Aanbevolen volgende fase:

1. `Klantportaal v1A - Staging Auth Validation`.
2. Daarna pas echte loginflow achter readiness gate.
3. Daarna pas hard route guards en customer-session binding.

Nog niet doen:

- geen productie-Auth;
- geen SQL;
- geen database writes;
- geen login live zetten zonder staging/RLS evidence.

### Klantportaal v1.1 - Auth readiness foundation

Status: `COMPLETE AS READINESS`

Output:

- browserveilige Supabase Auth-config detectie;
- login blijft productieve `Binnenkort beschikbaar` fallback voor normale bezoekers;
- Developer Mode toont technische readiness zonder secrets;
- `public/login.html` en `public/klantportaal.html` blijven de canonical route.

Volgende stap:

1. `Klantportaal v1A - Staging Auth Validation`.
2. Daarna pas echte sessie -> profile -> customer mapping.
3. Daarna pas hard route guards.

### Klantportaal v1.2 - Staging Auth wiring plan

Status: `PLAN ONLY`

Output:

- `docs/CLIENT_PORTAL_STAGING_AUTH_WIRING_PLAN.md`
- staging env-var checklist;
- testaccountplan;
- login/logout en password reset testflow;
- RLS/security checklist;
- rollback en evidenceplan.

Volgende stap:

1. Staging Auth testaccounts voorbereiden.
2. Daarna pas Auth wiring in staging activeren.
3. Productie blijft `NO-GO`.

### Klantportaal v1A - Staging Auth Readiness Validation

Status: `PARTIAL PASS`

Resultaat:

- staging/local env keys aanwezig zonder waarden te tonen;
- `.env.local` genegeerd;
- client auth config geeft alleen browserveilige config terug;
- readiness-service rapporteert `ready_for_staging_auth`;
- Auth blijft uit en productie blijft `NO-GO`.

Open blockers:

1. Echte staging login/logout met testaccounts.
2. Password reset in staging.
3. Customer A/B Auth-isolatie met echte sessies.

Volgende stap:

- `Klantportaal v1B - Staging Auth Wiring` alleen op test/staging.

### Klantportaal v1B - Staging Login/Logout Test

Status: `PARTIAL PASS`

Resultaat:

- staging Auth endpoint bereikbaar;
- foutieve login wordt geblokkeerd;
- normale bezoekers blijven op fallback;
- geldige login/logout is nog niet getest door ontbrekende staging testaccountcredentials.

Open blockers:

1. Customer A/B testaccounts veilig klaarzetten.
2. Tijdelijke testcredentials buiten de repo beschikbaar maken.
3. Login/logout opnieuw uitvoeren met geldige staging sessie.
4. Password reset en customer isolation daarna testen.

Productie blijft:

- `NO-GO`.

### Klantportaal Auth Config Debug

Status: `DIAGNOSE COMPLETE`

Conclusie:

- `.env.local` is niet automatisch beschikbaar in de browser.
- `client-auth-config` of runtime-config moet de publieke `SUPABASE_URL` en `SUPABASE_ANON_KEY` aanbieden.
- Static localhost/file-server is onvoldoende voor Auth wiring.
- `authLive=false` houdt login bewust verborgen.

Volgende stap:

1. Lokale test draaien via Netlify Dev/functions of veilige runtime-config.
2. Daarna pas `Klantportaal v1C - Valid staging Auth session test`.
