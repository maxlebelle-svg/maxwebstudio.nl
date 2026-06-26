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

