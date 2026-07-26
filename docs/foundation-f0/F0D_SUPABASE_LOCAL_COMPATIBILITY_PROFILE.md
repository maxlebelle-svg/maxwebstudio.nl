# F0-d — Supabase Local Compatibility Profile

Status: **DESIGNED / SETUP SCRIPT NOT AUTHORIZED**

| Rol | Nodig | Login | Superuser | Inherit | Bypass RLS | Ownergebruik/minimum | Risico |
|---|---|---:|---:|---:|---:|---|---|
| bootstrap_admin | lokaal testbeheer | tijdelijk ja, socket-only | ja | ja | impliciet | cluster/database aanmaken en migrations uitvoeren; nooit applicatierol | zeer krachtig; disposable cluster verplicht |
| postgres | expliciet vereist door beide assetmigrations | nee | nee | ja | nee | eigenaar van expliciet overgedragen assettabellen/functies | owner bypass op niet-forced RLS; niet als client gebruiken |
| authenticated | grants/policies | nee | nee | ja | nee | geen ownership; alleen expliciete grants | privilege-escalatie bij brede grants |
| anon | grants/policies | nee | nee | ja | nee | geen ownership en geen directe public-table grants | publieke toegang bij foutieve grants |
| service_role | serverfuncties en asset-RPCs | nee | nee | ja | ja, om Supabase serversemantiek te modelleren | alleen expliciete servergrants | BYPASSRLS; nooit browser/login |
| authenticator | niet nodig voor migration-only tests | standaard afwezig; alleen tijdelijke login bij latere PostgREST-test | nee | ja | nee | mag alleen naar APIrollen SET ROLE wanneer zo'n test apart is goedgekeurd | vergroot aanvalsvlak |
| supabase_admin | huidige appmigrations refereren deze rol niet | nee | nee | ja | nee | alleen toevoegen als platformmigration/tooling dit aantoonbaar vereist | kan platformownership verkeerd suggereren |

Benodigde lokale schema's/placeholders:

- `auth.users` leeg en een minimale `auth.uid()` stub;
- `storage.buckets` en `storage.objects` leeg, alleen catalogusvorm;
- `extensions` met `pgcrypto`/`digest`;
- `public` door PostgreSQL;
- geen Auth-identities/sessies, Storage-objecten, seed- of klantdata.

Het profiel moet vóór elke run attribuut- en ownershipfingerprints controleren. Het bootstrapscript mag pas in een volgende fase worden gemaakt. Het F0-c-falen op `OWNER TO postgres` wordt hiermee gemodelleerd zonder historische SQL aan te passen.
