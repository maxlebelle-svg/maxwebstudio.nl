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
