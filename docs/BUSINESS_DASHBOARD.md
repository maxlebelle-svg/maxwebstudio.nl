# Business Intelligence Dashboard

Dit document beschrijft het managementdashboard van Max Web Studio in het Admin CRM.

## Doel

Het dashboard geeft in een oogopslag inzicht in:

- omzetgezondheid
- abonnementenstatus
- klantdekking
- openstaande facturen
- operationele druk
- betaalrisico's

## Architectuur

Frontend:

- `/public/admin-dashboard.html`
- gebruikt bestaande Admin CRM-stijl
- haalt managementdata op via één endpoint
- gebruikt geen externe chart libraries
- toont alleen samengevatte admininformatie

Backend:

- `/.netlify/functions/admin-dashboard-metrics`
- vereist `ADMIN_TOKEN`
- gebruikt `SUPABASE_SERVICE_ROLE_KEY` alleen server-side
- leest Supabase-tabellen server-side
- geeft JSON met KPI's, grafiekdata en actiepunten terug

Belangrijke tabellen:

- `public.profiles`
- `public.customer_websites`
- `public.customer_subscriptions`
- `public.customer_invoices`
- `public.change_requests`

## KPI Definities

### Monthly Recurring Revenue

MRR is de som van `monthly_amount` voor actieve onderhoudsabonnementen.

Een abonnement telt als actief wanneer:

- `customer_subscriptions.status = active`, of
- `customer_subscriptions.mollie_subscription_status = active`

### Annual Recurring Revenue

ARR is:

```text
MRR x 12
```

### Actieve Klanten

Aantal profielen waar:

```text
profiles.status = actief
```

Als status ontbreekt, wordt het profiel conservatief als actief behandeld.

### Websites

Klanten met website zijn profielen die:

- minimaal één record in `customer_websites` hebben, of
- een `profiles.website` waarde hebben

### Factuur KPI's

Open facturen:

- `draft`
- `sent`
- `open`
- `pending`

Betaalde facturen:

- `paid`

Verlopen facturen:

- `expired`
- `overdue`

Openstaande waarde is de som van open factuurbedragen.

Betaalde omzet is de som van betaalde facturen binnen de gekozen periode.

## Risico Levels

Subscription risk komt uit `customer_subscriptions.subscription_risk_level`.

Gebruikte waarden:

- `normal`: geen open betaalprobleem
- `attention`: minimaal één mislukte incasso of opvolging nodig
- `high`: meerdere failures, chargeback of hoge urgentie

## Actie Vereist

De sectie `Actie vereist` toont automatisch:

- verlopen facturen
- mislukte incasso's
- klanten zonder afgeronde mandate
- abonnementen met hoog risico
- hoge prioriteit wijzigingsverzoeken

Klik op `Open klant` springt naar het klantdetailpaneel wanneer het actiepunt aan een profiel gekoppeld is.

## Periodefilters

Beschikbare filters:

- vandaag
- deze maand
- dit kwartaal
- dit jaar
- alles

De periode heeft vooral invloed op omzetgrafieken en betaalde omzet. Huidige status-KPI's zoals actieve abonnementen en hoog risico blijven actuele snapshots.

## Beperkingen

- Geen externe analytics of chart libraries.
- Geen forecast of churnberekening.
- Geen export naar Excel of PDF.
- Geen AI-samenvatting.
- Geen echte adminrollen of audit trail; toegang loopt nog via `ADMIN_TOKEN`.
