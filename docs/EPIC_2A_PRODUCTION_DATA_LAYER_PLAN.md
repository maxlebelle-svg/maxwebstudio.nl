# Epic 2A - Production Data Layer Plan

Status: `INVENTORY COMPLETE / NO CODE CHANGES`

Epic 2A brengt in kaart welke demo- en localStorage-data in het klantportaal vervangen moet worden door echte Supabase-data.

Dit document is de brug tussen:

- Epic 1: Digital Account Manager demo-ervaring;
- Epic 2: Production Rollout Plan;
- de toekomstige productie-uitrol van het klantportaal.

## Grenzen

In deze fase is bewust niets geactiveerd.

Niet uitgevoerd:

- geen codewijzigingen;
- geen SQL;
- geen Supabase schemawijzigingen;
- geen productie-auth activatie;
- geen echte klantdata;
- geen OpenAI;
- geen Mollie/Resend;
- geen runtimewijzigingen.

## Huidige Datastroom

Het klantportaal draait nu via `public/klantportaal.html`.

De belangrijkste databronnen zijn:

- `clientPortalDataService.js`: bouwt de klantveilige portal payload;
- `stagingClientPortalAuthBridgeService.js`: koppelt een staging Auth-sessie tijdelijk aan demo klantdata;
- repositories voor `customers`, `websites`, `projects`, `quotes`, `invoices` en `subscriptions`;
- localStorage keys voor demo en fallback;
- Supabase/hybrid read-layer waar die al veilig beschikbaar is.

De staging bridge seedt nu demo-objecten zoals:

- `demo-staging-testklant`;
- `demo-staging-website`;
- `demo-staging-project`;
- demo offerte, factuur, abonnement, wijzigingsverzoek, bericht, notificatie en bestand.

Die bridge is nuttig voor staging-validatie, maar mag geen productiebron worden.

## Productie Data Inventory

| Onderdeel | Huidige databron | Gewenste Supabase tabel/service | Benodigde velden | Auth-afhankelijkheid | RLS/security aandachtspunt | Migratievolgorde |
| --- | --- | --- | --- | --- | --- | --- |
| Auth en sessiecontext | `maxwebstudioSupabaseAuthSession`, `maxwebstudioCurrentSession`, staging bridge | Supabase Auth + `profiles` | `auth.users.id`, `email`, `role`, `customer_id`, `status`, timestamps | Supabase sessie is de enige production identity source | URL-parameters of localStorage mogen nooit autoriteit zijn; service role blijft server-side | 0 |
| Klantprofiel | `maxwebstudioCrmCustomers`, `maxwebstudioCustomers`, staging demo seed | `customers` via `CustomerRepository` | `id`, `name`, `company`, `email`, `phone`, `website`, `package`, `status`, `portal_status`, `customer_since`, timestamps | `profiles.customer_id` bepaalt welke customer gelezen mag worden | Customer mag alleen eigen record lezen; interne notities niet naar portal payload | 1 |
| Vandaag / Overzicht | Afgeleid uit websites, projects, invoices, change requests, messages, notifications, subscriptions | Afgeleide read-model laag boven Supabase services | websitegezondheid, open acties, laatste update, open facturen, unread berichten, actieve wijziging | Vereist geldige customer-context | Alleen data uit eigen customer scope combineren; geen cross-customer aggregatie | 2-6 |
| Mijn Website | `maxwebstudioManagedSites`, `maxwebstudioWebsites`, staging demo website | `websites` + eventueel `subscriptions` voor onderhoud/hosting | `id`, `customer_id`, `project_id`, `name`, `domain`, `live_url`, `status`, `maintenance_status`, `maintenance_plan`, `publish_status`, `ssl_status`, `last_checked_at`, `last_deploy_at`, `last_backup_at`, `seo_notes`, `seo_score`, `performance_score`, timestamps | Website moet via `customer_id` aan ingelogde klant gekoppeld zijn | Klant leest alleen eigen websites; domein/hosting/deployment velden blijven write-restricted | 2 |
| Projectstatus | `maxwebstudioProjects`, staging demo project | `projects` via `ProjectRepository` | `id`, `customer_id`, `website_id`, `name`, `status`, `phase`, `progress`, `start_date`, `deadline`, `public_notes`, `updated_at` | Project moet binnen eigen customer scope vallen | Customer read-only; interne rollen beheren status via bewezen write gates | 2 |
| Wijzigingsverzoeken | `maxwebstudioChangeRequests`, write fallback, staging demo request | `change_requests` | `id`, `customer_id`, `website_id`, `project_id`, `title`, `description`, `category`, `priority`, `status`, `created_by`, timestamps | Customer mag alleen eigen request aanmaken/lezen | Geen customer_id spoofing; customer mag status/ownership niet wijzigen | 3 |
| Berichten | `maxwebstudioClientPortalMessages`, write fallback, staging demo message | `client_portal_messages` | `id`, `customer_id`, `subject`, `body`, `sender_type`, `status`, `read_at`, timestamps | Bericht hoort bij eigen customer-context | Geen sender/customer spoofing; anonymous en no-profile blokkeren | 4 |
| Facturen | `maxwebstudioInvoices`, staging demo invoice | `invoices` + `invoice_lines` via finance service | `id`, `customer_id`, `invoice_number`, `status`, `payment_status`, `invoice_date`, `due_date`, `total`, `paid_at`, `subscription_id`, line items | Alleen eigen facturen zichtbaar na Auth/customer binding | Customer read-only; betalingen en statuswijzigingen uitsluitend server-side later | 5 |
| Offertes | `maxwebstudioQuotes`, staging demo quote | `quotes` + `quote_lines` via finance service | `id`, `customer_id`, `quote_number`, `status`, `quote_date`, `valid_until`, `total`, `accepted_at`, line items | Alleen eigen offertes zichtbaar na Auth/customer binding | Akkoord geven later via aparte server-side flow; geen brede customer writes | 5 |
| Abonnementen / onderhoud | `maxwebstudioSubscriptions`, staging demo subscription | `subscriptions` | `id`, `customer_id`, `website_id`, `plan`, `status`, `billing_cycle`, `next_invoice_date`, `amount`, `payment_status`, timestamps | Eigen customer scope | Customer read-only; facturatie en abonnementen blijven high-risk writes | 5 |
| Notificaties | `maxwebstudioClientPortalNotifications` en afgeleide notificaties | `client_portal_notifications` + afgeleide portal read laag | `id`, `customer_id`, `title`, `body`, `type`, `status`, `due_at`, `read_at`, `action_label`, `action_url`, timestamps | Alleen eigen customer notificaties | Notificaties mogen geen interne details of secrets bevatten | 6 |
| Bestanden | `maxwebstudioFiles`, staging demo file | `files` metadata + later Supabase Storage policies | `id`, `customer_id`, `website_id`, `project_id`, `name`, `type`, `category`, `status`, `storage_path`, `created_at`, `updated_at` | Bestandmetadata moet aan eigen customer gekoppeld zijn | Signed URLs en Storage RLS verplicht voor echte uploads/downloads | 7 |
| Max AI placeholders | Client-side demo teksten op basis van portal payload | Eerst afgeleid uit echte portal read-data; later `ai_drafts` en `ai_assistant_drafts` | Voor MVP geen aparte tabel; later `customer_id`, `entity_type`, `entity_id`, `draft_type`, `content`, `status`, timestamps | AI-context mag alleen eigen klantdata gebruiken | Geen prompts/secrets/logs naar klantweergave; toestemming en masking nodig voor echte AI | 8 |

