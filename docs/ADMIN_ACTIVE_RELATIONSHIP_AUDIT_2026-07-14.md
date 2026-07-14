# Admin active relationship audit — 2026-07-14

## Contract

De enige primaire relatiecontext is `{ relationshipType, relationshipId }`, met `relationshipType` gelijk aan `lead` of `customer`. `leadId` en `customerId` blijven tijdelijk als compatibele URL-parameters bestaan, maar worden uitsluitend uit het canonieke paar afgeleid. De centrale store valideert ieder ID server-side voordat de context actief wordt.

Medewerkers en salespartners zijn actor- of perspectiefgegevens, geen relaties. Zij worden gezocht via `admin-employee-search` en gekozen via `EmployeeSelector` in het profielmenu. De relatiezoeker gebruikt `admin-relationship-search` en heeft alleen Alle, Leads en Klanten. Een Team-tab is niet functioneel verantwoord zolang de productiemodules geen medewerkercontext als databron ondersteunen.

## Routematrix

| Module | Route / bronbestand | Classificatie | Typen | Contextbron | Serverfilter | Zonder relatie | Wissel / refresh / URL | Legacy/fallback en risico | Testdekking |
|---|---|---|---|---|---|---|---|---|---|
| Website Factory | `public/admin-website-factory.html` | relatiegebonden | lead + customer | `ActiveRelationship`; canonieke URL | ja, relatievalidatie en gerichte factory-handlers | centrale sidebar blokkeert | store + URL; pagina valideert; refresh herstelt | oude queryvarianten worden alleen als compatibele ID-ingang gelezen; geen eerste-klantfallback in factorycontext | `website-factory-customer-context-static`, context-handlertests |
| Website QA Scanner | `public/admin-website-qa-scanner.html` | globaal gereedschap | n.v.t. | actieve relatie wordt alleen voor navigatiecontinuïteit meegenomen | n.v.t.; gebruiker voert doel-URL in | bruikbaar als globaal gereedschap | centrale context blijft in URL/store | geen relatiegegevensbron | sidebar-route- en browser-smoke |
| Demo Sites | `public/admin-demo-sites.html` | relatiegebonden | lead + customer | `ActiveRelationship` + `MaxRelationshipScope` | ja, `demo-journey` controleert type en ID | lege selecteer-eerststatus; geen globale resultaten | oude rijen direct leeg; request-id voorkomt races; refresh en URL ondersteund | globale localStorage-fallback verwijderd uit de actieve weergave | `admin-relationship-data-isolation`, demo-handlertests |
| AI Content Library | `public/src/ai-content-library.js` | relatiegebonden lokale werkruimte | lead + customer | `ActiveRelationship` | geen serverdata | leeg werkpakket; opslaan geblokkeerd | opslagkey per type+ID; wissel laadt apart pakket | oude globale concepten worden niet meer gelezen; voorkomt kruisrelatieconcepten | `admin-relationship-data-isolation` |
| Asset Manager | `public/admin/ui/central-asset-library.js`, `functions/admin-relationship-assets.js` | relatiegebonden | lead + customer | `ActiveRelationship` | ja, lijst/actie/download op `lead_id` of `customer_id` | fail-closed; geen query | rijen direct leeg; request-id; canonieke URL/store | eerdere globale lijstquery en customer-only URL-fallback verwijderd | `admin-relationship-data-isolation`, handlertests |
| SEO Studio | `public/src/seo-studio.js` | relatiegebonden lokale werkruimte | lead + customer | `ActiveRelationship` | geen serverdata | leeg concept; opslaan geblokkeerd | opslagkey per type+ID; wissel herlaadt | oude globale SEO-draft wordt niet gelezen | `admin-relationship-data-isolation` |
| Social Media Studio | `public/src/social-media-studio.js` | relatiegebonden lokale werkruimte | lead + customer | `ActiveRelationship` | geen serverdata | lege editor; opslaan geblokkeerd | opslagkeys per type+ID; wissel herlaadt | legacy globale draft/varianten worden niet meer ingelezen | `admin-relationship-data-isolation` |
| Brand Center | `public/src/brand-center.js`, `public/admin/data/relationship-scope.js` | relatiegebonden | lead + customer | `ActiveRelationship` | client-side canonieke recordfiltering; geen nieuwe serverquery | lege state | wist state vóór scopewissel; centrale store/URL | naam- en eerste-projectfallback verwijderd uit actieve scope | `admin-relationship-data-isolation` |
| Domein Center | `public/admin-domain-center.html`, `functions/admin-domain-center.js` | relatiegebonden | lead + customer | `ActiveRelationship` | ja; lead queryt alleen lead, klant alleen klant/websites | handler 400; lege tabel | tabel direct leeg; request-id; centrale URL/store | eerdere globale query over klanten, websites en leads verwijderd | `admin-relationship-data-isolation`, inline syntax |
| Klant Onboarding | `public/admin-onboarding.html`, `functions/admin-supabase-data.js` | relatiegebonden, customer-only | customer | `ActiveRelationship` | ja, customer/websites/projects met customerfilter | selecteer-eerststatus | state direct leeg; request-id; opslag per customer | lead krijgt conversiemelding; lokale/seed fallback verwijderd; geen autoconversie | `admin-relationship-data-isolation`, inline syntax |
| Roadmap / Takenbord | `public/admin-roadmap.html` | globaal intern demobord | n.v.t. | geen relatiegegevens | n.v.t. | bruikbaar; alleen vaste demo-planning | actieve relatie blijft centraal bewaard en staat in navigatie-URL | pagina vermeldt expliciet dat taken nog niet gekoppeld zijn; geen klantdata | sidebar-route- en inline-syntaxtests |
| Websites | `public/admin-websites.html` | globaal operations-overzicht | n.v.t. | geen relatie als databeperking | globale geautoriseerde operations-query | bruikbaar als beheerpagina | actieve relatie blijft centraal bewaard en staat in navigatie-URL | groot legacy beheeroppervlak met eigen filters; niet als relatiegebonden bron classificeren | sidebar-rollout, inline syntax, bestaande website-tests |
| Projecten | `public/admin-projecten.html` | globaal operations-overzicht | n.v.t. | geen relatie als databeperking | globale geautoriseerde operations-query | bruikbaar als beheerpagina | actieve relatie blijft centraal bewaard en staat in navigatie-URL | groot legacy beheeroppervlak met eigen filters; niet als relatiegebonden bron classificeren | sidebar-rollout, inline syntax, bestaande projecttests |

