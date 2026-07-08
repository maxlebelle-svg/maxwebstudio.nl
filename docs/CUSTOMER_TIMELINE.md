# Customer Timeline + Activity Feed

Deze sprint voegt een centrale timeline toe voor klantactiviteiten en een globale activity feed voor het Max CRM dashboard.

## Centrale tabel

Migration draft:

`supabase/migration-drafts/024_customer_timeline_activity_feed.sql`

Tabel:

`public.customer_timeline_events`

Gebruik:

- klanttimeline: filter op `customer_id`
- globale activity feed: filter op `is_global = true`
- lead-only events: `lead_id` mag gevuld zijn zonder `customer_id`
- algemene events: mogen global zijn zonder klant of lead

De tabel heeft RLS aan en alleen `service_role` krijgt toegang. Frontend schrijft niet direct naar deze tabel.

## Backend

Centrale service:

`functions/services/timelineService.js`

Exports:

- `createTimelineEvent(input)`
- `listCustomerTimeline(customerId, filters)`
- `listActivityFeed(filters)`
- `normalizeTimelineEvent(input)`

Alle writes horen via `createTimelineEvent()` te lopen. De service gebruikt veilige defaults voor metadata en voorkomt optioneel dubbele events via `metadata.dedupeKey`.

Admin API:

`/.netlify/functions/admin-timeline-events`

Ondersteunde filters:

- `customerId`
- `global=true`
- `module`
- `eventType`
- `limit`
- `search`

Toegang loopt via bestaande admin-auth voor `super_admin`, `admin` en `sales_manager`.

## UI

Dashboard:

- `public/admin-dashboard.html`
- kaart: **Recente activiteit**
- toont laatste 10 globale events

Klantdetail:

- `public/admin-klanten.html`
- blok: **Customer Timeline**
- filters: alles, sales, facturen, e-mails, productie, support, SEO, QA, telefonie
- zoeken op titel, omschrijving, medewerker, module en event type

## Automatische logging

Aangesloten flows:

- lead ontvangen
- leadbevestiging verzonden
- interne lead notificatie verzonden
- factuur aangemaakt/bijgewerkt
- factuur verzonden
- factuur betaald
- onboarding gestart
- onboarding ingestuurd
- wijzigingsverzoek ingestuurd
- websitepakket-update verzonden
- algemene e-mail verzonden vanuit Mail Center

Logging is best effort: een fout in timeline logging mag de hoofdflow nooit breken.

## Deploy volgorde

1. Deploy code.
2. Voer migration `024_customer_timeline_activity_feed.sql` uit in Supabase.
3. Test eerst de lege dashboard feed en klanttimeline.
4. Verstuur daarna een testlead en controleer of lead- en mail-events verschijnen.

Als de migration nog niet is uitgevoerd, blijven hoofdflows werken. De feed/timeline API kan dan een nette foutmelding teruggeven omdat de tabel nog ontbreekt.