## LocalStorage Keys Die Niet Productie-Leidend Mogen Zijn

Deze keys mogen in productie hooguit fallback/readiness zijn, maar niet de bron van waarheid:

- `maxwebstudioSupabaseAuthSession`;
- `maxwebstudioCurrentSession`;
- `maxwebstudioCrmCustomers`;
- `maxwebstudioCustomers`;
- `maxwebstudioManagedSites`;
- `maxwebstudioWebsites`;
- `maxwebstudioProjects`;
- `maxwebstudioQuotes`;
- `maxwebstudioInvoices`;
- `maxwebstudioSubscriptions`;
- `maxwebstudioFiles`;
- `maxwebstudioChangeRequests`;
- `maxwebstudioClientPortalMessages`;
- `maxwebstudioClientPortalNotifications`;
- write-gate statuskeys zoals `maxwebstudioChangeRequestWriteEnabled` en `maxwebstudioClientPortalMessageWriteEnabled`.

Staging identifiers zoals `demo-staging-testklant`, `demo-staging-website` en `demo-staging-project` horen uitsluitend in test/staging.

## Implementatievolgorde

1. **Auth user naar profile/customer binding**
   - Supabase Auth sessie is leidend.
   - `profiles.customer_id` bepaalt de klantcontext.
   - URL params en localStorage mogen deze context niet overschrijven.

2. **Klantprofiel read**
   - Eerste echte production read.
   - Portal toont alleen basisprofiel en duidelijke empty state als koppeling ontbreekt.

3. **Mijn Website + Projectstatus read**
   - `websites` en `projects` aansluiten op dezelfde customer-context.
   - Dashboard/Terugkomreden wordt hiermee echt.

4. **Wijzigingsverzoeken**
   - Read eerst volledig op Supabase.
   - Create/write pas production-gated na RLS, audit en approval.

5. **Berichten**
   - Read eerst volledig op Supabase.
   - Create/write pas production-gated na RLS, audit en approval.

