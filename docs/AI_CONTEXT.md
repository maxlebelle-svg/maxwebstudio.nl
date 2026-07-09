# AI Context Voor Max Webstudio

Dit document is de single source of truth voor AI-tools, Codex en toekomstige ontwikkelaars. Gebruik dit als eerste referentie voordat je nieuwe functionaliteit bedenkt of bestaande code wijzigt.

Documentrollen:

- `docs/AI_CONTEXT.md`: missie, platform, AI-richtlijnen en ontwikkelfilosofie.
- `docs/PRODUCTION_ARCHITECTURE.md` en `docs/MODULE_BOUNDARIES.md`: technische architectuur, datastromen en modulegrenzen.
- `docs/ROADMAP.md` en `docs/MASTER_ROADMAP_V2.md`: geplande modules en prioriteiten.
- `docs/DESIGN_SYSTEM.md` en `docs/design-system/`: UI-patronen, kleuren, componenten en stijlregels.
- `docs/CONTRIBUTING.md`: workflow, kwaliteitscontroles en code-afspraken.

## Kern

Max Webstudio is geen traditioneel webdesignbureau.

Het doel is een volledig geautomatiseerd ondernemersplatform te bouwen waarin websites, hosting, domeinen, e-mail, branding, social media, advertenties, AI, CRM, planning, facturatie en klantbeheer samenkomen in een omgeving.

Nieuwe functionaliteit moet passen binnen dit langetermijnplatform en niet als losse tool worden ontworpen.

## Bedrijfsfilosofie

Max Webstudio verkoopt geen websites.

Max Webstudio verkoopt groei.

Iedere nieuwe functionaliteit moet uiteindelijk bijdragen aan minimaal een van deze doelen:

- meer klanten voor de ondernemer;
- minder handmatig werk;
- hogere automatisering;
- betere online uitstraling;
- meer terugkerende omzet;
- hogere klanttevredenheid;
- schaalbaarheid van het platform.

## Product En Positionering

- Max Webstudio richt zich op ondernemers die professioneel online willen groeien.
- De publieke propositie is: professionele websites vanaf EUR 495, gemiddeld binnen 5 werkdagen live, inclusief ontwerp, techniek, hosting en onderhoud.
- De toon is Nederlands, helder, commercieel, premium en toegankelijk.
- De doelgroep bestaat uit lokale ondernemers, zzp'ers, servicebedrijven en bedrijven die online groter en betrouwbaarder willen overkomen.

## Platformarchitectuur

Max Webstudio bestaat uit vier hoofdonderdelen:

- Publieke website: marketing, SEO, portfolio, pakketten, contact, demo's en leadgeneratie.
- Salesportaal: voor medewerkers. Leads, CRM, planning, offertes, websitefabriek, AI-tools, pipeline, demo's, agenda, omzet, targets en commerciële workflows.
- Klantportaal: voor klanten. Projectstatus, facturen, onboarding, bestanden, websitebeheer, social media, onderhoud, support en toekomstige AI-tools.
- Beheer/Admin: alleen voor beheerders. Gebruikersbeheer, instellingen, medewerkers, API-configuratie, releasebeheer, logging, developer mode en systeeminstellingen.

## Technische Basis

- De frontend is vooral statische HTML, CSS en vanilla JavaScript.
- Er is geen React, Next.js of centraal build-framework als basis.
- Hosting/deployment loopt via Netlify.
- Backendfunctionaliteit loopt via Netlify Functions in `/functions/`.
- Data en klantportaalontwikkeling zijn voorbereid richting Supabase.
- Betalingen en abonnementen zijn voorbereid met Mollie.
- E-mailflows zijn voorbereid met Resend.
- Afspraken/previewgesprekken lopen via Calendly.

## Projectstructuur

