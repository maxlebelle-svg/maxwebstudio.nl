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

- AI intake/briefing-provider ontwerpen en pas daarna gecontroleerd een server-side AI-adapter toevoegen.
