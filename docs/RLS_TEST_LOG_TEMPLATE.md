# RLS Test Log Template

Kopieer deze template per testronde.

## Testronde

- Datum:
- Tester:
- Supabase project:
- Commit hash:
- Schema versie:
- Policy versie:
- Environment:

## Scenarioresultaten

| Scenario | Rol | Verwachte uitkomst | Werkelijke uitkomst | Pass/Fail | Notes | Follow-up actie |
| --- | --- | --- | --- | --- | --- | --- |
| Admin alles lezen | admin | alle canonical data zichtbaar |  |  |  |  |
| Sales geen Developer Tools | sales | developer/security tooling geblokkeerd |  |  |  |  |
| Support geen betaalmutaties | support | payment writes geblokkeerd |  |  |  |  |
| Developer geen payment write | developer | technische tools wel, betalingen niet |  |  |  |  |
| Customer A eigen data | customer | alleen Customer A zichtbaar |  |  |  |  |
| Customer A ziet Customer B niet | customer | Customer B geblokkeerd |  |  |  |  |
| Demo-user ziet alleen demo | demo_user | productie geblokkeerd |  |  |  |  |
| Anonymous ziet geen klantdata | anonymous | alle canonical klantdata geblokkeerd |  |  |  |  |

## Go/No-Go advies

- Advies:
- Reden:
- Open follow-ups:
- Volgende testronde nodig: ja/nee