- `/public` is leidend voor live frontend-wijzigingen.
- Root-bestanden zoals `index.html`, `styles.css` en `script.js` kunnen duplicaten of oudere versies zijn.
- Pas root-bestanden alleen aan als dat expliciet gevraagd wordt of als er een afgesproken sync-strategie is.
- Publieke marketingpagina's staan onder andere in `/public/*.html`.
- Admin/CRM-pagina's staan vooral in `/public/admin-*.html`.
- Frontend modules/services staan in `/public/src/`.
- Admin design system CSS staat in `/public/admin/styles/premium-design-system.css`.
- Netlify Functions staan in `/functions/`.
- Supabase schema's, policies en migratieconcepten staan in `/supabase/` en `/docs/`.

## Live Publieke Website

- Hoofdpagina: `/public/index.html`.
- Styling: `/public/styles.css`.
- Interactie: meestal `/public/script.js` of inline/module scripts per pagina.
- Juridische en informatieve pagina's zijn onder andere `privacyverklaring.html`, `algemene-voorwaarden.html`, `cookiebeleid.html`, `disclaimer.html`, `werkwijze.html`, `waarom-max-webstudio.html` en `veelgestelde-vragen.html`.
- Belangrijke flows zijn gratis website-preview aanvragen, demo's bekijken, pakketten bekijken, onderhoudspakketten kiezen, contact/lead capture, wijziging doorgeven en klantportaal/login.

## Designregels

- Alles moet eruitzien als premium SaaS software.
- Geen standaard Bootstrap-uitstraling.
- Gebruik veel witruimte, rustige schaduwen en consistente iconen.
- Gebruik bestaande CSS variables, classes en componentpatronen.
- Gebruik bestaande Premium Design System componenten waar mogelijk.
- Gebruik geen technische termen richting klanten.
- Interne systemen mogen technischer zijn.
- Houd mobiel en desktop expliciet goed.
- Buttons en cards gebruiken meestal 8px border-radius.

Belangrijke visuele basis:

- Font: Inter.
- Basisgevoel: modern, premium, zakelijk, betrouwbaar, conversiegericht.
- Kernkleuren/tokens: `--ink`, `--muted`, `--line`, `--paper`, `--white`, `--blue`, `--blue-dark`, `--cyan`, `--green`.

## Belangrijke Frontendpatronen

- Header gebruikt vaak `.site-header`, `.brand`, `.main-nav` en `.header-cta`.
- CTA's gebruiken vaak `.button`, `.button.primary` en `.button.secondary`.
- Secties gebruiken vaak classes zoals `.hero`, `.section`, `.section-heading` en `.section-kicker`.
- Calendly-knoppen hebben vaak `data-calendly-open`.
- Pakketkeuzes gebruiken data-attributen zoals `data-package`, `data-care-package` en `data-checkout-package`.
- Lead/contactformulieren sturen naar Netlify Functions zoals `/.netlify/functions/send-lead`.

## AI Filosofie

- AI ondersteunt medewerkers en klanten.
- AI mag voorstellen doen, voorbereiden en automatiseren.
- Belangrijke acties zoals publiceren, verwijderen of betalingen uitvoeren gebeuren nooit automatisch zonder expliciete bevestiging of bestaande workflow.
- AI-functionaliteit moet aansluiten op bestaande data, services en gebruikersrollen.
- AI mag geen route om security, RLS, betalingslogica of release-governance heen worden.

## Roadmap

Houd rekening met toekomstige uitbreidingen:

- AI Website Wizard
- AI Content Generator
- AI SEO Assistant
- AI Logo Generator
- Social Media Planner
- Social Media Auto Posting
- Asset Manager
- Mail Center
- Timeline
- Klant Onboarding
- Website Factory
- CRM
- Planning
- Facturatie
- Domeinbeheer
- Hostingbeheer
- Telefonie (085-nummers)
- AI Chatbot
- AI Voicebot
- Branding Center

## Ontwerpregel Voor Nieuwe Functionaliteit

Voordat je nieuwe functionaliteit toevoegt:

