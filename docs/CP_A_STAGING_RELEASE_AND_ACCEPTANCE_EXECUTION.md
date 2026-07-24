# CP-A staging release and acceptance execution

Datum: 2026-07-24
Status: staginghervatting geblokkeerd tot de lokale digest-fix afzonderlijk wordt gepusht en opnieuw gereviewd

## Uitgevoerde releasefase

- releasebranch vóór fix remote op `e34910934b60a4006eb5c285946782d01f0ea370`;
- draft-PR #4 naar `codex/rc1-clean-migration-lineage`;
- bridge-migratie succesvol toegepast en gevalideerd op staging;
- CP-A één keer in een expliciete transactie geprobeerd;
- fout `42883` op `public.digest(bytea, unknown)`;
- volledige transactionele rollback bewezen;
- targetbranch en vaste stagingdeploy bleven op `fd5f7a8099e4521b4e6d8ff809a6bce9aa56773e`;
- geen accounts, fixtures, e-mails, betalingen of productieacties.

## Rollback- en remote bewijs

Read-only hercontrole na de blokkade:

| Controle | Staging | Productie |
|---|---:|---:|
| CP-A migration records | 0 | 0 |
| CP-A-tabellen | 0 | 0 |
| `quotes.quote_version` | afwezig | afwezig |
| CP-A-functies | 0 | 0 |
| CP-A-triggers | 0 | 0 |
| CP-A-policies | 0 | 0 |
| pgcrypto-schema | `extensions` | `extensions` |
| bridge migration records | 1 | 0 |

## Lokale correctie voorbereid

De nog nergens toegepaste CP-A-migratie is lokaal minimaal gecorrigeerd:

- oude aanroep: `public.digest(...)`;
- nieuwe aanroep: `extensions.digest(...)`;
- oude checksum: `757d304cd9200baf438e0968f00508cfbecb56648aeefcd5486516734c007a84`;
- nieuwe checksum: `a418a8b05b03879f572c0ebd5862acd2ce36d3eae8e35db6aefbd5fa7c7586c2`;
- bridgechecksum onveranderd: `22628ef185d4f78a8dd96eefd9aee68022e2010f9f5143c7d13df0be4ea6fa50`.

Lokale gates: PostgreSQL 10/10, bridge 9/9, CP-A 5/5, portaalregressies 76/76, volledige suite 260/270 met exact dezelfde 10 bekende failures en 0 nieuwe failures.

## Hervattingsgate

Deze lokale correctie autoriseert nog geen push, PR-update, migratie, merge of deploy. Hervatting vereist een afzonderlijke opdracht die de nieuwe branch-tip pusht, PR #4 actualiseert, opnieuw bevestigt dat CP-A remote afwezig is, daarna uitsluitend de gecorrigeerde CP-A-migratie op staging toepast en pas na groene poststate de stagingbranch fast-forwardt.

BLOCKED_CP_A_STAGING_RELEASE_AND_ACCEPTANCE
