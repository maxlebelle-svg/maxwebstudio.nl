# Release Decision Summary

Project: Max Webstudio  
Generated at: 2026-06-29  
Decision: NO-GO  
Scope: Fase 14.4C Supabase RLS Permission Patch

## Samenvatting

De permission blocker uit Fase 14.4B is onderzocht. De oorzaak is dat PostgREST-rollen niet genoeg privileges hebben op de canonical tabellen, waardoor de service role via de REST API geen testrecords kon plaatsen in `public.profiles`.

Er is een SQL patch voorbereid:

- `supabase/service-role-grants.sql`

De patch is nog niet uitgevoerd. Productie is niet geraakt.

## Patchscope

- Grants voor schema `public`.
- Execute grants voor RLS/helperfuncties.
- Select grants voor `anon` en `authenticated`.
- Geen mutatiegrants voor `anon` of `authenticated`.
- Volledige canonical table grants voor `service_role`, bedoeld voor server-side backend/admin/testflows.

## Niet inbegrepen

- Geen legacy `customer_*` tabellen.
- Geen `DROP`.
- Geen `TRUNCATE`.
- Geen data `DELETE`.
- Geen inserts/updates van klantdata.
- Geen productie-execution.

## Beslissing

`NO-GO / BLOCKED` blijft staan totdat:

1. de patch handmatig is gereviewd;
2. de patch alleen op het Supabase testproject is uitgevoerd;
3. Fase 14.4B opnieuw is gedraaid;
4. Customer A/B isolatie volledig bewezen is;
5. blockers handmatig zijn gereviewd.