- inventariseer eerst bestaande code;
- hergebruik bestaande componenten;
- breid bestaande services uit;
- voorkom dubbele functies;
- voorkom dubbele pagina's;
- voorkom dubbele API-routes;
- bouw altijd voort op de bestaande architectuur.

## Werkvolgorde

Voordat je code schrijft:

1. Inventariseer bestaande bestanden, routes, services en componenten.
2. Leg kort uit welke onderdelen je wilt aanpassen.
3. Controleer of bestaande functionaliteit uitgebreid kan worden.
4. Pas daarna de code aan.
5. Controleer of bestaande flows niet worden doorbroken.
6. Rapporteer na afloop welke bestanden zijn gewijzigd en welke controles zijn uitgevoerd.

## Quality Checklist

Na iedere wijziging controleer je minimaal:

- Geen duplicate code toegevoegd.
- Geen duplicate routes.
- Geen duplicate services.
- Geen duplicate CSS componenten.
- Geen console errors.
- Responsive op mobiel.
- Responsive op desktop.
- Toegankelijkheid behouden.
- SEO niet verslechterd.
- Bestaande functionaliteit blijft werken.
- Geen technische platformdetails zichtbaar richting klanten.
- Geen Netlify-, GitHub-, debug- of stacktrace-informatie zichtbaar richting klanten.
- Geen API keys of secrets in frontendcode.
- Betaalbedragen blijven server-side leidend.

## Modulegrenzen

- Public Website is voor marketing, SEO, portfolio/demo's, pricing, lead capture en juridische pagina's.
- Admin CRM is voor klanten, websites, projecten, offertes, facturen, abonnementen, release/developer mode en AI Website Wizard intake.
- Klantportaal is alleen voor klantveilige eigen data.
- Facturatie/Mollie is voor betaalstatussen, facturen, subscriptions en webhook sync.
- Demo Sites zijn verkoopvoorbeelden en bevatten geen echte klantdata.
- AI Website Wizard is voor intake en briefing, niet voor automatische productiepublicatie zonder approval.

## Veiligheid En Data

- Zet nooit API keys in frontendcode.
- Gebruik environment variables voor secrets.
- Valideer input server-side.
- Log geen gevoelige klantdata onnodig.
- Houd betaalbedragen server-side leidend.
- Klantdata moet klantveilig en rolbewust blijven.
- Supabase Auth en RLS zijn leidend voor live klantdata.

## Code-afspraken

- Maak kleine, gerichte wijzigingen.
- Gebruik bestaande patronen.
- Installeer geen libraries tenzij dat expliciet gevraagd wordt.
- Geen grote refactors zonder toestemming.
- Verwijder niets zonder expliciete opdracht.
- Nieuwe HTML-pagina's hebben een duidelijke title, meta description, exact een H1, logische headings, alt-teksten en consistente navigatie/CTA's.
- CSS gebruikt bestaande variables en expliciet responsive gedrag.
- JavaScript blijft vanilla JS tenzij anders goedgekeurd.
- Gebruik veilige DOM-opbouw bij formulierdata.
- Test relevante flows na wijzigingen.

## Praktische AI-instructie

Als je aan dit project werkt:

1. Lees eerst de relevante bestaande bestanden.
2. Ga ervan uit dat `/public` de live frontend is.
3. Zoek bestaande componenten, services en API-routes voordat je iets nieuws maakt.
4. Houd wijzigingen klein en passend binnen de platformarchitectuur.
5. Let op SEO, conversie, mobiel gedrag, toegankelijkheid, privacy en security.
6. Rapporteer wat je hebt aangepast, welke bestanden geraakt zijn en welke flow gecontroleerd is.
7. Geef concrete wijzigingen, liefst als exacte codeblokken, patches of duidelijke bestandsinstructies.
8. Houd de stijl passend bij Max Webstudio: premium, helder, Nederlands en resultaatgericht.
