# Foundation F0-e — Bootstrap Root Design

Status: **IMPLEMENTED LOCALLY / NOT PROMOTABLE**

`supabase-bootstrap/` is fysiek gescheiden van de productroot en bevat een eigen `supabase/config.toml`, lokale profieldefinitie en init/verify/cleanup/runner-scripts. De ingecheckte `supabase-bootstrap/supabase/migrations/` bevat geen SQL. `init.mjs` leest de authoritative baseline, controleert de vaste SHA-256 en staget exact één byte-identieke migration in een expliciete `/private/tmp/f0e-*`-projectroot.

Guardrails weigeren:

- een ontbrekende `F0E_LOCAL_ONLY=1`-sentinel;
- remote Supabase- of database-environmentvariabelen;
- credentials in de URL en iedere host anders dan `127.0.0.1`, `localhost` of `::1`;
- een workspace buiten `/private/tmp/f0e-*`;
- checksumdrift, extra bootstrap-SQL, pre-cutover common versions en synthetic history;
- gedeeltelijk basisschema zonder echte baselinehistory;
- Storage-objectdata of een testbucket.

Deze root bevat geen fallback naar historische migrations, symlink, history repair of deploypad.
