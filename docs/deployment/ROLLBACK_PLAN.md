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

## Rollback stappen

1. Stop nieuwe deploys.
2. Zet Netlify terug naar laatste stabiele deploy.
3. Pauzeer risicovolle webhooks indien nodig.
4. Controleer of probleem frontend/function/database is.
5. Bij databaseprobleem: restore backup of draai policies handmatig terug na review.
6. Controleer Customer A/B isolatie opnieuw.
7. Controleer admin-dashboard en klantportaal.
8. Leg incident en oplossing vast.

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
