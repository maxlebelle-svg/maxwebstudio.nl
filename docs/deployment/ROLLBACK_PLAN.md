# Rollback Plan

Status: procedure. Geen rollback SQL.

## Wanneer rollback nodig is

- klantdata is niet zichtbaar voor juiste klant
- klantdata is zichtbaar voor verkeerde klant
- admin kan niet meer inloggen
- facturen/offertes tonen verkeerde data
- RLS blokkeert kritieke server-side functies
- Mollie/Resend webhooks veroorzaken foutieve updates

## Vooraf verplicht

- database backup
- Git commit hash van laatste stabiele versie
- Netlify deploy rollback beschikbaar
- lijst met uitgevoerde SQL-stappen
- testlog en incidentnotities
- expliciete approval op blocker `rollback_plan_approved`

## Rollback stappen

1. Stop nieuwe deploys.
2. Zet Netlify terug naar laatste stabiele deploy.
3. Pauzeer risicovolle webhooks indien nodig.
4. Controleer of probleem frontend/function/database is.
5. Bij databaseprobleem: restore backup of draai policies handmatig terug na review.
6. Controleer Customer A/B isolatie opnieuw.
7. Controleer admin-dashboard en klantportaal.
8. Leg incident en oplossing vast.

## Staging/test rollback

Voor de Fase 24 migration drafts geldt eerst een staging/test rollback:

1. Stop direct bij de eerste kritieke SQL-, RLS- of isolatiefout.
2. Leg de exacte stap, foutmelding en context vast in `TEST_RESULTS.md`.
3. Reset de Supabase testdatabase, herstel snapshot of maak een nieuwe testbranch.
4. Pas de draft niet rechtstreeks in Supabase aan; corrigeer in Git in een aparte fixfase.
5. Herhaal de volledige execution flow vanaf `001_schema_tables.sql`.
6. Productie blijft onaangeraakt en No-Go.

## Wat niet automatisch wordt teruggedraaid

- RLS policies zonder handmatige review.
- Auth-user wijzigingen.
- Mollie betalingen of subscriptions.
- Resend verzonden e-mails.
- Storage objecten.

## Handmatige acties

- klanten informeren indien data tijdelijk onbereikbaar was
- Mollie dashboard controleren
- Resend delivery logs controleren
- Supabase logs exporteren
- nieuw testplan maken voordat opnieuw live wordt gegaan

## Approval

Rollback approval wordt niet automatisch gezet. Leg approvedBy, datum en opmerkingen vast via Developer Mode of deploymentnotities.
