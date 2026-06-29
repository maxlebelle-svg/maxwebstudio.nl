# Release Decision Summary

Project: Max Webstudio  
Generated at: 2026-06-29  
Decision: NO-GO  
Scope: Fase 14.4D RLS Recursion Patch

## Samenvatting

De RLS-recursie uit de 14.4B rerun is geanalyseerd. De helperfuncties `current_profile_id()` en `current_app_role()` lezen `public.profiles`, terwijl policies op `public.profiles` en gerelateerde tabellen opnieuw rol/profile checks aanroepen. Daardoor ontstaat recursie en eindigt de test met `stack depth limit exceeded`.

Er is een gerichte SQL patch voorbereid:

- `supabase/rls-recursion-patch.sql`

De patch is nog niet uitgevoerd. Productie is niet geraakt.

## Patchscope

- Alleen helperfuncties aanpassen.
- `SECURITY DEFINER` gebruiken voor profile/role lookup.
- Expliciete `search_path` zetten.
- Alleen actieve profiles gebruiken.
- Bestaande customer ownership policies intact laten.
- Geen brede bypass policies toevoegen.

## Rollback

- Herstel de helperfuncties uit `supabase/rls-policies.sql`.
- Herhaal Fase 14.4B.

## BLOCKED

- Patch is nog niet handmatig gereviewd.
- Patch is nog niet uitgevoerd op het testproject.
- RLS/customer-isolation is nog niet opnieuw getest.
- Deployment blockers zijn niet approved.

## Next Actions

1. Review `supabase/rls-recursion-patch.sql`.
2. Voer de patch alleen uit op het Supabase testproject.
3. Herhaal Fase 14.4B RLS/customer-isolation tests.
4. Houd release `NO-GO` totdat Customer A/B isolation PASS is.
