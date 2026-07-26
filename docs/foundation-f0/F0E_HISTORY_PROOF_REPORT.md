# Foundation F0-e — History Proof Report

Status: **BASELINE PASS / COMMON CUTOVER FAIL**

Supabase CLI `2.108.0` maakte zelf `supabase_migrations.schema_migrations` aan. De lokaal waargenomen velden waren:

| veld | type | nullable |
|---|---|---|
| `version` | `text` | nee |
| `statements` | `ARRAY` | ja |
| `name` | `text` | ja |

Na de baseline bevatte de tabel exact één echte row:

| version | name | statement count |
|---|---|---:|
| `00000000000000` | `authoritative_baseline` | 612 |

De baseline-SHA was exact `6c8b9a8137850edadb6fe976938d44e16a5eecadc740481a65423bf72251ff11`. Er zijn geen checksumvelden, repairrows of synthetische historische versies toegevoegd.

Bij omschakeling naar de aparte common-root weigerde de CLI omdat remote/databaseversie `00000000000000` niet in die lokale migrationsdirectory stond. Exitstatus was 1; history bleef exact één row. De CLI suggereerde `migration repair` en `db pull`. Conform opdracht is direct gestopt en geen van beide uitgevoerd. Dit bewijst dat het huidige strikte Model C niet door de standaard CLI-historyvalidatie komt.