## Navigatie en racegedrag

- Iedere centrale sidebarlink gebruikt `ActiveRelationship.buildRelationshipUrl` en draagt het canonieke paar plus één afgeleid compatibiliteits-ID.
- Wissen verwijdert alle vier relatieparameters en de minimale lokale store.
- Refresh valideert de URL of minimale store opnieuw op de server.
- `popstate` valideert back/forward opnieuw; een history-entry zonder relatie wist de actieve context.
- Een validatieresponse van een oudere selectie kan een nieuwere relatie niet overschrijven.
- Relatiegebonden links zijn zonder relatie uitgeschakeld. Customer-only links zijn bij een lead uitgeschakeld met de melding: “Deze functie wordt beschikbaar nadat de lead klant is geworden.”

## Lisanne Post recovery

Niet uitgevoerd. De verplichte productie-preflight kon niet plaatsvinden doordat de beschikbare browserveiligheidsregel navigatie naar `maxwebstudio.nl` blokkeerde. Er is bewust geen andere browser, directe productienetwerkroute of write-endpoint gebruikt. Zonder actuele read-only schema-, deduplicatie-, archief- en logkoppelcontrole is geen exacte veilige rijmutatie vastgesteld en is geen productiegegeven gewijzigd.

Bewezen bronreferenties voor een volgende geautoriseerde recovery-run:

- `lisanne post`, `advies post`, `lisannepost9@hotmail.com`, `+31626605588`
- pakket `Business Website`, onderhoud `Ik wil advies`, bericht `website met diensten`
- bron `homepage-contact-form`, ingediend `2026-07-13T09:57:12.788Z`
- bestaande e-maillogs `e183edcc-1222-44ad-9518-a281ea434aad` en `fc2166ac-84a1-4cff-a9bb-8a5409698e10`

De volgende run moet eerst read-only de actuele leadstatuswaarden, deduplicatiekolommen, archief/legacy-opslag, bestaande logkoppelingen en timeline-schema tonen. Pas daarna mag een exact idempotent insert/updateplan worden gepresenteerd. Het herstel mag geen mail, notificatie, nieuw timeline-event, klantconversie of willekeurige medewerkerstoewijzing veroorzaken.

## Verificatie

- Baseline vóór wijzigingen: 364/364 tests groen.
- Eindresultaat: 371/371 tests groen met `node --test tests/*.test.js`.
- Gerichte context-, sidebar-, handlercontract- en data-isolatietests: groen.
- Alle inline scripts van de gedeelde adminroutes doorstaan de syntaxcontrole.
- Lokale browser-smoke: alle 13 routes beantwoorden en renderen hun eigen pagina of de verwachte loginredirect; geen lokale console-errors. De losse statische server levert Netlify Functions niet, waardoor functionele datacalls daar verwacht 404 geven.
- Live/read-only smoke voor QuantumBouw, Fuellinq en Lisanne Post: niet uitgevoerd door de hierboven beschreven browserveiligheidsblokkade.
- Er is niet gepusht en niet gedeployed.
