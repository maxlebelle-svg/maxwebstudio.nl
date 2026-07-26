# F0-d — Column Comparison Resolution

Status: **BLOCKED_MISSING_EVIDENCE**

De ene unresolved F0-c-entry was geen geïdentificeerde afwijkende kolom, maar de volledige kolomvergelijking als geheel.

| Veld | Lokale baseline-evidence | Runtime-evidence |
|---|---|---|
| Tabel/kolom | 29 tabellen, 612 benoemde kolommen in F0C_LOCAL_REBUILD_CATALOG.json | geen volledige opgeslagen lijst |
| Datatype/UDT | per lokale kolom aanwezig | ontbreekt |
| Default | per lokale kolom aanwezig | ontbreekt |
| Nullability | per lokale kolom aanwezig | ontbreekt |
| Identity/generation | lokale information_schema-export; geen identities vastgesteld in de opgeslagen selectie | ontbreekt |
| Collation | niet opgenomen in F0-c-export | ontbreekt |

Er kan daarom voor geen van de 612 lokale kolommen exhaustief `resolved_equivalent`, `intentional_difference` of `unexpected_drift` worden vastgesteld. Constraints en indexen bewijzen slechts delen van kolomsemantiek en vervangen geen column catalog.

Benodigd bewijs is één read-only runtimecatalogus met schema, tabel, kolom, ordinal position, data/UDT-type, formatted type, default, nullability, identity, generated expression en collation. Nieuwe remote evidencecollection is in F0-d niet toegestaan of uitgevoerd. De gate blijft geblokkeerd totdat afzonderlijke toestemming en een begrensd queryplan bestaan.
