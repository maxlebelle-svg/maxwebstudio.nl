# F0-d — Future Migration Contract

Status: **BINDEND ONTWERPCONTRACT VANAF CUTOVER**

Iedere migration vanaf het goedgekeurde cutoverpoint moet aan alle regels voldoen:

1. Append-only; bestaande migrationbytes en versienummers zijn immutable.
2. Dezelfde SQL werkt op een bewezen bestaande-runtimefingerprint én bootstrapfingerprint.
3. Expliciete preconditions controleren objectbestaan, relevante data, extensies, rollen en laatste historyversie.
4. Geen onvoorwaardelijke CREATE wanneer het object op één lijn kan bestaan.
5. Geen blinde `IF NOT EXISTS`: bij bestaand object wordt de volledige verwachte definitie vergeleken; afwijking stopt de migration.
6. Kolommen vergelijken datatype, default, nullability, generation/identity en collation vóór wijziging.
7. Constraints vergelijken type, expressie, deferrability en validated-status; indexen uniqueness, keys/expressies, predicate en access method.
8. Transactioneel uitvoeren waar PostgreSQL dit ondersteunt; anders expliciete fasering en compensatie.
9. Grants en revokes zijn expliciet per rol/object; geen impliciete brede privileges.
10. Iedere SECURITY DEFINER heeft vaste `search_path=pg_catalog`, geschemakwalificeerde applicatiereferenties, input-/tenantcontrole en afzonderlijke EXECUTE-grants.
11. Geen PUBLIC EXECUTE zonder machineleesbare, goedgekeurde uitzondering en dreigingsanalyse.
12. RLS wordt expliciet enabled; policyrol, command, USING en WITH CHECK worden volledig vastgelegd en getest. Forced RLS vereist apart compatibiliteitsbesluit.
13. Storagewijzigingen zijn declaratief; geen objectdata en geen browserpolicy zonder ontwerpbesluit.
14. Iedere migration heeft rollback of compensatiestrategie, lock-/downtime-inschatting en data-preflight.
15. Statische tests controleren checksum, dependencyvolgorde, definities en security.
16. Lokale integratietests draaien op beide lijnen met het Supabase-compatibiliteitsprofiel.
17. Schema-, owner-, ACL-, RLS-, function- en bucketfingerprints worden vóór en na vastgelegd en vergeleken.
18. Geen Auth-, Storage-object-, seed- of klantdata in testartefacten/logs.
19. Stagingvalidatie en expliciete menselijke approval zijn verplicht vóór productie.
20. Productie stopt bij fingerprint-, history-, precondition- of securityafwijking; geen ad-hoc repair.
