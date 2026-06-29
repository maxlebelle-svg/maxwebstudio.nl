# AI Website Wizard

Status: Fase 15.1 intake UI. Geen productieaanpassingen, geen SQL, geen API keys en geen AI-calls.

## Doel

De AI Website Wizard wordt de toekomstige workflow waarmee Max Webstudio websites kan voorbereiden voor klanten. In deze fase is de technische basis gelegd en is de eerste lokale intake-UI toegevoegd:

- architectuur
- workflow
- state management
- placeholder services
- Developer Mode readiness
- intake UI in het admin-dashboard
- uitbreidbaarheid voor latere AI-functionaliteit

## Niet In Deze Fase

- Geen OpenAI-calls.
- Geen logo-generatie.
- Geen AI-content generatie.
- Geen websitebouw/scaffold generatie.
- Geen database-uitbreiding.
- Geen nieuwe dependencies.
- Geen productie deploy.
- Geen nieuwe API keys.

## Architectuur

| Laag | Bestand | Doel |
| --- | --- | --- |
| Workflow config | `public/src/config/aiWebsiteWizardWorkflow.js` | Definieert fases, stappen, statussen en toekomstige automation hooks |
| State model | `public/src/models/AIWebsiteWizardState.js` | Normaliseert wizard-state en houdt Supabase-migratiepad expliciet |
| Service | `public/src/services/aiWebsiteWizardService.js` | Leest/schrijft concept-state lokaal en exposeert readiness/developer summary |
| Storage key | `public/src/config/storageKeys.js` | Reserveert `maxwebstudioAiWebsiteWizardState` voor lokale concepten |
| Developer Mode | `public/admin-dashboard.html` | Toont workflow/readiness zonder AI-acties uit te voeren |

## Workflow

De wizard bestaat uit vijf fases:

1. Intake
2. Huisstijl
3. Content & SEO
4. Conversie
5. Publicatie

Stappen:

- Bedrijfsinformatie
- Branchekeuze
- Huisstijl
- Kleuren
- Logo
- Pagina's
- Diensten
- Contactgegevens
- SEO
- Afbeeldingen
- AI-content
- CTA's
- Hosting
- Domeinnaam
- Publicatie

## State Management

Lokale sleutel:

- `maxwebstudioAiWebsiteWizardState`

Voorlopig blijft state lokaal en voorbereid. Later kan dit naar Supabase migreren via een canonical tabel zoals:

- `ai_website_wizard_states`

Belangrijke velden:

- `id`
- `customerId`
- `projectId`
- `websiteId`
- `status`
- `currentStepId`
- `workflowVersion`
- `steps`
- `metadata`
- `createdAt`
- `updatedAt`

## Interfaces

De foundation gebruikt nu JSDoc interfaces in gewone JavaScript-bestanden, zodat we geen TypeScript-build of nieuwe dependency nodig hebben:

- `AiWebsiteWizardPhase`
- `AiWebsiteWizardStep`
- `AiWebsiteWizardState`
- `AiWebsiteWizardStepState`

Deze interfaces zijn bedoeld als migratievriendelijke contracten voor toekomstige Supabase-tabellen, AI-adapters en website-builders.

## Placeholder Services

De service exposeert bewust alleen veilige foundation- en intakefuncties:

- `getAiWebsiteWizardArchitecture()`
- `getAiWebsiteWizardReadiness()`
- `getWizardDeveloperSummary()`
- `getAiWebsiteWizardWorkflow()`
- `getOrCreateWizardDraft()`
- `createWizardDraft()`
- `updateWizardStep()`
- `listWizardDrafts()`
- `validateWizardIntake()`
- `saveWizardIntake()`
- `getWizardIntakeSummary()`
- `clearWizardDrafts()`
- `getWizardProgress()`

Deze functies voeren geen externe calls uit.

## Fase 15.1 - Intake UI

De eerste zichtbare wizard staat in `public/admin-dashboard.html` onder de module **AI Wizard**.

De UI bevat:

- stapnavigatie op basis van de bestaande workflowconfig
- voortgangsbalk
- intakeformulier
- validatie op verplichte intakevelden
- lokale opslag in `maxwebstudioAiWebsiteWizardState`
- read-only samenvatting/preview
- reset/clear draft actie met bevestiging
- Developer Mode debugkaart

Velden in de intake:

- bedrijfsnaam
- branche
- doelgroep
- belangrijkste diensten
- onderscheidend vermogen
- gewenste uitstraling
- kleurenvoorkeur
- bestaande website
- contactgegevens
- gewenste pagina's
- belangrijkste CTA
- notities

Verplichte velden:

- bedrijfsnaam
- branche
- doelgroep
- belangrijkste diensten
- contactgegevens
- gewenste pagina's
- belangrijkste CTA

De intake wordt verdeeld over bestaande workflowstappen zoals `business_information`, `industry_selection`, `services`, `pages`, `contact_details`, `ctas`, `brand_style`, `colors` en `domain`. Daardoor blijft de state migreerbaar naar een latere Supabase-tabel zonder dat de UI een apart dataspoor maakt.

## Toekomstige Providers

Latere fases kunnen adapters toevoegen voor:

- AI intake analyse
- AI content generation
- logo generation
- SEO planning
- website scaffold generation
- image selection/generation
- hosting/domain checks
- publication checklist automation

Deze adapters moeten server-side secrets gebruiken en mogen geen API keys in frontendcode plaatsen.

## Developer Mode

Developer Mode toont:

- foundationstatus
- workflowversie
- aantal fases/stappen
- storage key
- huidige draft count
- laatste intake-progress
- intake-validatiestatus
- waarschuwingen
- toekomstige capabilities

De Developer Mode debugkaart in de AI Wizard-sectie toont alleen interne draftinformatie wanneer Developer Mode aan staat.

De kaarten voeren geen AI-acties uit.

## Security

- Geen nieuwe secrets.
- Geen AI provider keys.
- Geen SQL.
- Geen productie-switch.
- Geen echte klantdata nodig.
- Service role keys blijven buiten scope.

## Release Status

Fase 15.1 is klaar wanneer:

- docs bestaan
- workflowconfig bestaat
- state model bestaat
- service bestaat
- intake UI zichtbaar is in de admin
- intakeconcept lokaal opslaat
- preview en reset werken
- Developer Mode readiness/debug zichtbaar is
- JS syntaxchecks slagen
- geen secrets zijn toegevoegd
