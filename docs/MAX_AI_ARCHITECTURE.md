# Max AI Architecture

Status: strategisch ontwerp.  
Fase: 27.  
Doel: Max AI vastleggen als centrale Experience Layer van het Max Webstudio-platform.

Dit document bouwt niets en voert niets uit.

## Definitie

Max AI is de centrale assistentlaag die gebruikers begeleidt, context verzamelt, samenvattingen maakt, concepten voorbereidt en acties voorstelt.

Max AI is niet:

- een simpele chatbot;
- een onbegrensde agent;
- een directe databasebeheerder;
- een betaalsysteem;
- een deployment tool;
- een vervanging van menselijke review.

## Architectuurlagen

### 1. Experience Layer

Zichtbare interactiepunten:

- publieke website;
- AI aanvraagflow;
- AI Website Wizard;
- admin-dashboard;
- CRM;
- Leadfinder;
- klantportaal;
- project- en wijzigingsverzoekflows.

### 2. Context Layer

Gecontroleerde context die aan Max AI gegeven mag worden:

- klantgegevens;
- websitegegevens;
- projectstatus;
- offertecontext;
- factuurstatus in klantvriendelijke vorm;
- abonnementsstatus;
- wijzigingsverzoeken;
- Leadfinder data;
- AI Wizard intake;
- eerdere AI concepten.

### 3. Policy Layer

Regels die bepalen:

- welke rol welke AI-actie mag starten;
- welke data gemaskeerd wordt;
- welke module alleen read-only is;
- welke acties menselijke goedkeuring vereisen;
- welke output gelogd wordt.

### 4. Server-side AI Adapter

Toekomstige laag voor echte AI-calls.

Vereisten:

- draait server-side;
- gebruikt environment secrets;
- ondersteunt prompt templates;
- ondersteunt rate limiting;
- logt request metadata zonder gevoelige inhoud;
- maskeert persoonsgegevens waar nodig;
- ondersteunt fallback bij storing;
- schrijft niet rechtstreeks naar kritieke tabellen zonder expliciete workflow.

### 5. Action Layer

Max AI mag in MVP vooral voorstellen doen.

Voorbeelden:

- concept homepage structuur;
- projectbrief;
- SEO suggesties;
- offerte-intro;
- klantbericht;
- opvolgadvies;
- wijzigingsverzoek samenvatting.

Later kan Max AI gecontroleerde acties voorbereiden, maar niet zonder menselijke of server-side validatie.

## Data Die AI Mag Lezen

Onder voorwaarden en met roltoegang:

- `customers`
- `websites`
- `projects`
- `quotes`
- `quote_lines`
- `invoices`
- `invoice_lines`
- `subscriptions`
- `files`
- `change_requests`
- `leads`
- `crm_tasks`
- `client_portal_messages`
- `client_portal_notifications`
- `ai_drafts`
- `ai_assistant_drafts`

## Data Die AI Niet Direct Mag Wijzigen

Max AI mag deze nooit direct wijzigen:

- factuurbedragen;
- betaalstatussen;
- Mollie payment/subscription data;
- gebruikers;
- rollen;
- Auth/profiles;
- RLS policies;
- Supabase schema;
- deployment/release data;
- productieconfiguratie;
- environment variables;
- audit logs.

Max AI mag hier hooguit concepten of waarschuwingen voor maken.

## Rollen

### Bezoeker

Mag AI gebruiken voor:

- websitebehoefte verkennen;
- pakketadvies;
- aanvraag/intake;
- demo-richting kiezen.

Mag geen interne data zien.

### Klant

Mag AI gebruiken voor:

- eigen projectstatus begrijpen;
- eigen facturen/offertes laten uitleggen;
- wijzigingsverzoeken formuleren;
- bestanden of projectinformatie vinden.

Mag alleen eigen customer-context gebruiken.

### Admin

Mag AI gebruiken voor:

- klant/project/lead samenvatten;
- offerte- en projectconcepten;
- interne opvolging;
- SEO en contentconcepten.

### Sales

Mag AI gebruiken voor:

- Leadfinder analyse;
- belscript;
- opvolgadvies;
- leadscore uitleg.

### Developer

Mag AI-readiness zien, maar AI mag geen deployment of schema wijzigen.

## Veiligheidsprincipes

- Server-side AI-calls only.
- Geen provider keys in frontend.
- Geen AI-context zonder rolcontrole.
- Geen klantdata zonder Customer A/B isolation.
- Geen kritieke writes zonder review.
- Geen betaal- of deploymentacties via AI in MVP.
- Geen geheimen, signed URLs, reset tokens of providerpayloads in prompts.
- Prompt/output logging zonder gevoelige inhoud.
- Consent/privacytekst voordat klantdata naar externe AI-provider gaat.

## MVP AI Capabilities

- begeleide intake;
- template/mock conceptoutput;
- projectbrief;
- website structuur;
- SEO title/meta;
- dienstenblokken;
- FAQ concept;
- CRM samenvatting;
- lead opvolgadvies.

## V2 Capabilities

- echte OpenAI via server-side adapter;
- CRM AI;
- Leadfinder AI;
- project AI;
- SEO AI;
- klantbericht concepten;
- offerte-ondersteuning.

## V3 Capabilities

- AI websitegenerator;
- logo-generator;
- voice AI;
- AI sales agent;
- marketing automation;
- support AI;
- gecontroleerde multi-step workflows.

## Belangrijkste Beslissing

Max AI wordt het brein boven de workflows, maar niet de eigenaar van kritieke waarheid.

De bron van waarheid blijft Supabase met Auth/RLS, duidelijke ownership en menselijke controle op kritieke acties.

## Merkidentiteit

De merkpersoonlijkheid van Max AI is vastgelegd in:

- `docs/MAX_AI_BRAND_GUIDELINES.md`
- `docs/MAX_AI_PERSONA.md`

Architectuur en UI moeten deze richtlijnen volgen:

- Max AI voelt als een vriendelijke digitale collega van Max Webstudio.
- Max AI ondersteunt en begeleidt, maar beslist niet zelfstandig.
- De mascotte wordt pas in Fase 33 als zichtbaar UI-element geintroduceerd.
- Max AI verschijnt niet in login, juridische pagina's, betaalflows of security/deployment approval schermen.
- Max AI heeft drie rollen: Adviseur voor bezoekers, Projectmanager voor klanten en Collega voor interne gebruikers.
