# Release Decision Summary

Project: Max Webstudio  
Generated at: 2026-06-29  
Decision: NO-GO  
Scope: Fase 14.4B rerun na Supabase service-role grants

## Samenvatting

De Supabase testomgeving is opnieuw gevalideerd nadat `supabase/service-role-grants.sql` op het testproject is uitgevoerd.

De eerdere `403 permission denied` op `public.profiles` is opgelost. Auth, profile insert, canonical testrecord setup en Storage werken nu in de testomgeving.

De release blijft `NO-GO / BLOCKED`, omdat RLS-selects nu falen met `500 stack depth limit exceeded`. Customer A/B isolation is daardoor nog niet bewezen.

## PASS

- `.env.local` testconfig actief en gitignored.
- Service role profile insert werkt; eerdere 403 is opgelost.
- Auth Admin API kon 2 testgebruikers aanmaken.
- Customer A/B login werkt.
- Canonical testrecords konden worden geplaatst.
- Storage bucket/upload/signed URL/private public endpoint werkt.
- Geen productie aangepast.
- Geen echte klantdata gebruikt.

## FAIL

- RLS select op `profiles` geeft `500 stack depth limit exceeded`.
- RLS exact-id tests op canonical modules geven 500.
- Anonymous DB probe geeft 500.

## BLOCKED

- Customer A/B isolation.
- RLS testlog approval.
- Deployment blocker approvals.

## Belangrijkste technische blocker

Postgres foutcode:

`54001`

Foutmelding:

`stack depth limit exceeded`

Waarschijnlijke oorzaak:

RLS-recursie doordat helperfunctie `current_app_role()` `public.profiles` raadpleegt terwijl policies op `public.profiles` en andere tabellen opnieuw rolchecks uitvoeren.

## Next Actions

1. Maak een RLS-recursiepatch voor de helper/policylaag.
2. Review de patch voordat deze wordt uitgevoerd.
3. Voer de patch alleen uit op het Supabase testproject.
4. Herhaal Fase 14.4B exact-id RLS/customer-isolation tests.
5. Houd release `NO-GO` totdat Customer A/B isolation PASS is en blockers handmatig zijn gereviewd.

Er is geen productie geraakt en er zijn geen secrets opgeslagen.