6. **Facturen, offertes en abonnementen**
   - Read-only naar productie.
   - Geen Mollie-live of betaalstatuswrites zonder aparte release.

7. **Notificaties**
   - Eerst read-only.
   - `read_at` of gelezen-status pas later als aparte low-risk write.

8. **Bestanden**
   - Eerst metadata read-only.
   - Storage uploads/downloads pas na Storage Security uitvoering en signed URL-validatie.

9. **Max AI placeholders**
   - Blijven placeholder/regelgebaseerd.
   - Later pas echte AI-context via server-side adapter.

## Productieblockers Voor Bouwfase

Voordat Epic 2A van inventory naar implementatie gaat:

- production Auth-config moet expliciet zijn goedgekeurd;
- password reset, logout en session restore moeten production-ready zijn;
- Customer A/B RLS-isolatie moet opnieuw worden bewezen op production-like data;
- productie mag geen demo/staging records bevatten;
- adminbeheer voor klantprofielkoppeling moet duidelijk zijn;
- audit logging, backup en rollback moeten release-ready zijn;
- release governance moet productie `GO` geven.

## Volgende Stap

Aanbevolen vervolg:

`Epic 2A.2 - Production Customer Profile Read`

Doel van die stap:

- Supabase Auth sessie koppelen aan `profiles.customer_id`;
- klantprofiel read-only tonen vanuit echte Supabase-data;
- demo/local fallback behouden zolang production rollout `NO-GO` is;
- geen writes activeren.

## Epic 2A.2 - Supabase Customer Profile Foundation

Status: `IMPLEMENTED / READ-ONLY FOUNDATION / PRODUCTION AUTH NO-GO`

Doel:

- de klantcontext niet langer uitsluitend uit demo/localStorage laten komen;
- eerst proberen een klantprofiel op te halen op basis van de ingelogde Supabase Auth user;
- veilig terugvallen naar de staging/demo bridge zolang er geen echt profile/customer bestaat.

Toegevoegd:

- `public/src/services/clientCustomerProfileContextService.js`

Werking:

1. Lees de bestaande Supabase Auth-sessie uit de browser.
2. Haal publieke Supabase-config op via de bestaande client auth config route.
3. Lees read-only `profiles` met `auth_user_id = session.user.id`.
4. Lees read-only de gekoppelde `customers` record via `profiles.customer_id`.
5. Geef een klantveilige context terug aan `klantportaal.html`.
6. Als profile/customer ontbreekt of niet veilig gelezen kan worden, blijft de staging/demo fallback actief.

Ondersteunde states:

- `loading`: voorbereid voor UI-statussen;
- `profile_found`: profile en customer gevonden;
- `profile_missing`: sessie of customer-koppeling ontbreekt;
- `error`: veilige foutstatus zonder secrets.

Benodigde Supabase-velden:

`profiles`:

- `id`;
- `auth_user_id`;
- `email`;
- `role`;
- `customer_id`;
- `status`.

`customers`:

- `id`;
- `name`;
- `company_name` of `company`;
- `email`;
- `phone`;
- `website` of `website_url`;
- `package` of `plan`;
- `status`;
- `portal_status`;
- `customer_since`;
- `created_at`;
- `updated_at`.

Securityregels:

- Geen service role naar frontend.
- Alleen Supabase Auth access token en anon/publishable key worden client-side gebruikt.
- Customer context mag in productie niet uit URL-parameters of localStorage worden afgeleid.
- RLS moet afdwingen dat de ingelogde customer alleen eigen `profiles` en `customers` ziet.
- Fallback is uitsluitend bedoeld voor staging/demo/readiness.

Bewust niet uitgevoerd:

- geen volledige portaldata-migratie;
- geen writes;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen redesign;
- geen OpenAI/Mollie.

Volgende aanbevolen stap:

`Epic 2A.3 - Mijn Website Production Read`

## Epic 2A.3 - Mijn Website Production Data Foundation

Status: `IMPLEMENTED / READ-ONLY FOUNDATION / PRODUCTION AUTH NO-GO`

Doel:

- de databron voor `Mijn Website` en projectstatus voorbereiden op echte Supabase-data;
- bestaande portal UX behouden;
- demo/localStorage fallback behouden zolang Supabase-data ontbreekt.

Toegevoegd:

- `public/src/services/clientWebsiteProjectContextService.js`

Werking:

1. Gebruik de bestaande Supabase Auth-sessie.
2. Gebruik de klantcontext uit Epic 2A.2.
3. Lees read-only `websites` op `customer_id`.
4. Lees read-only `projects` op `customer_id`.
5. Normaliseer de velden naar de bestaande klantportaalvorm.
6. Als websites/projecten ontbreken of niet veilig gelezen kunnen worden, blijft de bestaande portal payload actief.

