# Foundation F0-e — Negative Test Report

Status: **PASS (GUARDRAILS) / DOES NOT OVERRIDE POC FAIL**

| negatieve conditie | resultaat |
|---|---|
| baseline checksum mismatch | hard fail |
| historische/extra migration in bootstrap-root | hard fail |
| common version vóór `20260721000000` | hard fail |
| remote environmentvariabelen | hard fail |
| externe projectref | hard fail |
| niet-lokale TCP-host | hard fail |
| credentials in lokale URL | hard fail |
| gedeeltelijke baseline zonder history | hard fail |
| meerdere/dubbele baselinehistoryrows | hard fail |
| synthetic pre-cutover marker | hard fail |
| testbucket of Storage-objectdata | hard fail |
| workspace buiten expliciete temp-prefix | hard fail |

De tests oefenen de gedeelde guardrailfuncties uit die door init/verify/cleanup worden gebruikt. Geen negatieve test benaderde een remote systeem.
