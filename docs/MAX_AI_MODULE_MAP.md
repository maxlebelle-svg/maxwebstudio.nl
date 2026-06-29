# Max AI Module Map

Status: strategische modulekaart.  
Fase: 27.

Deze kaart bepaalt hoe Max AI straks per module mag lezen, schrijven, voorstellen en loggen.

## Legenda

- Read: AI mag gecontroleerd context lezen.
- Draft: AI mag concept output maken.
- Suggest: AI mag actie voorstellen.
- Write: AI mag schrijven via gecontroleerde workflow.
- Blocked: AI mag dit niet doen.

## Modulekaart

| Module | Read | Draft | Suggest | Write | Belangrijkste beperking |
|---|---:|---:|---:|---:|---|
| Publieke website | Ja | Ja | Ja | Nee | Geen persoonlijke data zonder consent |
| Aanvraagflow | Ja | Ja | Ja | Later | Eerst local/demo, later server-side |
| AI Website Wizard | Ja | Ja | Ja | Later | Output blijft concept tot review |
| CRM customers | Ja | Ja | Ja | Later | Alleen met rolcontrole en audit |
| Websites | Ja | Ja | Ja | Later | Geen live publicatie in MVP |
| Projects | Ja | Ja | Ja | Later | Statuswijzigingen eerst menselijk |
| Quotes | Ja | Ja | Ja | Nee | Geen prijzen automatisch wijzigen |
| Invoices | Beperkt | Ja | Ja | Nee | Geen bedrag/status/payment writes |
| Subscriptions | Beperkt | Ja | Ja | Nee | Geen Mollie/abonnement acties |
| Files | Beperkt | Ja | Ja | Nee | Geen signed URLs/secrets in prompts |
| Change requests | Ja | Ja | Ja | Later | Samenvatten mag, statuswrite later |
| Leadfinder | Ja | Ja | Ja | Later | Geen scraping zonder aparte fase |
| CRM tasks | Ja | Ja | Ja | Later | Taken eerst concept/confirm |
| Client portal messages | Ja | Ja | Ja | Later | Alleen eigen customer-context |
| Notifications | Ja | Ja | Ja | Later | Geen automatische verzending in MVP |
| Audit logs | Nee | Nee | Nee | Nee | Security/admin only |
| Deployment | Nee | Nee | Nee | Nee | AI mag nooit deployment uitvoeren |
| Auth/profiles/roles | Nee | Nee | Nee | Nee | Geen AI-writes |
| Supabase schema/RLS | Nee | Nee | Nee | Nee | Geen AI-writes |
| Mollie payments | Nee | Nee | Nee | Nee | Geen AI-acties |
| Resend emails | Beperkt | Ja | Ja | Nee | Verzenden pas na review/approval |

## Databronnen

### Local/demo

Toegestaan voor:

- intake drafts;
- demo leads;
- AI Wizard drafts;
- AI Admin mock output;
- salesdemo's;
- conceptflows.

Niet behandelen als productiebron.

### Supabase

Toekomstige productiebron voor:

- profiles;
- customers;
- websites;
- projects;
- quotes;
- quote_lines;
- invoices;
- invoice_lines;
- subscriptions;
- files;
- change_requests;
- leads;
- crm_tasks;
- client_portal_messages;
- client_portal_notifications;
- ai_drafts;
- ai_assistant_drafts;
- audit_logs.

## AI Draft Tabellen

Toekomstige tabellen:

### `ai_drafts`

Voor klant/project/website concepten:

- websitebrief;
- homepage structuur;
- SEO concept;
- contentblokken;
- wizard output.

### `ai_assistant_drafts`

Voor interne assistentoutput:

- leadanalyse;
- opvolgadvies;
- offerte-intro;
- projectstatus;
- klantbericht;
- wijzigingsverzoek samenvatting.

## Logging

AI logging moet vastleggen:

- wie de actie startte;
- welke module;
- welk record;
- welk type output;
- timestamp;
- model/provider metadata later;
- status/foutmelding.

Niet loggen:

- volledige secrets;
- API keys;
- betaalproviderpayloads;
- reset tokens;
- volledige signed URLs;
- onnodige persoonsgegevens.

## Minimale AI Permission Rules

1. Bezoekers krijgen alleen publieke context.
2. Klanten krijgen alleen eigen customer-context.
3. Sales krijgt leads/CRM-context, geen factuurwrites.
4. Support krijgt klant/project/context, geen payment writes.
5. Admin krijgt brede context, maar kritieke acties blijven review-only.
6. Developer krijgt readiness/context, geen klantinhoud tenzij expliciet nodig.
7. Demo users krijgen alleen demo data.

## Kritieke Blokkades Voor Live AI

Live AI blijft NO-GO totdat:

- Auth/RLS bewezen is;
- Customer A/B isolation bewezen is;
- AI adapter server-side is;
- prompt masking bestaat;
- logging bestaat;
- rate limiting bestaat;
- privacy/consent zichtbaar is;
- rollback/fallback is beschreven.

