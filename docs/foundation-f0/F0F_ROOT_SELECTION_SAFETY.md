# Foundation F0-f — Root Selection Safety

Status: **PASS FOR LOCAL STATIC SELECTOR**

`select-root.mjs` vereist expliciet `--mode bootstrap` of `--mode existing`; zonder geldige modus volgt een harde stop. Beide modi vereisen `F0F_LOCAL_ONLY=1` en weigeren `SUPABASE_ACCESS_TOKEN`, project-id/ref, Supabase DB URL en `DATABASE_URL`.

Bootstrapmodus wijst uitsluitend naar `supabase-bootstrap` en vereist via de validator de baselinechecksum plus afwezigheid van historische migrations. Existingmodus wijst uitsluitend naar `supabase`; een toekomstige execution view moet de baseline uitsluiten en alleen genuine historical files plus gevalideerde commonfiles bevatten.

Er is geen automatische detectie, linked-projectfallback of productierunner. Rootselectie is in F0-f alleen statische, lokale beveiliging.
