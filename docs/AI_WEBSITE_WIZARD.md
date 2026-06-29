# AI Website Wizard

Status: Fase 15.0 foundation. Geen productieaanpassingen, geen SQL, geen API keys en geen AI-calls.

## Doel

De AI Website Wizard wordt de toekomstige workflow waarmee Max Webstudio websites kan voorbereiden voor klanten. In deze fase is alleen de technische basis gelegd:

- architectuur
- workflow
- state management
- placeholder services
- Developer Mode readiness
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

De service exposeert bewust alleen veilige foundation-functies:

- `getAiWebsiteWizardArchitecture()`
- `getAiWebsiteWizardReadiness()`
- `getWizardDeveloperSummary()`
- `getAiWebsiteWizardWorkflow()`
- `createWizardDraft()`
- `updateWizardStep()`
- `listWizardDrafts()`
- `getWizardProgress()`

Deze functies voeren geen externe calls uit.

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
- waarschuwingen
- toekomstige capabilities

De kaart is read-only en voert geen AI-acties uit.

## Security

- Geen nieuwe secrets.
- Geen AI provider keys.
- Geen SQL.
- Geen productie-switch.
- Geen echte klantdata nodig.
- Service role keys blijven buiten scope.

## Release Status

Fase 15.0 is klaar wanneer:

- docs bestaan
- workflowconfig bestaat
- state model bestaat
- service bestaat
- Developer Mode readiness zichtbaar is
- JS syntaxchecks slagen
- geen secrets zijn toegevoegd