Ondersteunde states:

- `loading`: voorbereid voor UI-statussen;
- `found`: websites en/of projecten gevonden;
- `missing`: geen customer_id, sessie, config of records;
- `error`: veilige foutstatus zonder secrets.

Benodigde Supabase-velden voor `websites`:

- `id`;
- `customer_id`;
- `project_id`;
- `name`;
- `domain`;
- `live_url`;
- `status`;
- `hosting_package`;
- `care_package`;
- `maintenance_status`;
- `maintenance_plan`;
- `publish_status`;
- `ssl_status`;
- `safety_status`;
- `backup_status`;
- `last_backup_at`;
- `last_checked_at`;
- `last_deploy_at`;
- `seo_notes`;
- `seo_score`;
- `performance_score`;
- `updated_at`.

Benodigde Supabase-velden voor `projects`:

- `id`;
- `customer_id`;
- `website_id`;
- `name`;
- `project_name`;
- `status`;
- `phase`;
- `progress`;
- `start_date`;
- `deadline`;
- `public_notes`;
- `client_visible_notes`;
- `updated_at`.

Securityregels:

- Geen service role naar frontend.
- Reads gebruiken de ingelogde Supabase Auth-sessie.
- RLS moet afdwingen dat de klant alleen eigen `websites` en `projects` kan lezen.
- Website/project `customer_id` mag in productie niet uit localStorage worden vertrouwd.
- Hosting, deployment, domein en ownership-writes blijven geblokkeerd.

Bewust niet uitgevoerd:

- geen redesign;
- geen writes;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen OpenAI/Mollie;
- geen nieuwe dependencies.

Volgende aanbevolen stap:

`Epic 2A.4 - Change Requests Production Read`

## Epic 2A.4 - Wijzigingsverzoeken Production Data Foundation

Status: `IMPLEMENTED / READ-WRITE FOUNDATION / PRODUCTION AUTH NO-GO`

Doel:

- wijzigingsverzoeken voorbereiden op echte Supabase-data;
- bestaande wijzigingsverzoeken read-only ophalen op `customer_id`;
- nieuw wijzigingsverzoek via Supabase aanmaken als er een veilige Auth/customer-context bestaat;
- bestaande demo/localStorage fallback behouden zolang Supabase-data of write-permissie ontbreekt.

Toegevoegd:

- `public/src/services/clientChangeRequestContextService.js`

Werking read:

1. Gebruik de bestaande Supabase Auth-sessie.
2. Gebruik de customer context uit Epic 2A.2.
3. Lees read-only `change_requests` op `customer_id`.
4. Normaliseer records naar de bestaande klantportaalvorm.
5. Als records ontbreken of niet veilig gelezen kunnen worden, blijft de bestaande portal payload actief.

Werking create:

1. Valideer titel, omschrijving, type/categorie, prioriteit en gekoppelde website/project.
2. Controleer of `customer_id` production-ready is.
3. Maak via Supabase REST een `change_requests` record aan met de ingelogde Auth-sessie.
4. Zet `auth_user_id` op de ingelogde gebruiker.
5. Als Supabase-context ontbreekt of create faalt, valt de flow terug op de bestaande lokale fallback.

Ondersteunde states:

- `loading`;
- `found`;
- `missing`;
- `create_success`;
- `create_error`;
- `error`.

Benodigde Supabase-velden voor `change_requests`:

- `id`;
- `customer_id`;
- `auth_user_id`;
- `website_id`;
- `project_id`;
- `name`;
- `company`;
- `email`;
- `phone`;
- `title`;
- `description`;
- `category` als technisch veld voor klantvriendelijk `type`;
- `priority`;
- `status`;
- `files`;
- `source`;
- `is_demo`;
- `environment`;
- `metadata`;
- `created_at`;
- `updated_at`.

Securityregels:

- Geen service role naar frontend.
- Reads en creates gebruiken de ingelogde Supabase Auth-sessie.
- RLS moet afdwingen dat de klant alleen eigen `change_requests` kan lezen en aanmaken.
- `customer_id` mag niet vanuit formulierinput komen.
- `auth_user_id` wordt client-side gevuld op basis van de actieve sessie en moet server/RLS-side worden gecontroleerd.
- Customer mag geen status, ownership, archive/delete of adminvelden wijzigen.
- Uploads blijven uitgesloten tot Storage Security productie-uitvoering.

Bewust niet uitgevoerd:

- geen redesign;
- geen SQL;
- geen productie-auth activatie;
- geen echte klantdata;
- geen uploads;
- geen OpenAI/Mollie;
- geen nieuwe dependencies.

Volgende aanbevolen stap:

`Epic 2A.5 - Client Portal Messages Production Data Foundation`
